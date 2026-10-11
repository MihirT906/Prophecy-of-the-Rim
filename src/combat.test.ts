import { expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { WEAPONS } from './data';
import { spawnEnemy } from './enemies';
import { damagePlayer, newPlayer, updatePlayer } from './player';
import { newState, type Arena, type State } from './state';
import { fire } from './weapons';

function mkState(): State {
  const w = 10, h = 10, tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1;
  const arena: Arena = { w, h, tiles, start: { x: 160, y: 160 }, spawns: [], exit: { x: 9, y: 5 } };
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'test');
  s.arena = arena;
  s.player = { ...newPlayer(), x: 160, y: 160 };
  s.screen = 'playing';
  return s;
}

test('pistol fires one bullet and sets cooldown', () => {
  const s = mkState();
  fire(s, { x: 1, y: 0 });
  expect(s.bullets.length).toBe(1);
  expect(s.player.cooldown).toBeCloseTo(WEAPONS.pistol.interval);
  fire(s, { x: 1, y: 0 });
  expect(s.bullets.length).toBe(1);
});

test('shotgun fires its pellet count and uses one ammo', () => {
  const s = mkState();
  s.player.weapon = 'shotgun';
  s.player.ammo = 18;
  fire(s, { x: 1, y: 0 });
  expect(s.bullets.length).toBe(WEAPONS.shotgun.count);
  expect(s.player.ammo).toBe(17);
});

test('running out of ammo reverts to pistol', () => {
  const s = mkState();
  s.player.weapon = 'smg';
  s.player.ammo = 1;
  fire(s, { x: 0, y: 1 });
  expect(s.player.weapon).toBe('pistol');
});

test('held fire keeps the exact average rate', () => {
  const s = mkState();
  s.player.weapon = 'smg';
  s.player.ammo = 1000;
  s.input.held.add('ArrowRight');
  for (let i = 0; i < 60; i++) updatePlayer(s, 1 / 60);
  expect(s.bullets.length).toBe(Math.ceil(1 / WEAPONS.smg.interval));
});

test('a fast bullet cannot skip an enemy it passes through', () => {
  const s = mkState();
  const e = spawnEnemy(s, 'rusher', { x: 200, y: 100 });
  spawnBullet(s, { x: 180, y: 100 }, { x: 1, y: 0 }, 3000, 1, 0, 1, 'player', '#fff');
  updateBullets(s, 1 / 60);
  expect(e.hp).toBe(1);
});

test('bullet hits enemy and is removed at pierce 0', () => {
  const s = mkState();
  const e = spawnEnemy(s, 'gunner', { x: 200, y: 100 });
  spawnBullet(s, { x: 160, y: 100 }, { x: 1, y: 0 }, 600, 1, 0, 1, 'player', '#fff');
  for (let i = 0; i < 10; i++) updateBullets(s, 1 / 60);
  expect(e.hp).toBe(3);
  expect(s.bullets.length).toBe(0);
});

test('damagePlayer respects i-frames', () => {
  const s = mkState();
  damagePlayer(s, 1, { x: 100, y: 160 });
  damagePlayer(s, 1, { x: 100, y: 160 });
  expect(s.player.hp).toBe(9);
  expect(s.player.vx).toBeGreaterThan(0);
});

test('kills never interrupt flight or heal the hull: weapons are bought with spice, not earned', () => {
  const s = mkState();
  s.player.hp = 3;
  for (let i = 0; i < 20; i++) {
    spawnEnemy(s, 'rusher', { x: 200, y: 100 });
    spawnBullet(s, { x: 180, y: 100 }, { x: 1, y: 0 }, 600, 10, 0, 1, 'player', '#fff');
    for (let k = 0; k < 5; k++) updateBullets(s, 1 / 60);
  }
  expect(s.player.kills).toBe(20);
  expect([s.screen, s.player.hp, s.player.maxHp]).toEqual(['playing', 3, newPlayer().maxHp]);
  expect(s.player).not.toHaveProperty('xp');
});

test('shots inherit the ship velocity at the moment they are fired', () => {
  const s = mkState();
  Object.assign(s.player, { vx: 120, vy: -40 });
  fire(s, { x: 1, y: 0 });
  const b = s.bullets[0];
  expect(Math.hypot(b.vx - 120, b.vy + 40)).toBeCloseTo(WEAPONS.pistol.speed);
});
