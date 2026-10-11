import { deliveryQuest } from './quest';
import { contractCountdown, CONTRACT_SECONDS, DEFAULT_EMBARGO_SECONDS, deliveryOffer, deliveryReceiver, DELIVERY_TRUST, ownedSpice, reputationLabel, routeFare, spendOwned, spendTransit, START_REPUTATION, THEFT_PENALTY, transitSpice, type DeliveryContract, type DeliveryOffer } from './contracts';
import { captureLane, generateLane, installLane, laneCenter, laneContains, readLane, type Lane, type LaneSave } from './hyperspace';
import { advanceDialogue, createComms, farewell } from './comms';
import { speakGlyph, stopVoice, toggleVoice } from './alien-voice';
import { isSolid } from './arena';
import { ARMS, RARITIES, TILE } from './data';
import { takePress } from './input';
import { writeSave } from './save';
import type { ArsenalItem, State, Vec } from './state';
import { spiceContacts, generateSystem, generateUniverse, LOT_SIZE, nextInwardSector, OUTER_RING, PRESCIENCE_REQUIRED,
  SYSTEM_W, SYSTEM_H, RESTOCK_SECONDS, routeBetween, SECTOR_COUNT, START_SECTOR, STARTING_CREDITS, STARTING_SPICE, TRANSCENDENCE_DOSES, type Gate, type SolarSystem, type Universe } from './universe';

export interface Shipment { contract?: DeliveryContract; serial: number; origin: number; destination: number; remaining: number; commodity: 'melange'; illegal: true }
export type RunStatus = 'active' | 'won' | 'lost';
export interface WorldLife { hp: number; awake: boolean; clock: number }
export interface VoyageSave {
  worlds?: Record<string, WorldLife>;
  version: 7; earnedSpice: number; embargoUntil: number; personalSpice: number; reputation: number; thefts: number; lane: LaneSave | null; velocity: Vec; spent: number; departing: boolean; seed: string; sectorId: number; position: Vec; hull: number; navTarget: number;
  visited: number[]; credits: number; deliveries: number; consumed: number; sold: number; collected: number;
  jumps: number; elapsed: number; status: RunStatus; cargo: Shipment | null; stockReadyAt: Record<number, number>;
  arsenal: ArsenalItem[]; armed: number; purchased: Record<string, number[]>;  // armory: owned items, spice spent on them, market slots bought per visit key
}
export type UniverseEvent =
  | { type: 'sector-entered'; from: number | null; to: number; ring: number; carryingSpice: boolean }
  | { type: 'cargo-collected'; sectorId: number; units: number; destination: number }
  | { type: 'spice-consumed'; sectorId: number; total: number }
  | { type: 'cargo-sold'; sectorId: number; units: number; reward: number; delivered: boolean }
  | { type: 'transcended'; elapsed: number };
export interface Voyage {
  worlds: Record<string, WorldLife>;
  earnedSpice: number; embargoUntil: number; personalSpice: number; reputation: number; thefts: number;
  lane: Lane | null; spent: number; departing: boolean; trailClock: number; trail: (Vec & { time: number; thrust: boolean })[];
  universe: Universe; system: SolarSystem; sectorId: number; visited: number[]; navTarget: number;
  credits: number; deliveries: number; consumed: number; sold: number; collected: number; jumps: number; elapsed: number;
  status: RunStatus; cargo: Shipment | null; stockReadyAt: Record<number, number>;
  notice: string; noticeTimer: number; jumpTimer: number; saveTimer: number; events: UniverseEvent[]; storageError: boolean;
  arsenal: ArsenalItem[]; armed: number; purchased: Record<string, number[]>;
}
export interface Interaction { offer?: DeliveryOffer; contactName?: string; contactId?: string; kind: 'collect' | 'sell' | 'jump' | 'transcend'; label: string; blocked: string | null; at: Vec; gate?: Gate }
export const INTERACT_RANGE = 48;

function int(v: unknown, min: number, max: number): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max; }
function number(v: unknown, min = 0, max = 1e9): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; }
function record(v: unknown): v is Record<string, unknown> { return typeof v === 'object' && v !== null && !Array.isArray(v); }
/** Missing armory fields (saves written before the market) read as empty; present but malformed ones reject the run. */
function readArsenal(value: unknown): ArsenalItem[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 8) return null;
  const out: ArsenalItem[] = [];
  for (const item of value) {
    if (!record(item) || !(item.id as string in ARMS) || !(item.rarity as string in RARITIES) || !int(item.durability, 1, RARITIES[item.rarity as keyof typeof RARITIES].durability)) return null;
    out.push({ id: item.id as ArsenalItem['id'], rarity: item.rarity as ArsenalItem['rarity'], durability: item.durability as number });
  }
  return out;
}
function readPurchased(value: unknown): Record<string, number[]> | null {
  if (value === undefined) return {};
  if (!record(value)) return null;
  const out: Record<string, number[]> = {};
  for (const [key, slots] of Object.entries(value)) {
    if (!Array.isArray(slots) || !slots.every(n => int(n, 0, 15))) return null;
    out[key] = [...new Set(slots as number[])];
  }
  return out;
}

