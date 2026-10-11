import { ENEMIES, PATROL, TILE } from './data';
import { circle, DIM, INK, line, LOCK, label } from './space-render';
import type { Enemy, State } from './state';

const HULL = ENEMIES.patrol.color;

/** World space: the scan cone while on its route, then the hull, status label and a bar once damaged. */
export function drawPatrol(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const b = e.patrol;
  if (!b) return;
  const hunting = b.mode === 'pursue';
  if (!hunting && !b.cleared) {
    ctx.beginPath(); ctx.moveTo(e.x, e.y);
    ctx.arc(e.x, e.y, PATROL.scanRange, e.facing - PATROL.scanArc, e.facing + PATROL.scanArc); ctx.closePath();
    ctx.globalAlpha = .07 + b.scan * .25; ctx.fillStyle = b.scan > 0 ? LOCK : HULL; ctx.fill();
    ctx.globalAlpha = .45; ctx.strokeStyle = b.scan > 0 ? LOCK : HULL; ctx.lineWidth = 1; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (hunting) circle(ctx, e, e.r + 8 + Math.sin(time * 9) * 3, LOCK);
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.facing);
  ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(-10, -13); ctx.lineTo(-16, -6); ctx.lineTo(-16, 6); ctx.lineTo(-10, 13); ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : hunting ? '#5a3a3a' : '#33434c'; ctx.fill();
  ctx.strokeStyle = hunting ? LOCK : HULL; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  label(ctx, hunting ? 'GUILD / PURSUIT' : b.scan > 0 ? `SCANNING ${Math.round(b.scan * 100)}%` : b.cleared ? 'GUILD / CLEARED' : 'GUILD PATROL',
    e.x, e.y - e.r - 12, 10, hunting || b.scan > 0 ? LOCK : DIM, 'center');
  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(e.x - 14, e.y + e.r + 8, 28, 3);
    ctx.fillStyle = LOCK; ctx.fillRect(e.x - 14, e.y + e.r + 8, 28 * Math.max(0, e.hp / e.maxHp), 3);
  }
}

/** Screen space: minimap blips, a scan or pursuit warning, and edge chevrons toward pursuers that are off screen. */
export function drawPatrolHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const patrols = s.enemies.filter(e => e.patrol), p = s.player;
  if (!patrols.length) return;
  const box = { x: w - 224, y: 86, size: 196 }, scale = box.size / (s.arena.w * TILE);  // the flight HUD's local-system map
  for (const e of patrols) circle(ctx, { x: box.x + e.x * scale, y: box.y + e.y * scale }, 3, e.patrol!.mode === 'pursue' ? LOCK : ENEMIES.patrol.color, true);
  const hunters = patrols.filter(e => e.patrol!.mode === 'pursue'), scan = Math.max(...patrols.map(e => e.patrol!.mode === 'route' ? e.patrol!.scan : 0));
  if (hunters.length) {
    const nearest = Math.min(...hunters.map(e => Math.hypot(e.x - p.x, e.y - p.y)));
    label(ctx, `GUILD PURSUIT x${hunters.length} / NEAREST ${Math.round(nearest)}m / BREAK ${PATROL.loseRange}m OR EMPTY THE HOLD`, w / 2, 152, 13, LOCK, 'center');
    for (const e of hunters) {
      const dx = e.x - p.x, dy = e.y - p.y, k = Math.min((w / 2 - 60) / Math.max(1, Math.abs(dx)), (h / 2 - 120) / Math.max(1, Math.abs(dy)));
      if (k >= 1) continue;
      ctx.save(); ctx.translate(w / 2 + dx * k, h / 2 + dy * k); ctx.rotate(Math.atan2(dy, dx));
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fillStyle = LOCK; ctx.fill(); ctx.restore();
    }
  } else if (scan > 0) {
    const carrying = !!s.voyage?.cargo || (s.voyage?.personalSpice ?? 0) > 0;
    label(ctx, carrying ? 'GUILD SCAN / SPICE ABOARD / LEAVE THE CONE' : 'GUILD SCAN / HOLD EMPTY', w / 2, 152, 13, carrying ? LOCK : INK, 'center');
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(w / 2 - 90, 162, 180, 5);
    ctx.fillStyle = LOCK; ctx.fillRect(w / 2 - 90, 162, 180 * scan, 5);
    line(ctx, { x: w / 2 - 90, y: 170 }, { x: w / 2 + 90, y: 170 }, DIM);
  }
}
