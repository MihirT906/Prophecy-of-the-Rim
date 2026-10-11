import { uiPanel } from './raster-ui';
import { ENEMIES, SEEKER, TILE } from './data';
import { circle, DIM, line, label, LOCK, text } from './space-render';
import type { Enemy, State } from './state';
import { sheltered } from './storms';
import { census, FACTIONS, factionOf, hunting } from './threats';
import { wormSegments } from './worms';

/** Draws the threats that have their own look. False for a kind it does not know, which keeps the plain marker. */
export function drawFoe(ctx: CanvasRenderingContext2D, e: Enemy, time: number): boolean {
  if (e.worm) { drawWorm(ctx, e, time); return true; }
  if (e.seeker) { drawSeeker(ctx, e, time); return true; }
  if (e.raider) { drawRaider(ctx, e, time); return true; }
  if (e.witness) { drawWitness(ctx, e, time); return true; }
  return false;
}

function drawWorm(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const hide = ENEMIES.worm.color, segments = wormSegments(e);
  for (let k = segments.length - 1; k >= 0; k--) {  // tail first, so each ring overlaps the one behind it
    const seg = segments[k];
    circle(ctx, seg, seg.r, k % 2 ? '#8a6d3b' : '#a5834a', true);
    circle(ctx, seg, seg.r, '#5e4826');
  }
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.facing);
  circle(ctx, { x: 0, y: 0 }, e.r, e.flash > 0 ? '#ffffff' : hide, true);
  const gape = e.r * (.62 + Math.sin(time * 5) * .1);
  circle(ctx, { x: e.r * .25, y: 0 }, gape, '#1c120c', true);
  ctx.strokeStyle = '#f1e2b8'; ctx.lineWidth = 2;
  for (let k = 0; k < 9; k++) {  // a ring of crysknife teeth pointing into the maw
    const a = k / 9 * Math.PI * 2 + time * .6;
    ctx.beginPath(); ctx.moveTo(e.r * .25 + Math.cos(a) * gape, Math.sin(a) * gape);
    ctx.lineTo(e.r * .25 + Math.cos(a) * gape * .45, Math.sin(a) * gape * .45); ctx.stroke();
  }
  ctx.restore();
  label(ctx, e.worm!.hunting ? 'SHAI-HULUD / HUNTING YOUR ENGINES' : 'SHAI-HULUD', e.x, e.y - e.r - 14, 11, e.worm!.hunting ? LOCK : DIM, 'center');
  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(e.x - 30, e.y + e.r + 10, 60, 4);
    ctx.fillStyle = LOCK; ctx.fillRect(e.x - 30, e.y + e.r + 10, 60 * Math.max(0, e.hp / e.maxHp), 4);
  }
}

/** A needle drone: pale and tethered to its hover point asleep, red-eyed with a shrinking fuse ring once it hunts. */
function drawSeeker(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const b = e.seeker!;
  if (!b.awake) line(ctx, e, b.home, '#3a3a34');
  else circle(ctx, e, e.r + 3 + 9 * Math.max(0, b.fuse / SEEKER.fuse), LOCK);
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(b.awake ? e.facing : time * .8 + e.id);
  ctx.beginPath(); ctx.moveTo(e.r + 6, 0); ctx.lineTo(0, -e.r * .7); ctx.lineTo(-e.r - 2, 0); ctx.lineTo(0, e.r * .7); ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : b.awake ? ENEMIES.seeker.color : '#77735f'; ctx.fill();
  ctx.fillStyle = b.awake ? '#ff5a48' : '#3a3a34'; ctx.fillRect(1, -2, 4, 4);
  ctx.restore();
}

/** A Harkonnen dart: a cold grey hull while it lies dark, red with a flaring drive once the ambush is sprung. */
function drawRaider(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const b = e.raider!, dark = b.mode === 'dark', hull = ENEMIES.raider.color;
  ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.facing);
  if (b.mode === 'run') {
    ctx.beginPath(); ctx.moveTo(-10, -4); ctx.lineTo(-24 - Math.sin(time * 60 + e.id) * 6, 0); ctx.lineTo(-10, 4);
    ctx.fillStyle = '#ffb347'; ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(-4, -5); ctx.lineTo(-12, -14); ctx.lineTo(-9, 0); ctx.lineTo(-12, 14); ctx.lineTo(-4, 5); ctx.closePath();
  ctx.fillStyle = e.flash > 0 ? '#ffffff' : dark ? '#34302e' : '#5e2a20'; ctx.fill();
  ctx.strokeStyle = dark ? '#6b6058' : hull; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
  label(ctx, dark ? 'HARKONNEN / RUNNING DARK' : b.mode === 'run' ? 'HARKONNEN / ATTACK RUN' : 'HARKONNEN / COMING ABOUT', e.x, e.y - e.r - 12, 10, dark ? DIM : LOCK, 'center');
}

