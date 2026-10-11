import { beforeEach, expect, test } from 'vitest';
import { spawnBullet } from './bullets';
import { damagePlayer, newPlayer } from './player';
import { applySave, createSave, loadSave, writeSave } from './save';
import { newState, type State, type Vec } from './state';
import { generateUniverse, INWARD_FARE, LOT_SIZE, nextInwardSector, PRESCIENCE_REQUIRED, routeBetween, START_SECTOR, STARTING_CREDITS, STARTING_SPICE, TRANSCENDENCE_DOSES } from './universe';
import { mapPoint, starAt } from './space-render';
import { finishLane, chooseOnMap, confirmComms, closeComms, closeMap, openDeparture, captureVoyage, consumeSpice, consumeUniverseEvents, enterSector, passage, readVoyageSave, startVoyage, updateVoyage } from './voyage';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, { localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); },
  } });
});
function fresh(seed = 'race'): State {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, seed);
  applySave(s, createSave('Pilot')); startVoyage(s, seed); s.voyage!.jumpTimer = 0;
  s.voyage!.personalSpice = s.voyage!.earnedSpice = 0;  // units are traced from an empty wallet, without the launch stipend
  return s;
}
function at(s: State, p: Vec): void { Object.assign(s.player, { x: p.x, y: p.y, vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; }
function interact(s: State, p: Vec): void { at(s, p); s.input.pressed.push('KeyE'); updateVoyage(s, 1 / 60); if (s.screen === 'comms') { confirmComms(s); closeComms(s); } }
function collect(s: State): void { interact(s, s.voyage!.system.cache); }
function transit(s: State, to: number): void { at(s, s.voyage!.system.gates.find(g => g.to === to)!); openDeparture(s, to); expect(enterSector(s, to)).toBe(true); Object.assign(s.player, s.voyage!.lane!.course.exit); expect(finishLane(s)).toBe(true); }

test('a new run launches with a spice stipend that pays for the first inward jump on its own', () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'stipend');
  applySave(s, createSave('Pilot')); startVoyage(s, 'stipend'); s.voyage!.jumpTimer = 0;
  const v = s.voyage!, to = nextInwardSector(v.universe, v.sectorId), cost = passage(v, to);
  expect(v.personalSpice).toBe(STARTING_SPICE); expect(v.cargo).toBeNull(); expect(v.collected).toBe(0);
  expect(readVoyageSave(captureVoyage(s))).not.toBeNull();
  for (let i = 0; i < cost.required; i++) expect(consumeSpice(s)).toBe(true);
  transit(s, to);
  expect(v.sectorId).toBe(to); expect(v.personalSpice).toBe(STARTING_SPICE - cost.required - cost.fare);
  expect(readVoyageSave(captureVoyage(s))).not.toBeNull();
});

test('pickup and consumption conserve units; duplicate pickup is blocked', () => {
  const s = fresh(), v = s.voyage!;
  consumeSpice(s); expect(v.consumed).toBe(0);
  s.input.pressed.push('KeyE'); updateVoyage(s, 1 / 60); expect(v.cargo).toBeNull(); // too far from cache
  collect(s); collect(s);
  expect(v.collected).toBe(LOT_SIZE); expect(v.cargo?.remaining).toBe(8);
  for (let i = 0; i < 4; i++) expect(consumeSpice(s)).toBe(true);
  expect(v.consumed).toBe(4); expect(v.cargo?.remaining).toBe(8);
  expect(v.collected).toBe(v.consumed + v.sold + v.cargo!.remaining);
  expect(loadSave()?.voyage?.consumed).toBe(4);
  expect(consumeUniverseEvents(s).filter(e => e.type === 'cargo-collected')).toHaveLength(1);
  expect(consumeUniverseEvents(s)).toEqual([]);
});

