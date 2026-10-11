import type { Body, State } from './state';
import { announce } from './voyage';

/** Same limits readLane enforces, so live state always stays saveable. */
export const MAX_ENEMIES = 100, MAX_BULLETS = 500;

const finite = (b: Body) => Number.isFinite(b.x) && Number.isFinite(b.y)
  && Number.isFinite(b.vx) && Number.isFinite(b.vy) && Number.isFinite(b.hp);
const invalid = (b: Body) => !finite(b);
function cleanBodies<T extends Body>(bodies: T[], limit: number, keepNewest = false): T[] {
  // Most ticks are healthy: scan without allocating filtered copies of both actor arrays.
  if (bodies.length <= limit && !bodies.some(invalid)) return bodies;
  const clean = bodies.filter(finite);
  return keepNewest ? clean.slice(-limit) : clean.slice(0, limit);
}
const lastSafe = new WeakMap<State, {
  x: number; y: number; hp: number;
  arena: State['arena']; player: State['player']; voyage: State['voyage'];
}>();

/** Self-healing watchdog run after every playing tick: one corrupt value (NaN physics, a broken enemy,
 *  a runaway projectile count) is repaired instead of silently breaking or unsaving the run. Returns repairs made. */
export function repairState(s: State): number {
  const p = s.player;
  let repairs = 0;
  if (finite(p)) {
    let safe = lastSafe.get(s);
    if (!safe) {
      safe = { x: p.x, y: p.y, hp: p.hp, arena: s.arena, player: p, voyage: s.voyage };
      lastSafe.set(s, safe);
    } else {
      safe.x = p.x; safe.y = p.y; safe.hp = p.hp;
      safe.arena = s.arena; safe.player = p; safe.voyage = s.voyage;
    }
  }
  else {
    const previous = lastSafe.get(s);
    const safe = previous?.arena === s.arena && previous.player === p && previous.voyage === s.voyage
      ? previous : { ...s.arena.start, hp: p.maxHp };
    if (![p.x, p.y].every(Number.isFinite)) Object.assign(p, { x: safe.x, y: safe.y });
    if (!Number.isFinite(p.hp)) p.hp = safe.hp;
    p.vx = 0; p.vy = 0;
    repairs++;
  }
  const enemies = cleanBodies(s.enemies, MAX_ENEMIES);
  const bullets = cleanBodies(s.bullets, MAX_BULLETS, true);
  repairs += s.enemies.length - enemies.length + s.bullets.length - bullets.length;
  if (enemies.length !== s.enemies.length) s.enemies = enemies;
  if (bullets.length !== s.bullets.length) s.bullets = bullets;
  if (repairs && s.voyage) announce(s.voyage, `INTEGRITY / ${repairs} corrupt value${repairs > 1 ? 's' : ''} repaired.`);
  return repairs;
}
