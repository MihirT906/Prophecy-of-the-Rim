import { blastFeedback } from './combat-feedback';
import { ARMS, RARITIES, RARITY_ORDER, TILE, type ArmsId } from './data';
import { damageEnemy } from './enemies';
import { burst } from './fx';
import { laneCenter } from './hyperspace';
import { damagePlayer } from './player';
import { writeSave } from './save';
import { nextId, type ArsenalItem, type Enemy, type Hazard, type State, type Vec } from './state';
import { announce } from './voyage';
import { launchBombingRun, launchCarryall, launchDrone, launchGunship, launchThopter, updateAircraft } from './strikes';
import { dropMine, launchDeathHand, launchHawkStrike, launchSeeker, updateHazards } from './ordnance';

/** Armory dispatcher: one activation per item id. Activations live in strikes.ts (aircraft) and ordnance.ts (hazards, bullets, fear). */
const ACTIVATE: Record<ArmsId, (s: State, item: ArsenalItem) => void> = {
  thopter: launchThopter, bombing: launchBombingRun, gunship: launchGunship, drone: launchDrone, carryall: launchCarryall,
  deathhand: launchDeathHand, hawk: launchHawkStrike, aamine: dropMine, seeker: launchSeeker,
};

/** Fire arsenal slot `slot` (0-based). One use of durability; the item is removed at zero. Saved at once so a reload cannot refund it. */
export function useArms(s: State, slot: number): boolean {
  const v = s.voyage, item = v?.arsenal[slot];
  if (!v || !item || s.screen !== 'playing' || v.status !== 'active') return false;
  ACTIVATE[item.id](s, item);
  if (--item.durability <= 0) { v.arsenal.splice(slot, 1); announce(v, `${ARMS[item.id].name} spent.`); }
  else announce(v, `${ARMS[item.id].name} · ${item.durability} use${item.durability === 1 ? '' : 's'} left`);
  writeSave(s);
  return true;
}

/** Per-tick system, after bullets and before the voyage: fear timers, friendly aircraft, ground ordnance. */
export function updateArms(s: State, dt: number): void {
  if (s.screen !== 'playing') return;
  for (const e of s.enemies) if (e.fear) e.fear = Math.max(0, e.fear - dt);
  updateAircraft(s, dt);
  if (s.screen !== 'playing') return;
  updateHazards(s, dt);
}

/** Rarity effect multiplier and 0-based tier (common 0 .. legendary 3). */
export function power(item: ArsenalItem): number { return RARITIES[item.rarity].power; }
export function tier(item: ArsenalItem): number { return RARITY_ORDER.indexOf(item.rarity); }

export function nearestEnemy(s: State, at: Vec, range = Infinity, exclude?: Set<number>): Enemy | null {
  let best: Enemy | null = null, bestD = range;
  for (const e of s.enemies) {
    if (exclude?.has(e.id)) continue;
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d < bestD) { best = e; bestD = d; }
  }
  return best;
}

/** Playable bounds around a point: the FTL corridor's width at that x (its lethal edges), or the system boundary. */
export function bounds(s: State, at: Vec = s.player): { x0: number; y0: number; x1: number; y1: number } {
  const course = s.voyage?.lane?.course;
  if (course) {
    const center = laneCenter(course, Math.max(0, Math.min(course.length, at.x)));
    return { x0: 60, y0: center - course.width / 2 + 60, x1: course.length - 60, y1: center + course.width / 2 - 60 };
  }
  return { x0: 48, y0: 48, x1: s.arena.w * TILE - 48, y1: s.arena.h * TILE - 48 };
}
export function clampToBounds(s: State, at: Vec): Vec {
  const b = bounds(s, at);
  return { x: Math.max(b.x0, Math.min(b.x1, at.x)), y: Math.max(b.y0, Math.min(b.y1, at.y)) };
}
export function inBounds(s: State, at: Vec, slack = 0): boolean {
  const b = bounds(s, at);
  return at.x >= b.x0 - slack && at.x <= b.x1 + slack && at.y >= b.y0 - slack && at.y <= b.y1 + slack;
}
/** The point `distance` px along the player's aim, kept inside the room. */
export function aimPoint(s: State, distance: number): Vec {
  const p = s.player;
  return clampToBounds(s, { x: p.x + p.aim.x * distance, y: p.y + p.aim.y * distance });
}

export function spawnHazard(s: State, h: Omit<Hazard, 'id'>): Hazard {
  const hazard: Hazard = { id: nextId(s), ...h };
  s.hazards.push(hazard);
  return hazard;
}

/** Area damage: every enemy within r (plus its radius) takes dmg; the player takes selfDmg if inside. */
export function explode(s: State, at: Vec, r: number, dmg: number, selfDmg: number, color: string): void {
  for (const e of [...s.enemies]) {
    const dx = e.x - at.x, dy = e.y - at.y, d = Math.hypot(dx, dy);
    if (d >= r + e.r) continue;
    damageEnemy(s, e, dmg, d ? { x: dx / d, y: dy / d } : { x: 1, y: 0 });
  }
  const p = s.player;
  if (selfDmg > 0 && Math.hypot(p.x - at.x, p.y - at.y) < r + p.r) damagePlayer(s, selfDmg, at);
  blastFeedback(s, at, r);
  burst(s, at, color, Math.min(40, 10 + Math.round(r / 4)));
  // Blast rings and local particles provide impact without shaking every chain kill.
}
