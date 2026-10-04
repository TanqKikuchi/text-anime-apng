import type { Scene } from '../../core/scene';
import { invalidateRenderCache } from '../../render';
import { fallbackChain, familiesToLoad, findCatalogFont, googleFontsUrl, myFontWeights, snapWeight } from './catalog';
import type { MyFont } from './catalog';

/** FNT-02 font loading (Google Fonts css2 link + FontFaceSet.load), FNT-03 chains for the renderer. */

export const CSS_TIMEOUT_MS = 12_000;
export const FACE_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

export interface FontLoaderEvents {
  /** Fonts finished loading: caches were dropped; redraw everything. */
  readonly onLoaded: () => void;
  /** Loading state of the active scene changed. */
  readonly onBusy: (busy: boolean) => void;
  /** A family failed to load (warn once). */
  readonly onFailed: (family: string) => void;
}

export class FontLoader {
  private readonly cssPromises = new Map<string, Promise<boolean>>();
  private readonly faceDone = new Map<string, Promise<boolean>>();
  private readonly failed = new Set<string>();
  private readonly inFlight = new Set<Promise<unknown>>();
  private readonly myFonts = new Map<string, MyFont>();
  private busyCount = 0;
  private events: FontLoaderEvents = { onLoaded: () => {}, onBusy: () => {}, onFailed: () => {} };
  private redrawTimer: ReturnType<typeof setTimeout> | undefined;

  /** Stable function instance for RenderOptions.fontFamily (the renderer caches per instance). */
  readonly fontFamily = (family: string): string => fallbackChain(family, this.myFonts.get(family));

  setEvents(events: FontLoaderEvents): void {
    this.events = events;
  }

  setMyFonts(fonts: readonly MyFont[]): void {
    this.myFonts.clear();
    for (const font of fonts) this.myFonts.set(font.family, font);
    invalidateRenderCache();
  }

  isKnownFamily(family: string): boolean {
    return findCatalogFont(family) !== undefined || this.myFonts.has(family);
  }

  weightsOf(family: string): readonly number[] {
    const mine = this.myFonts.get(family);
    if (mine) return myFontWeights(mine);
    return findCatalogFont(family)?.weights ?? [400, 700];
  }