test('exits open a map; only a confirmed, affordable connection charges cargo', () => {
  const s = fresh(), v = s.voyage!, from = v.sectorId, to = nextInwardSector(v.universe, from);
  expect(enterSector(s, to)).toBe(false);
  interact(s, v.system.gates.find(g => g.to === to)!);
  expect(s.screen).toBe('map'); expect(v.departing).toBe(true);
  expect(enterSector(s, to)).toBe(false); expect(v.spent).toBe(0);
  closeMap(s); collect(s); for (let i = 0; i < 4; i++) consumeSpice(s);
  s.player.hp = 7; s.player.weapon = 'shotgun'; s.player.ammo = 9;
  spawnBullet(s, s.player, { x: 1, y: 0 }, 500, 1, 0, 1, 'player', '#fff');
  at(s, v.system.gates.find(g => g.to === to)!); openDeparture(s, to);
  const fare = passage(v, to).fare;
  expect(enterSector(s, -1)).toBe(false); expect(v.cargo?.remaining).toBe(8);
  expect(enterSector(s, to)).toBe(true);
  expect(v.spent).toBe(fare); expect(v.cargo?.remaining).toBe(8 - fare);
  expect(v.sectorId).toBe(from); expect(v.jumps).toBe(0);
  Object.assign(s.player, v.lane!.course.exit); expect(finishLane(s)).toBe(true);
  expect(v.credits).toBe(STARTING_CREDITS); expect(v.jumps).toBe(1);
  expect(s.player.hp).toBe(7); expect(s.player.ammo).toBe(9); expect(s.player.weapon).toBe('shotgun');
  expect(s.bullets).toHaveLength(0); expect(s.spawnQueue).toHaveLength(0);
  expect(enterSector(s, from)).toBe(false);
  // Planning map cannot initiate transit even with funds.
  s.screen = 'map'; expect(enterSector(s, from)).toBe(false); closeMap(s);
  const cargo = v.cargo!.remaining;
  at(s, v.system.gates[0]); openDeparture(s); closeMap(s);
  expect(v.cargo?.remaining).toBe(cargo); expect(v.spent).toBe(fare);
});

test('map choices jump on open lanes, refuse locked ones, plot distant stars and stay home', () => {
  const s = fresh(), v = s.voyage!, from = v.sectorId, inward = nextInwardSector(v.universe, from);
  const gate = v.system.gates.find(g => g.to === inward)!, here = v.universe.sectors[from];
  const far = v.universe.sectors.find(x => x.id !== from && !here.neighbors.includes(x.id))!.id;
  // Planning only sets the course.
  s.screen = 'map';
  expect(chooseOnMap(s, far)).toEqual({ label: `COURSE SET: ${v.universe.sectors[far].name.toUpperCase()}`, cue: 'confirm' });
  expect(v.navTarget).toBe(far); expect(s.screen).toBe('playing');
  // The departure chart preselects the plotted course's first jump; choosing the distant star costs nothing.
  at(s, gate); openDeparture(s);
  const first = routeBetween(v.universe, from, far)[1];
  expect(s.cursor).toBe(first);
  expect(chooseOnMap(s, far).cue).toBe('select'); expect(s.screen).toBe('map'); expect(v.spent).toBe(0);
  expect(chooseOnMap(s, inward)).toEqual({ label: `LOCKED: NEED ${PRESCIENCE_REQUIRED[v.universe.sectors[inward].ring]} DOSES`, cue: 'blocked' });
  expect(s.screen).toBe('map'); expect(v.spent).toBe(0);
  expect(chooseOnMap(s, from)).toEqual({ label: 'STAYING IN THIS SECTOR', cue: 'back' });
  expect(s.screen).toBe('playing'); expect(v.departing).toBe(false);
  collect(s); for (let i = 0; i < 4; i++) consumeSpice(s);
  at(s, gate); openDeparture(s, inward);
  const fare = passage(v, inward).fare;
  expect(chooseOnMap(s, inward)).toEqual({ label: `JUMPING TO ${v.universe.sectors[inward].name.toUpperCase()} / -${fare} SPICE`, cue: 'confirm' });
  expect(v.lane?.to).toBe(inward); expect(v.spent).toBe(fare);
});

test('every chart star is clickable at its own position and empty chart space selects nothing', () => {
  for (const seed of ['race', 'alpha', 'omega']) {
    const v = { universe: generateUniverse(seed) } as Parameters<typeof mapPoint>[0];
    for (const sector of v.universe.sectors) {
      const p = mapPoint(v, sector.id);
      expect(starAt(v, p)).toBe(sector.id);
      expect(starAt(v, { x: p.x + 8, y: p.y - 8 })).toBe(sector.id);
    }
    expect(starAt(v, { x: 120, y: 110 })).toBeNull();
  }
});

test('physical boundary opens departure and expensive routes fail atomically', () => {
  const s = fresh(), v = s.voyage!;
  s.player.x = 20; updateVoyage(s, 1 / 60);
  expect(s.screen).toBe('map'); expect(v.departing).toBe(true);
  expect(s.player.x).toBe(180); expect(s.player.vx).toBe(0);
  const before = captureVoyage(s);
  expect(enterSector(s, v.universe.sectors[v.sectorId].neighbors[0])).toBe(false);
  expect(captureVoyage(s)).toEqual(before);
  const restored = fresh(); startVoyage(restored, 'ignored', before);
  expect(restored.screen).toBe('map'); expect(restored.voyage?.departing).toBe(true);
});