/** Reject incompatible prototypes or malformed runs without discarding the pilot record. */
export function readVoyageSave(value: unknown): VoyageSave | null {
  if (!record(value) || ![2, 3, 4, 5, 6, 7].includes(value.version as number) || typeof value.seed !== 'string' || !value.seed.length || value.seed.length > 128
    || !int(value.sectorId, 0, SECTOR_COUNT - 1) || !int(value.navTarget, 0, SECTOR_COUNT - 1)
    || !record(value.position) || !number(value.position.x, -1e9) || !number(value.position.y, -1e9) || !number(value.hull)
    || !number(value.elapsed) || !int(value.credits, 0, 1e9) || !int(value.consumed, 0, TRANSCENDENCE_DOSES)
    || !int(value.deliveries, 0, 1e8) || !int(value.jumps, 0, 1e8) || !int(value.collected, 0, 1e9) || !int(value.sold, 0, 1e9)
    || !Array.isArray(value.visited) || !record(value.stockReadyAt)
    || !['active', 'won', 'lost'].includes(value.status as string)) return null;
  const earnedSpice = value.version === 7 ? value.earnedSpice : 0;
  const embargoUntil = value.version === 7 ? value.embargoUntil : 0;
  if (!int(earnedSpice, 0, 1e9) || !number(embargoUntil)) return null;
  const personalSpice = Number(value.version) >= 6 ? value.personalSpice : 0;
  const reputation = Number(value.version) >= 6 ? value.reputation : START_REPUTATION;
  const thefts = Number(value.version) >= 6 ? value.thefts : 0;
  if (!int(personalSpice, 0, 1e9) || !int(reputation, 0, 100) || !int(thefts, 0, 1e8)) return null;
  const spent = value.version === 2 ? 0 : value.spent;
  const velocity = value.version === 2 ? { x: 0, y: 0 } : value.velocity;
  if (!int(spent, 0, 1e9) || !record(velocity) || !number(velocity.x, -1e6, 1e6) || !number(velocity.y, -1e6, 1e6) || (value.version !== 2 && typeof value.departing !== 'boolean')) return null;
  const armed = value.armed === undefined ? 0 : value.armed, arsenal = readArsenal(value.arsenal), purchased = readPurchased(value.purchased);
  if (!int(armed, 0, 1e9) || !arsenal || !purchased) return null;
  let rawLane = value.lane;
  const legacyTransit = value.version === 4 && record(rawLane) && !('course' in rawLane);
  if (legacyTransit) {
    if (!record(rawLane) || !int(rawLane.from, 0, SECTOR_COUNT - 1) || !int(rawLane.to, 0, SECTOR_COUNT - 1)) return null;
    const u = generateUniverse(value.seed);
    if (!u.sectors[rawLane.from].neighbors.includes(rawLane.to)) return null;
    rawLane = { ...rawLane, elapsed: 0, course: generateLane(u, rawLane.from, rawLane.to), enemies: [], bullets: [] };
  }
  const lane = Number(value.version) >= 4 && rawLane !== null ? readLane(rawLane) : null;
  if (Number(value.version) >= 4 && rawLane !== null && !lane) return null;
  if (lane && (lane.from !== value.sectorId || !generateUniverse(value.seed).sectors[lane.from]?.neighbors.includes(lane.to) || value.departing === true || value.status === 'won')) return null;
  let cargo: Shipment | null = null;
  if (value.cargo !== null) {
    const c = value.cargo;
    if (!record(c) || !int(c.serial, 1, 1e9) || !int(c.origin, 0, SECTOR_COUNT - 1) || !int(c.destination, 0, SECTOR_COUNT - 1)
      || !int(c.remaining, 1, LOT_SIZE) || c.commodity !== 'melange' || c.illegal !== true) return null;
    if (!generateUniverse(value.seed).sectors[c.origin].neighbors.includes(c.destination)) return null;
    cargo = { serial: c.serial, origin: c.origin, destination: c.destination, remaining: c.remaining, commodity: 'melange', illegal: true };
    if (Number(value.version) >= 6 && c.contract !== undefined) {
      const d = c.contract;
      if (!record(d) || typeof d.issuer !== 'string' || !d.issuer.length || d.issuer.length > 80 || typeof d.recipient !== 'string'
        || !int(d.due, 1, LOT_SIZE) || !int(d.fuel, 0, 5) || !int(d.cut, 1, 5) || !int(d.reward, 1, LOT_SIZE * 2)
        || c.remaining !== d.due + d.fuel || d.due + d.fuel + d.cut > LOT_SIZE
        || !generateSystem(generateUniverse(value.seed), c.destination).stations.some(st => st.id === d.recipient)) return null;
      const bonus = value.version === 7 ? d.bonus : 0, deadline = value.version === 7 ? d.deadline : value.elapsed + CONTRACT_SECONDS;
      if (!int(bonus, 0, 24) || !number(deadline)) return null;
      cargo.contract = { bonus, deadline, issuer: d.issuer, recipient: d.recipient, due: d.due, fuel: d.fuel, cut: d.cut, reward: d.reward };
    }
  }
  if (value.collected + earnedSpice !== value.sold + value.consumed + spent + armed + personalSpice + (cargo?.remaining ?? 0) || value.collected % LOT_SIZE !== 0) return null;
  if (value.status === 'won' && (value.sectorId !== 0 || value.consumed < TRANSCENDENCE_DOSES || value.hull <= 0)) return null;
  if ((value.status === 'active' && value.hull <= 0) || (value.status === 'lost' && value.hull > 0)) return null;
  const stockReadyAt: Record<number, number> = {};
  for (const [key, t] of Object.entries(value.stockReadyAt)) if (int(Number(key), 0, SECTOR_COUNT - 1) && number(t)) stockReadyAt[Number(key)] = t;
  const worlds: Record<string, WorldLife> = {};
  if (record(value.worlds)) for (const [key, life] of Object.entries(value.worlds)) {
    if (/^\d+:\d+$/.test(key) && record(life) && number(life.hp, 0, 180) && typeof life.awake === 'boolean' && number(life.clock, 0, 6)) worlds[key] = { hp: life.hp, awake: life.awake, clock: life.clock };
  }
  return { worlds, version: 7, earnedSpice, embargoUntil, personalSpice, reputation, thefts, lane, spent, velocity: legacyTransit ? { x: 0, y: 0 } : { x: velocity.x, y: velocity.y }, departing: value.departing === true, seed: value.seed, sectorId: value.sectorId, navTarget: value.navTarget,
    position: legacyTransit && lane ? { x: 240, y: laneCenter(lane.course, 240) } : { x: value.position.x * (value.version === 2 ? SYSTEM_W / 40 : value.version === 3 ? SYSTEM_W / 640 : 1), y: value.position.y * (value.version === 2 ? SYSTEM_H / 24 : value.version === 3 ? SYSTEM_H / 640 : 1) }, hull: value.hull, credits: value.credits,
    deliveries: value.deliveries, consumed: value.consumed, sold: value.sold, collected: value.collected,
    jumps: value.jumps, elapsed: value.elapsed, status: value.status as RunStatus, cargo, stockReadyAt, arsenal, armed, purchased,
    visited: [...new Set([...value.visited.filter(n => int(n, 0, SECTOR_COUNT - 1)), value.sectorId])] };
}

