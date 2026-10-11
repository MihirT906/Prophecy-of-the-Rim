import { deliveryQuest } from './quest';
import { drawQuestTracker } from './quest-render';
import { bitmapText, bitmapWidth } from './bitmap-text';
import { livingWorld, planetLabel, WORLD_HP, worldKey } from './planet-hazards';
import { uiPanel } from './raster-ui';
import { contractCountdown, ownedSpice, transitSpice } from './contracts';
import { drawAsteroid, drawDeepSpace, drawPlanet, drawStation, metalPanel } from './retro-render';
import { SECTOR_CONFIG } from './sector-config';
import { TILE } from './data';
import type { State, Vec } from './state';
import { spiceContacts, celestialPosition, debrisPosition, OUTER_RING, PRESCIENCE_REQUIRED, routeBetween, TRANSCENDENCE_DOSES } from './universe';
import { interactionAt, objective, passage, raceTime, type Voyage } from './voyage';
import { drawBeacons, drawCompass, drawGuide, drawMissionPanel } from './mission-render';
import { deliveryOffer } from './contracts';
import { reducedMotion } from './accessibility';

export const INK = '#e0e0e0', DIM = '#919191', ACCENT = '#dfc58b', LOCK = '#ba8686', DELIVERY = '#7fd8c6';
export function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 14, color = INK, align: CanvasTextAlign = 'left'): void {
  bitmapText(ctx, value, x, y, size, color, align);
}
/** A world-space transponder plate or compact screen-space alert. */
export function label(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size = 12, color = INK, align: CanvasTextAlign = 'left'): void {
  const width = bitmapWidth(value, size), left = x - (align === 'center' ? width / 2 : align === 'right' ? width : 0);
  uiPanel(ctx, color === LOCK ? 'buttonSelected' : 'well', Math.round(left - 7), Math.round(y - size - 5), width + 14, size + 13);
  text(ctx, value, x, y, size, color, align);
}
export function line(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, color = DIM, width = 1): void {
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}
export function circle(ctx: CanvasRenderingContext2D, p: Vec, radius: number, color = DIM, fill = false): void {
  ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
}
export function drawGrayBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#080806'; ctx.fillRect(0, 0, w, h);
  uiPanel(ctx, 'terminal', 8, 8, w - 16, h - 16);
}

