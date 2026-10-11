import { ENEMY_DENSITY, STORM, TILE } from './data';
import { patrolSites, spawnPatrol } from './patrols';
import { spawnRaiders } from './raiders';
import { makeRng } from './rng';
import { spawnStorm } from './storms';
import { spawnNest } from './seekers';
import type { State, Vec } from './state';
import { START_SECTOR } from './universe';
import { consumeUniverseEvents } from './voyage';
import { spawnWitness } from './witness';
import { spawnWorm } from './worms';

/** Sector arrival: populate the system. Each kind of threat has its own module; this decides how many and where. */
export function spawnEncounters(s: State): void {
  const v = s.voyage;
  if (!v || v.lane || v.status !== 'active') return;
  // A run resumed inside a lane queues an arrival for the sector it left: only the current sector counts.
  if (!consumeUniverseEvents(s).some(e => e.type === 'sector-entered' && e.to === v.sectorId)) return;
  s.storms = [];
  for (const site of patrolSites(v)) spawnPatrol(s, site);
  for (const site of v.system.encounters) {
    if (site.role === 'ambush') spawnRaiders(s, site, site.count, site.seed);
    if (site.role === 'stalker') spawnWitness(s, site);
  }
  const danger = v.universe.sectors[v.sectorId].danger, rng = makeRng(`${v.universe.seed}:${v.sectorId}:ambient`);
  const start = v.system.arena.start, home = v.sectorId === START_SECTOR;
  // The starting sector's worm surfaces just past the freighter, so the first screen already has wormsign.
  if (home) spawnWorm(s, { x: start.x + 950, y: start.y - 760 }, { x: start.x + 420, y: start.y + 900 });
  if (home || danger >= 2) for (let i = home ? 1 : 0; i < ENEMY_DENSITY; i++) spawnWorm(s, farPoint(s, rng, start), farPoint(s, rng, start));
  // A Harkonnen pack waits dark beside the first freighter: collecting spice there springs it.
  if (home) spawnRaiders(s, { x: start.x + 680, y: start.y - 150 }, 3 * ENEMY_DENSITY, 'home');
  // A Witness begins behind the ship at launch: it is already closing when the run starts.
  if (home) spawnWitness(s, { x: start.x - 170, y: start.y + 250 });
  if (home) for (let i = 1; i < ENEMY_DENSITY; i++) spawnWitness(s, farPoint(s, rng, start));
  // Coriolis storms roam every system; the launch point has one rolling in from below.
  if (home) spawnStorm(s, { x: start.x + 330, y: start.y + 310 }, { x: 9, y: -7 }, 150);
  for (let i = 0; i < 1 + Math.floor(danger / 2); i++) {
    const a = rng() * Math.PI * 2, speed = STORM.drift * (.4 + rng() * .6);
    spawnStorm(s, farPoint(s, rng, start), { x: Math.cos(a) * speed, y: Math.sin(a) * speed }, STORM.radius * (.8 + rng() * .5));
  }
  // Hunter-seeker nests: more of them the more dangerous the system, and one hanging above the launch point.
  if (home) spawnNest(s, { x: start.x + 240, y: start.y - 262 }, 'home');
  for (let i = 0; i < Math.min(4, danger) * ENEMY_DENSITY; i++) spawnNest(s, farPoint(s, rng, start), `nest-${i}`);
}

/** A point inside the sector, away from its edges and at least 900 px from `from`. */
export function farPoint(s: State, rng: () => number, from: Vec): Vec {
  const w = s.arena.w * TILE, h = s.arena.h * TILE;
  for (;;) {
    const at = { x: 500 + rng() * (w - 1000), y: 500 + rng() * (h - 1000) };
    if (Math.hypot(at.x - from.x, at.y - from.y) >= 900) return at;
  }
}
