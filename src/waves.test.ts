import { expect, test } from 'vitest';
import { pickKind, startArena, updateWaves, waveCount, waveSize } from './waves';
import { makeRng } from './rng';
import { newState } from './state';
import { TILE, WAVES } from './data';
import { tileAt } from './arena';

test('wave counts and enemy mixes scale with arena number', () => {
  expect(waveCount(1)).toBe(4);
  expect(waveSize(1, 1)).toBe(7);
  for (let i = 0; i < 1000; i++) expect(pickKind(() => i / 1000, 1)).toBe('rusher');
  const rng = makeRng('mix');
  expect(new Set(Array.from({ length: 1000 }, () => pickKind(rng, 10))))
    .toEqual(new Set(['rusher', 'gunner', 'brute']));
});

test('arena setup, cleared waves and exit transition preserve the player', () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'waves');
  s.player.hp = 7;
  s.player.vx = 100;
  startArena(s, 2);
  expect(s.arenaN).toBe(2);
  expect(s.waveTotal).toBe(waveCount(2));
  expect(s.spawnQueue).toHaveLength(waveSize(2, 1));
  expect([s.player.x, s.player.y]).toEqual([s.arena.start.x, s.arena.start.y]);
  expect(s.player.vx).toBe(0);
  for (let wave = 1; wave < s.waveTotal; wave++) {
    s.spawnQueue = [];
    updateWaves(s, 0);
    expect(s.wave).toBe(wave + 1);
    expect(s.spawnQueue).toHaveLength(waveSize(2, wave + 1));
  }
  s.spawnQueue = [];
  updateWaves(s, 0);
  expect(s.exitOpen).toBe(true);
  expect(tileAt(s.arena, Math.floor(s.arena.exit.x / TILE), Math.floor(s.arena.exit.y / TILE))).toBe(3);
  s.particles.push({ x: 0, y: 0, vx: 0, vy: 0, ttl: Infinity, maxTtl: 1, size: 2, color: 'red', decal: true });
  Object.assign(s.player, s.arena.exit);
  updateWaves(s, 0);
  expect(s.arenaN).toBe(3);
  expect(s.exitOpen).toBe(false);
  expect(s.particles).toEqual([]);
  expect(s.player.hp).toBe(7);
});

test('queued enemies release across three seconds and block the next wave', () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'release');
  startArena(s, 1);
  const count = s.spawnQueue.length;
  const interval = WAVES.releaseSeconds / count;
  updateWaves(s, interval / 2);
  expect(s.enemies).toHaveLength(0);
  updateWaves(s, interval / 2);
  expect(s.enemies).toHaveLength(1);
  expect(s.arena.spawns).toContainEqual({ x: s.enemies[0].x, y: s.enemies[0].y });
  expect(s.enemies[0]).not.toMatchObject(s.arena.exit);
  updateWaves(s, WAVES.releaseSeconds - interval + 1e-9);
  expect(s.enemies).toHaveLength(count);
  expect(s.spawnQueue).toEqual([]);
  expect(s.wave).toBe(1);
});