export function drawSystem(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const left = s.player.x - w / 2, top = s.player.y - h / 2;
  drawDeepSpace(ctx, s, w, h);
  const v = s.voyage!, system = v.system;
  circle(ctx, system.star, system.star.radius * 6, '#34303a');
  const glow = ctx.createRadialGradient(system.star.x, system.star.y, system.star.radius * .7, system.star.x, system.star.y, system.star.radius * 2.8);
  glow.addColorStop(0, '#eeb85d70'); glow.addColorStop(1, '#b46d2400');
  ctx.fillStyle = glow; ctx.fillRect(system.star.x - system.star.radius * 3, system.star.y - system.star.radius * 3, system.star.radius * 6, system.star.radius * 6);
  drawPlanet(ctx, system.star, system.star.radius, 'stellar-furnace');
  const visible = (p: Vec, r: number) => p.x + r > left && p.x - r < left + w && p.y + r > top && p.y - r < top + h;
  for (const [index, planet] of system.planets.entries()) {
    const at = celestialPosition(system, planet, v.elapsed);
    if (!visible(at, planet.radius + 220)) continue;
    const life = v.worlds[worldKey(s, index)], alive = livingWorld(planet) && life?.awake && life.hp > 0;
    const color = planet.kind === 'ocean' ? '#65e1d5' : planet.kind === 'safe' ? '#86b99b' : '#e99b7b';
    ctx.save();
    if (life?.hp === 0) ctx.globalAlpha = .35;
    drawPlanet(ctx, at, planet.radius, `${v.universe.seed}:${planet.name}`);
    if (planet.kind === 'radiation' || planet.kind === 'storm' || alive) {
      const reach = planet.radius + (alive ? 190 : 150);
      ctx.setLineDash([8, 9]); circle(ctx, at, reach, color); ctx.setLineDash([]);
      if (alive || planet.kind === 'storm') circle(ctx, at, planet.radius + 10 + (v.elapsed % 2) * 65, color);
    }
    if (alive) {
      // A vast iris and writhing limbs reveal the false planet's living anatomy.
      for (let arm = 0; arm < 8; arm++) {
        const a = arm * Math.PI / 4 + Math.sin(v.elapsed + arm) * .18;
        line(ctx, { x: at.x + Math.cos(a) * planet.radius * .7, y: at.y + Math.sin(a) * planet.radius * .7 },
          { x: at.x + Math.cos(a + .25) * (planet.radius + 55), y: at.y + Math.sin(a + .25) * (planet.radius + 55) }, color, 7);
      }
      circle(ctx, at, planet.radius * .38, color, true);
      circle(ctx, { x: at.x + Math.sin(v.elapsed) * 12, y: at.y }, planet.radius * .2, '#111421', true);
      ctx.fillStyle = '#352b31'; ctx.fillRect(at.x - 100, at.y - planet.radius - 56, 200, 8);
      ctx.fillStyle = color; ctx.fillRect(at.x - 100, at.y - planet.radius - 56, 200 * life.hp / WORLD_HP, 8);
      if (life.clock > (life.hp < WORLD_HP / 2 ? 2.3 : 3.8)) label(ctx, 'PULSE INCOMING / CLEAR THE RING', at.x, at.y + planet.radius + 215, 12, color, 'center');
    }
    label(ctx, life?.hp === 0 ? 'INERT REMAINS' : livingWorld(planet) && !alive ? 'ANOMALOUS WORLD / APPROACH WITH CAUTION' : planetLabel(planet), at.x, at.y - planet.radius - 75, 12, color, 'center');
    ctx.restore();
  }
  for (const hazard of system.hazards) {
    if (hazard.kind !== 'ion-cloud' || !visible(hazard, hazard.radius)) continue;
    circle(ctx, hazard, hazard.radius, '#54434a');
    label(ctx, 'ION SHEAR / ENGINE INTERFERENCE', hazard.x, hazard.y, 13, LOCK, 'center');
  }
  for (const body of system.debris) {
    const at = debrisPosition(body, v.elapsed);
    if (visible(at, body.radius)) drawAsteroid(ctx, at, body.radius, `${body.x}:${body.y}`);
  }
  ctx.strokeStyle = '#aaaaaa'; ctx.strokeRect(32, 32, s.arena.w * TILE - 64, s.arena.h * TILE - 64);
  for (let i = 1; i < v.trail.length; i++) {
    const a = v.trail[i - 1], b = v.trail[i];
    ctx.globalAlpha = Math.max(0, 1 - (v.elapsed - b.time) / SECTOR_CONFIG.trailSeconds) * .7;
    line(ctx, a, b, b.thrust ? ACCENT : '#707070', b.thrust ? 3 : 1);
  }
  ctx.globalAlpha = 1;
  const target = objective(s);
  if (target) { ctx.setLineDash([3, 5]); circle(ctx, target.at, 38, ACCENT); ctx.setLineDash([]); }
  drawCompass(ctx, s);
  for (const gate of system.gates) {
    const cost = passage(v, gate.to), color = cost.blocked ? LOCK : INK, sector = v.universe.sectors[gate.to];
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.strokeRect(gate.x - 13, gate.y - 13, 26, 26);
    const align = gate.edge === 'west' ? 'left' : gate.edge === 'east' ? 'right' : 'center';
    const x = gate.x + (gate.edge === 'west' ? 30 : gate.edge === 'east' ? -30 : 0);
    const y = gate.y + (gate.edge === 'south' ? -31 : gate.edge === 'north' ? 35 : -2);
    const inward = sector.ring < v.universe.sectors[v.sectorId].ring;
    const head = `GATE > ${sector.name.toUpperCase()} · R${sector.ring}${inward ? ' · INWARD' : ''}`;
    const why = cost.required > v.consumed ? `NEEDS ${cost.required} DOSES (${v.consumed}/${cost.required})` : cost.blocked ? `NEEDS ${cost.fare} SPICE ABOARD` : `E TO LEAVE · FARE ${cost.fare}`;
    const plateWidth = Math.max(bitmapWidth(head, 11), bitmapWidth(why, 10), 116);
    uiPanel(ctx, 'well', x - (align === 'right' ? plateWidth : align === 'center' ? plateWidth / 2 : 0) - 7, y - 17, plateWidth + 14, 39);
    text(ctx, head, x, y, 11, color, align);
    text(ctx, why, x, y + 15, 10, cost.blocked ? LOCK : DIM, align);
  }
  const waiting = Math.max(0, Math.ceil((v.stockReadyAt[v.sectorId] ?? 0) - v.elapsed));
  for (const contact of spiceContacts(system, v.elapsed)) {
    if (!visible(contact, contact.radius + 180)) continue;
    const near = Math.hypot(contact.x - s.player.x, contact.y - s.player.y) <= contact.radius + 100;
    if (contact.kind === 'ship') {
      ctx.save(); ctx.translate(contact.x, contact.y);
      ctx.beginPath(); ctx.moveTo(34, 0); ctx.lineTo(13, -20); ctx.lineTo(-30, -20);
      ctx.lineTo(-30, 20); ctx.lineTo(13, 20); ctx.closePath();
      ctx.fillStyle = '#454545'; ctx.fill(); ctx.strokeStyle = ACCENT; ctx.stroke();
      ctx.strokeRect(-17, -12, 16, 24); ctx.restore();
    } else if (contact.kind === 'station') {
      drawStation(ctx, contact, `${v.universe.seed}:${contact.id}`, s.time);
    } else {
      // Planet surface was rendered above; the landing light marks its port.
      circle(ctx, { x: contact.x + contact.radius * .35, y: contact.y - contact.radius * .25 }, 3, ACCENT, true);
    }
    ctx.setLineDash([5, 8]); circle(ctx, contact, contact.radius + 100, near ? ACCENT : '#555555'); ctx.setLineDash([]);
    const role = contact.kind === 'station' ? 'STATION' : contact.kind === 'ship' ? 'SPICE SHIP' : 'SMUGGLER PORT';
    label(ctx, `${contact.name.toUpperCase()} · ${role}`, contact.x, contact.y - contact.radius - 25, 13, ACCENT, 'center');
    if (near) {
      const hint = contact.kind === 'station' ? (v.cargo ? '[E] HAND IN SPICE   [F] ARMORY' : '[E] RECEIVER / NO CARGO   [F] ARMORY')
        : waiting ? `NETWORK RESUPPLY ${waiting}s` : v.cargo?.contract ? '[E] COMMS / DELIVERY IN PROGRESS' : `[E] DELIVERY OFFER / YOUR CUT ${deliveryOffer(v, contact.id).cut} SPICE`;
      label(ctx, hint, contact.x, contact.y + contact.radius + 28, 12, ACCENT, 'center');
    }
  }
  if (v.sectorId === 0) {
    circle(ctx, system.beacon, 35, ACCENT); circle(ctx, system.beacon, 28, ACCENT);
    label(ctx, 'TRANSCEND', system.beacon.x, system.beacon.y - 50, 14, ACCENT, 'center');
    label(ctx, `${TRANSCENDENCE_DOSES} DOSES + E`, system.beacon.x, system.beacon.y + 58, 11, DIM, 'center');
  }
}