function emit(v: Voyage, event: UniverseEvent): void { v.events.push(event); if (v.events.length > 32) v.events.shift(); }
/** Drain once after updateVoyage: the stable integration boundary for partner systems. */
export function consumeUniverseEvents(s: State): UniverseEvent[] { return s.voyage?.events.splice(0) ?? []; }
export function announce(v: Voyage, message: string): void { v.notice = message; v.noticeTimer = 5; }

function safePosition(system: SolarSystem, at: Vec, r: number): boolean {
  return [-r, r].every(dx => [-r, r].every(dy => !isSolid(system.arena, Math.floor((at.x + dx) / TILE), Math.floor((at.y + dy) / TILE))));
}
function installSector(s: State, id: number, from: number | null, position?: Vec): void {
  const v = s.voyage!;
  v.sectorId = id; v.system = generateSystem(v.universe, id);
  if (!v.visited.includes(id)) v.visited.push(id);
  const candidate = position ?? v.system.gates.find(g => g.to === from)?.arrival ?? v.system.arena.start;
  const at = safePosition(v.system, candidate, s.player.r) ? candidate : v.system.arena.start;
  s.arena = v.system.arena; s.arenaN = OUTER_RING - v.universe.sectors[id].ring + 1;
  s.wave = 0; s.waveTotal = 0; s.spawnQueue = []; s.exitOpen = false; s.spawnTimer = 0;
  s.enemies = []; s.bullets = []; s.pickups = []; s.particles = []; s.aircraft = []; s.hazards = []; s.shake = 0;
  Object.assign(s.player, { x: at.x, y: at.y, vx: 0, vy: 0 });
  v.jumpTimer = .65; v.trail = []; v.trailClock = 0;
  emit(v, { type: 'sector-entered', from, to: id, ring: v.universe.sectors[id].ring, carryingSpice: v.cargo !== null });
}

