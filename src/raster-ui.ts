import { recordLayout } from './ui-layout';
import catalog from '../assets/ui/catalog.json';

// Explicit URL literals let Vite embed the raster set in the offline build as well.
const sources: Record<string, string> = {
  'cockpit.png': new URL('../assets/ui/runtime/cockpit.webp', import.meta.url).href,
  'terminal.png': new URL('../assets/ui/runtime/terminal.webp', import.meta.url).href,
  'controls.png': new URL('../assets/ui/runtime/controls.webp', import.meta.url).href,
  'navigator.png': new URL('../assets/ui/runtime/navigator.webp', import.meta.url).href,
  'facedancer.png': new URL('../assets/ui/runtime/facedancer.webp', import.meta.url).href,
  'ghola.png': new URL('../assets/ui/runtime/ghola.webp', import.meta.url).href,
  'smuggler.png': new URL('../assets/ui/runtime/smuggler.webp', import.meta.url).href,
};
const images = new Map<string, HTMLImageElement>();
export type RasterRegion = keyof typeof catalog;
export function rasterImage(id: RasterRegion): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  const file = catalog[id].file;
  let image = images.get(file);
  if (!image) { image = new Image(); image.src = sources[file]; images.set(file, image); }
  return image.complete && image.naturalWidth > 0 ? image : null;
}
// Start all seven downloads together; missing art falls back without stopping gameplay.
if (typeof Image !== 'undefined') for (const id of Object.keys(catalog) as RasterRegion[]) rasterImage(id);

/** Nine-slice the generated borders without stretching corner hardware. */
export function rasterPanel(ctx: CanvasRenderingContext2D, id: RasterRegion, x: number, y: number, w: number, h: number): boolean {
  recordLayout(ctx, { kind: 'panel', name: id, x, y, w, h, inset: Math.min(6, h / 6) + 2 });
  const image = rasterImage(id); if (!image || w <= 0 || h <= 0) return false;
  const spec = catalog[id], [sx,sy,sw,sh] = spec.rect, b = spec.border;
  const [bl,bt,br,bb] = spec.slice;
  const scaleX = image.naturalWidth / spec.size[0], scaleY = image.naturalHeight / spec.size[1];
  const edge = Math.min(b, 6, w / 6, h / 6);
  const srcX = [sx,sx+bl,sx+sw-br,sx+sw], srcY = [sy,sy+bt,sy+sh-bb,sy+sh];
  const dstX = [x,x+edge,x+w-edge,x+w], dstY = [y,y+edge,y+h-edge,y+h];
  ctx.save(); ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
    ctx.drawImage(image, srcX[col]*scaleX, srcY[row]*scaleY, (srcX[col+1]-srcX[col])*scaleX, (srcY[row+1]-srcY[row])*scaleY,
      Math.round(dstX[col]), Math.round(dstY[row]), Math.round(dstX[col+1])-Math.round(dstX[col]), Math.round(dstY[row+1])-Math.round(dstY[row]));
  }
  ctx.restore(); return true;
}
export function uiPanel(ctx: CanvasRenderingContext2D, id: RasterRegion, x: number, y: number, w: number, h: number): void {
  if (rasterPanel(ctx,id,x,y,w,h)) return;
  ctx.fillStyle = '#100f0c'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = '#806c48'; ctx.lineWidth = 2; ctx.strokeRect(x+1,y+1,w-2,h-2);
}
