import { beforeEach, expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { ENEMIES, WITNESS } from './data';
import { updateEnemies } from './enemies';
import { newState, type State } from './state';
import { startVoyage } from './voyage';
import { spawnWitness, watched } from './witness';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function space(seed = 'witness-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own Witness
  Object.assign(s.player, { x: 2000, y: 2000, vx: 0, vy: 0, aim: { x: 1, y: 0 } });
  return s;
}
function run(s: State, seconds: number): void {
  for (let t = 0; t < seconds && s.screen === 'playing'; t += DT) updateEnemies(s, DT);
}

test('watched means inside the aim cone and within sight', () => {
  const s = space();
  expect(watched(s, spawnWitness(s, { x: 2400, y: 2000 }))).toBe(true);
  expect(watched(s, spawnWitness(s, { x: 2000 + WITNESS.sight + 10, y: 2000 }))).toBe(false);
  expect(watched(s, spawnWitness(s, { x: 1600, y: 2000 }))).toBe(false);
  expect(watched(s, spawnWitness(s, { x: 2400, y: 2000 + 400 * Math.tan(WITNESS.gaze - .05) }))).toBe(true);
  expect(watched(s, spawnWitness(s, { x: 2400, y: 2000 + 400 * Math.tan(WITNESS.gaze + .05) }))).toBe(false);
});

test('it closes in while the ship looks away and stops dead the moment it is looked at', () => {
  const s = space(), e = spawnWitness(s, { x: 1500, y: 2000 });  // behind a ship aiming right
  run(s, 1);
  expect(e.witness!.seen).toBe(false);
  expect(e.x).toBeGreaterThan(1500 + 150);
  expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(ENEMIES.witness.speed);
  expect(s.voyage!.notice).toContain('SILENT WITNESS');
  s.player.aim = { x: -1, y: 0 };
  const at = e.x;
  run(s, 2);
  expect(e.witness!.seen).toBe(true);
  expect(e.x).toBe(at);
  expect([e.vx, e.vy]).toEqual([0, 0]);
  expect(s.player.hp).toBe(s.player.maxHp);
});

test('shots pass through it unwatched and hurt it while it is pinned', () => {
  const s = space(), e = spawnWitness(s, { x: 1700, y: 2000 });
  const shoot = () => { spawnBullet(s, { x: e.x + 40, y: e.y }, { x: -1, y: 0 }, 400, 3, 0, 1, 'player', '#fff'); for (let i = 0; i < 20; i++) updateBullets(s, DT); };
  updateEnemies(s, DT);
  shoot();
  expect(e.hp).toBe(ENEMIES.witness.hp);
  s.player.aim = { x: -1, y: 0 };
  updateEnemies(s, DT);
  shoot();
  expect(e.hp).toBe(ENEMIES.witness.hp - 3);
  shoot(); shoot();
  expect(s.enemies).not.toContain(e);
  expect(s.player.kills).toBe(1);
});

test('a touch costs hull and puts it back behind the ship, inside the sector', () => {
  const s = space(), e = spawnWitness(s, { x: 2000 - 20, y: 2000 });
  updateEnemies(s, DT);
  expect(s.player.hp).toBe(s.player.maxHp - ENEMIES.witness.dmg);
  expect([e.x, e.y]).toEqual([2000 - WITNESS.blink, 2000]);
  expect(watched(s, e)).toBe(false);
  expect(s.voyage!.notice).toContain('behind you again');

  const edge = space(), w = spawnWitness(edge, { x: 200 - 20, y: 2000 });
  edge.player.x = 200;
  updateEnemies(edge, DT);
  expect(w.x).toBe(64);  // clamped to the sector instead of leaving it
});
