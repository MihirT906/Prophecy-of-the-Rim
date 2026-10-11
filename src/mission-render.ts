// Screen-space mission panel, named edge chevrons and the first-run guide; a world-space compass beside the ship.
import { bitmapWidth } from './bitmap-text';
import { mission, MISSION_STEPS } from './mission';
import { uiPanel } from './raster-ui';
import { ACCENT, DIM, INK, label, LOCK, text } from './space-render';
import type { State, Vec } from './state';
import { spiceContacts, TRANSCENDENCE_DOSES } from './universe';

const PANEL = { x: 10, y: 72, w: 460, h: 90, inset: 8 };

/** Word wrap by bitmap glyph count, hard-breaking long tokens and marking omitted text. */
export function wrap(value: string, maxChars: number, rows: number): string[] {
  if (!Number.isInteger(maxChars) || !Number.isInteger(rows) || maxChars < 1 || rows < 1) return [];
  const out: string[] = []; let row: string[] = [];
  for (const word of value.trim().split(/\s+/).filter(Boolean)) {
    const glyphs = Array.from(word);
    if (row.length && row.length + 1 + glyphs.length > maxChars) { out.push(row.join('')); row = []; }
    if (row.length) row.push(' ');
    while (glyphs.length > maxChars) {
      out.push(glyphs.splice(0, maxChars).join(''));
    }
    row.push(...glyphs);
  }
  if (row.length) out.push(row.join(''));
  if (out.length > rows) {
    const tail = out.slice(rows - 1).join(' ');
    out.length = rows;
    out[rows - 1] = Array.from(tail).slice(0, maxChars - 1).join('') + '…';
  }
  return out;
}

/** Top-left: the step, what to do, how, and what comes after. Raster well, bitmap rows kept inside its inset. */
export function drawMissionPanel(ctx: CanvasRenderingContext2D, s: State): void {
  const m = mission(s);
  if (!m) return;
  const x = PANEL.x + PANEL.inset + 4, right = PANEL.x + PANEL.w - PANEL.inset - 4, width = right - x;
  uiPanel(ctx, 'well', PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const step = m.step > MISSION_STEPS ? 'FINAL' : `STEP ${m.step}/${MISSION_STEPS}`;
  text(ctx, `MISSION · ${step}`, x, PANEL.y + 17, 10, DIM);
  if (m.at) text(ctx, `${(Math.hypot(m.at.x - s.player.x, m.at.y - s.player.y) / 1000).toFixed(1)}km`, right, PANEL.y + 17, 10, ACCENT, 'right');
  text(ctx, m.title.slice(0, Math.floor(width / (15 * .6))), x, PANEL.y + 35, 15, ACCENT);
  const detail = wrap(m.detail, Math.floor(width / (10 * .6)), 2);
  text(ctx, detail[0] ?? '', x, PANEL.y + 50, 10, INK);
  text(ctx, detail[1] ?? '', x, PANEL.y + 64, 10, INK);
  text(ctx, wrap(`NEXT: ${m.next}`, Math.floor(width / (10 * .6)), 1)[0], x, PANEL.y + 78, 10, DIM);
}

/** Edge chevrons: the mission target in accent, the station and the nearest spice source dimmed, each named.
 * Kept clear of the chart and legend (top right), the delivery tracker (right), and the threat list (left). */
export function drawBeacons(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const v = s.voyage, m = mission(s);
  if (!v || v.lane) return;
  const p = s.player, beacons: { at: Vec; label: string; color: string; size: number }[] = [];
  if (m?.at) beacons.push({ at: m.at, label: m.label, color: ACCENT, size: 12 });
  const station = v.system.stations[0];
  if (station && !(m?.at && Math.hypot(m.at.x - station.x, m.at.y - station.y) < 1)) beacons.push({ at: station, label: 'STATION · hand in / armory', color: DIM, size: 8 });
  if (v.cargo) {
    const source = [...spiceContacts(v.system, v.elapsed)].filter(c => c.kind !== 'station').sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    if (source && !(m?.at && Math.hypot(m.at.x - source.x, m.at.y - source.y) < 1)) beacons.push({ at: source, label: 'CONTRACTS', color: '#6c6c6c', size: 7 });
  }
  const placed: { x: number; y: number }[] = [];
  for (const b of beacons) {
    const dx = b.at.x - p.x, dy = b.at.y - p.y, d = Math.hypot(dx, dy);
    const k = Math.min((w / 2 - 110) / Math.max(1, Math.abs(dx)), (h / 2 - 170) / Math.max(1, Math.abs(dy)));
    if (k >= 1) continue;  // on screen: the thing itself is the marker
    const at = { x: w / 2 + dx * k, y: h / 2 + dy * k };
    if (at.x > w - 370 && at.y < 540) at.y = 540;   // chart, legend and delivery tracker live there
    if (at.x < 330) at.y = Math.max(330, Math.min(420, at.y));  // between the threat list and the guide card
    while (placed.some(q => Math.abs(q.x - at.x) < 200 && Math.abs(q.y - at.y) < 30)) at.y += 30;
    placed.push({ x: at.x, y: at.y });
    ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.atan2(dy, dx));
    ctx.beginPath(); ctx.moveTo(b.size, 0); ctx.lineTo(-b.size * .6, -b.size * .66); ctx.lineTo(-b.size * .6, b.size * .66); ctx.closePath();
    ctx.fillStyle = b.color; ctx.fill(); ctx.restore();
    const caption = `${b.label} · ${(d / 1000).toFixed(1)}km`, size = b.size >= 12 ? 11 : 9, half = bitmapWidth(caption, size) / 2 + 10;
    label(ctx, caption, Math.max(half, Math.min(w - half, at.x)), at.y + (at.y < h / 2 ? 30 : -20), size, b.color, 'center');
  }
}