export function drawFlightHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const v = s.voyage!, sector = v.universe.sectors[v.sectorId], cargo = v.cargo;
  uiPanel(ctx, 'well', 10, 72, 460, 50);
  uiPanel(ctx, 'hudTop', 0, 0, w, 66); uiPanel(ctx, 'hudBottom', 0, h - 66, w, 66);
  for (const x of [w * .38, w * .67]) line(ctx, { x, y: 9 }, { x, y: 56 }, '#665744', 2);
  // Segmented glass gauges sit beneath the engraved readouts.
  for (let i = 0; i < 24; i++) {
    ctx.fillStyle = i / 24 < s.player.hp / s.player.maxHp ? '#984d3d' : '#30221e'; ctx.fillRect(w / 2 - 113 + i * 6, 54, 4, 4);
    ctx.fillStyle = i / 24 < v.consumed / TRANSCENDENCE_DOSES ? '#869cba' : '#222b36'; ctx.fillRect(w / 2 + 42 + i * 3, 54, 2, 4);
  }
  line(ctx, { x: 0, y: 62 }, { x: w, y: 62 }, '#555555'); line(ctx, { x: 0, y: h - 62 }, { x: w, y: h - 62 }, '#555555');
  text(ctx, `${sector.name.toUpperCase()} / RING ${sector.ring}`, 18, 24, 16);
  text(ctx, cargo ? `SEALED ${cargo.contract?.due ?? cargo.remaining} > ${v.universe.sectors[cargo.destination].name.toUpperCase()}` : 'NO CONTRACT / HAIL A SHIP OR PLANET', 18, 47, 12, cargo ? ACCENT : DIM);
  text(ctx, `PRESCIENCE ${v.consumed}/${TRANSCENDENCE_DOSES}`, w / 2, 24, 14, ACCENT, 'center');
  text(ctx, `HULL ${Math.ceil(s.player.hp)}/${s.player.maxHp}   YOUR SPICE ${ownedSpice(v)}   REP ${v.reputation}`, w / 2, 47, 12, INK, 'center');
  text(ctx, cargo?.contract ? `DELIVERY ${contractCountdown(v)} / +${cargo.contract.bonus} SPICE` : `FLIGHT TIME ${raceTime(v.elapsed)}`, w - 18, 24, 16, cargo?.contract && cargo.contract.deadline - v.elapsed <= 30 ? LOCK : INK, 'right');
  const speed = Math.hypot(s.player.vx, s.player.vy);
  text(ctx, `SUBLIGHT ${speed.toFixed(0)} / ${SECTOR_CONFIG.cruiseSpeed}   BRAKE ${Math.ceil(speed * speed / (2 * SECTOR_CONFIG.brake))}m   RISK ${sector.danger}/5`, w - 18, 47, 12, DIM, 'right');
  text(ctx, 'WASD move   ARROWS aim + fire   SPACE brake   E interact   M map   ESC controls', 18, h - 18, 12, DIM);
  const action = interactionAt(s), target = objective(s), quest = deliveryQuest(v);
  const missionFailed = v.noticeTimer > 0 && /^(DEADLINE EXPIRED|SHIPMENT STOLEN)/.test(v.notice);
  const instruction = missionFailed ? v.notice : action ? action.blocked ?? `[E] ${action.contactName ? `Hail ${action.contactName}` : action.label}` : quest ? 'FOLLOW THE GOLD MARKER / DELIVERY DETAILS ON THE RIGHT' : v.noticeTimer > 0 ? v.notice : target ? `APPROACH: ${target.label}` : 'M: choose a route';
  text(ctx, instruction, 18, h - 40, 13, missionFailed || action?.blocked ? LOCK : ACCENT);
  const box = { x: w - 224, y: 86, size: 196 }, scale = box.size / (s.arena.w * TILE);
  metalPanel(ctx, box.x - 12, box.y - 12, box.size + 24, box.size + 50);
  ctx.fillStyle = '#0c1818'; ctx.fillRect(box.x, box.y, box.size, box.size);
  for (let y = box.y; y < box.y + box.size; y += 4) { ctx.fillStyle = '#81a89008'; ctx.fillRect(box.x, y, box.size, 1); }
  ctx.strokeStyle = '#555555'; ctx.strokeRect(box.x, box.y, box.size, box.size);
  const mapAt = (p: Vec) => ({ x: box.x + p.x * scale, y: box.y + p.y * scale });
  for (const g of v.system.gates) { const at = mapAt(g); ctx.strokeStyle = DIM; ctx.lineWidth = 1; ctx.strokeRect(at.x - 3, at.y - 3, 6, 6); }
  circle(ctx, mapAt(v.system.star), 5, '#666666');
  for (const planet of v.system.planets) circle(ctx, mapAt(celestialPosition(v.system, planet, v.elapsed)), 3, planet.kind === 'safe' ? '#86b99b' : '#e99b7b');
  for (const contact of spiceContacts(v.system, v.elapsed)) {
    const at = mapAt(contact);
    if (contact.kind === 'station') { ctx.fillStyle = ACCENT; ctx.fillRect(at.x - 3, at.y - 3, 6, 6); }
    else { ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(Math.PI / 4); ctx.strokeStyle = ACCENT; ctx.lineWidth = 1; ctx.strokeRect(-2.5, -2.5, 5, 5); ctx.restore(); }
  }
  if (target) { line(ctx, mapAt(s.player), mapAt(target.at), ACCENT); circle(ctx, mapAt(target.at), 7, ACCENT); }
  circle(ctx, mapAt(s.player), 3, '#ffffff', true);
  text(ctx, 'CHART · ● you ◎ target ■ station', box.x, box.y + box.size + 15, 9, DIM);
  text(ctx, '◇ spice ○ planet □ gate · threat', box.x, box.y + box.size + 27, 9, DIM);
  if (target && quest) {
    // An on-screen delivery target gets gold brackets; everything off screen is handled by the named edge chevrons.
    const dx = target.at.x - s.player.x, dy = target.at.y - s.player.y;
    const k = Math.min((w / 2 - 100) / Math.max(1, Math.abs(dx)), (h / 2 - 155) / Math.max(1, Math.abs(dy)));
    if (k >= 1) {
      const px = w / 2 + dx, py = h / 2 + dy;
      ctx.strokeStyle = '#f0d486'; ctx.lineWidth = 3;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(px + sx * 44, py + sy * 24); ctx.lineTo(px + sx * 44, py + sy * 44); ctx.lineTo(px + sx * 24, py + sy * 44); ctx.stroke();
      }
      label(ctx, quest.stage === 'deliver' ? '[E] DELIVERY RECEIVER' : 'DELIVERY / EXIT HERE', px, py + 74, 12, '#f0d486', 'center');
    }
  }
  drawQuestTracker(ctx, s, w);
  drawMissionPanel(ctx, s);
  drawBeacons(ctx, s, w, h);
  drawGuide(ctx, s, w, h);
  if (v.storageError) label(ctx, 'SAVE UNAVAILABLE: browser storage is blocked or full', w / 2, 83, 12, LOCK, 'center');
}

