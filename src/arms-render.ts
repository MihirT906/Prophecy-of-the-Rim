import { uiPanel } from './raster-ui';
// Gray-box drawing of friendly aircraft, ground ordnance, and the arsenal HUD strip. Shapes and monospace labels only.
import { ARMS, RARITIES } from './data';
import { ACCENT, circle, DIM, INK, line, label, text } from './space-render';
import type { Hazard, State, Vec } from './state';

const HULL = '#1b1f24', SHADOW = 'rgba(0,0,0,.35)';
const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));
function reset(ctx: CanvasRenderingContext2D): void { ctx.globalAlpha = 1; ctx.setLineDash([]); ctx.lineWidth = 1; }
/** Fuse fraction 1 (just dropped) .. 0 (detonating); ttl keeps the full fuse when the owner set it, else assume 0.6 s. */
const fuse = (h: Hazard): number => clamp01(h.timer / (h.ttl > 0 ? h.ttl : .6));

/** Below enemies: bomb and warhead markers, radiation pools, mines, the Death Hand reticle and the Hawk flash. World coordinates. */
export function drawHazards(ctx: CanvasRenderingContext2D, s: State): void {
  for (const h of s.hazards) {
    switch (h.kind) {
      case 'bomb':
      case 'warhead': {
        const f = fuse(h), warhead = h.kind === 'warhead';
        ctx.globalAlpha = warhead ? .55 + .45 * Math.abs(Math.sin(s.time * 18 + h.id)) : .9;
        ctx.setLineDash([6, 5]); circle(ctx, h, Math.max(4, h.r * (.3 + .7 * f)), h.color); ctx.setLineDash([]);
        if (warhead) { ctx.setLineDash([2, 6]); circle(ctx, h, h.r, h.color); ctx.setLineDash([]); }
        circle(ctx, h, 3 + (1 - f) * 4, warhead ? h.color : INK, true);
        break;
      }
      case 'pool': {
        ctx.globalAlpha = .18 * clamp01(h.ttl / 1.5);  // fades over the last moments, whatever the owner's total was
        circle(ctx, h, h.r, h.color, true);
        ctx.globalAlpha = .6 * clamp01(h.ttl / 1.5);
        circle(ctx, h, h.r, h.color);
        for (let i = 0; i < 5; i++) {
          const a = s.time * (.8 + i * .17) + i * 1.3 + h.id, d = h.r * (.25 + .14 * i);
          circle(ctx, { x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d }, 2.5, h.color, true);
        }
        label(ctx, 'RADIATION', h.x, h.y + 4, 11, h.color, 'center');
        break;
      }
      case 'mine': {
        ctx.globalAlpha = .35; circle(ctx, h, h.r, h.color); ctx.globalAlpha = 1;
        const bob = Math.sin(s.time * 3 + h.id) * 2;
        ctx.beginPath(); ctx.moveTo(h.x, h.y - 9 + bob); ctx.lineTo(h.x + 7, h.y + bob); ctx.lineTo(h.x, h.y + 9 + bob); ctx.lineTo(h.x - 7, h.y + bob); ctx.closePath();
        ctx.fillStyle = HULL; ctx.fill(); ctx.strokeStyle = h.color; ctx.lineWidth = 1.5; ctx.stroke();
        circle(ctx, { x: h.x, y: h.y + bob }, 2, s.time % .8 < .4 ? h.color : DIM, true);
        break;
      }
      case 'marker':
        if (h.dmg > 0) drawSiren(ctx, s, h); else drawHawk(ctx, s, h);
        break;
    }
    reset(ctx);
  }
}

/** Death Hand target reticle: crosshairs plus the blast ring, flashing faster as the countdown runs out. */
function drawSiren(ctx: CanvasRenderingContext2D, s: State, h: Hazard): void {
  const left = Math.max(0, h.timer), rate = 4 + 14 / (left + .3), on = Math.sin(s.time * rate) > 0;
  ctx.globalAlpha = on ? 1 : .45;
  ctx.lineWidth = 2;
  circle(ctx, h, h.r, h.color);
  ctx.setLineDash([4, 6]); circle(ctx, h, h.r * .55, h.color); ctx.setLineDash([]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    line(ctx, { x: h.x + dx * h.r * .3, y: h.y + dy * h.r * .3 }, { x: h.x + dx * (h.r + 14), y: h.y + dy * (h.r + 14) }, h.color, 2);
  }
  label(ctx, 'DEATH HAND', h.x, h.y - h.r - 16, 13, h.color, 'center');
  label(ctx, `${left.toFixed(1)}s`, h.x, h.y + 5, 15, on ? INK : h.color, 'center');
}

/** Hawk Strike: three expanding wing arcs around the player, fading out over the marker's half second. */
function drawHawk(ctx: CanvasRenderingContext2D, s: State, h: Hazard): void {
  const life = clamp01(h.ttl / .5), spread = 1 - life;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    ctx.globalAlpha = life * (1 - i * .25);
    const r = h.r * (.4 + i * .3) + spread * 120 + Math.sin(s.time * 20 + i) * 4;
    for (const side of [-1, 1]) {
      // One wing per side: an arc sweeping 100 degrees around the side's axis.
      const mid = side < 0 ? Math.PI : 0;
      ctx.beginPath(); ctx.arc(h.x, h.y, r, mid - Math.PI * .28, mid + Math.PI * .28);
      ctx.strokeStyle = h.color; ctx.stroke();
    }
  }
  ctx.globalAlpha = life;
  label(ctx, 'HAWK STRIKE', h.x, h.y - h.r - 10, 12, h.color, 'center');
}

