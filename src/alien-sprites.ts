import type { CommsSession } from './comms';
import catalog from '../assets/ui/catalog.json';
import { rasterImage } from './raster-ui';
import { portraitFrame } from './portrait-animation';

export function drawAlienSprite(ctx: CanvasRenderingContext2D, c: CommsSession, motion: number): boolean {
  const image = rasterImage(c.entity.kind); if (!image) return false;
  const animation = catalog[c.entity.kind].animation;
  const frame = portraitFrame(c.elapsed, c.shown < c.text.length || motion > .06, motion);
  const fw = image.naturalWidth / animation.columns, fh = image.naturalHeight / animation.rows;
  ctx.save(); ctx.imageSmoothingEnabled = false;
  // A square transmission image keeps generated heads in their original proportions.
  ctx.fillStyle = '#080a08'; ctx.fillRect(44,153,433,472);
  ctx.drawImage(image, frame % animation.columns * fw, Math.floor(frame / animation.columns) * fh, fw, fh, 44,172,433,433);
  ctx.restore(); return true;
}