const MAP_X = 430, MAP_Y = 378, MAP_R = 248, STAR_HIT = 20;
/** Chart position of a sector on the radial map. */
export function mapPoint(v: Voyage, id: number): Vec {
  const sector = v.universe.sectors[id];
  return { x: MAP_X + sector.x * MAP_R, y: MAP_Y + sector.y * MAP_R };
}
/** The star under a chart point, if any. Stars sit far enough apart that the nearest one wins. */
export function starAt(v: Voyage, p: Vec): number | null {
  let found: number | null = null, closest = STAR_HIT;
  for (const sector of v.universe.sectors) {
    const at = mapPoint(v, sector.id), d = Math.hypot(at.x - p.x, at.y - p.y);
    if (d <= closest) { found = sector.id; closest = d; }
  }
  return found;
}

/** What Enter or a click on the selected star will do, in the words of the action box. */
function mapAction(v: Voyage, to: number, delivery: number[]): { title: string; detail: string; hint: string; color: string } {
  const sectors = v.universe.sectors, route = routeBetween(v.universe, v.sectorId, to), first = sectors[route[1]], drop = delivery[delivery.length - 1];
  if (to === v.sectorId) return v.departing
    ? { title: 'YOU ARE HERE', detail: 'CLICK THIS STAR OR PRESS ESC TO STAY IN THE SECTOR', color: INK,
      hint: drop === to ? 'Your delivery is in this sector. Stay and hand it in.' : 'Gold rings mark the stars you can jump to right now.' }
    : { title: 'YOU ARE HERE', detail: 'CLICK OR ENTER TO CLEAR YOUR COURSE', hint: 'To travel, fly past the sector edge or through a gate.', color: INK };
  if (!v.departing) return { title: 'CLICK OR ENTER TO SET COURSE', color: ACCENT, hint: 'Fly out through that gate to open the jump chart.',
    detail: `${route.length - 1} JUMP${route.length > 2 ? 'S' : ''} / LEAVE BY THE ${first.name.toUpperCase()} GATE` };
  if (!sectors[v.sectorId].neighbors.includes(to)) return { title: 'NO DIRECT LANE FROM HERE', color: INK,
    detail: `FIRST JUMP: ${first.name.toUpperCase()} / ${route.length - 1} JUMPS IN ALL`,
    hint: drop === to ? 'Your delivery goes here. Jump to the first star.' : 'Click or Enter to plot it, then jump to the first star.' };
  const cost = passage(v, to);
  if (v.consumed < cost.required) return { title: 'LOCKED / CANNOT JUMP YET', color: LOCK,
    detail: `RING ${sectors[to].ring} NEEDS ${cost.required} DOSES. YOU HAVE TAKEN ${v.consumed}.`, hint: 'Take doses with C in flight. Each uses one of your spice.' };
  if (cost.blocked) return { title: 'LOCKED / CANNOT JUMP YET', color: LOCK,
    detail: `PASSAGE COSTS ${cost.fare} SPICE. YOU HAVE ${transitSpice(v)} TO SPEND.`, hint: 'Sealed contract cargo cannot pay fares.' };
  return { title: 'CLICK OR ENTER TO JUMP HERE', color: ACCENT,
    detail: `PASSAGE ${cost.fare} SPICE / YOU HAVE ${transitSpice(v)} TO SPEND`,
    hint: delivery[1] === to ? 'Your delivery goes this way. Then fly its FTL course.' : 'You then fly its FTL course. Lane walls are lethal.' };
}

