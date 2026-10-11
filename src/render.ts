import { drawPlayerBombs, drawBombHud } from './player-bomb';
import { drawCombatFeedback } from './combat-feedback';
import { drawShredderLocks } from './shredder';
import { beginLayout } from './ui-layout';
import { drawPlayerShip, drawTrafficShip } from './ship-render';
import { uiPanel } from './raster-ui';
import { metalPanel } from './retro-render';
import { damageAssist, gameSpeed, musicEnabled, reducedMotion } from './accessibility';
import { drawLane, drawLaneHud } from './hyperspace-render';
import { drawComms } from './comms-render';
import { drawFoe, drawStorms, drawThreatHud } from './foe-render';
import { drawPatrol, drawPatrolHud } from './patrol-render';
import { listSaves, loadSave } from './save';
import { drawShop, drawShopHud } from './shop-render';
import { ACCENT, circle, DIM, drawFlightHud, drawGalaxyMap, drawGrayBackground, drawSystem, INK, label, line, text } from './space-render';
import type { State } from './state';
import { raceTime } from './voyage';
import { drawAircraft, drawArsenal, drawHazards } from './arms-render';
import { drawMarket } from './market-render';

/** Gray-box rendering deliberately keeps partner-owned combat objects visible without new art. */
function entities(ctx: CanvasRenderingContext2D, s: State): void {
  drawHazards(ctx, s);
  drawPlayerBombs(ctx, s);
  drawShredderLocks(ctx, s);
  for (const e of s.enemies) {
    if (s.voyage?.lane) { drawTrafficShip(ctx, e); continue; }
    if (e.patrol) { drawPatrol(ctx, e, s.time); continue; }
    if (drawFoe(ctx, e, s.time)) continue;
    circle(ctx, e, e.r, e.flash > 0 ? '#ffffff' : '#b98484', true);
    text(ctx, e.kind, e.x, e.y - e.r - 6, 10, DIM, 'center');
  }
  for (const b of s.bullets) {
    const speed = Math.hypot(b.vx, b.vy) || 1;
    line(ctx, { x: b.x - b.vx / speed * 18, y: b.y - b.vy / speed * 18 }, b, b.safeForPlayer ? '#9affdf' : b.debris ? '#ff845d' : b.owner === 'player' ? '#f1db99' : '#eb887a', b.owner === 'player' ? 3 : 4);
    circle(ctx, b, b.r, INK, true);
  }
  for (const p of s.pickups) {
    ctx.strokeStyle = INK; ctx.strokeRect(p.x - 8, p.y - 8, 16, 16);
    text(ctx, p.kind === 'ammo' ? 'A' : 'W', p.x, p.y + 4, 10, INK, 'center');
  }
  for (const fx of s.particles) if (!fx.decal) { ctx.globalAlpha = Math.max(0, fx.ttl / fx.maxTtl); ctx.fillStyle = fx.color; ctx.fillRect(fx.x, fx.y, fx.size, fx.size); }
  ctx.globalAlpha = 1;
  drawPlayerShip(ctx, s);
  drawCombatFeedback(ctx, s);
  drawAircraft(ctx, s);
}

function rows(ctx: CanvasRenderingContext2D, items: string[], cursor: number, x: number, y: number): void {
  items.forEach((item, i) => {
    const width = Math.max(360, item.length * 11 + 48);
    uiPanel(ctx, i === cursor ? 'buttonSelected' : 'button', x - width / 2, y + i * 40 - 25, width, 38);
    text(ctx, item, x, y + i * 40, 18, i === cursor ? ACCENT : INK, 'center');
  });
}

