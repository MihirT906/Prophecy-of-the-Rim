import { drawAlienSprite } from './alien-sprites';
import type { CommsSession } from './comms';
import { circle, line } from './space-render';

/** Human-derived Dune contacts seen through tanks, masks and damaged transmission optics. */
export function drawPortrait(ctx: CanvasRenderingContext2D, c: CommsSession, motion: number): void {
  if (drawAlienSprite(ctx, c, motion)) return;
  const e = c.entity, t = c.elapsed, cx = 260, cy = 362, breath = Math.sin(t * 1.2) * 3;
  const ink = '#080e0e', shade = '#28322e', color = e.tint;
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke();
  };
  // Robes and shoulders frame an identifiable head rather than an unrelated alien species.
  ellipse(cx, cy + 221, 174, 116, ink);
  if (e.kind === 'navigator') {
    ctx.fillStyle = '#7c572020'; ctx.fillRect(54, 166, 413, 405);
    for (let i = 0; i < 24; i++) {
      const x = 65 + (i * 83.7) % 393, y = 560 - (t * (9 + i % 5) + i * 47) % 382;
      circle(ctx, { x, y }, 1 + i % 3, '#bd954455', true);
    }
    ellipse(cx, cy + breath, e.width * 1.35, 115, shade);
    for (const side of [-1, 1]) {
      ellipse(cx + side * 70, cy - 14 + breath, 23, 7, ink);
      circle(ctx, { x: cx + side * 70, y: cy - 14 + breath }, 3, '#253fc0', true);
      for (let i = 0; i < e.tubes; i++) {
        ctx.beginPath(); ctx.moveTo(cx + side * 65, cy + 75);
        ctx.bezierCurveTo(cx + side * 180, cy + 30, cx + side * (100 + i * 16), cy + 165, cx + side * (90 + i * 21), 579);
        ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.stroke();
      }
    }
    ellipse(cx, cy + 51 + breath, 24 + motion * 12, 7 + motion * 19, ink);
    for (const x of [62, 458]) line(ctx, { x, y: 165 }, { x, y: 580 }, color, 4);
  } else {
    ellipse(cx, cy + breath, e.width, 135, shade);
    if (e.kind === 'facedancer') {
      // Two mismatched facial outlines shift subtly under the skin.
      for (let i = 0; i < e.ridges; i++) {
        const x = cx - e.width + 15 + i * (e.width * 2 - 30) / e.ridges;
        ctx.beginPath(); ctx.moveTo(x, cy - 109);
        ctx.bezierCurveTo(x + e.asymmetry + Math.sin(t + i) * 7, cy - 20, x - 22, cy + 25, cx + (x - cx) * .55, cy + 110);
        ctx.strokeStyle = '#93aa8755'; ctx.stroke();
      }
    }
    for (const side of [-1, 1]) {
      const x = cx + side * 34, y = cy - 32 + breath + (side === 1 ? e.asymmetry : 0);
      const blink = Math.sin(t * 1.4 + e.width) > .995 ? 1 : 8;
      ellipse(x, y, 19, blink, e.kind === 'ghola' ? '#101719' : '#151c29');
      if (e.kind === 'ghola') {
        circle(ctx, { x, y }, 6, '#b2d9de', false);
        line(ctx, { x: x - 16, y }, { x: x + 16, y }, '#b2d9de');
        line(ctx, { x, y: y - 6 }, { x, y: y + 6 }, '#b2d9de');
      } else circle(ctx, { x: x + Math.sin(t * .5) * 3, y }, 5, '#304dd2', true);
      line(ctx, { x: cx + side * 8, y: cy - 18 }, { x: cx + side * 14, y: cy + 24 }, color);
    }
    if (e.kind === 'smuggler') {
      ellipse(cx, cy + 58, 68, 49, ink);
      for (let i = -3; i <= 3; i++) {
        line(ctx, { x: cx + i * 12, y: cy + 39 - motion * 8 }, { x: cx + i * 12, y: cy + 77 + motion * 8 }, color, 3);
      }
      for (const side of [-1, 1]) {
        line(ctx, { x: cx + side * 63, y: cy + 52 }, { x: cx + side * 115, y: cy + 103 }, color, 7);
        line(ctx, { x: cx + side * 115, y: cy + 103 }, { x: cx + side * 115, y: cy + 201 }, color, 7);
      }
    } else {
      ellipse(cx + e.asymmetry * .3, cy + 63 + breath, 26 + motion * 5, 2 + motion * 16, ink);
      line(ctx, { x: cx - 33, y: cy + 91 }, { x: cx + 30, y: cy + 97 }, color);
    }
  }
  // Sample-synchronous interference makes the transmission itself feel unstable.
  ctx.fillStyle = `${color}22`;
  ctx.fillRect(54, 178 + (t * 27) % 393, 413, 2 + motion * 5);
}