export function startVoyage(s: State, seed: string, snapshot?: VoyageSave): void {
  s.comms = null; stopVoice();
  const saved = readVoyageSave(snapshot), universe = generateUniverse(saved?.seed ?? seed), sectorId = saved?.sectorId ?? START_SECTOR;
  s.voyage = { earnedSpice: saved?.earnedSpice ?? STARTING_SPICE, embargoUntil: saved?.embargoUntil ?? 0, worlds: saved?.worlds ?? {}, personalSpice: saved?.personalSpice ?? STARTING_SPICE, reputation: saved?.reputation ?? START_REPUTATION, thefts: saved?.thefts ?? 0, lane: null, spent: saved?.spent ?? 0, departing: saved?.departing ?? false, trail: [], trailClock: 0, universe, sectorId, system: generateSystem(universe, sectorId),
    visited: saved?.visited ?? [START_SECTOR], navTarget: saved?.navTarget ?? START_SECTOR,
    credits: saved?.credits ?? STARTING_CREDITS, deliveries: saved?.deliveries ?? 0, consumed: saved?.consumed ?? 0,
    sold: saved?.sold ?? 0, collected: saved?.collected ?? 0, jumps: saved?.jumps ?? 0, elapsed: saved?.elapsed ?? 0,
    status: saved?.status ?? 'active', cargo: saved?.cargo ?? null, stockReadyAt: saved?.stockReadyAt ?? {},
    notice: '', noticeTimer: 0, jumpTimer: 0, saveTimer: 0, events: [], storageError: false,
    arsenal: saved?.arsenal.map(item => ({ ...item })) ?? [], armed: saved?.armed ?? 0, purchased: saved?.purchased ?? {} };
  s.market = null;

  s.player.hp = saved ? Math.min(s.player.maxHp, saved.hull) : s.player.maxHp;
  installSector(s, sectorId, null, saved?.position);
  if (saved?.lane) {
    installLane(s, saved.lane, saved.lane);
    const course = saved.lane.course, x = Math.max(64, Math.min(course.length - 64, saved.position.x));
    const center = laneCenter(course, x), y = Math.max(center - course.width / 2 + s.player.r, Math.min(center + course.width / 2 - s.player.r, saved.position.y));
    Object.assign(s.player, { x, y });
  }
  if (saved) { s.player.vx = saved.velocity.x; s.player.vy = saved.velocity.y; }
  s.screen = saved?.status === 'won' ? 'transcended' : saved?.status === 'lost' ? 'dead' : 'playing';
  if (s.voyage.departing && s.voyage.status === 'active') { s.screen = 'map'; s.cursor = nextInwardSector(universe, sectorId); }
  expireContract(s);
  if (s.voyage.noticeTimer) return;
  announce(s.voyage, saved ? 'Run resumed. M: route map. R: restore cargo objective.' : 'Fly to the nearby freighter. Within 100m of its hull, press E to review a delivery contract.');
}

export function captureVoyage(s: State): VoyageSave | undefined {
  const v = s.voyage;
  if (!v) return undefined;
  return { worlds: Object.fromEntries(Object.entries(v.worlds).map(([key, life]) => [key, { ...life }])), version: 7, earnedSpice: v.earnedSpice, embargoUntil: v.embargoUntil, personalSpice: v.personalSpice, reputation: v.reputation, thefts: v.thefts, lane: captureLane(s), velocity: { x: s.player.vx, y: s.player.vy }, spent: v.spent, departing: v.departing, seed: v.universe.seed, sectorId: v.sectorId, navTarget: v.navTarget,
    position: { x: s.player.x, y: s.player.y }, hull: s.player.hp, visited: [...v.visited],
    credits: v.credits, deliveries: v.deliveries, consumed: v.consumed, sold: v.sold, collected: v.collected,
    jumps: v.jumps, elapsed: v.elapsed, status: s.screen === 'dead' ? 'lost' : v.status,
    cargo: v.cargo ? { ...v.cargo, ...(v.cargo.contract ? { contract: { ...v.cargo.contract } } : {}) } : null, stockReadyAt: { ...v.stockReadyAt },
    arsenal: v.arsenal.map(item => ({ ...item })), armed: v.armed, purchased: Object.fromEntries(Object.entries(v.purchased).map(([k, slots]) => [k, [...slots]])) };
}

export function passage(v: Voyage, to: number): { fare: number; required: number; blocked: string | null } {
  const source = v.universe.sectors[v.sectorId], target = v.universe.sectors[to];
  if (!target || !source.neighbors.includes(to)) return { fare: 0, required: 0, blocked: 'No direct transit connection.' };
  const inward = target.ring < source.ring;
  const fare = routeFare(v, to);
  const required = inward ? PRESCIENCE_REQUIRED[target.ring] : 0;
  const blocked = v.consumed < required ? `Need ${required} consumed doses (${v.consumed}/${required}).`
    : transitSpice(v) < fare ? `Need ${fare} spendable spice for passage. Contract cargo is sealed.` : null;
  return { fare, required, blocked };
}