/** A lidless eye in a ring of spines: solid and pale while the ship pins it with its gaze, a shimmer when it is free to move. */
function drawWitness(ctx: CanvasRenderingContext2D, e: Enemy, time: number): void {
  const seen = e.witness!.seen, tone = ENEMIES.witness.color;
  ctx.globalAlpha = seen ? 1 : .45 + Math.sin(time * 17 + e.id) * .2;
  ctx.strokeStyle = e.flash > 0 ? '#ffffff' : tone; ctx.lineWidth = 2;
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + (seen ? 0 : time * 1.5);
    line(ctx, { x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r }, { x: e.x + Math.cos(a) * (e.r + 9), y: e.y + Math.sin(a) * (e.r + 9) }, tone, 2);
  }
  circle(ctx, e, e.r, e.flash > 0 ? '#ffffff' : seen ? '#3b3550' : '#1d1a26', true);
  circle(ctx, e, e.r, tone);
  circle(ctx, e, e.r * .45, seen ? '#f1e2b8' : tone, true);
  circle(ctx, e, e.r * .18, '#0d0b12', true);
  ctx.globalAlpha = 1;
  label(ctx, seen ? 'SILENT WITNESS / PINNED BY YOUR GAZE' : 'SILENT WITNESS', e.x, e.y - e.r - 16, 10, seen ? DIM : LOCK, 'center');
  if (e.hp < e.maxHp) {
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(e.x - 16, e.y + e.r + 14, 32, 3);
    ctx.fillStyle = LOCK; ctx.fillRect(e.x - 16, e.y + e.r + 14, 32 * Math.max(0, e.hp / e.maxHp), 3);
  }
}

/** World space, under the ships: each storm as layered dust with streaks wheeling around its eye. */
export function drawStorms(ctx: CanvasRenderingContext2D, s: State): void {
  const inside = sheltered(s);
  for (const storm of s.storms) {
    for (let k = 3; k >= 1; k--) { ctx.globalAlpha = .1; circle(ctx, storm, storm.r * k / 3, '#c9a35c', true); }
    ctx.globalAlpha = .5; ctx.strokeStyle = '#c9a35c'; ctx.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const a = s.time * (.5 + k * .08) + k * .9, r = storm.r * (.3 + k * .1);
      ctx.beginPath(); ctx.arc(storm.x, storm.y, r, a, a + 1.1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    circle(ctx, storm, storm.r, '#8a6d3b');
    label(ctx, 'CORIOLIS STORM / ABRADES THE HULL / BLINDS GUILD SCANS', storm.x, storm.y - storm.r - 10, 10, inside === storm ? LOCK : DIM, 'center');
  }
}

/** Screen space: the threat board, every contact and storm on the local map, and chevrons toward hunters off screen. */
export function drawThreatHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const c = census(s), p = s.player;
  if (!c.total && !c.storms) return;
  const box = { x: w - 224, y: 86, size: 196 }, scale = box.size / (s.arena.w * TILE);  // the flight HUD's local-system map
  for (const storm of s.storms) circle(ctx, { x: box.x + storm.x * scale, y: box.y + storm.y * scale }, Math.max(2, storm.r * scale), '#8a6d3b');
  for (const e of s.enemies) {
    if (e.patrol) continue;  // the patrol HUD already plots its own
    ctx.fillStyle = hunting(e) ? LOCK : FACTIONS[factionOf(e)].color;
    ctx.fillRect(box.x + e.x * scale - 1, box.y + e.y * scale - 1, e.worm ? 4 : 2, e.worm ? 4 : 2);
  }
  const nearby = s.enemies.filter(e => hunting(e) && Math.hypot(e.x-p.x,e.y-p.y)<700);
  if (nearby.length) {
    uiPanel(ctx, 'well', 10, 170, 360, 58);  // below the mission panel (72..162)
    text(ctx, `${nearby.length} NEARBY HOSTILE${nearby.length===1?'':'S'}`, 26, 192, 14, LOCK);
    if(c.nearest) text(ctx, `${FACTIONS[c.nearest.faction].name} / ${Math.round(c.nearest.distance)}m`, 26, 214, 12, DIM);
  }
  if (sheltered(s)) label(ctx, 'INSIDE A CORIOLIS STORM / HULL ABRADING / GUILD SCANS BLIND', w / 2, 190, 13, LOCK, 'center');
  const warnings = s.enemies.filter(e => !e.patrol && hunting(e)).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y)).slice(0,3);
  for (const e of warnings) {
    const dx = e.x - p.x, dy = e.y - p.y, k = Math.min((w / 2 - 60) / Math.max(1, Math.abs(dx)), (h / 2 - 120) / Math.max(1, Math.abs(dy)));
    if (k >= 1) continue;  // on screen: the thing itself is the warning
    ctx.save(); ctx.translate(w / 2 + dx * k, h / 2 + dy * k); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fillStyle = FACTIONS[factionOf(e)].color; ctx.fill(); ctx.restore();
  }
}
