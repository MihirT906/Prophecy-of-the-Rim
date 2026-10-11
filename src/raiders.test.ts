import { beforeEach, expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { ENEMIES, RAIDER } from './data';
import { updateEnemies } from './enemies';
import { spawnRaiders } from './raiders';
import { newState, type State } from './state';
import { nextInwardSector } from './universe';
import { startVoyage } from './voyage';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function space(seed = 'raider-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own pack
  s.voyage!.personalSpice = s.voyage!.earnedSpice = 0;  // the hold starts clean; tests load it themselves
  Object.assign(s.player, { x: 1000, y: 1000, vx: 0, vy: 0 });
  return s;
}
function load(s: State): void {
  const v = s.voyage!;
  v.cargo = { serial: 1, origin: v.sectorId, destination: nextInwardSector(v.universe, v.sectorId), remaining: 12, commodity: 'melange', illegal: true };
}
function run(s: State, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds && s.screen === 'playing'; t += DT) { each?.(); updateEnemies(s, DT); }
}

test('a dark pack ignores an empty ship at a distance but springs on one carrying spice', () => {
  const s = space(), pack = spawnRaiders(s, { x: 1000 + RAIDER.quiet + 150, y: 1000 }, 3, 'a');
  run(s, 2);
  expect(pack.every(e => e.raider!.mode === 'dark' && e.x === pack[0].x - 34 * Math.ceil(pack.indexOf(e) / 2))).toBe(true);
  expect(s.bullets).toHaveLength(0);
  load(s);
  updateEnemies(s, DT);
  expect(pack.every(e => e.raider!.mode === 'wheel')).toBe(true);
  expect(new Set(pack.map(e => e.raider!.t)).size).toBe(3);  // staggered
  expect(s.voyage!.notice).toContain('HARKONNEN AMBUSH');
});

test('an empty ship still wakes them by coming too close, and so does shooting one', () => {
  const near = space(), [a] = spawnRaiders(near, { x: 1000 + RAIDER.quiet - 10, y: 1000 }, 1, 'a');
  updateEnemies(near, DT);
  expect(a.raider!.mode).toBe('wheel');

  const far = space(), pack = spawnRaiders(far, { x: 1000 + RAIDER.ambush + 200, y: 1000 }, 2, 'a');
  spawnBullet(far, { x: pack[0].x - 20, y: pack[0].y }, { x: 1, y: 0 }, 400, 1, 0, 1, 'player', '#fff');
  updateBullets(far, DT);
  expect(pack[0].hp).toBe(ENEMIES.raider.hp - 1);
  expect(pack.every(e => e.raider!.mode === 'wheel')).toBe(true);
});

test('an attack run holds one heading, leads the target, fires down the nose and overshoots before coming about', () => {
  const s = space(), [e] = spawnRaiders(s, { x: 1000 + 500, y: 1000 }, 1, 'a');
  load(s);
  s.player.vy = 200;  // crossing its nose
  run(s, .25, () => { s.player.y = 1000; });
  expect(e.raider!.mode).toBe('run');
  const dir = { ...e.raider!.dir };
  expect(dir.x).toBeLessThan(0);
  expect(dir.y).toBeGreaterThan(0);  // aimed ahead of a ship moving down the screen
  s.player.vy = 0;
  run(s, .6, () => { s.player.y = 1000; });
  expect(e.raider!.dir).toEqual(dir);  // committed: it does not track
  expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(ENEMIES.raider.speed, 0);
  expect(e.vy / e.vx).toBeCloseTo(dir.y / dir.x, 1);
  const shots = s.bullets.filter(b => b.owner === 'enemy');
  expect(shots.length).toBeGreaterThan(0);
  for (const b of shots) expect(b.vy / b.vx).toBeCloseTo(dir.y / dir.x, 5);
  for (let t = 0; t < 2 && e.raider!.mode === 'run'; t += DT) updateEnemies(s, DT);
  expect(e.raider!.mode).toBe('wheel');
  expect(e.x).toBeLessThan(s.player.x - RAIDER.overshoot * .8);  // it went past before turning
});

test('guns stay silent when the target is off the nose', () => {
  const s = space(), [e] = spawnRaiders(s, { x: 1400, y: 1000 }, 1, 'a');
  Object.assign(e.raider!, { mode: 'run', t: RAIDER.runSeconds, dir: { x: 0, y: 1 } });  // flying down, target to the left
  e.timer = 0;
  run(s, .5);
  expect(s.bullets).toHaveLength(0);
});

test('a pack that is left far behind goes dark again', () => {
  const s = space(), [e] = spawnRaiders(s, { x: 1200, y: 1000 }, 1, 'a');
  updateEnemies(s, DT);
  expect(e.raider!.mode).toBe('wheel');
  s.player.x = e.x - RAIDER.giveUp - 100;
  updateEnemies(s, DT);
  expect(e.raider!.mode).toBe('dark');
  const at = e.x;
  run(s, 3);
  expect(Math.abs(e.x - at)).toBeLessThan(40);  // drifts to a stop
});

test('a raider on its run rams for damage', () => {
  const s = space(), [e] = spawnRaiders(s, { x: 3000, y: 3000 }, 1, 'a');
  e.raider!.mode = 'run';
  Object.assign(s.player, { x: e.x + 5, y: e.y });
  updateEnemies(s, DT);
  expect(s.player.hp).toBe(s.player.maxHp - ENEMIES.raider.dmg);
});