export function enterSector(s: State, to: number): boolean {
  const v = s.voyage;
  if (!v || v.lane || s.screen !== 'map' || !v.departing || v.status !== 'active') return false;
  const gate = v.system.gates.find(g => g.to === to), cost = passage(v, to);
  if (!gate) return false;
  if (cost.blocked) { announce(v, cost.blocked); return false; }
  const from = v.sectorId;
  if (!spendTransit(v, cost.fare)) return false;
  v.spent += cost.fare;
  v.departing = false; s.screen = 'playing';
  installLane(s, { from, to });
  announce(v, `${v.universe.sectors[to].name} · ${cost.fare ? `${cost.fare} spice paid` : 'transit'}`);
  writeSave(s);
  return true;
}

export function consumeSpice(s: State): boolean {
  const v = s.voyage;
  if (!v || v.lane || s.screen !== 'playing' || v.status !== 'active') return false;
  if (!ownedSpice(v)) { announce(v, 'No personal spice. Delivery cargo is sealed; earn another cut or steal it through comms.'); return false; }
  if (v.consumed >= TRANSCENDENCE_DOSES) { announce(v, 'Prescience complete. Keep the remaining cargo for passage.'); return false; }
  spendOwned(v, 1); v.consumed++;
  emit(v, { type: 'spice-consumed', sectorId: v.sectorId, total: v.consumed });
  announce(v, `Prescience ${v.consumed}/${TRANSCENDENCE_DOSES} · one unit from your personal cut.`);
  writeSave(s);
  return true;
}

export function interactionAt(s: State): Interaction | null {
  const v = s.voyage;
  if (!v || v.lane || v.status !== 'active' || v.jumpTimer > 0) return null;
  const near = (p: Vec) => Math.hypot(p.x - s.player.x, p.y - s.player.y) <= INTERACT_RANGE;
  if (v.sectorId === 0 && near(v.system.beacon)) return { kind: 'transcend', label: 'Transcend reality', at: v.system.beacon,
    blocked: v.consumed < TRANSCENDENCE_DOSES ? `Consume ${TRANSCENDENCE_DOSES - v.consumed} more doses before transcending.` : null };
  const contact = spiceContacts(v.system, v.elapsed)
    .filter(c => Math.hypot(c.x - s.player.x, c.y - s.player.y) <= c.radius + 100)
    .sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - a.radius - (Math.hypot(b.x - s.player.x, b.y - s.player.y) - b.radius))[0];
  if (contact) {
    if (contact.kind === 'station') {
      const cargo = v.cargo, contract = cargo?.contract;
      const correct = cargo?.destination === v.sectorId && (!contract || contract.recipient === contact.id);
      return { kind: 'sell', label: contract ? 'Hand in delivery' : 'Spice receiver', at: contact,
        blocked: !cargo ? 'No shipment to hand in. Ships and planet ports offer delivery work.'
          : contract && !correct ? `Wrong receiver. Deliver to ${v.universe.sectors[cargo.destination].name}.` : null,
        contactName: contact.name, contactId: contact.id };
    }
    const offer = deliveryOffer(v, contact.id);
    const waiting = Math.max(0, Math.ceil((v.stockReadyAt[v.sectorId] ?? 0) - v.elapsed));
    return { kind: 'collect', label: `Delivery offer / your cut ${offer.cut} spice`, offer, at: contact, contactName: contact.name, contactId: contact.id,
      blocked: v.cargo?.contract ? 'You already have a delivery. Finish it before accepting another.'
        : offer.blocked ?? (waiting ? `Next shipment in ${waiting}s of flight time.` : null) };
  }
  const gate = [...v.system.gates].sort((a, b) => Math.hypot(a.x - s.player.x, a.y - s.player.y) - Math.hypot(b.x - s.player.x, b.y - s.player.y)).find(near);
  if (!gate) return null;
  return { kind: 'jump', label: 'Leave sector and choose a destination', blocked: null, at: gate, gate };
}

/** Boundary crossing only opens the chart. No resource is charged until confirmation. */
export function openDeparture(s: State, preferred?: number): void {
  const v = s.voyage;
  if (!v || v.lane || s.screen !== 'playing' || v.jumpTimer > 0) return;
  v.departing = true; s.screen = 'map';
  // Preselect the first jump of a plotted course, which is the destination itself when adjacent.
  const course = routeBetween(v.universe, v.sectorId, v.navTarget)[1];
  s.cursor = preferred ?? (course !== undefined ? course : nextInwardSector(v.universe, v.sectorId));
  s.player.x = Math.max(180, Math.min(SYSTEM_W * TILE - 180, s.player.x));
  s.player.y = Math.max(180, Math.min(SYSTEM_H * TILE - 180, s.player.y));
  s.player.vx = 0; s.player.vy = 0;
  writeSave(s);
}
export function closeMap(s: State): void {
  if (!s.voyage) return;
  s.voyage.departing = false; s.voyage.jumpTimer = 1; s.screen = 'playing'; writeSave(s);
}

/** What a map choice did, worded for the input acknowledgement panel. */
export interface MapChoice { label: string; cue: 'select' | 'confirm' | 'back' | 'blocked' }

