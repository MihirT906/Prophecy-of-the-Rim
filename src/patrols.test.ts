import { beforeEach, expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { ENEMIES, ENEMY_DENSITY, PATROL } from './data';
import { updateEnemies } from './enemies';
import { inScanCone, patrolSites, spawnPatrol } from './patrols';
import { newState, type State } from './state';
import { generateSystem, generateUniverse, nextInwardSector, START_SECTOR, type EncounterSite } from './universe';
import { startVoyage } from './voyage';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function voyage(seed = 'patrol-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own patrols
  s.voyage!.personalSpice = s.voyage!.earnedSpice = 0;  // the hold starts clean; tests load it themselves
  return s;
}
function site(s: State, count = 1): EncounterSite {
  return { archetype: 'smuggler-patrol', role: 'patrol', count, seed: 'squad-a', triggerRadius: 900, x: s.player.x + 2000, y: s.player.y };
}
function load(s: State): void {
  const v = s.voyage!;
  v.cargo = { serial: 1, origin: v.sectorId, destination: nextInwardSector(v.universe, v.sectorId), remaining: 12, commodity: 'melange', illegal: true };
}
/** Park the player a fixed distance dead ahead of a patrol. */
function ahead(s: State, e: { x: number; y: number; facing: number }, d: number): void {
  Object.assign(s.player, { x: e.x + Math.cos(e.facing) * d, y: e.y + Math.sin(e.facing) * d, vx: 0, vy: 0 });
}
/** The Guild ships among everything else the sector spawns. */
const squads = (s: State) => s.enemies.filter(e => e.patrol);
function run(s: State, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds; t += DT) { each?.(); updateEnemies(s, DT); }
}

test('entering a sector turns its patrol sites into squads that fly their loop', () => {
  const seed = Array.from({ length: 200 }, (_, i) => `seed-${i}`)
    .find(seed => generateSystem(generateUniverse(seed), START_SECTOR).encounters.some(e => e.role === 'patrol'))!;
  expect(seed).toBeDefined();
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  const sites = s.voyage!.system.encounters.filter(e => e.role === 'patrol');
  Object.assign(s.player, { x: -5000, y: -5000 });  // far from every cone
  updateEnemies(s, DT);
  expect(squads(s)).toHaveLength(sites.reduce((n, e) => n + e.count, 0));
  expect(squads(s).every(e => e.kind === 'patrol' && e.patrol!.mode === 'route' && e.patrol!.route.length === 3)).toBe(true);
  updateEnemies(s, DT);
  expect(squads(s)).toHaveLength(sites.reduce((n, e) => n + e.count, 0));  // the arrival is consumed once

  const lead = squads(s)[0], from = { x: lead.x, y: lead.y }, target = lead.patrol!.route[lead.patrol!.leg];
  run(s, 2);
  expect(Math.hypot(target.x - lead.x, target.y - lead.y)).toBeLessThan(Math.hypot(target.x - from.x, target.y - from.y));
  expect(Math.hypot(lead.vx, lead.vy)).toBeCloseTo(ENEMIES.patrol.speed * PATROL.cruise, 0);
  expect(s.bullets).toHaveLength(0);
});

test('the starting sector always has a patrol, placed clear of the launch point', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `start-${i}`);
  const bare = seeds.find(seed => !generateSystem(generateUniverse(seed), START_SECTOR).encounters.some(e => e.role === 'patrol'))!;
  expect(bare).toBeDefined();
  for (const seed of seeds.slice(0, 40).concat(bare)) {
    const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
    startVoyage(s, seed);
    const start = { x: s.player.x, y: s.player.y };
    updateEnemies(s, DT);
    expect(squads(s).length).toBeGreaterThan(0);
    expect(squads(s).every(e => !inScanCone(e, start) && Math.hypot(e.x - start.x, e.y - start.y) > PATROL.scanRange)).toBe(true);
  }
  // Only the starting sector is topped up: elsewhere the system's own roll stands.
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, bare);
  startVoyage(s, bare);
  const v = s.voyage!;
  expect(patrolSites(v)).toHaveLength(1);
  expect(patrolSites(v)[0].count).toBe(2 * ENEMY_DENSITY);
  v.sectorId = 0;  // the same bare system anywhere else gets nothing added
  expect(patrolSites(v)).toEqual([]);
});

test('the scan cone is a wedge ahead of the ship', () => {
  const s = voyage(), [e] = spawnPatrol(s, site(s));
  e.facing = 0;
  expect(inScanCone(e, { x: e.x + PATROL.scanRange - 1, y: e.y })).toBe(true);
  expect(inScanCone(e, { x: e.x + PATROL.scanRange + 1, y: e.y })).toBe(false);
  expect(inScanCone(e, { x: e.x - 100, y: e.y })).toBe(false);
  expect(inScanCone(e, { x: e.x + 100, y: e.y + 100 * Math.tan(PATROL.scanArc - .05) })).toBe(true);
  expect(inScanCone(e, { x: e.x + 100, y: e.y + 100 * Math.tan(PATROL.scanArc + .05) })).toBe(false);
});

