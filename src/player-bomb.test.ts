import { expect, test } from 'vitest';
import { spawnEnemy } from './enemies';
import { placePlayerBomb, updatePlayerBombs, PLAYER_BOMB } from './player-bomb';
import { newState } from './state';
import { startVoyage } from './voyage';

function fresh() {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'bomb-retry');
  startVoyage(s, s.seed);
  return s;
}

test('retry clears bombs from the previous attempt even in the same sector', () => {
  const s = fresh();
  expect(placePlayerBomb(s)).toBe(true);
  startVoyage(s, s.seed);
  const enemy = spawnEnemy(s, 'rusher', s.player);
  const hp = enemy.hp;
  updatePlayerBombs(s, PLAYER_BOMB.fuse + PLAYER_BOMB.wave);
  expect(enemy.hp).toBe(hp);
});

test('retry restores a ready bomb without carrying over its recharge', () => {
  const s = fresh();
  expect(placePlayerBomb(s)).toBe(true);
  expect(placePlayerBomb(s)).toBe(false);
  startVoyage(s, s.seed);
  expect(placePlayerBomb(s)).toBe(true);
});

test('changing sectors within an attempt preserves bomb recharge', () => {
  const s = fresh();
  expect(placePlayerBomb(s)).toBe(true);
  s.voyage!.sectorId++;
  expect(placePlayerBomb(s)).toBe(false);
  updatePlayerBombs(s, PLAYER_BOMB.recharge);
  expect(placePlayerBomb(s)).toBe(true);
});
