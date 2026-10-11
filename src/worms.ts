import { ENEMIES, TILE, WORM } from './data';
import { spawnEnemy } from './enemies';
import { moveVector } from './input';
import { damagePlayer } from './player';
import type { Enemy, State, Vec } from './state';
import { announce } from './voyage';

const STEP = 6;  // px of head travel between trail points

/** Shai-Hulud surfaces at `at`, already stretched out behind its head, swimming for `goal`. */
export function spawnWorm(s: State, at: Vec, goal: Vec): Enemy {
  const e = spawnEnemy(s, 'worm', at), heading = Math.atan2(goal.y - at.y, goal.x - at.x);
  const length = WORM.segments * WORM.spacing / STEP;
  e.facing = heading;
  e.worm = { heading, goal: { ...goal }, hunting: false,
    trail: Array.from({ length: length + 1 }, (_, k) => ({ x: at.x - Math.cos(heading) * k * STEP, y: at.y - Math.sin(heading) * k * STEP })) };
  return e;
}

/** Body segments from neck to tail: positions along the trail, tapering to half the head's girth. */
export function wormSegments(e: Enemy): (Vec & { r: number })[] {
  const trail = e.worm!.trail;
  return Array.from({ length: WORM.segments }, (_, k) => {
    const at = trail[Math.min(trail.length - 1, Math.round((k + 1) * WORM.spacing / STEP))];
    return { x: at.x, y: at.y, r: e.r * (1 - .5 * (k + 1) / WORM.segments) };
  });
}

/** It hears engines, not ships: thrusting inside hearRange draws it, coasting or braking lets it lose interest. */
export function updateWorm(s: State, e: Enemy, dt: number): void {
  const w = e.worm!, p = s.player, d = ENEMIES.worm;
  const thrust = moveVector(s.input), dist = Math.hypot(p.x - e.x, p.y - e.y);
  const hunting = !!(thrust.x || thrust.y) && dist <= WORM.hearRange;
  if (hunting !== w.hunting && s.voyage) announce(s.voyage, hunting ? 'WORMSIGN: Shai-Hulud hears your engines. Cut thrust and coast.' : 'The worm loses your rhythm.');
  w.hunting = hunting;
  if (!hunting && Math.hypot(w.goal.x - e.x, w.goal.y - e.y) < 220) {  // reached the waypoint: pick another across the sector
    const width = s.arena.w * TILE, height = s.arena.h * TILE;
    w.goal = { x: 400 + s.rng() * Math.max(1, width - 800), y: 400 + s.rng() * Math.max(1, height - 800) };
  }
  const to = hunting ? p : w.goal, want = Math.atan2(to.y - e.y, to.x - e.x) - w.heading;
  const turn = Math.atan2(Math.sin(want), Math.cos(want)), limit = WORM.turn * dt;
  w.heading += Math.max(-limit, Math.min(limit, turn));
  const speed = d.speed * (hunting ? 1 : WORM.cruise);
  e.vx = Math.cos(w.heading) * speed; e.vy = Math.sin(w.heading) * speed;
  e.x += e.vx * dt; e.y += e.vy * dt; e.facing = w.heading;
  while (Math.hypot(e.x - w.trail[0].x, e.y - w.trail[0].y) >= STEP) {
    const last = w.trail[0], gap = Math.hypot(e.x - last.x, e.y - last.y);
    w.trail.unshift({ x: last.x + (e.x - last.x) / gap * STEP, y: last.y + (e.y - last.y) / gap * STEP });
    w.trail.pop();
  }
  // The maw bites hard; the flanks grind. One hit per pass: the player's invulnerability window covers the rest.
  if (dist < e.r + p.r) { damagePlayer(s, d.dmg, e); return; }
  const flank = wormSegments(e).find(seg => Math.hypot(p.x - seg.x, p.y - seg.y) < seg.r + p.r);
  if (flank) damagePlayer(s, WORM.bodyDmg, flank);
}
