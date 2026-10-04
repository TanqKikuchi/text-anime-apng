/** Tiny DOM helpers (no framework). */

export type Child = Node | string | null | undefined | false;

export interface ElementProps {
  readonly class?: string;
  readonly id?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly on?: { readonly [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void };
}

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElementProps = {}, children: readonly Child[] = []): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) {
    for (const [name, value] of Object.entries(props.attrs)) {
      if (value === undefined || value === false) continue;
      el.setAttribute(name, value === true ? '' : String(value));
    }
  }
  if (props.on) {
    for (const [type, listener] of Object.entries(props.on)) {
      if (listener) el.addEventListener(type, listener as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

let idCounter = 0;
export function uid(prefix = 'mm'): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

export function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden !== hidden) el.hidden = hidden;
}

export function setPressed(el: HTMLElement, pressed: boolean): void {
  const value = pressed ? 'true' : 'false';
  if (el.getAttribute('aria-pressed') !== value) el.setAttribute('aria-pressed', value);
}

/** Sets an input's value unless the user is typing in it. */
export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string): void {
  if (input.value === value) return;
  if (document.activeElement === input && !(input instanceof HTMLSelectElement) && input.type !== 'range') return;
  input.value = value;
}

export function clearChildren(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

/** SVG icon from a small set of 24×24 line drawings. */
export function icon(name: IconName, label?: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'icon');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else {
    svg.setAttribute('aria-hidden', 'true');
  }
  for (const d of ICONS[name]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

export type IconName =
  | 'text' | 'font' | 'motion' | 'decoration' | 'layout' | 'play' | 'pause' | 'restart' | 'help' | 'keyboard'
  | 'info' | 'sun' | 'moon' | 'download' | 'close' | 'message' | 'trailer' | 'pin' | 'upload' | 'chevron-up' | 'chevron-down' | 'export';

const ICONS: Readonly<Record<IconName, readonly string[]>> = {
  text: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'],
  font: ['M4 20 10 4h1l6 16', 'M6.5 14h8', 'M17 20h4'],
  motion: ['M3 12h4l3-7 4 14 3-7h4'],
  decoration: ['M12 3l2.6 5.6L20 9.5l-4 4 1 5.8L12 16.6 7 19.3l1-5.8-4-4 5.4-.9z'],
  layout: ['M4 4h16v16H4z', 'M4 9h16', 'M9 9v11'],
  play: ['M7 5v14l12-7z'],
  pause: ['M8 5v14', 'M16 5v14'],
  restart: ['M4 4v6h6', 'M5.5 15a7 7 0 1 0 1.6-7.3L4 10'],
  help: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14', 'M12 17.5v.01'],
  keyboard: ['M3 7h18v10H3z', 'M7 11h.01M11 11h.01M15 11h.01M8 14h8'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5', 'M12 8v.01'],
  sun: ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
  close: ['M6 6l12 12', 'M18 6 6 18'],
  message: ['M4 5h16v11H9l-5 4z'],
  trailer: ['M4 6h16', 'M4 10h12', 'M4 14h16', 'M4 18h9'],
  pin: ['M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z', 'M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'],
  upload: ['M12 20V9', 'M7 13l5-5 5 5', 'M5 4h14'],
  'chevron-up': ['M6 15l6-6 6 6'],
  'chevron-down': ['M6 9l6 6 6-6'],
  export: ['M12 3v12', 'M7 8l5-5 5 5', 'M5 13v7h14v-7'],
};
