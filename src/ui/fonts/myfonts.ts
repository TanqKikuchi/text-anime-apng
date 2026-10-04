import type { StorageLike } from '../i18n';
import { MYFONTS_STORAGE_KEY } from '../persist';
import type { MyFont } from './catalog';

/** FNT-07/08/09 + STO-04: registered fonts. List in localStorage, file bytes in IndexedDB. */

const DB_NAME = 'mojimotion';
const STORE = 'fonts';

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function dbRequest<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    } catch {
      resolve(null);
    }
  });
}

export function parseMyFontList(json: string | null): MyFont[] {
  if (!json) return [];
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is MyFont => typeof entry === 'object' && entry !== null
      && typeof (entry as MyFont).id === 'string' && typeof (entry as MyFont).family === 'string'
      && typeof (entry as MyFont).name === 'string' && ((entry as MyFont).kind === 'file' || (entry as MyFont).kind === 'local'))
      .map((entry) => ({ id: entry.id, family: entry.family, name: entry.name, size: Number(entry.size) || 0, kind: entry.kind }));
  } catch {
    return [];
  }
}

/** FNT-07: display name = file name without extension. */
export function fontDisplayName(fileName: string): string {
  return fileName.replace(/\.(ttf|otf|woff2?|ttc)$/iu, '').trim() || fileName;
}

const FONT_FILE = /\.(ttf|otf|woff2?)$/iu;
export function isFontFileName(name: string): boolean {
  return FONT_FILE.test(name);
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `f${Date.now().toString(36)}${counter.toString(36)}`;
}

export type AddFileResult =
  | { readonly status: 'added' | 'exists'; readonly font: MyFont; readonly persisted: boolean }
  | { readonly status: 'unsupported' };

export class MyFontStore {
  private fonts: MyFont[] = [];
  private readonly faces = new Map<string, FontFace>();
  private listeners = new Set<() => void>();

  constructor(private readonly storage: StorageLike | null) {
    try {
      this.fonts = parseMyFontList(storage?.getItem(MYFONTS_STORAGE_KEY) ?? null);
    } catch {
      this.fonts = [];
    }
  }

  list(): readonly MyFont[] {
    return this.fonts;
  }

  byFamily(family: string): MyFont | undefined {
    return this.fonts.find((font) => font.family === family);
  }

  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  private saveList(): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(MYFONTS_STORAGE_KEY, JSON.stringify(this.fonts));
      return true;
    } catch {
      return false;
    }
  }

  /** Reads uploaded font bytes back from IndexedDB; entries that cannot be restored are dropped. */
  async restore(): Promise<void> {
    const keep: MyFont[] = [];
    for (const font of this.fonts) {
      if (font.kind === 'local') {
        keep.push(font);
        continue;
      }
      const bytes = await dbRequest<ArrayBuffer>('readonly', (store) => store.get(font.id) as IDBRequest<ArrayBuffer>);
      if (!bytes) continue;
      try {
        await this.registerFace(font.family, bytes);
        keep.push(font);
      } catch {
        // Broken data: drop it.
      }
    }
    const changed = keep.length !== this.fonts.length;
    this.fonts = keep;
    if (changed) this.saveList();
    this.emit();
  }

  private async registerFace(family: string, bytes: ArrayBuffer): Promise<void> {
    const face = new FontFace(family, bytes, { weight: '100 900' });
    await face.load();
    document.fonts.add(face);
    this.faces.set(family, face);
  }

  async addFile(file: File): Promise<AddFileResult> {
    const name = fontDisplayName(file.name);
    const existing = this.fonts.find((font) => font.kind === 'file' && font.name === name && font.size === file.size);
    if (existing) return { status: 'exists', font: existing, persisted: true };
    if (!isFontFileName(file.name)) return { status: 'unsupported' };
    const id = newId();
    const family = `MojiMotion User ${id}`;
    let bytes: ArrayBuffer;
    try {
      bytes = await file.arrayBuffer();
      await this.registerFace(family, bytes);
    } catch {
      return { status: 'unsupported' };
    }
    const font: MyFont = { id, family, name, size: file.size, kind: 'file' };
    this.fonts = [...this.fonts, font];
    const stored = await dbRequest('readwrite', (store) => store.put(bytes, id));
    const persisted = stored !== null && this.saveList();
    this.emit();
    return { status: 'added', font, persisted };
  }

  addLocal(name: string): MyFont {
    const existing = this.fonts.find((font) => font.kind === 'local' && font.family === name);
    if (existing) return existing;
    const font: MyFont = { id: newId(), family: name, name, size: 0, kind: 'local' };
    this.fonts = [...this.fonts, font];
    this.saveList();
    this.emit();
    return font;
  }

  async remove(id: string): Promise<MyFont | undefined> {
    const font = this.fonts.find((entry) => entry.id === id);
    if (!font) return undefined;
    this.fonts = this.fonts.filter((entry) => entry.id !== id);
    const face = this.faces.get(font.family);
    if (face) {
      document.fonts.delete(face);
      this.faces.delete(font.family);
    }
    this.saveList();
    if (font.kind === 'file') await dbRequest('readwrite', (store) => store.delete(id));
    this.emit();
    return font;
  }
}

/** FNT-08: a local font exists when a sample's width differs from the generic-only width. */
export function localFontExists(name: string, measure: (font: string) => number): boolean {
  const clean = name.replace(/["\\]/g, '').trim();
  if (!clean) return false;
  for (const generic of ['monospace', 'serif', 'sans-serif']) {
    const base = measure(`72px ${generic}`);
    const test = measure(`72px "${clean}", ${generic}`);
    if (Math.abs(base - test) > 0.5) return true;
  }
  return false;
}

export const LOCAL_FONT_SAMPLE = 'mmMWwlLiI10@あア漢';