/** Enter or a click on a star. Departing: jump to a neighbour, stay on your own star, or plot a longer
 *  course without paying. Planning: set the course and close the chart. */
export function chooseOnMap(s: State, to: number): MapChoice {
  const v = s.voyage, target = v?.universe.sectors[to];
  if (!v || !target || s.screen !== 'map') return { label: 'NAV CHART UNAVAILABLE', cue: 'blocked' };
  const name = target.name.toUpperCase();
  if (!v.departing) {
    v.navTarget = to; closeMap(s);
    return { label: to === v.sectorId ? 'COURSE CLEARED' : `COURSE SET: ${name}`, cue: 'confirm' };
  }
  if (to === v.sectorId) { closeMap(s); return { label: 'STAYING IN THIS SECTOR', cue: 'back' }; }
  if (!v.universe.sectors[v.sectorId].neighbors.includes(to)) {
    v.navTarget = to;
    const first = v.universe.sectors[routeBetween(v.universe, v.sectorId, to)[1]];
    return { label: `COURSE SET / FIRST JUMP ${first.name.toUpperCase()}`, cue: 'select' };
  }
  const cost = passage(v, to);
  if (enterSector(s, to)) return { label: `JUMPING TO ${name} / -${cost.fare} SPICE`, cue: 'confirm' };
  return { label: v.consumed < cost.required ? `LOCKED: NEED ${cost.required} DOSES` : cost.blocked ? `LOCKED: NEED ${cost.fare} SPICE` : 'JUMP UNAVAILABLE', cue: 'blocked' };
}

export function resetNavigation(v: Voyage): void { v.navTarget = v.cargo?.destination ?? (v.consumed >= TRANSCENDENCE_DOSES ? 0 : v.sectorId); }
export function objective(s: State): { at: Vec; label: string } | null {
  const v = s.voyage;
  if (!v) return null;
  const quest = deliveryQuest(v);
  if (quest) return { at: quest.at, label: quest.label };
  if (v.navTarget === v.sectorId) {
    if (v.sectorId === 0 && v.consumed >= TRANSCENDENCE_DOSES) return { at: v.system.beacon, label: 'CENTER / TRANSCEND' };
    return v.cargo ? { at: v.system.dock, label: v.cargo.destination === v.sectorId ? 'DELIVER SPICE' : 'DELIVERY RECEIVER' }
      : (() => {
        const contact = spiceContacts(v.system, v.elapsed).filter(c => c.kind !== 'station' && !deliveryOffer(v, c.id).blocked).sort((a, b) =>
          Math.hypot(a.x - s.player.x, a.y - s.player.y) - a.radius - (Math.hypot(b.x - s.player.x, b.y - s.player.y) - b.radius))[0];
        return contact ? { at: contact, label: contact.name.toUpperCase() } : { at: v.system.cache, label: `CONTRACTS SUSPENDED ${Math.max(0, Math.ceil(v.embargoUntil - v.elapsed))}s` };
      })();
  }
  const next = routeBetween(v.universe, v.sectorId, v.navTarget)[1], gate = v.system.gates.find(g => g.to === next);
  return gate ? { at: gate, label: `TO ${v.universe.sectors[next].name.toUpperCase()}` } : null;
}

export function updateVoyage(s: State, dt: number): void {
  const v = s.voyage;
  if (!v || s.screen !== 'playing' || v.status !== 'active') return;
  v.elapsed += dt; v.saveTimer += dt;
  v.noticeTimer = Math.max(0, v.noticeTimer - dt);
  expireContract(s);
  if (v.lane) {
    v.lane.elapsed += dt;
    if (finishLane(s)) return;
    else if (v.saveTimer >= 2) { v.saveTimer = 0; writeSave(s); }
    return;
  }
  v.jumpTimer = Math.max(0, v.jumpTimer - dt);
  if (s.player.x <= 32 || s.player.y <= 32 || s.player.x >= SYSTEM_W * TILE - 32 || s.player.y >= SYSTEM_H * TILE - 32) { openDeparture(s); if (v.departing) return; }
  if (takePress(s.input, 'KeyC')) consumeSpice(s);
  if (takePress(s.input, 'KeyR')) resetNavigation(v);
  if (takePress(s.input, 'KeyE')) {
    const action = interactionAt(s);
    if (action && (action.kind === 'collect' || action.kind === 'sell')) {
      s.comms = createComms(`${v.universe.seed}:${v.sectorId}:${action.contactId}`, action.contactName ?? 'Unknown contact', action.kind, action.blocked);
      configureComms(s, action); s.screen = 'comms'; stopVoice();
    } else performAction(s, action);
  }

  if (v.saveTimer >= 2) { v.saveTimer = 0; writeSave(s); }
}

