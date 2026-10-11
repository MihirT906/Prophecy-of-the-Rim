import { beforeEach, expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { ENEMIES, SEEKER } from './data';
import { spawnEnemy, updateEnemies } from './enemies';
import { spawnNest } from './seekers';
import { newState, type State } from './state';
import { startVoyage } from './voyage';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function space(seed = 'seeker-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own drones
  Object.assign(s.player, { x: 1000, y: 1000, vx: 0, vy: 0 });
  return s;
}
function run(s: State, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds && s.screen === 'playing'; t += DT) { each?.(); updateEnemies(s, DT); }
}
const awake = (s: State) => s.enemies.filter(e => e.seeker?.awake).length;

test('a nest sleeps on station until a ship comes close, then all of it wakes at once', () => {
  const s = space(), nest = spawnNest(s, { x: 1000, y: 1000 + SEEKER.wake + 60 }, 'a');
  expect(nest).toHaveLength(SEEKER.nest);
  run(s, 2);
  expect(awake(s)).toBe(0);
  for (const e of nest) expect(Math.hypot(e.x - e.seeker!.home.x, e.y - e.seeker!.home.y)).toBeLessThan(10);
  expect(s.player.hp).toBe(s.player.maxHp);
  s.player.y += 30;  // inside the wake radius of the nearest drone only
  updateEnemies(s, DT);
  expect(awake(s)).toBe(SEEKER.nest);
  expect(s.voyage!.notice).toContain('HUNTER-SEEKERS');
});

test('waking spreads to sleepers near a waking drone, but not to a distant nest', () => {
  const s = space();
  spawnNest(s, { x: 1000, y: 1000 + SEEKER.wake }, 'a', 3);
  spawnNest(s, { x: 1000 + SEEKER.chain, y: 1000 + SEEKER.wake }, 'b', 3);  // overlapping the first
  spawnNest(s, { x: 3000, y: 3000 }, 'c', 3);
  updateEnemies(s, DT);
  expect(s.enemies.filter(e => e.seeker!.awake).map(e => e.seeker!.nest).sort()).toEqual(['a', 'a', 'a', 'b', 'b', 'b']);
});

test('awake drones home on the ship and burst on contact', () => {
  const s = space(), [e] = spawnNest(s, { x: 1000, y: 1000 + 150 }, 'a', 1);
  const gap = Math.hypot(e.x - s.player.x, e.y - s.player.y);
  run(s, .5);
  expect(e.seeker!.awake).toBe(true);
  expect(Math.hypot(e.x - s.player.x, e.y - s.player.y)).toBeLessThan(gap);
  expect(Math.hypot(e.vx, e.vy)).toBeLessThanOrEqual(ENEMIES.seeker.speed + 1e-6);
  run(s, 3);
  expect(s.enemies).toHaveLength(0);
  expect(s.player.hp).toBe(s.player.maxHp - ENEMIES.seeker.dmg);
});

test('a drone that never reaches the ship fizzles when its fuse runs out', () => {
  const s = space(), [e] = spawnNest(s, { x: 1000, y: 1000 + 150 }, 'a', 1);
  updateEnemies(s, DT);
  expect(e.seeker!.fuse).toBeGreaterThan(SEEKER.fuse - .1);
  run(s, SEEKER.fuse + 1, () => { s.player.x = e.x + 600; s.player.y = e.y; });  // always out of reach
  expect(s.enemies).toHaveLength(0);
  expect(s.player.hp).toBe(s.player.maxHp);
  expect(s.player.kills).toBe(0);
});

test('shooting one drone chains through the cluster and scorches a ship that is too close', () => {
  const s = space();
  const line = Array.from({ length: 5 }, (_, k) => spawnNest(s, { x: 2000 + k * 60 - 40, y: 2000 }, 'row', 1)[0]);  // 60 px apart
  const lone = spawnNest(s, { x: 2000 + 5 * 60 + 200, y: 2000 }, 'row', 1)[0];  // beyond the last blast
  const brute = spawnEnemy(s, 'brute', { x: 2000 + 60 - 40, y: 2000 + 70 });
  Object.assign(s.player, { x: line[0].x - 60, y: 2000 });
  spawnBullet(s, { x: line[0].x - 30, y: 2000 }, { x: 1, y: 0 }, 300, 1, 0, 1, 'player', '#fff');
  for (let i = 0; i < 10; i++) updateBullets(s, DT);
  expect(line.every(e => !s.enemies.includes(e))).toBe(true);
  expect(s.enemies).toContain(lone);
  expect(brute.hp).toBeLessThan(ENEMIES.brute.hp);  // other enemies are caught in it too
  expect(s.player.kills).toBe(5);
  expect(s.player.hp).toBe(s.player.maxHp - SEEKER.splashDmg);
  expect(s.pickups).toHaveLength(0);  // drones leave no salvage
});
