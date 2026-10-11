import { bitmapWidth } from './bitmap-text';
import { uiPanel } from './raster-ui';
import { drawPortrait } from './comms-portrait';
import type { State } from './state';
import { voiceAvailable, voiceLevel, voiceMuted } from './alien-voice';
import { line, text } from './space-render';

export function drawComms(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const c = s.comms!;
  const bone = '#c2c4a7', rust = '#a2665c', dim = '#707a6e', t = c.elapsed;
  const speaking = c.shown < c.text.length;
  const level = voiceLevel(), motion = level || (speaking ? c.pulse * .6 : 0);
  ctx.fillStyle = '#090e0d'; ctx.fillRect(0, 0, w, h);
  uiPanel(ctx, 'terminal', 8, 8, w - 16, h - 16);
  uiPanel(ctx, 'portrait', 32, 141, 457, 496);
  uiPanel(ctx, 'well', 505, 148, w - 538, 420);
  uiPanel(ctx, s.input.held.has('Enter') ? 'buttonPressed' : 'buttonSelected', 505, 590, w - 538, 46);
  text(ctx, 'INCOMING / ENCRYPTED CARRIER', 44, 48, 14, rust);
  text(ctx, c.name.toUpperCase(), 44, 91, 27, bone);
  text(ctx, 'TRANSLATION IS APPROXIMATE. INTENT IS NOT VERIFIED.', 44, 119, 11, dim);
  const panel = { x: 44, y: 153, w: 433, h: 472 };
  ctx.fillStyle = '#111b17'; ctx.fillRect(panel.x, panel.y, panel.w, panel.h);
  ctx.save(); ctx.beginPath(); ctx.rect(panel.x, panel.y, panel.w, panel.h); ctx.clip();
  drawPortrait(ctx, c, motion);
  for (let y = panel.y; y < panel.y + panel.h; y += 5) { ctx.fillStyle = '#080d0b33'; ctx.fillRect(panel.x, y, panel.w, 1); }
  ctx.restore();
  text(ctx, c.entity.label, 60, 603, 11, bone);
  const x = 521, width = w - x - 51;
  text(ctx, c.response ? 'EXCHANGE ACKNOWLEDGED' : c.action === 'collect' ? 'SENDER / DELIVERY CONTRACT' : 'RECEIVER / CARGO HAND-IN', x, 179, 14, rust);
  line(ctx, { x, y: 199 }, { x: w - 48, y: 199 }, dim);
  // Lay out complete words first so a growing word never jumps between rows.
  const words = c.text.split(' '); let row = '', rowStart = 0, consumed = 0, y = 240;
  ctx.font = '18px monospace';
  const drawRow = () => {
    const visible = row.slice(0, Math.max(0, c.shown - rowStart));
    const cursor = speaking && c.shown >= rowStart && c.shown <= rowStart + row.length;
    text(ctx, visible + (cursor ? ' ▌' : ''), x, y, 18, bone);
  };
  for (const word of words) {
    if (bitmapWidth(`${row} ${word}`, 18) > width && row) {
      drawRow(); row = ''; rowStart = consumed; y += 32;
    }
    row += `${row ? ' ' : ''}${word}`; consumed += word.length + 1;
  }
  drawRow();
  c.details.forEach((detail, i) => text(ctx, detail, x, 352 + i * 20, 12, i === 4 ? rust : bone));
  for (let i = 0; i < 64; i++) {
    const amplitude = 2 + motion * (8 + 16 * Math.abs(Math.sin(i * 1.7 + t * 12)));
    line(ctx, { x: x + i * 9, y: 490 - amplitude }, { x: x + i * 9, y: 490 + amplitude }, speaking ? dim : '#374038', 3);
  }
  text(ctx, voiceMuted ? 'VOICE MUTED / V TO ENABLE' : voiceAvailable() ? 'LIVE VOCAL ENVELOPE / V TO MUTE' : 'VOICE UNAVAILABLE / TEXT CHANNEL ACTIVE', x, 548, 11, dim);
  if (c.canSteal && !c.response) text(ctx, c.theftArmed ? '[X AGAIN] STEAL / -25 REP / LOSE BONUS' : '[X] STEAL / -25 REP / LOSE BONUS', x, 582, 12, rust);
  text(ctx, c.response ? '[ENTER] END TRANSMISSION' : `[ENTER] ${c.prompt}`, x, 618, 18, bone);
  line(ctx, { x: 44, y: h - 96 }, { x: w - 44, y: h - 96 }, '#344037');
  text(ctx, 'ESC disconnect     SPACE reveal text     V voice on/off', 44, h - 59, 13, bone);
  text(ctx, 'SHIP IN HOLD / FLIGHT CLOCK PAUSED / NO TRANSFER UNTIL CONFIRMED', 44, h - 34, 11, dim);
}
