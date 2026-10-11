import { uiPanel } from './raster-ui';
import { ownedSpice } from './contracts';
// The station armory screen: an overlay on the frozen system, gray-box like the rest of the HUD.
import { ARMS, MARKET, RARITIES } from './data';
import { ACCENT, DIM, INK, LOCK, line, text } from './space-render';
import type { State } from './state';

const SOLD = '#5a5a5a';

export function drawMarket(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const m = s.market, v = s.voyage;
  if (!m || !v) return;
  ctx.fillStyle = '#080806'; ctx.fillRect(0, 0, w, h);
  uiPanel(ctx, 'terminal', 8, 8, w - 16, h - 16);
  uiPanel(ctx, 'well', 802, 118, w - 834, 262);
  uiPanel(ctx, 'hudBottom', 24, h - 140, w - 48, 116);
  const sector = v.universe.sectors[v.sectorId], x = 44, top = 164, rowH = 62, right = 820;
  text(ctx, `ARMORY / ${m.station.toUpperCase()}`, x, 64, 28, INK);
  text(ctx, '< GUNS', w - x - 150, 64, 12, DIM); text(ctx, 'AIR SUPPORT', w - x, 64, 12, ACCENT, 'right');
  text(ctx, `SPICE ABOARD ${ownedSpice(v)}   ARSENAL ${v.arsenal.length}/${MARKET.arsenal}   RING ${sector.ring} / ${sector.name.toUpperCase()}`, x, 94, 13, DIM);
  line(ctx, { x, y: 112 }, { x: w - x, y: 112 }, '#4a4a4a');
  text(ctx, 'STOCK / PRICES IN PERSONAL SPICE', x, 126, 12, DIM);
  text(ctx, `ARSENAL 1-${MARKET.arsenal}`, right, 140, 12, DIM);
  m.stock.forEach((item, i) => {
    const y = top + i * rowH, def = ARMS[item.id], rarity = RARITIES[item.rarity], selected = i === s.cursor;
    uiPanel(ctx, selected ? 'buttonSelected' : 'well', x - 12, y - 25, 752, 57);
    const main = item.sold ? SOLD : selected ? ACCENT : INK;
    text(ctx, `${selected ? '> ' : '  '}${i + 1}. ${def.name}`, x, y, 18, main);
    text(ctx, rarity.name, x + 310, y, 12, item.sold ? SOLD : rarity.color);
    text(ctx, item.sold ? 'SOLD' : `${item.price} SPICE`, x + 440, y, 14, main);
    text(ctx, `${rarity.durability} USES`, x + 560, y, 12, item.sold ? SOLD : DIM);
    text(ctx, def.desc, x + 22, y + 22, 12, item.sold ? '#454545' : DIM);
  });
  const current = m.stock[s.cursor];
  if (current) text(ctx, `"${ARMS[current.id].lore}"`, x, top + m.stock.length * rowH + 8, 13, ACCENT);
  for (let k = 0; k < MARKET.arsenal; k++) {
    const y = top + k * 48, owned = v.arsenal[k];
    if (!owned) { text(ctx, `${k + 1}. ---`, right, y, 15, '#454545'); continue; }
    const rarity = RARITIES[owned.rarity];
    text(ctx, `${k + 1}. ${ARMS[owned.id].name}`, right, y, 15, INK);
    text(ctx, rarity.name, right, y + 18, 11, rarity.color);
    text(ctx, '●'.repeat(owned.durability) + '○'.repeat(Math.max(0, rarity.durability - owned.durability)), right + 150, y + 18, 11, rarity.color);
  }
  if (m.notice) text(ctx, m.notice, x, h - 118, 14, m.notice.includes('bought') ? ACCENT : LOCK);
  line(ctx, { x, y: h - 96 }, { x: w - x, y: h - 96 }, '#344037');
  text(ctx, 'UP/DOWN select   ENTER buy   TAB guns page   ESC or F undock', x, h - 59, 13, INK);
  text(ctx, 'FLIGHT CLOCK PAUSED / SPICE SPENT HERE NEVER PAYS A FARE / ITEMS BREAK WHEN THEIR USES RUN OUT', x, h - 34, 11, DIM);
}
