import type { EnemyKind } from './data';
import { WAVES } from './data';
import type { State } from './state';
import { generateArena, inExit, openExit } from './arena';
import { spawnEnemy } from './enemies';
import { randInt } from './rng';
import { writeSave } from './save';

/** 3 + n */
export function waveCount(n: number): number { return WAVES.base + n; }
/** 4 + n + 2w */
export function waveSize(n: number, w: number): number { return WAVES.sizeBase + n + WAVES.sizePerWave * w; }
export function pickKind(rng: () => number, n: number): EnemyKind {
  const gunner = Math.max(0, n - WAVES.gunnerFrom + 1) * WAVES.gunnerPerArena;
  const brute = Math.max(0, n - WAVES.bruteFrom + 1) * WAVES.brutePerArena;
  const roll = rng() * (1 + gunner + brute);
  return roll < 1 ? 'rusher' : roll < 1 + gunner ? 'gunner' : 'brute';
}

function queueWave(s: State): void {
  s.wave++;
  const size = waveSize(s.arenaN, s.wave);
  s.spawnQueue = Array.from({ length: size }, () => pickKind(s.rng, s.arenaN));
  s.spawnTimer = WAVES.releaseSeconds / size;
}
/** Generate, reset lists, place player, wave 0, queue first wave. */
export function startArena(s: State, n: number): void {
  s.arenaN = n;
  s.arena = generateArena(s.seed, n);
  s.enemies = [];
  s.bullets = [];
  s.pickups = [];
  s.particles = [];
  s.shake = 0;
  s.player.x = s.arena.start.x;
  s.player.y = s.arena.start.y;
  s.player.vx = s.player.vy = 0;
  s.wave = 0;
  s.waveTotal = waveCount(n);
  s.exitOpen = false;
  queueWave(s);
}
/** Release queue, advance wave, open exit, arena transition on inExit. */
export function updateWaves(s: State, dt: number): void {
  if (s.exitOpen) {
    if (inExit(s.arena, s.player)) {
      startArena(s, s.arenaN + 1);
      writeSave(s);
    }
    return;
  }
  if (s.spawnQueue.length > 0) {
    s.spawnTimer -= dt;
    const interval = WAVES.releaseSeconds / waveSize(s.arenaN, s.wave);
    while (s.spawnQueue.length > 0 && s.spawnTimer <= 0) {
      const kind = s.spawnQueue.shift()!;
      spawnEnemy(s, kind, s.arena.spawns[randInt(s.rng, 0, s.arena.spawns.length - 1)]);
      s.spawnTimer += interval;
    }
  }
  if (s.spawnQueue.length === 0 && s.enemies.length === 0) {
    if (s.wave < s.waveTotal) queueWave(s);
    else {
      openExit(s.arena);
      s.exitOpen = true;
      writeSave(s);
    }
  }
}
