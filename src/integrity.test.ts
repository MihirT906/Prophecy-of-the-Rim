import { expect, test } from 'vitest';
import { spawnBullet } from './bullets';
import { spawnEnemy } from './enemies';
import { MAX_BULLETS, MAX_ENEMIES, repairState } from './integrity';
import { newState } from './state';
import { newPlayer } from './player';

const fresh = () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'integrity');
  Object.assign(s.player, { x: 300, y: 200 });
  return s;
};

test('healthy state is untouched', () => {
  const s = fresh();
  spawnEnemy(s, 'rusher', { x: 400, y: 200 });
  expect(repairState(s)).toBe(0);
  expect(s.enemies.length).toBe(1);
});

test('NaN physics snaps the ship back to its last safe state', () => {
  const s = fresh();
  repairState(s);
  Object.assign(s.player, { x: NaN, vx: Infinity, hp: NaN });
  expect(repairState(s)).toBe(1);
  expect(s.player).toMatchObject({ x: 300, y: 200, vx: 0, vy: 0, hp: s.player.maxHp });
});

test('corrupt enemies are dropped and runaway bullets are capped to what saves accept', () => {
  const s = fresh();
  spawnEnemy(s, 'gunner', { x: 400, y: 200 }).vx = NaN;
  for (let i = 0; i < MAX_BULLETS + 20; i++) spawnBullet(s, { x: 10, y: 10 }, { x: 1, y: 0 }, 100, 1, 0, 1, 'enemy', '#fff');
  expect(repairState(s)).toBe(21);
  expect([s.enemies.length, s.bullets.length]).toEqual([0, MAX_BULLETS]);
});


test('first-frame corruption falls back to the arena spawn and repairs only once', () => {
  const s = fresh();
  Object.assign(s.player, { x: NaN, y: Infinity, hp: NaN });
  expect(repairState(s)).toBe(1);
  expect(s.player).toMatchObject({ ...s.arena.start, hp: s.player.maxHp, vx: 0, vy: 0 });
  expect(repairState(s)).toBe(0);
});

test('safe positions are isolated between runs and update after movement', () => {
  const a = fresh(), b = fresh();
  repairState(a);
  Object.assign(b.player, { x: 700, y: 500 }); repairState(b);
  Object.assign(a.player, { x: 350, y: 250 }); repairState(a);
  a.player.x = NaN; b.player.x = NaN;
  repairState(a); repairState(b);
  expect([a.player.x, a.player.y]).toEqual([350, 250]);
  expect([b.player.x, b.player.y]).toEqual([700, 500]);
});

test('finite death health is preserved rather than resurrecting the player', () => {
  const s = fresh(); s.player.hp = 0;
  expect(repairState(s)).toBe(0);
  expect(s.player.hp).toBe(0);
});

test('corruption after travel uses the new arena spawn rather than coordinates from another world', () => {
  const s = fresh();
  repairState(s);
  s.arena = { ...s.arena, start: { x: 80, y: 90 } };
  s.player.x = NaN;
  repairState(s);
  expect([s.player.x, s.player.y]).toEqual([80, 90]);
});

test('a replacement player cannot inherit the previous attempt\'s damaged hull', () => {
  const s = fresh();
  s.player.hp = 1;
  repairState(s);
  s.player = newPlayer();
  s.player.hp = NaN;
  repairState(s);
  expect(s.player.hp).toBe(s.player.maxHp);
});

test('enemy limits preserve the first valid enemies and healthy collection identity', () => {
  const s = fresh();
  for (let i = 0; i < MAX_ENEMIES + 3; i++) spawnEnemy(s, 'rusher', { x: i, y: 200 });
  const first = s.enemies[0];
  expect(repairState(s)).toBe(3);
  expect(s.enemies).toHaveLength(MAX_ENEMIES);
  expect(s.enemies[0]).toBe(first);
  const enemies = s.enemies, bullets = s.bullets;
  expect(repairState(s)).toBe(0);
  expect(s.enemies).toBe(enemies); expect(s.bullets).toBe(bullets);
});
