import type { Vec } from './state';

/** event.code values; typed = printable chars for naming. */
export interface Input { held: Set<string>; pressed: string[]; typed: string[]; pointer?: Pointer }
/** Pointer position in canvas pixels. moved marks a fresh position; clicks queue like presses. */
export interface Pointer { x: number; y: number; over: boolean; moved: boolean; clicks: Vec[] }

const NO_SCROLL = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export function installInput(win: Window): Input {
  const i: Input = { held: new Set(), pressed: [], typed: [] };
  win.addEventListener('keydown', e => {
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    if (!e.repeat) i.pressed.push(e.code);
    i.held.add(e.code);
    if (e.key.length === 1) i.typed.push(e.key);
  });
  win.addEventListener('keyup', e => { i.held.delete(e.code); });
  win.addEventListener('blur', () => {
    i.held.clear();
    i.pressed.length = 0;
    i.typed.length = 0;
    if (i.pointer) i.pointer.clicks.length = 0;
  });
  return i;
}

/** Maps the letterboxed canvas back to its fixed drawing size. */
export function installPointer(canvas: HTMLCanvasElement, i: Input): void {
  const p: Pointer = { x: 0, y: 0, over: false, moved: false, clicks: [] };
  const at = (e: PointerEvent): Vec => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  };
  canvas.addEventListener('pointermove', e => Object.assign(p, at(e), { over: true, moved: true }));
  canvas.addEventListener('pointerleave', () => { p.over = false; });
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const q = at(e);
    Object.assign(p, q, { over: true, moved: true });
    p.clicks.push(q);
  });
  i.pointer = p;
}

/** Consumes the first queued click. */
export function takeClick(i: Input): Vec | null {
  return i.pointer?.clicks.shift() ?? null;
}

/** The pointer position once per movement, so a resting mouse never overrides keyboard selection. */
export function takeHover(i: Input): Vec | null {
  const p = i.pointer;
  if (!p?.moved || !p.over) return null;
  p.moved = false;
  return { x: p.x, y: p.y };
}

function axis(i: Input, up: string[], down: string[], left: string[], right: string[]): Vec {
  // pressed keeps a tap made and released between two updates alive for the next one
  const on = (codes: string[]) => codes.some(c => i.held.has(c) || i.pressed.includes(c)) ? 1 : 0;
  const x = on(right) - on(left), y = on(down) - on(up);
  const len = Math.hypot(x, y);
  return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
}

export function moveVector(i: Input): Vec {
  return axis(i, ['KeyW'], ['KeyS'], ['KeyA'], ['KeyD']);
}

export function aimVector(i: Input): Vec {
  return axis(i, ['ArrowUp', 'KeyI'], ['ArrowDown', 'KeyK'], ['ArrowLeft', 'KeyJ'], ['ArrowRight', 'KeyL']);
}

/** Consumes the first matching one-shot press. */
export function takePress(i: Input, ...codes: string[]): boolean {
  const k = i.pressed.findIndex(c => codes.includes(c));
  if (k < 0) return false;
  i.pressed.splice(k, 1);
  return true;
}