test('same-ring dangerous passage is cheaper and symmetric in both directions', () => {
  const s = fresh(), v = s.voyage!, source = v.universe.sectors[v.sectorId];
  const dest = v.universe.sectors[source.neighbors.find(n => v.universe.sectors[n].ring === source.ring)!];
  source.danger = 1; dest.danger = 1; const safe = passage(v, dest.id).fare;
  source.danger = 5; dest.danger = 5; const dangerous = passage(v, dest.id).fare;
  expect(dangerous).toBeLessThan(safe); expect(dangerous).toBeGreaterThan(0);
  v.sectorId = dest.id; expect(passage(v, source.id).fare).toBe(dangerous);
});

test('deliveries pay the agreed reward and wrong receivers cannot buy sealed cargo', () => {
  const s = fresh(), v = s.voyage!;
  collect(s); for (let i = 0; i < 4; i++) consumeSpice(s);
  transit(s, v.cargo!.destination);
  interact(s, v.system.dock);
  expect(v.credits).toBe(16); expect(v.deliveries).toBe(1); expect(v.sold).toBe(5); expect(v.cargo).toBeNull();
  interact(s, v.system.dock); expect(v.credits).toBe(16);
  collect(s); const before = v.credits;
  interact(s, v.system.dock);
  expect(v.credits).toBe(before); expect(v.deliveries).toBe(1);
  expect(v.collected + v.earnedSpice).toBe(v.consumed + v.sold + v.spent + v.personalSpice + (v.cargo?.remaining ?? 0));
});

test('exhausting your cut cannot consume sealed cargo or accept a duplicate shipment', () => {
  const s = fresh(), v = s.voyage!;
  collect(s); for (let i = 0; i < LOT_SIZE; i++) consumeSpice(s);
  expect(v.consumed).toBe(4); expect(v.personalSpice).toBe(0); expect(v.cargo?.remaining).toBe(8);
  updateVoyage(s, 16); collect(s); expect(v.collected).toBe(12);
  expect(consumeSpice(s)).toBe(false);
});

test('every tested seed supports a complete, funded rim-to-center race', () => {
  for (let seed = 0; seed < 30; seed++) {
    const s = fresh(`complete-${seed}`), v = s.voyage!;
    while (v.sectorId !== 0) {
      collect(s); expect(v.cargo).not.toBeNull();
      const to = v.cargo!.destination, ring = v.universe.sectors[to].ring;
      const wanted = ring === 0 ? TRANSCENDENCE_DOSES : PRESCIENCE_REQUIRED[ring];
      while (v.consumed < wanted) expect(consumeSpice(s)).toBe(true);
      expect(v.cargo!.remaining).toBeGreaterThanOrEqual(INWARD_FARE[ring]);
      transit(s, to); interact(s, v.system.dock);
    }
    expect(v.status).toBe('active'); // center arrival alone is not victory
    interact(s, v.system.beacon);
    expect(s.screen).toBe('transcended'); expect(v.status).toBe('won');
    expect(v.consumed).toBe(16); expect(v.jumps).toBe(4); expect(v.deliveries).toBe(4);
    expect(v.credits).toBe(38); expect(v.collected + v.earnedSpice).toBe(v.sold + v.consumed + v.spent + v.personalSpice);
    expect(v.reputation).toBe(92); expect(consumeSpice(s)).toBe(false);
    expect(readVoyageSave(captureVoyage(s))?.status).toBe('won');
    const time = v.elapsed; updateVoyage(s, 10); expect(v.elapsed).toBe(time);
  }
});

test('center requires the final doses; no early win and no running the clock in menus', () => {
  const s = fresh(), v = s.voyage!;
  while (v.sectorId !== 0) {
    collect(s); const to = v.cargo!.destination, ring = v.universe.sectors[to].ring;
    while (v.consumed < PRESCIENCE_REQUIRED[ring]) consumeSpice(s);
    transit(s, to); interact(s, v.system.dock);
  }
  expect(v.consumed).toBe(12); interact(s, v.system.beacon); expect(v.status).toBe('active');
  collect(s); for (let i = 0; i < 4; i++) consumeSpice(s);
  for (const screen of ['map', 'paused', 'menu'] as const) {
    s.screen = screen; const elapsed = v.elapsed; updateVoyage(s, 4); expect(v.elapsed).toBe(elapsed);
  }
  s.screen = 'playing'; interact(s, v.system.beacon); expect(v.status).toBe('won');
});