export function drawGalaxyMap(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  drawGrayBackground(ctx, w, h);
  uiPanel(ctx, 'well', 100, 92, 650, 586);
  uiPanel(ctx, 'well', 783, 106, w - 807, 572);
  const v = s.voyage!, sectors = v.universe.sectors, at = (id: number) => mapPoint(v, id), departing = v.departing;
  const lanes = sectors[v.sectorId].neighbors.map(id => ({ id, cost: passage(v, id) })), lane = (id: number) => departing ? lanes.find(l => l.id === id) : undefined;
  text(ctx, 'THE INWARD PASSAGE', 36, 43, 28);
  text(ctx, departing ? 'SECTOR EXIT / Click a gold-ringed star to jump there. Passage costs spice, then you fly its FTL course.'
    : 'ROUTE PLANNER / Click any star to plot a course. To travel, fly out past the sector edge or through a gate.', 36, 72, 13, DIM);
  for (let ring = 1; ring <= OUTER_RING; ring++) circle(ctx, { x: MAP_X, y: MAP_Y }, ring / OUTER_RING * MAP_R, '#404040');
  for (const sector of sectors) for (const neighbor of sector.neighbors) if (neighbor > sector.id) line(ctx, at(sector.id), at(neighbor), '#474747');
  // Inward hops beyond your prescience are dashed red; outward and same-ring hops never need doses.
  const drawRoute = (route: number[], width: number, dash: number[]) => {
    for (let i = 1; i < route.length; i++) {
      const locked = sectors[route[i]].ring < sectors[route[i - 1]].ring && v.consumed < PRESCIENCE_REQUIRED[sectors[route[i]].ring];
      ctx.setLineDash(locked ? [4, 5] : dash); line(ctx, at(route[i - 1]), at(route[i]), locked ? LOCK : ACCENT, width);
    }
    ctx.setLineDash([]);
  };
  if (departing) for (const l of lanes) drawRoute([v.sectorId, l.id], 2, []);
  if (v.navTarget !== s.cursor) drawRoute(routeBetween(v.universe, v.sectorId, v.navTarget), 1, [2, 6]);
  const route = routeBetween(v.universe, v.sectorId, s.cursor);
  drawRoute(route, 3, []);
  // The delivery route stays on top in its own colour, with chevrons pointing toward the receiver.
  const contract = v.cargo?.contract, quest = deliveryQuest(v), drop = contract ? v.cargo!.destination : null;
  const delivery = drop === null ? [] : routeBetween(v.universe, v.sectorId, drop);
  for (let i = 1; i < delivery.length; i++) {
    const a = at(delivery[i - 1]), b = at(delivery[i]), angle = Math.atan2(b.y - a.y, b.x - a.x);
    const locked = sectors[delivery[i]].ring < sectors[delivery[i - 1]].ring && v.consumed < PRESCIENCE_REQUIRED[sectors[delivery[i]].ring];
    ctx.setLineDash(locked ? [6, 5] : []); line(ctx, a, b, DELIVERY, 3); ctx.setLineDash([]);
    ctx.save(); ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2); ctx.rotate(angle);
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fillStyle = DELIVERY; ctx.fill(); ctx.restore();
  }
  // Nested markers never overlap: reach ring, then dock square, then the selection reticle above the label.
  const pulse = reducedMotion() ? 0 : Math.sin(s.time * 5);
  for (const sector of sectors) {
    const p = at(sector.id), current = sector.id === v.sectorId, jump = lane(sector.id), r = sector.id ? 5 : 10;
    circle(ctx, p, r, current ? INK : v.visited.includes(sector.id) ? '#bbbbbb' : '#686868', true);
    if (current) circle(ctx, p, r + 4, INK);
    if (jump) {
      ctx.lineWidth = 2; ctx.strokeStyle = jump.cost.blocked ? LOCK : ACCENT;
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 4 + (jump.cost.blocked ? 0 : pulse), 0, Math.PI * 2); ctx.stroke();
    }
    if (sector.id === drop) { ctx.strokeStyle = DELIVERY; ctx.lineWidth = 2; ctx.strokeRect(p.x - r - 8, p.y - r - 8, 2 * r + 16, 2 * r + 16); }
    if (sector.id === s.cursor) {
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 14, 0, Math.PI * 2); ctx.stroke();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) line(ctx, { x: p.x + dx * (r + 14), y: p.y + dy * (r + 14) }, { x: p.x + dx * (r + 20), y: p.y + dy * (r + 20) }, INK, 2);
    }
  }
  for (const sector of sectors) {
    const p = at(sector.id), current = sector.id === v.sectorId, jump = lane(sector.id), name = sector.id ? sector.name : 'CENTER';
    if (!current && sector.id !== s.cursor && sector.id && sector.ring !== OUTER_RING && !jump && sector.id !== drop) continue;
    label(ctx, current ? `YOU: ${name}` : sector.id === drop ? `DELIVERY: ${name}` : name, p.x, p.y + (sector.id ? 30 : 35), 10,
      sector.id === drop ? DELIVERY : jump ? jump.cost.blocked ? LOCK : ACCENT : current || sector.id === s.cursor ? INK : DIM, 'center');
  }
  const selected = sectors[s.cursor], hops = route.length - 1, action = mapAction(v, s.cursor, delivery), x = 805;
  text(ctx, selected.name.toUpperCase(), x, 150, 24, ACCENT);
  text(ctx, `RING ${selected.ring} / ${hops === 0 ? 'YOU ARE HERE' : hops === 1 ? 'DIRECT LANE FROM HERE' : `${hops} JUMPS FROM HERE`}`, x, 180, 12);
  text(ctx, `DANGER ${selected.danger}/5`, x, 202, 12, selected.danger >= 4 ? LOCK : DIM);
  uiPanel(ctx, action.color === LOCK ? 'buttonSelected' : 'well', 795, 220, w - 831, 96);
  text(ctx, action.title, x, 248, 16, action.color);
  text(ctx, action.detail, x, 274, 12);
  text(ctx, action.hint, x, 296, 12, DIM);
  uiPanel(ctx, 'well', 795, 328, w - 831, 88);
  if (contract && quest && drop !== null) {
    const next = delivery[1], hops = delivery.length - 1, cost = next === undefined ? null : passage(v, next), name = next === undefined ? '' : sectors[next].name.toUpperCase();
    const step = next === undefined ? [departing ? 'THE RECEIVER IS IN THIS SECTOR: ESC, THEN FLY TO IT' : 'THE RECEIVER IS IN THIS SECTOR: FLY TO IT, PRESS E', DELIVERY]
      : cost!.blocked ? [`NEXT JUMP ${name} IS LOCKED: ${v.consumed < cost!.required ? `NEED ${cost!.required} DOSES` : `NEED ${cost!.fare} SPICE`}`, LOCK]
      : [`${departing ? `CLICK ${name} TO JUMP` : `LEAVE BY THE ${name} GATE`} / ${hops} JUMP${hops > 1 ? 'S' : ''} TO GO`, DELIVERY];
    text(ctx, `YOUR DELIVERY / ${contractCountdown(v)} LEFT`, x, 354, 14, DELIVERY);
    text(ctx, `${contract.due} SPICE TO ${quest.station.toUpperCase()}, ${quest.system.toUpperCase()}`, x, 378, 12);
    text(ctx, step[0], x, 400, 12, step[1]);
  } else {
    text(ctx, 'NO DELIVERY YET', x, 354, 14, DIM);
    text(ctx, 'Hail a spice ship or planet port with E to take a contract.', x, 378, 12, DIM);
  }
  text(ctx, departing ? 'JUMPS FROM HERE' : 'LANES FROM YOUR SECTOR', x, 442, 14);
  lanes.forEach((l, k) => {
    const chosen = l.id === s.cursor, status = !l.cost.blocked ? 'READY' : v.consumed < l.cost.required ? `NEED ${l.cost.required} DOSES` : 'NEED SPICE';
    text(ctx, `${chosen ? '>' : ' '} ${sectors[l.id].name.padEnd(15)} ${String(l.cost.fare).padStart(2)} SPICE  ${status}${delivery[1] === l.id ? '  < DELIVERY' : ''}`, x, 464 + k * 19, 12,
      l.cost.blocked ? LOCK : delivery[1] === l.id ? DELIVERY : chosen ? ACCENT : INK);
  });
  text(ctx, `PRESCIENCE ${v.consumed}/${TRANSCENDENCE_DOSES} DOSES / SPENT ${v.spent} SPICE`, x, 610, 13, ACCENT);
  text(ctx, `YOUR SPICE ${ownedSpice(v)} / SEALED CARGO ${contract?.due ?? 0}`, x, 632, 13);
  text(ctx, `DOSES TO ENTER RING 3/2/1/0: ${[3, 2, 1, 0].map(r => PRESCIENCE_REQUIRED[r]).join('/')}`, x, 656, 12, DIM);
  const reset = contract ? 'R delivery route' : 'R reset course';
  text(ctx, departing ? `CLICK a gold star to jump   ARROWS select   ENTER jump   ESC stay here   ${reset}`
    : `CLICK a star to set course   ARROWS select   ENTER set course   ${reset}   M/ESC close`, 36, h - 54, 12);
  text(ctx, 'Simulation paused.  Gold ring = jump now   red = locked   white reticle = selected   teal = your delivery route', 36, h - 28, 11, DIM);
}