test('an empty hold passes the scan and is then ignored', () => {
  const s = voyage(), [e] = spawnPatrol(s, site(s));
  run(s, PATROL.scanSeconds / 2, () => ahead(s, e, 200));
  expect(e.patrol!.scan).toBeGreaterThan(.3);
  expect(e.patrol!.mode).toBe('route');
  run(s, PATROL.scanSeconds, () => ahead(s, e, 200));
  expect(e.patrol).toMatchObject({ mode: 'route', scan: 0 });
  expect(e.patrol!.cleared).toBeGreaterThan(0);
  expect(s.voyage!.notice).toContain('Manifest clean');
  load(s);  // picking up spice right after being cleared goes unnoticed until the patrol looks again
  run(s, 2, () => ahead(s, e, 200));
  expect(e.patrol!.mode).toBe('route');
  expect(s.player.hp).toBe(s.player.maxHp);
});

test('slipping out of the cone before the scan completes drains it', () => {
  const s = voyage(), [e] = spawnPatrol(s, site(s));
  load(s);
  run(s, PATROL.scanSeconds * .6, () => ahead(s, e, 200));
  expect(e.patrol!.scan).toBeGreaterThan(.4);
  Object.assign(s.player, { x: e.x - 3000, y: e.y });
  run(s, PATROL.scanSeconds);
  expect(e.patrol).toMatchObject({ mode: 'route', scan: 0, cleared: 0 });
});

test('spice in the cone brings the whole squad in pursuit, firing', () => {
  const s = voyage(), squad = spawnPatrol(s, site(s, 3)), [e] = squad;
  load(s);
  run(s, PATROL.scanSeconds + .1, () => ahead(s, e, 300));
  expect(squad.every(o => o.patrol!.mode === 'pursue')).toBe(true);
  expect(s.voyage!.notice).toContain('contraband');
  const gap = Math.hypot(s.player.x - e.x, s.player.y - e.y);
  run(s, 1.5);
  expect(Math.hypot(s.player.x - e.x, s.player.y - e.y)).toBeLessThan(gap);
  expect(s.bullets.filter(b => b.owner === 'enemy').length).toBeGreaterThanOrEqual(3);
  for (let i = 0; i < 240 && s.screen === 'playing'; i++) { updateEnemies(s, DT); updateBullets(s, DT); }
  expect(s.player.hp).toBeLessThan(s.player.maxHp);
});

test('pursuit ends when the hold is emptied or the player stays out of range', () => {
  const s = voyage(), [e] = spawnPatrol(s, site(s));
  load(s);
  run(s, PATROL.scanSeconds + .1, () => ahead(s, e, 300));
  expect(e.patrol!.mode).toBe('pursue');
  s.voyage!.cargo = null;
  updateEnemies(s, DT);
  expect(e.patrol).toMatchObject({ mode: 'route', hostile: false });
  expect(s.voyage!.notice).toContain('stands down');

  load(s);
  e.patrol!.cleared = 0;
  run(s, PATROL.scanSeconds + .1, () => ahead(s, e, 300));
  expect(e.patrol!.mode).toBe('pursue');
  run(s, PATROL.loseSeconds - .5, () => ahead(s, e, PATROL.loseRange + 200));
  expect(e.patrol!.mode).toBe('pursue');
  run(s, 1, () => ahead(s, e, PATROL.loseRange + 200));
  expect(e.patrol!.mode).toBe('route');
  expect(s.voyage!.notice).toContain('lost your trail');
});

test('shooting a patrol makes its squad hostile even with an empty hold', () => {
  const s = voyage(), squad = spawnPatrol(s, site(s, 2)), [e] = squad;
  Object.assign(s.player, { x: e.x - 300, y: e.y + 300 });
  spawnBullet(s, { x: e.x - 20, y: e.y }, { x: 1, y: 0 }, 500, 1, 0, 1, 'player', '#fff');
  updateBullets(s, DT);
  expect(e.hp).toBe(ENEMIES.patrol.hp - 1);
  expect(squad.every(o => o.patrol!.mode === 'pursue' && o.patrol!.hostile)).toBe(true);
  run(s, 1);
  expect(squad.every(o => o.patrol!.mode === 'pursue')).toBe(true);  // no cargo, still hunting
});

test('a patrol on its route does not ram: only a pursuer hurts on contact', () => {
  const s = voyage(), [e] = spawnPatrol(s, site(s));
  e.patrol!.cleared = 99;
  Object.assign(s.player, { x: e.x, y: e.y });
  updateEnemies(s, DT);
  expect(s.player.hp).toBe(s.player.maxHp);
  load(s);
  e.patrol!.mode = 'pursue';
  Object.assign(s.player, { x: e.x, y: e.y });
  updateEnemies(s, DT);
  expect(s.player.hp).toBe(s.player.maxHp - 1);
});
