import { ENEMIES, PLAYER, TILE, WITNESS } from './data';
import { spawnEnemy } from './enemies';
import { burst } from './fx';
import { damagePlayer, steer } from './player';
import type { Enemy, State, Vec } from './state';
import { announce } from './voyage';

export function spawnWitness(s: State, at: Vec): Enemy {
  const e = spawnEnemy(s, 'witness', at);
  e.witness = { seen: false, known: false };
  return e;
}

/** Looking at it means pointing the ship's aim at it: the nose while flying, the guns while firing. */
export function watched(s: State, e: Enemy): boolean {
  const p = s.player, dx = e.x - p.x, dy = e.y - p.y, dist = Math.hypot(dx, dy);
  if (dist > WITNESS.sight) return false;
  return !dist || (dx * p.aim.x + dy * p.aim.y) / dist >= Math.cos(WITNESS.gaze);
}

export function updateWitness(s: State, e: Enemy, dt: number): void {
  const b = e.witness!, p = s.player, d = ENEMIES.witness;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
  b.seen = watched(s, e);
  if (!b.known && dist <= WITNESS.hush) {
    b.known = true;
    if (s.voyage) announce(s.voyage, 'SILENT WITNESS: it moves only when you look away. Aim at it to pin it, then shoot.');
  }
  if (b.seen) { e.vx = 0; e.vy = 0; return; }  // pinned: no drift, no glide
  steer(e, { x: dx / dist, y: dy / dist }, d.speed, d.accel, PLAYER.friction, dt);
  e.x += e.vx * dt; e.y += e.vy * dt;
  e.facing = Math.atan2(dy, dx);
  if (dist >= e.r + p.r) return;
  damagePlayer(s, d.dmg, e);
  // Having touched the ship it is gone, and somewhere behind the pilot again.
  burst(s, e, d.color, 12);
  const w = s.arena.w * TILE, h = s.arena.h * TILE;
  e.x = Math.max(64, Math.min(w - 64, p.x - p.aim.x * WITNESS.blink));
  e.y = Math.max(64, Math.min(h - 64, p.y - p.aim.y * WITNESS.blink));
  e.vx = 0; e.vy = 0;
  if (s.voyage && s.screen === 'playing') announce(s.voyage, 'The Witness touched the hull. It is behind you again.');
}