export function render(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  beginLayout(w, h);
  if (s.screen === 'comms' && s.comms) { drawComms(ctx, s, w, h); return; }
  if (s.screen === 'map' && s.voyage) { drawGalaxyMap(ctx, s, w, h); return; }
  if (s.screen === 'shop' && s.voyage) { drawShop(ctx, s, w, h); return; }
  if (s.voyage) {
    ctx.save();
    if (s.shake && s.screen === 'playing') ctx.translate((Math.random() - .5) * s.shake, (Math.random() - .5) * s.shake);
    ctx.fillStyle = s.voyage.lane ? '#11171e' : '#171717'; ctx.fillRect(0, 0, w, h);
    ctx.translate(w / 2 - s.player.x, h / 2 - s.player.y);
    if (s.voyage.lane) drawLane(ctx, s, w, h); else { drawSystem(ctx, s, w, h); drawStorms(ctx, s); }
    entities(ctx, s); ctx.restore();
    if (s.voyage.lane) drawLaneHud(ctx, s, w, h); else { drawFlightHud(ctx, s, w, h); drawPatrolHud(ctx, s, w, h); drawThreatHud(ctx, s, w, h); drawShopHud(ctx, s, w, h); }
    if (gameSpeed() < 1 || damageAssist()) label(ctx, `ASSIST / GAME SPEED ${gameSpeed() * 100}%${damageAssist() ? ' / HALF DAMAGE' : ''}`, w / 2, h - 80, 12, ACCENT, 'center');
    drawArsenal(ctx, s, w, h);
    if(s.screen==='playing') drawBombHud(ctx,s,w,h);
  } else drawGrayBackground(ctx, w, h);
  if (s.screen === 'playing') return;
  if (s.screen === 'market' && s.market) { beginLayout(w, h); drawMarket(ctx, s, w, h); return; }
  beginLayout(w, h); // Modal replaces the flight HUD for layout purposes.
  ctx.fillStyle = 'rgba(13,13,13,.94)'; ctx.fillRect(0, 0, w, h);
  metalPanel(ctx, 24, 24, w - 48, h - 48);
  const x = w / 2, y = h / 2;
  switch (s.screen) {
    case 'title':
      text(ctx, 'PROPHECY OF THE RIM', x, y - 135, 44, INK, 'center');
      text(ctx, 'AN UNAUTHORIZED PASSAGE THROUGH THE DUNE UNIVERSE', x, y - 87, 13, DIM, 'center');
      text(ctx, 'GOAL: fly from the rim to the center of the chart with 16 doses of spice in your blood.', x, y - 30, 15, INK, 'center');
      text(ctx, 'EACH LEG: accept a delivery (E)  >  dose your cut (C)  >  leave by a gate (E)  >  fly the FTL course  >  hand in (E)', x, y + 2, 13, INK, 'center');
      text(ctx, 'The mission panel at the top left always names your next step and points at it.', x, y + 30, 12, DIM, 'center');
      text(ctx, 'H in flight shows or hides the guide card. Every ring inward needs four more doses.', x, y + 50, 12, DIM, 'center');
      uiPanel(ctx, 'buttonSelected', x - 180, y + 90, 360, 46);
      text(ctx, 'ENTER TO BEGIN', x, y + 119, 20, ACCENT, 'center');
      text(ctx, 'B: effects on/off / center and transcendence are this scenario\'s original premise.', x, h - 42, 11, DIM, 'center');
      break;
    case 'menu': {
      const pilot = loadSave();
      text(ctx, 'FLIGHT DECK', x, y - 130, 34, INK, 'center');
      text(ctx, pilot ? pilot.name : 'Create a pilot to start a run.', x, y - 83, 16, DIM, 'center');
      rows(ctx, ['Fly / Resume', 'Pilots', 'Controls'], s.cursor, x, y - 18);
      text(ctx, 'UP/DOWN SELECT / ENTER CONFIRM / ESC BACK', x, y + 127, 12, DIM, 'center');
      break;
    }
    case 'naming':
      text(ctx, 'PILOT CALLSIGN', x, y - 70, 28, INK, 'center');
      uiPanel(ctx, 'well', x - 260, y - 40, 520, 65);
      text(ctx, s.nameInput + (s.time % 1 < .5 ? '_' : ''), x, y, 28, ACCENT, 'center');
      text(ctx, 'ENTER: BEGIN ON THE OUTER RIM', x, y + 65, 13, DIM, 'center');
      break;
    case 'characters': {
      const pilots = listSaves(), top = Math.max(0, s.cursor - 10);
      text(ctx, 'PILOTS', x, 102, 34, INK, 'center');
      if (!pilots.length) text(ctx, 'NO PILOTS / N TO CREATE ONE', x, 210, 16, DIM, 'center');
      rows(ctx, pilots.slice(top, top + 11).map(p => `${p.name.padEnd(16)} ${p.voyage ? `${raceTime(p.voyage.elapsed)} / ${p.voyage.status}` : 'NEW RUN'}`), s.cursor - top, x, 185);
      text(ctx, 'N NEW / ENTER RESUME / X DELETE / ESC BACK', x, h - 60, 13, DIM, 'center');
      break;
    }
    case 'settings':
      text(ctx, 'FLIGHT MANUAL', x, 122, 32, INK, 'center');
      ['WASD: steer / thrust     SPACE: brake     Z: fire ahead', 'E: hail senders / hand in deliveries / leave at a transit marker', 'C: consume ONE personal spice, gaining one prescience',
        'M: radial map     R: restore the cargo objective', 'Cross a sector boundary, then choose the next star.',
        'Jumps use fuel allowance, then your spice. Sealed cargo is protected.', 'Inward jumps also need prescience. Keep spice for the fare.',
        'Same controls everywhere: sublight systems, faster FTL obstacle courses.', 'Reach the center, consume 16 doses, press E at its beacon.',
        'Map / pause freeze the clock. Ship loss ends the run.']
        .forEach((row, i) => text(ctx, row, x, 190 + i * 33, 14, i >= 4 ? DIM : INK, 'center'));
      text(ctx, `MUSIC: ${musicEnabled() ? 'ON' : 'OFF'}   U: toggle the score (voices and key sounds stay on)`, x, h - 146, 14, ACCENT, 'center');
      text(ctx, `ACCESSIBILITY / REDUCE MOTION: ${reducedMotion() ? 'ON' : 'OFF'}   GAME SPEED: ${gameSpeed() * 100}%   HALF DAMAGE: ${damageAssist() ? 'ON' : 'OFF'}`, x, h - 112, 15, ACCENT, 'center');
      text(ctx, 'R / ENTER: no shake or damage flash   G: slow the game for reaction time   H: hull takes half damage', x, h - 92, 12, DIM, 'center');
      text(ctx, 'ESC BACK', x, h - 62, 15, ACCENT, 'center');
      break;
    case 'paused':
      text(ctx, 'PAUSED', x, y - 90, 34, INK, 'center');
      rows(ctx, ['Resume', 'Main menu'], s.cursor, x, y - 13);
      text(ctx, `CLOCK STOPPED / ESC RESUME / U MUSIC ${musicEnabled() ? 'ON' : 'OFF'}`, x, y + 104, 13, DIM, 'center');
      break;
    case 'dead':
    case 'transcended': {
      const won = s.screen === 'transcended', v = s.voyage;
      text(ctx, won ? 'TRANSCENDED' : 'SHIP LOST / RUN ENDED', x, y - 135, 40, won ? ACCENT : INK, 'center');
      if (v) {
        text(ctx, `FLIGHT TIME ${raceTime(v.elapsed)}`, x, y - 70, 26, INK, 'center');
        text(ctx, `${v.consumed}/16 DOSES  /  ${v.jumps} JUMPS  /  ${v.deliveries} DELIVERIES`, x, y - 23, 16, DIM, 'center');
        text(ctx, won ? 'The chart ends. Your awareness does not.' : v.notice || 'The route survives. This attempt does not.', x, y + 24, 16, INK, 'center');
        text(ctx, `UNIVERSE ${v.universe.seed}`, x, y + 65, 11, DIM, 'center');
      }
      line(ctx, { x: x - 210, y: y + 95 }, { x: x + 210, y: y + 95 }, '#4a4a4a');
      text(ctx, 'ENTER: NEW RUN, SAME UNIVERSE / ESC: FLIGHT DECK', x, y + 139, 14, ACCENT, 'center');
      break;
    }
  }
}
