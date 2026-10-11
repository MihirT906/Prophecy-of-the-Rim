import { uiPanel } from './raster-ui';
import { WEAPONS } from './data';
import { shopOffers, shopStation } from './shop';
import { ACCENT, DIM, drawGrayBackground, INK, line, LOCK, text } from './space-render';
import type { State } from './state';
import { ownedSpice } from './contracts';

const COLS = [70, 110, 470, 620, 740, 860, 980, 1100];  // x of each armory table column

/** Flight HUD additions: the mounted weapon with its rounds, and the armory prompt while a station is in reach. */
export function drawShopHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const p = s.player;
  text(ctx, `WEAPON ${WEAPONS[p.weapon].name} ${p.weapon === 'pistol' ? '∞' : Math.floor(p.ammo)}`, w - 18, h - 40, 13, p.weapon === 'pistol' ? DIM : ACCENT, 'right');
  if (shopStation(s)) text(ctx, '[F] ARMORY / WEAPONS FOR SPICE', w - 18, h - 18, 12, ACCENT, 'right');
}

export function drawShop(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  drawGrayBackground(ctx, w, h);
  const v = s.voyage!, p = s.player, station = shopStation(s), offers = shopOffers(s), aboard = ownedSpice(v);
  text(ctx, 'ARMORY', 60, 92, 34);
  text(ctx, `${(station?.name ?? 'STATION').toUpperCase()} / PAYMENT IN MELANGE ONLY`, 60, 122, 13, DIM);
  text(ctx, `YOUR SPICE ${aboard}`, w - 60, 92, 22, aboard ? ACCENT : LOCK, 'right');
  text(ctx, `MOUNTED: ${WEAPONS[p.weapon].name} ${p.weapon === 'pistol' ? '∞' : Math.floor(p.ammo)}`, w - 60, 122, 13, INK, 'right');
  line(ctx, { x: 60, y: 146 }, { x: w - 60, y: 146 }, '#555555');
  ['', 'WEAPON', 'PRICE', 'ROUNDS', 'DAMAGE', 'SHOTS/s', 'PELLETS', 'PIERCE'].forEach((label, k) => text(ctx, label, COLS[k], 182, 11, DIM));
  const pageStart=Math.floor(s.cursor/3)*3;
  offers.slice(pageStart,pageStart+3).forEach((o, k) => {
    const d = WEAPONS[o.id], y = 228 + k * 78, on = k+pageStart === s.cursor, color = o.blocked ? (on ? LOCK : DIM) : on ? ACCENT : INK;
    uiPanel(ctx, o.blocked ? 'buttonDisabled' : on ? 'buttonSelected' : 'button', 60, y - 34, w - 120, 66);
    ctx.fillStyle = d.color; ctx.fillRect(COLS[0] + 4, y - 14, 10, 20);
    [on ? '>' : '', o.refill ? `${d.name} / REARM` : d.name, `${o.price} SPICE`, String(o.rounds), d.dmg.toFixed(1),
      (1 / d.interval).toFixed(1), String(d.count), String(d.pierce)]
      .forEach((cell, c) => text(ctx, cell, COLS[c] + (c ? 0 : 24), y, c === 1 ? 20 : 15, c === 2 && o.blocked ? LOCK : color));
    text(ctx, o.blocked ?? (d.description ?? (o.refill ? 'ENTER: refill the magazine' : 'ENTER: buy and mount, replacing the current weapon')), COLS[1], y + 20, 11, o.blocked ? LOCK : DIM);
  });
  line(ctx, { x: 60, y: h - 150 }, { x: w - 60, y: h - 150 }, '#555555');
  text(ctx, 'Spice paid here leaves the hold for good: it cannot be sold, consumed or spent on passage.', 60, h - 118, 13, DIM);
  if (v.noticeTimer > 0) text(ctx, v.notice, 60, h - 100, 14, ACCENT);
  text(ctx, 'UP/DOWN select   ENTER buy   TAB air support   ESC / F undock', 60, h - 54, 13);
  text(ctx, `GUNS ${Math.floor(s.cursor/3)+1}/${Math.ceil(offers.length/3)}`, 60, 62, 12, ACCENT); text(ctx, 'AIR SUPPORT >', 150, 62, 12, DIM);
}
