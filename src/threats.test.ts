import { beforeEach, expect, test } from 'vitest';
import { spawnEnemy, updateEnemies } from './enemies';
import { spawnPatrol } from './patrols';
import { spawnRaiders } from './raiders';
import { spawnNest } from './seekers';
import { newState, type State } from './state';
import { spawnStorm } from './storms';
import { census, factionOf, hunting } from './threats';
import { START_SECTOR } from './universe';
import { startVoyage } from './voyage';
import { spawnWitness } from './witness';
import { spawnWorm } from './worms';

beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));
function space(seed = 'threat-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;
  Object.assign(s.player, { x: 2000, y: 2000, vx: 0, vy: 0, aim: { x: 1, y: 0 } });
  return s;
}

test('contacts are counted by faction, and hunting means actively after the ship', () => {
  const s = space();
  const [guild] = spawnPatrol(s, { archetype: 'smuggler-patrol', role: 'patrol', count: 2, seed: 'a', triggerRadius: 900, x: 3500, y: 3000 });
  const pack = spawnRaiders(s, { x: 3000, y: 1000 }, 3, 'a');
  const nest = spawnNest(s, { x: 1000, y: 3000 }, 'a', 4);
  const worm = spawnWorm(s, { x: 4000, y: 3000 }, { x: 4500, y: 3000 });
  const eye = spawnWitness(s, { x: 2600, y: 2000 });  // dead ahead: watched
  spawnEnemy(s, 'brute', { x: 2000, y: 2500 });
  spawnStorm(s, { x: 500, y: 500 }, { x: 0, y: 0 });
  eye.witness!.seen = true;
  expect(s.enemies.map(factionOf)).toEqual(['guild', 'guild', 'harkonnen', 'harkonnen', 'harkonnen', 'seeker', 'seeker', 'seeker', 'seeker', 'worm', 'witness', 'other']);
  let c = census(s);
  expect(c.total).toBe(12);
  expect(c.storms).toBe(1);
  expect(Object.fromEntries(Object.entries(c.by).map(([f, row]) => [f, row.count]))).toEqual({ guild: 2, harkonnen: 3, seeker: 4, worm: 1, witness: 1, other: 1 });
  expect(c.hunters).toBe(1);  // only the plain interceptor: everything else is waiting, wandering or pinned
  expect(c.nearest).toMatchObject({ faction: 'other' });

  guild.patrol!.mode = 'pursue';
  pack[0].raider!.mode = 'run';
  nest[1].seeker!.awake = true;
  worm.worm!.hunting = true;
  eye.witness!.seen = false;
  expect([guild, pack[0], pack[1], nest[1], nest[0], worm, eye].map(hunting)).toEqual([true, true, false, true, false, true, true]);
  c = census(s);
  expect(c.hunters).toBe(6);
  expect(c.by.guild).toEqual({ count: 2, hunters: 1 });
  expect(c.by.harkonnen).toEqual({ count: 3, hunters: 1 });
});

test('the nearest threat is the closest hunter, measured hull to hull', () => {
  const s = space();
  spawnNest(s, { x: 2100, y: 2000 }, 'a', 1);  // closest of all, but asleep
  const far = spawnEnemy(s, 'brute', { x: 2000, y: 2900 }), near = spawnEnemy(s, 'rusher', { x: 2400, y: 2000 });
  expect(census(s).nearest).toMatchObject({ enemy: near, distance: 400 - near.r - s.player.r });
  s.enemies.splice(s.enemies.indexOf(near), 1);
  expect(census(s).nearest!.enemy).toBe(far);
  s.enemies.length = 0;
  expect(census(s)).toMatchObject({ total: 0, hunters: 0, nearest: null });
});

test('the launch sector is crowded from the first tick, with every faction on the board', () => {
  for (let i = 0; i < 12; i++) {
    const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, `crowd-${i}`);
    startVoyage(s, `crowd-${i}`);
    expect(s.voyage!.sectorId).toBe(START_SECTOR);
    const start = { x: s.player.x, y: s.player.y };
    updateEnemies(s, 1 / 60);
    const c = census(s);
    expect(c.total).toBeGreaterThanOrEqual(40);
    for (const f of ['guild', 'harkonnen', 'seeker', 'worm', 'witness'] as const) expect(c.by[f].count).toBeGreaterThan(0);
    expect(c.storms).toBeGreaterThanOrEqual(2);
    // On the first screen (640 x 322 px either side of the ship) without anything touching it yet.
    const onScreen = s.enemies.filter(e => Math.abs(e.x - start.x) < 640 && Math.abs(e.y - start.y) < 322);
    expect(new Set(onScreen.map(factionOf)).size).toBeGreaterThanOrEqual(2);
    expect(onScreen.length).toBeGreaterThanOrEqual(8);
    expect(s.player.hp).toBe(s.player.maxHp);
  }
});
