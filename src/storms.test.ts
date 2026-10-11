import { beforeEach, expect, test } from 'vitest';
import { PATROL, STORM, TILE } from './data';
import { updateEnemies } from './enemies';
import { spawnPatrol } from './patrols';
import { newState, type State } from './state';
import { sheltered, spawnStorm, updateStorms } from './storms';
import { generateLane } from './hyperspace';
import { nextInwardSector, START_SECTOR } from './universe';
import { startVoyage } from './voyage';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function space(seed = 'storm-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own weather
  Object.assign(s.player, { x: 2000, y: 2000, vx: 0, vy: 0 });
  return s;
}
function load(s: State): void {
  const v = s.voyage!;
  v.cargo = { serial: 1, origin: v.sectorId, destination: nextInwardSector(v.universe, v.sectorId), remaining: 12, commodity: 'melange', illegal: true };
}

test('storms drift and turn back at the sector edge', () => {
  const s = space(), w = s.arena.w * TILE;
  const a = spawnStorm(s, { x: 3000, y: 3000 }, { x: 20, y: -10 }, 100);
  const b = spawnStorm(s, { x: w - 101, y: 3000 }, { x: 30, y: 0 }, 100);
  for (let i = 0; i < 60; i++) updateStorms(s, DT);
  expect(a.x).toBeCloseTo(3020); expect(a.y).toBeCloseTo(2990);
  expect(b.vx).toBe(-30);
  expect(b.x).toBeLessThan(w - 100 + 1);
});

test('a ship inside loses hull on a steady beat and is unharmed outside', () => {
  const s = space(), storm = spawnStorm(s, { x: 2000 + STORM.radius + 50, y: 2000 }, { x: 0, y: 0 });
  for (let t = 0; t < 5; t += DT) updateStorms(s, DT);
  expect(sheltered(s)).toBeNull();
  expect(s.player.hp).toBe(s.player.maxHp);
  s.player.x = storm.x;
  expect(sheltered(s)).toBe(storm);
  for (let t = 0; t < STORM.abrade * 3 + .1; t += DT) { s.player.iframes = 0; updateStorms(s, DT); }
  expect(s.player.hp).toBe(s.player.maxHp - 3 * STORM.dmg);
  expect(s.voyage!.notice).toContain('CORIOLIS STORM');
  expect([s.player.vx, s.player.vy]).toEqual([0, 0]);  // abrasion does not shove the ship
  s.player.x = 2000;
  updateStorms(s, DT);
  expect(storm.grit).toBe(0);
});

test('a storm hides spice from a Guild scan', () => {
  const s = space(), [e] = spawnPatrol(s, { archetype: 'smuggler-patrol', role: 'patrol', count: 1, seed: 'a', triggerRadius: 900, x: 3000, y: 2000 });
  load(s);
  spawnStorm(s, { x: 0, y: 0 }, { x: 0, y: 0 }, 60);
  const park = () => { Object.assign(s.player, { x: e.x + Math.cos(e.facing) * 200, y: e.y + Math.sin(e.facing) * 200, hp: 10, iframes: 0 }); Object.assign(s.storms[0], s.player); };
  for (let t = 0; t < PATROL.scanSeconds * 3; t += DT) { park(); updateEnemies(s, DT); }
  expect(e.patrol).toMatchObject({ mode: 'route', scan: 0 });
  s.storms.length = 0;  // the weather moves on
  for (let t = 0; t < PATROL.scanSeconds + .1; t += DT) { Object.assign(s.player, { x: e.x + Math.cos(e.facing) * 200, y: e.y + Math.sin(e.facing) * 200 }); updateEnemies(s, DT); }
  expect(e.patrol!.mode).toBe('pursue');
});

test('ducking into a storm shakes a pursuit even at close range', () => {
  const s = space(), [e] = spawnPatrol(s, { archetype: 'smuggler-patrol', role: 'patrol', count: 1, seed: 'a', triggerRadius: 900, x: 2300, y: 2000 });
  load(s);
  e.patrol!.mode = 'pursue';
  for (let t = 0; t < PATROL.loseSeconds + 1; t += DT) { s.player.hp = 10; updateEnemies(s, DT); }
  expect(e.patrol!.mode).toBe('pursue');  // in the open, at this range, it never lets go
  spawnStorm(s, s.player, { x: 0, y: 0 });
  for (let t = 0; t < PATROL.loseSeconds + .1; t += DT) { s.player.hp = 10; updateEnemies(s, DT); }
  expect(e.patrol!.mode).toBe('route');
  expect(s.voyage!.notice).toContain('lost your trail');
});

test('every system has weather, the launch point has a storm nearby, and lanes have none', () => {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, 'weather');
  startVoyage(s, 'weather');
  expect(s.voyage!.sectorId).toBe(START_SECTOR);
  updateEnemies(s, DT);
  const danger = s.voyage!.universe.sectors[START_SECTOR].danger;
  expect(s.storms).toHaveLength(2 + Math.floor(danger / 2));
  const nearest = Math.min(...s.storms.map(storm => Math.hypot(storm.x - s.player.x, storm.y - s.player.y) - storm.r));
  expect(nearest).toBeGreaterThan(100);  // not on top of the ship
  expect(nearest).toBeLessThan(400);     // but on the first screen
  const v = s.voyage!, to = nextInwardSector(v.universe, v.sectorId);
  v.lane = { from: v.sectorId, to, elapsed: 0, course: generateLane(v.universe, v.sectorId, to) };
  expect(sheltered(s)).toBeNull();
  updateStorms(s, DT);
  expect(s.storms).toHaveLength(0);
});