export function raceTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}.${Math.floor(seconds % 1 * 10)}`;
}

function performAction(s: State, action: Interaction | null): void {
  const v = s.voyage!;
    if (action?.blocked) announce(v, action.blocked);
    else if (action?.kind === 'collect') {
      const offer = action.offer!;
      const { destination, blocked: _, duration, ...terms } = offer;
      const contract: DeliveryContract = { ...terms, deadline: v.elapsed + duration };
      // Old prototype cargo is personal property and can coexist with a new contract.
      if (v.cargo) v.personalSpice += v.cargo.remaining;
      v.collected += LOT_SIZE; v.personalSpice += contract.cut;
      v.cargo = { serial: v.collected / LOT_SIZE, origin: v.sectorId, destination, remaining: contract.due + contract.fuel, contract, commodity: 'melange', illegal: true };
      v.stockReadyAt[v.sectorId] = v.elapsed + RESTOCK_SECONDS;
      v.navTarget = destination;
      emit(v, { type: 'cargo-collected', sectorId: v.sectorId, units: LOT_SIZE, destination });
      announce(v, `Contract accepted. Your ${contract.cut} spice cut is paid. Deliver ${contract.due} sealed units; ${contract.fuel} reserved for passage.`);
      writeSave(s);
    } else if (action?.kind === 'sell' && v.cargo) {
      const cargo = v.cargo, contract = cargo.contract;
      const delivered = cargo.destination === v.sectorId, units = contract?.due ?? cargo.remaining;
      const reward = contract?.reward ?? units;
      // Unused fuel is returned with the delivery, never silently duplicated or awarded again.
      v.credits += reward; v.sold += cargo.remaining;
      if (delivered) v.deliveries++;
      if (contract) { v.reputation = Math.min(100, v.reputation + DELIVERY_TRUST); v.personalSpice += contract.bonus; v.earnedSpice += contract.bonus; }
      v.cargo = null; v.navTarget = v.sectorId;
      emit(v, { type: 'cargo-sold', sectorId: v.sectorId, units, reward, delivered });
      announce(v, contract ? `Delivered ${units} sealed units. +${contract.bonus} spice, +${reward} credits, +${DELIVERY_TRUST} trust. Your spice cut stays yours.` : `Sold ${units} personal units for ${reward} credits.`);
      writeSave(s);
    } else if (action?.gate) openDeparture(s, action.gate.to);
    else if (action?.kind === 'transcend') {
      v.status = 'won'; s.screen = 'transcended';
      emit(v, { type: 'transcended', elapsed: v.elapsed }); writeSave(s);
    } else announce(v, 'Approach a planet port or spice ship, then press E within 100m of its hull.');
}
function configureComms(s: State, action: Interaction): void {
  const v = s.voyage!, c = s.comms!, cargo = v.cargo, contract = cargo?.contract;
  c.contactId = action.contactId; c.canSteal = !!contract;
  const rep = `REPUTATION ${v.reputation}/100 / ${reputationLabel(v.reputation)}`;
  if (contract && cargo) {
    const receiver = deliveryReceiver(v.universe, cargo.destination);
    c.details = [`DELIVER ${contract.due} SEALED SPICE / ${v.universe.sectors[cargo.destination].name.toUpperCase()}`,
      `RECEIVER: ${receiver.name.toUpperCase()}`, `YOUR CUT: ${contract.cut} PAID / PERSONAL BALANCE: ${ownedSpice(v)}`,
      `ON DELIVERY: +${contract.bonus} SPICE / +${contract.reward} CREDITS`, `DEADLINE ${contractCountdown(v)} FLIGHT TIME / FUEL ${contract.fuel}`, rep];
    c.text = action.blocked ?? `The seals match. Hand over ${contract.due} spice. Your cut is already yours; we will pay ${contract.bonus} more spice, ${contract.reward} credits, and vouch for you.`;
    c.prompt = action.blocked ? 'ACKNOWLEDGE' : 'HAND IN SEALED CARGO';
  } else if (action.kind === 'collect' && action.offer) {
    const o = action.offer, receiver = deliveryReceiver(v.universe, o.destination);
    c.details = [`DELIVER ${o.due} SEALED SPICE / ${v.universe.sectors[o.destination].name.toUpperCase()}`,
      `RECEIVER: ${receiver.name.toUpperCase()}`, `YOUR CUT: ${o.cut} SPICE NOW / FUEL ALLOWANCE: ${o.fuel}`,
      `ON DELIVERY: +${o.bonus} SPICE / +${o.reward} CREDITS / +${DELIVERY_TRUST} TRUST`, `DEADLINE 3:00 FLIGHT TIME / EXPIRY COUNTS AS THEFT`, rep];
    c.text = action.blocked ?? `Take this shipment to ${receiver.name}. Keep ${o.cut} spice as your cut, paid now. Deliver within three minutes of flight for ${o.bonus} more spice. Theft or expiry costs trust and suspends contracts.`;
    c.prompt = action.blocked ? 'ACKNOWLEDGE' : 'ACCEPT DELIVERY CONTRACT';
  } else {
    c.details = [`YOUR SPICE: ${ownedSpice(v)}`, rep];
    c.text = action.blocked ?? `This unsealed spice belongs to you. We can buy the ${cargo?.remaining ?? 0} units in your hold for the same number of credits.`;
    c.prompt = action.blocked ? 'ACKNOWLEDGE' : 'SELL PERSONAL CARGO';
  }
}

/** Theft and timeout share the same once-only failure settlement and saved penalty. */
function defaultContract(s: State, reason: 'theft' | 'expired'): boolean {
  const v = s.voyage;
  if (!v || v.status !== 'active' || !v.cargo?.contract) return false;
  const stolen = v.cargo.remaining;
  v.personalSpice += stolen; v.cargo = null; v.thefts++; v.reputation = Math.max(0, v.reputation - THEFT_PENALTY); v.navTarget = v.sectorId;
  v.embargoUntil = v.elapsed + DEFAULT_EMBARGO_SECONDS;
  announce(v, `${reason === 'expired' ? 'DEADLINE EXPIRED / THEFT' : 'SHIPMENT STOLEN'}: ${stolen} spice kept, bonus lost. -${THEFT_PENALTY} REP. Contracts blocked ${DEFAULT_EMBARGO_SECONDS}s.`);
  if (s.comms) {
    const c = s.comms;
    c.response = true; c.canSteal = false; c.theftArmed = false;
    c.details = [`PERSONAL SPICE: ${v.personalSpice}`, `REPUTATION ${v.reputation}/100 / ${reputationLabel(v.reputation)}`, `CONTRACTS SUSPENDED ${DEFAULT_EMBARGO_SECONDS}s FLIGHT TIME / BONUS FORFEITED`];
    c.text = reason === 'expired' ? 'The deadline has passed. The network has marked the shipment stolen. Your contract is over.' : 'You broke the seals. Keep the cargo. Your delivery payment is cancelled; the network has suspended your contracts.';
    c.shown = 0; c.wait = 0; c.pulse = 0; stopVoice();
  }
  writeSave(s); return true;
}
export function expireContract(s: State): boolean {
  const v = s.voyage;
  return !!v?.cargo?.contract && v.elapsed >= v.cargo.contract.deadline && defaultContract(s, 'expired');
}
export function stealShipment(s: State): boolean {
  if (s.screen !== 'comms' || !s.comms || s.comms.response) return false;
  return defaultContract(s, 'theft');
}

export function closeComms(s: State): void {
  stopVoice(); s.comms = null; s.screen = 'playing';
}
export function confirmComms(s: State): void {
  const c = s.comms;
  if (!c || s.screen !== 'comms') return;
  if (c.response) { closeComms(s); return; }
  if (expireContract(s)) return;
  const action = interactionAt(s);
  if (!action || action.kind !== c.action || action.contactId !== c.contactId) { closeComms(s); return; }
  performAction(s, action);
  const v = s.voyage!;
  c.details = [`YOUR SPICE: ${ownedSpice(v)} / CREDITS: ${v.credits}`, `REPUTATION ${v.reputation}/100 / ${reputationLabel(v.reputation)}`,
    v.cargo?.contract ? `ACTIVE DELIVERY: ${v.cargo.contract.due} SEALED UNITS / ${v.universe.sectors[v.cargo.destination].name.toUpperCase()}` : 'NO ACTIVE DELIVERY'];
  c.response = true; c.text = `${s.voyage!.notice} ${farewell(c.seed)}`; c.shown = 0; c.wait = 0; c.pulse = 0; stopVoice();
}
export function updateComms(s: State, dt: number): void {
  const c = s.comms;
  if (!c || s.screen !== 'comms') return;
  if (takePress(s.input, 'Escape')) { closeComms(s); return; }
  if (takePress(s.input, 'KeyV')) toggleVoice();
  if (takePress(s.input, 'KeyX') && !c.response && s.voyage?.cargo?.contract) {
    if (!c.theftArmed) c.theftArmed = true;
    else stealShipment(s);
    return;
  }
  if (takePress(s.input, 'Enter')) { c.theftArmed = false; confirmComms(s); return; }
  if (takePress(s.input, 'Space')) { c.shown = c.text.length; c.pulse = 0; stopVoice(); }
  advanceDialogue(c, dt, (char, index) => speakGlyph(char, index, c.pitch, c.entity.timbre, c.wait));
}

/** Arrival requires physically reaching the course exit; waiting never completes transit. */
export function finishLane(s: State): boolean {
  const v = s.voyage, lane = v?.lane;
  if (!v || !lane || s.screen !== 'playing' || s.player.hp <= 0 || s.player.x < lane.course.exit.x || !laneContains(lane.course, s.player, s.player.r)) return false;
  v.lane = null; v.jumps++;
  installSector(s, lane.to, lane.from);
  if (!v.cargo && v.navTarget === lane.from) v.navTarget = lane.to;
  announce(v, 'REALSPACE / lane cleared. Engines stabilized.'); writeSave(s);
  return true;
}
