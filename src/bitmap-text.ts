import { recordLayout } from './ui-layout';
/** Fixed-resolution glyph sprites. Text is drawn as nearest-neighbor bitmaps, never live canvas type. */
const atlases = new Map<string, { canvas: HTMLCanvasElement; slots: Map<string, number> }>();
const CELL_W = 8, CELL_H = 14, COLS = 32, ROWS = 16, BASE = 12;
export function bitmapWidth(value: string, size: number): number { return Array.from(value).length * size * .6; }
export function bitmapText(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = 'left'): void {
  if (!value) return;
  let atlas = atlases.get(color);
  if (!atlas) {
    if (atlases.size >= 64) atlases.delete(atlases.keys().next().value!);
    const canvas = document.createElement('canvas'); canvas.width = CELL_W * COLS; canvas.height = CELL_H * ROWS;
    atlas = { canvas, slots: new Map() }; atlases.set(color, atlas);
  }
  const g = atlas.canvas.getContext('2d')!, scale = size / BASE, advance = size * .6, width = bitmapWidth(value, size);
  let left = x - (align === 'center' ? width / 2 : align === 'right' || align === 'end' ? width : 0);
  recordLayout(ctx, { kind: 'text', name: value, x: left, y: y - size * .85, w: width, h: size, inset: 0 });
  ctx.save(); ctx.imageSmoothingEnabled = false;
  for (const char of value) {
    let slot = atlas.slots.get(char);
    if (slot === undefined) {
      if (atlas.slots.size === COLS * ROWS) { g.clearRect(0, 0, atlas.canvas.width, atlas.canvas.height); atlas.slots.clear(); }
      slot = atlas.slots.size; atlas.slots.set(char, slot);
      g.font = `${BASE}px monospace`; g.fillStyle = color; g.textBaseline = 'alphabetic';
      g.fillText(char, slot % COLS * CELL_W, Math.floor(slot / COLS) * CELL_H + 11);
    }
    ctx.drawImage(atlas.canvas, slot % COLS * CELL_W, Math.floor(slot / COLS) * CELL_H, CELL_W, CELL_H,
      Math.round(left), Math.round(y - 11 * scale), CELL_W * scale, CELL_H * scale);
    left += advance;
  }
  ctx.restore();
}