  private loadCss(family: string): Promise<boolean> {
    let promise = this.cssPromises.get(family);
    if (promise) return promise;
    const font = findCatalogFont(family);
    if (!font || typeof document === 'undefined') return Promise.resolve(false);
    promise = withTimeout(
      new Promise<boolean>((resolve) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = googleFontsUrl(font.family, font.weights);
        link.dataset.family = font.family;
        link.addEventListener('load', () => resolve(true));
        link.addEventListener('error', () => resolve(false));
        document.head.append(link);
      }),
      CSS_TIMEOUT_MS,
    ).catch(() => false);
    this.cssPromises.set(family, promise);
    return promise;
  }

  private loadFace(family: string, weight: number, italic: boolean, text: string): Promise<boolean> {
    const key = `${family}\u0000${weight}\u0000${italic}\u0000${text}`;
    let promise = this.faceDone.get(key);
    if (promise) return promise;
    promise = (async () => {
      const cssOk = await this.loadCss(family);
      if (!cssOk) return false;
      try {
        await withTimeout(document.fonts.load(`${italic ? 'italic ' : ''}${weight} 48px "${family}"`, text || 'Aa'), FACE_TIMEOUT_MS);
        return true;
      } catch {
        return false;
      }
    })();
    this.faceDone.set(key, promise);
    return promise;
  }

  private requestsFor(scene: Scene): { family: string; weight: number; italic: boolean; text: string }[] {
    const requests: { family: string; weight: number; italic: boolean; text: string }[] = [];
    const add = (family: string, weight: number, italic: boolean, text: string) => {
      const mine = this.myFonts.get(family);
      for (const name of familiesToLoad(family, text, mine)) {
        const font = findCatalogFont(name);
        if (!font) continue;
        requests.push({ family: name, weight: snapWeight(weight, font.weights), italic, text });
      }
    };
    const { text } = scene;
    const all = `${text.main}${text.sub}`;
    add(text.mainFont.family, text.mainFont.weight, text.mainFont.italic, text.main || all);
    if (text.sub.trim() !== '' && scene.mode !== 'trailer') {
      const subFamily = text.subFontInherit ? text.mainFont.family : text.subFont.family;
      add(subFamily, text.subFont.weight, text.subFont.italic, text.sub);
    }
    return requests;
  }

  /** True when every face the scene needs was requested before and finished. */
  isSceneLoaded(scene: Scene): boolean {
    return this.requestsFor(scene).every((r) => this.faceDone.has(`${r.family}\u0000${r.weight}\u0000${r.italic}\u0000${r.text}`));
  }

  /**
   * Loads what a scene needs. `track` = count it in the busy indicator (active scene). Resolves
   * to false when some family failed (the renderer then uses the fallback chain).
   */
  ensureScene(scene: Scene, track = true): Promise<boolean> {
    const requests = this.requestsFor(scene);
    const fresh = requests.some((r) => !this.faceDone.has(`${r.family}\u0000${r.weight}\u0000${r.italic}\u0000${r.text}`));
    const all = Promise.all(requests.map((r) => this.loadFace(r.family, r.weight, r.italic, r.text).then((ok) => ({ ok, family: r.family }))));
    if (!fresh) return all.then((results) => results.every((r) => r.ok));
    if (track) this.setBusy(1);
    const job = all.then((results) => {
      for (const result of results) {
        if (!result.ok && !this.failed.has(result.family)) {
          this.failed.add(result.family);
          this.events.onFailed(result.family);
        }
      }
      this.scheduleRedraw();
      return results.every((r) => r.ok);
    }).finally(() => {
      if (track) this.setBusy(-1);
      this.inFlight.delete(job);
    });
    this.inFlight.add(job);
    return job;
  }

  private setBusy(delta: number): void {
    const before = this.busyCount > 0;
    this.busyCount = Math.max(0, this.busyCount + delta);
    const after = this.busyCount > 0;
    if (before !== after) this.events.onBusy(after);
  }

  private scheduleRedraw(): void {
    if (this.redrawTimer !== undefined) return;
    this.redrawTimer = setTimeout(() => {
      this.redrawTimer = undefined;
      invalidateRenderCache();
      this.events.onLoaded();
    }, 30);
  }

  /** Waits until no load is in flight (FNT-02: exports wait for fonts). */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) await Promise.allSettled([...this.inFlight]);
    if (this.redrawTimer !== undefined) {
      clearTimeout(this.redrawTimer);
      this.redrawTimer = undefined;
      invalidateRenderCache();
      this.events.onLoaded();
    }
  }
}

/** FNT-06: loads a subset of a family for a picker card under an alias name; returns the alias or null. */
const sampleAliases = new Map<string, Promise<string | null>>();
export function loadSampleFace(family: string, text: string): Promise<string | null> {
  const cached = sampleAliases.get(family);
  if (cached) return cached;
  const font = findCatalogFont(family);
  if (!font || typeof FontFace === 'undefined') return Promise.resolve(null);
  const alias = `mm-sample-${sampleAliases.size}`;
  const promise = (async () => {
    try {
      const weight = snapWeight(700, font.weights);
      const response = await withTimeout(fetch(googleFontsUrl(family, [weight], text)), CSS_TIMEOUT_MS);
      if (!response.ok) return null;
      const css = await response.text();
      const match = /url\((['"]?)([^'")]+)\1\)/.exec(css);
      if (!match) return null;
      const face = new FontFace(alias, `url(${match[2]})`, { weight: String(weight) });
      await withTimeout(face.load(), FACE_TIMEOUT_MS);
      document.fonts.add(face);
      return alias;
    } catch {
      return null;
    }
  })();
  sampleAliases.set(family, promise);
  return promise;
}
