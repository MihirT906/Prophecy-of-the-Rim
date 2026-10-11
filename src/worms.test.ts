import { beforeEach, expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { ENEMIES, ENEMY_DENSITY, WORM } from './data';
import { updateEnemies } from './enemies';
import { newState, type State } from './state';
import { generateUniverse, START_SECTOR } from './universe';
import { startVoyage } from './voyage';
import { spawnWorm, wormSegments } from './worms';

const DT = 1 / 60;
beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

function space(seed = 'worm-test'): State {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  s.voyage!.events.length = 0;  // each test places its own worm
  return s;
}
function run(s: State, seconds: number): void {
  for (let t = 0; t < seconds && s.screen === 'playing'; t += DT) updateEnemies(s, DT);
}

test('the body trails the head in a tapering chain', () => {
  const s = space(), e = spawnWorm(s, { x: 2000, y: 2000 }, { x: 4000, y: 2000 });
  const body = wormSegments(e);
  expect(body).toHaveLength(WORM.segments);
  body.forEach((seg, k) => {
    expect(seg.x).toBeCloseTo(2000 - (k + 1) * WORM.spacing);
    expect(seg.y).toBeCloseTo(2000);
    expect(seg.r).toBeLessThan(k ? body[k - 1].r : e.r);
  });
  expect(body.at(-1)!.r).toBeCloseTo(e.r / 2);
  Object.assign(s.player, { x: 0, y: 0 });
  run(s, 3);  // after swimming, the chain still follows the path at its spacing
  const moved = wormSegments(e);
  const neck = Math.hypot(e.x - moved[0].x, e.y - moved[0].y);  // the head runs up to one trail step ahead
  expect(neck).toBeGreaterThanOrEqual(WORM.spacing - .01); expect(neck).toBeLessThan(WORM.spacing + 6);
  for (let k = 1; k < moved.length; k++) expect(Math.hypot(moved[k].x - moved[k - 1].x, moved[k].y - moved[k - 1].y)).toBeCloseTo(WORM.spacing, 0);
});

test('a coasting ship is ignored: the worm cruises to its waypoint and picks another', () => {
  const s = space(), e = spawnWorm(s, { x: 2000, y: 2000 }, { x: 2600, y: 2000 });
  Object.assign(s.player, { x: 2300, y: 2400 });  // well inside hearing, engines off
  run(s, 1);
  expect(e.worm!.hunting).toBe(false);
  expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(ENEMIES.worm.speed * WORM.cruise);
  expect(e.worm!.heading).toBeCloseTo(0);
  run(s, 3);
  expect(e.worm!.goal).not.toEqual({ x: 2600, y: 2000 });
  expect(s.player.hp).toBe(s.player.maxHp);
});

test('thrust inside hearing range draws it at full speed, limited by its turn rate; cutting thrust shakes it', () => {
  const s = space(), e = spawnWorm(s, { x: 2000, y: 2000 }, { x: 4000, y: 2000 });
  Object.assign(s.player, { x: 2000, y: 2000 + WORM.hearRange - 50 });  // abeam, so it has to come about
  s.input.held.add('KeyW');
  updateEnemies(s, DT);
  expect(e.worm!.hunting).toBe(true);
  expect(s.voyage!.notice).toContain('WORMSIGN');
  expect(e.worm!.heading).toBeCloseTo(WORM.turn * DT);  // one tick of turning, not a snap
  expect(Math.hypot(e.vx, e.vy)).toBeCloseTo(ENEMIES.worm.speed);
  const gap = Math.hypot(s.player.x - e.x, s.player.y - e.y);
  run(s, 2);
  expect(Math.hypot(s.player.x - e.x, s.player.y - e.y)).toBeLessThan(gap);
  s.input.held.clear();
  updateEnemies(s, DT);
  expect(e.worm!.hunting).toBe(false);
  expect(s.voyage!.notice).toContain('loses your rhythm');

  const far = space(), deaf = spawnWorm(far, { x: 2000, y: 2000 }, { x: 4000, y: 2000 });
  Object.assign(far.player, { x: 2000, y: 2000 + WORM.hearRange + 50 });
  far.input.held.add('KeyW');
  updateEnemies(far, DT);
  expect(deaf.worm!.hunting).toBe(false);
});

test('the maw bites for full damage, the flanks grind for less, and only the head can be shot', () => {
  const s = space(), e = spawnWorm(s, { x: 2000, y: 2000 }, { x: 4000, y: 2000 });
  Object.assign(s.player, { x: e.x + e.r, y: e.y });
  updateEnemies(s, DT);
  expect(s.player.hp).toBe(s.player.maxHp - ENEMIES.worm.dmg);

  const t = space(), w = spawnWorm(t, { x: 2000, y: 2000 }, { x: 4000, y: 2000 }), mid = wormSegments(w)[8];
  Object.assign(t.player, { x: mid.x, y: mid.y + mid.r });
  updateEnemies(t, DT);
  expect(t.player.hp).toBe(t.player.maxHp - WORM.bodyDmg);
  updateEnemies(t, DT);
  expect(t.player.hp).toBe(t.player.maxHp - WORM.bodyDmg);  // invulnerability window: no second hit this pass

  spawnBullet(t, { x: mid.x, y: mid.y - 40 }, { x: 0, y: 1 }, 400, 5, 0, 1, 'player', '#fff');
  for (let i = 0; i < 30; i++) updateBullets(t, DT);
  expect(w.hp).toBe(ENEMIES.worm.hp);  // straight through the flank
  spawnBullet(t, { x: w.x + 60, y: w.y }, { x: -1, y: 0 }, 400, 5, 0, 1, 'player', '#fff');
  for (let i = 0; i < 30; i++) updateBullets(t, DT);
  expect(w.hp).toBe(ENEMIES.worm.hp - 5);
});

test('the starting sector has a worm in sight of the launch point from the first tick', () => {
  for (let i = 0; i < 20; i++) {
    const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, `home-${i}`);
    startVoyage(s, `home-${i}`);
    expect(s.voyage!.sectorId).toBe(START_SECTOR);
    updateEnemies(s, DT);
    const worms = s.enemies.filter(e => e.worm);
    expect(worms).toHaveLength(ENEMY_DENSITY);
    const gaps = worms.map(w => Math.hypot(w.x - s.player.x, w.y - s.player.y));
    for (const gap of gaps) expect(gap).toBeGreaterThan(WORM.hearRange);  // none hunting before the player has moved
    expect(Math.min(...gaps)).toBeLessThan(1400);
  }
  expect(generateUniverse('home-0').sectors[START_SECTOR].danger).toBeGreaterThan(0);
});