/** Above everything else in the world: thopters, bombers, gunship, drone, carryall, each with a ground shadow. */
export function drawAircraft(ctx: CanvasRenderingContext2D, s: State): void {
  for (const a of s.aircraft) {
    const color = RARITIES[a.rarity].color, beat = Math.sin(s.time * 30 + a.phase), angle = Math.atan2(a.dir.y, a.dir.x);
    ctx.save(); ctx.translate(a.x, a.y + 18); ctx.scale(1, .45); ctx.beginPath(); ctx.arc(0, 0, a.r + 8, 0, Math.PI * 2); ctx.fillStyle = SHADOW; ctx.fill(); ctx.restore();
    ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(angle);
    ctx.fillStyle = HULL; ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    switch (a.kind) {
      case 'thopter': wings(ctx, 22, 7, beat); dart(ctx, 20, 6); break;
      case 'bomber': wings(ctx, 26, 11, beat); dart(ctx, 22, 11); break;
      case 'gunship':
        wings(ctx, 20, 12, beat * .5);
        ctx.beginPath(); ctx.rect(-18, -9, 34, 18); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(16, -4, 10, 8); ctx.fill(); ctx.stroke();
        for (const side of [-1, 1]) { ctx.beginPath(); ctx.rect(-6, side * 11 - 2, 12, 4); ctx.fill(); ctx.stroke(); }
        break;
      case 'drone': wings(ctx, 12, 5, beat); dart(ctx, 12, 7); break;
      case 'carryall':
        wings(ctx, 30, 9, beat * .6);
        ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(12, -14); ctx.lineTo(-26, -14); ctx.lineTo(-26, 14); ctx.lineTo(12, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.rect(-14, -8, 18, 16); ctx.strokeStyle = a.cargo > 0 ? ACCENT : color; ctx.stroke();
        break;
    }
    ctx.restore();
    const caption = a.kind === 'thopter' ? 'THOPTER' : a.kind.toUpperCase();
    label(ctx, a.cargo > 0 ? `${caption} ×${a.cargo}` : caption, a.x, a.y + a.r + 24, 10, a.cargo > 0 ? ACCENT : DIM, 'center');
    reset(ctx);
  }
}
/** Two flapping wings: span px each side, chord px, beat -1..1 scales the span. Drawn in local craft coordinates. */
function wings(ctx: CanvasRenderingContext2D, span: number, chord: number, beat: number): void {
  const k = .55 + .45 * Math.abs(beat);
  for (const side of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(4, side * 3); ctx.lineTo(-4, side * span * k); ctx.lineTo(-4 - chord, side * span * k * .8); ctx.lineTo(-chord, side * 3); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }
}
function dart(ctx: CanvasRenderingContext2D, length: number, half: number): void {
  ctx.beginPath(); ctx.moveTo(length, 0); ctx.lineTo(-length * .6, -half); ctx.lineTo(-length * .4, 0); ctx.lineTo(-length * .6, half); ctx.closePath();
  ctx.fill(); ctx.stroke();
}

/** Screen coordinates: arsenal slots 1-4 above the bottom HUD bar, plus the Death Hand siren frame. Only while playing. */
export function drawArsenal(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const v = s.voyage;
  if (!v || s.screen !== 'playing') return;
  const siren = s.hazards.find(z => z.kind === 'marker' && z.dmg > 0);
  if (siren) {
    const left = Math.max(0, siren.timer), rate = 4 + 14 / (left + .3);
    ctx.globalAlpha = .35 + .5 * Math.abs(Math.sin(s.time * rate));
    ctx.strokeStyle = '#ff4a3d'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
    reset(ctx);
    label(ctx, `DEATH HAND INBOUND ${left.toFixed(1)}s / CLEAR THE MARKER`, w / 2, 128, 14, '#ff6b5e', 'center');
  }
  const y = h - (v.lane ? 72 : 66) - 56, box: Vec = { x: 18, y };  // above the lane or flight HUD bar
  for (let i = 0; i < v.arsenal.length; i++) {  // four 112 px boxes end at x 490, clear of the key-feedback panel
    const x = box.x + i * 118, item = v.arsenal[i];
    uiPanel(ctx, item ? 'buttonSelected' : 'well', x, y, 112, 44);
    ctx.strokeStyle = item ? RARITIES[item.rarity].color : '#333333'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, 111, 43);
    text(ctx, String(i + 1), x + 10, y + 28, 18, item ? INK : '#444444');
    if (!item) { text(ctx, '—', x + 28, y + 27, 14, '#444444'); continue; }
    const rarity = RARITIES[item.rarity];
    text(ctx, ARMS[item.id].name, x + 24, y + 17, 9, rarity.color);
    text(ctx, '●'.repeat(Math.max(0, item.durability)) + '○'.repeat(Math.max(0, rarity.durability - item.durability)), x + 24, y + 36, 10, rarity.color);
    text(ctx, rarity.name, x + 106, y + 36, 7, DIM, 'right');
  }
  reset(ctx);
}