test('save restores graph, location, partial cargo, clock, route, and depleted caches', () => {
  const s = fresh('saved-run'), v = s.voyage!;
  collect(s); for (let i = 0; i < 4; i++) consumeSpice(s);
  transit(s, v.cargo!.destination); updateVoyage(s, .2); v.navTarget = 0; s.player.vx = 33; s.player.vy = -12;
  writeSave(s); const snapshot = captureVoyage(s)!;
  const restored = newState({ held: new Set(), pressed: [], typed: [] }, 'different-seed');
  const save = loadSave()!; applySave(restored, save); startVoyage(restored, 'ignored', save.voyage);
  expect(captureVoyage(restored)).toEqual(snapshot);
  expect(restored.voyage?.system).toEqual(v.system); expect(restored.voyage?.universe).toEqual(v.universe);
  snapshot.position = { x: 0, y: 0 }; restored.player = newPlayer(); startVoyage(restored, 'ignored', snapshot);
  expect({ x: restored.player.x, y: restored.player.y }).toEqual(restored.voyage!.system.arena.start);
  expect(readVoyageSave({ ...snapshot, version: 1 })).toBeNull();
  expect(readVoyageSave({ ...snapshot, consumed: 999 })).toBeNull();
  expect(readVoyageSave({ ...snapshot, credits: -1 })).toBeNull();
  expect(readVoyageSave({ ...snapshot, elapsed: Infinity })).toBeNull();
  expect(readVoyageSave({ ...snapshot, cargo: { ...snapshot.cargo, remaining: 999 } })).toBeNull();
});

test('death persists a lost run and a fresh attempt resets resources', () => {
  const s = fresh(); collect(s); consumeSpice(s); damagePlayer(s, 100, null);
  expect(s.screen).toBe('dead'); expect(loadSave()?.voyage?.status).toBe('lost');
  const seed = s.voyage!.universe.seed, snapshot = captureVoyage(s)!;
  s.player = newPlayer(); startVoyage(s, seed, snapshot); expect(s.screen).toBe('dead');
  s.player = newPlayer(); startVoyage(s, seed);
  expect(s.screen).toBe('playing'); expect(s.voyage!.sectorId).toBe(START_SECTOR);
  expect(s.voyage!.credits).toBe(STARTING_CREDITS); expect(s.voyage!.consumed).toBe(0);
  expect(s.voyage!.elapsed).toBe(0); expect(s.voyage!.cargo).toBeNull();
  expect(passage(s.voyage!, nextInwardSector(s.voyage!.universe, START_SECTOR)).blocked).toContain('consumed doses');
});


test('version-2 saves migrate position and conserve cargo; invalid velocity is rejected', () => {
  const s = fresh('migration'); collect(s); consumeSpice(s);
  const current = captureVoyage(s)!;
  const legacy = { ...current, version: 2, cargo: { ...current.cargo!, contract: undefined, remaining: 11 }, position: { x: 300, y: 384 } };
  const migrated = readVoyageSave(legacy)!;
  expect(migrated.version).toBe(7); expect(migrated.spent).toBe(0);
  expect(migrated.position).toEqual({ x: 1200, y: 1920 });
  expect(migrated.velocity).toEqual({ x: 0, y: 0 });
  expect(migrated.cargo?.remaining).toBe(11); expect(migrated.cargo?.contract).toBeUndefined();
  expect(readVoyageSave({ ...current, velocity: { x: NaN, y: 0 } })).toBeNull();
  expect(readVoyageSave({ ...current, spent: 1 })).toBeNull();
});

test('ships and moving planet ports transfer spice from outside their hulls', async () => {
  const { spiceContacts } = await import('./universe');
  for (const kind of ['ship', 'planet'] as const) {
    const s = fresh(`contact-${kind}`), v = s.voyage!;
    v.elapsed = 200;
    const c = spiceContacts(v.system, v.elapsed).find(c => c.kind === kind)!;
    at(s, { x: c.x + c.radius + 110, y: c.y });
    s.input.pressed.push('KeyE'); updateVoyage(s, 1 / 60);
    expect(v.cargo).toBeNull();
    interact(s, { x: c.x + c.radius + 50, y: c.y });
    expect(v.cargo?.remaining).toBe(8);
    interact(s, { x: c.x + c.radius + 50, y: c.y });
    expect(v.collected).toBe(12);
  }
});