/** World space: a short arrow beside the ship pointing at the mission target, so the heading is never a guess. */
export function drawCompass(ctx: CanvasRenderingContext2D, s: State): void {
  const m = mission(s);
  if (!m?.at) return;
  const p = s.player, dx = m.at.x - p.x, dy = m.at.y - p.y, d = Math.hypot(dx, dy);
  if (d < 90) return;
  const a = Math.atan2(dy, dx);
  ctx.save(); ctx.translate(p.x + Math.cos(a) * 44, p.y + Math.sin(a) * 44); ctx.rotate(a);
  ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath();
  ctx.fillStyle = ACCENT; ctx.globalAlpha = .85; ctx.fill(); ctx.globalAlpha = 1; ctx.restore();
}

/** Bottom left in flight, top left on a course: how a run works, in seven lines. H hides and shows it. */
export function drawGuide(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const v = s.voyage;
  if (!v || !s.guide) return;
  void w;
  const x = 18, y = v.lane ? 108 : h - 66 - 56 - 30 - 140, lines = [
    '1 ACCEPT a delivery: E at a ship or port',
    '2 DOSE your cut with C: 4 per ring inward',
    '3 GATE: E at an edge marker, pick a star',
    '4 FTL COURSE: cross the exit line',
    '5 HAND IN at the receiver station',
    `GOAL: the center with ${TRANSCENDENCE_DOSES} doses, then E`,
    'F at a station: guns and air support',
  ];
  uiPanel(ctx, 'well', x, y, 250, 140);
  text(ctx, 'HOW A RUN WORKS', x + 12, y + 20, 10, ACCENT);
  text(ctx, 'H hide', x + 238, y + 20, 9, DIM, 'right');
  lines.forEach((row, i) => text(ctx, row, x + 12, y + 38 + i * 14, 9, i === 5 ? ACCENT : INK));
}

/** The lane HUD's mission line, under its top bar. */
export function drawLaneMission(ctx: CanvasRenderingContext2D, s: State, w: number): void {
  const m = mission(s);
  if (!m) return;
  label(ctx, `STEP ${m.step}/${MISSION_STEPS} · ${m.title} · ${m.detail}`, w / 2, 116, 11, ACCENT, 'center');
  if (s.player.hp <= 3) label(ctx, 'HULL CRITICAL: 1-4 fires your arms, SPACE brakes before obstacles', w / 2, 146, 11, LOCK, 'center');
}
