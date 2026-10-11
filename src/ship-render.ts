import { reducedMotion } from './accessibility';
import { moveVector } from './input';
import type { Enemy, State } from './state';

// Pixel-authored hull and cached animation cels. The live renderer only blits bitmaps.
const HULL = [
  '.........................',
  '......ss.................',
  '.....sGGss...............',
  '....sGHHGGss.............',
  '...sGHHHGGGGsss..........',
  '..sGGGGHHHHGGGGsss.......',
  '..sDDGGHHHHHHHGGGGsss....',
  '...sDGGGGHHHCCCCHHGGGss..',
  '..sDDGGHHHHHHHGGGGsss....',
  '..sGGGGHHHHGGGGsss.......',
  '...sGHHHGGGGsss..........',
  '....sGHHGGss.............',
  '.....sGGss...............',
  '......ss.................',
  '.........................',
];
const palette: Record<string, string> = { s: '#1d252d', D: '#554a40', G: '#958774', H: '#d0c1a2', C: '#8be5e2' };
const cache = new Map<string, HTMLCanvasElement>();
function cel(kind: 'hull' | 'jet' | 'muzzle', frame: number, ftl: boolean): HTMLCanvasElement {
  const key = `${kind}/${frame}/${ftl}`; const existing = cache.get(key); if (existing) return existing;
  const c = document.createElement('canvas'); c.width = 40; c.height = 24;
  const g = c.getContext('2d')!;
  if (kind === 'hull') {
    HULL.forEach((row, y) => [...row].forEach((p, x) => {
      if (!palette[p]) return;
      g.fillStyle = palette[p]; g.fillRect(x + 7, y + 4, 1, 1);
    }));
    g.fillStyle = frame === 0 ? '#e8aa5e' : '#fff3b2'; g.fillRect(12, 7, 2, 1); g.fillRect(12, 15, 2, 1);
  } else {
    const length = kind === 'muzzle' ? 6 + frame * 2 : 7 + frame * 3;
    for (let i = 0; i < length; i++) {
      const half = Math.max(0, Math.floor((length - i) / 5));
      g.fillStyle = i < 4 ? '#fff3ce' : ftl ? '#79d9f5' : '#ed9a4d';
      g.fillRect(20 - i, 12 - half, 1, half * 2 + 1);
    }
  }
  cache.set(key, c); return c;
}

export function drawPlayerShip(ctx: CanvasRenderingContext2D, s: State): void {
  const p = s.player, frame = reducedMotion() ? 1 : Math.floor(s.time * 16) % 3;
  const ftl = !!s.voyage?.lane, drive = moveVector(s.input), brake = s.input.held.has('Space');
  const jet = (angle: number, distance: number, size = 2) => {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(angle); ctx.translate(-distance, 0);
    ctx.drawImage(cel('jet', frame, ftl), -40 * size / 2, -24 * size / 2, 40 * size, 24 * size); ctx.restore();
  };
  ctx.save(); ctx.imageSmoothingEnabled = false;
  if (s.screen === 'playing') {
    // Exhaust opposes the applied impulse, including strafing independently of weapon aim.
    if (drive.x || drive.y) jet(Math.atan2(drive.y, drive.x), 14);
    if (brake) for (let i = 0; i < 4; i++) jet(i * Math.PI / 2, 15, 1);
  }
  ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.rotate(Math.atan2(p.aim.y, p.aim.x));
  if (p.iframes > 0) ctx.globalAlpha = reducedMotion() ? .7 : .6 + .4 * Math.abs(Math.sin(s.time * 15));
  ctx.drawImage(cel('hull', frame, ftl), -40, -24, 80, 48);
  if (p.muzzle > 0) {
    ctx.save(); ctx.translate(29, 0); ctx.rotate(Math.PI);
    ctx.drawImage(cel('muzzle', frame, ftl), -40, -24, 80, 48); ctx.restore();
  }
  ctx.restore();
}

/** Same raster hull fidelity as the pilot, with red running lights for hostile traffic. */
export function drawTrafficShip(ctx:CanvasRenderingContext2D,e:Enemy):void {
  ctx.save();ctx.imageSmoothingEnabled=false;ctx.translate(Math.round(e.x),Math.round(e.y));ctx.rotate(e.facing);
  ctx.drawImage(cel('jet',1,true),-55,-18,60,36);
  ctx.drawImage(cel('hull',0,true),-40,-24,80,48);
  ctx.fillStyle=e.flash>0?'#ffffff':'#ef7865';ctx.fillRect(-10,-10,8,4);ctx.fillRect(-10,6,8,4);ctx.restore();
}
