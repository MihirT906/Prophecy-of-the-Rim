import { ENEMIES } from './data';
import type { Enemy, State } from './state';

export type Faction = 'guild' | 'harkonnen' | 'seeker' | 'worm' | 'witness' | 'other';
export const FACTIONS: Record<Faction, { name: string; color: string }> = {
  guild: { name: 'GUILD PATROL', color: ENEMIES.patrol.color },
  harkonnen: { name: 'HARKONNEN RAIDER', color: ENEMIES.raider.color },
  seeker: { name: 'HUNTER-SEEKER', color: ENEMIES.seeker.color },
  worm: { name: 'SHAI-HULUD', color: ENEMIES.worm.color },
  witness: { name: 'SILENT WITNESS', color: ENEMIES.witness.color },
  other: { name: 'INTERCEPTOR', color: '#b98484' },
};
export const FACTION_ORDER = Object.keys(FACTIONS) as Faction[];

export function factionOf(e: Enemy): Faction {
  return e.patrol ? 'guild' : e.raider ? 'harkonnen' : e.seeker ? 'seeker' : e.worm ? 'worm' : e.witness ? 'witness' : 'other';
}

/** Actively after the ship right now, as opposed to patrolling, sleeping, lying dark, wandering or pinned. */
export function hunting(e: Enemy): boolean {
  if (e.patrol) return e.patrol.mode === 'pursue';
  if (e.raider) return e.raider.mode !== 'dark';
  if (e.seeker) return e.seeker.awake;
  if (e.worm) return e.worm.hunting;
  if (e.witness) return !e.witness.seen;
  return true;
}

export interface Census { total: number; hunters: number; storms: number; by: Record<Faction, { count: number; hunters: number }>;
  nearest: { enemy: Enemy; faction: Faction; distance: number } | null }

/** Everything in the system that can hurt the ship, counted by faction, with the closest one that is hunting it. */
export function census(s: State): Census {
  const by = Object.fromEntries(FACTION_ORDER.map(f => [f, { count: 0, hunters: 0 }])) as Census['by'];
  let nearest: Census['nearest'] = null;
  for (const e of s.enemies) {
    const faction = factionOf(e), row = by[faction];
    row.count++;
    if (!hunting(e)) continue;
    row.hunters++;
    const distance = Math.max(0, Math.hypot(e.x - s.player.x, e.y - s.player.y) - e.r - s.player.r);
    if (!nearest || distance < nearest.distance) nearest = { enemy: e, faction, distance };
  }
  return { total: s.enemies.length, hunters: FACTION_ORDER.reduce((n, f) => n + by[f].hunters, 0), storms: s.storms.length, by, nearest };
}
