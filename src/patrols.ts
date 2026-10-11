import { spawnBullet } from './bullets';
import { ENEMIES, ENEMY_BULLET_TTL, ENEMY_DENSITY, PATROL } from './data';
import { spawnEnemy } from './enemies';
import { makeRng } from './rng';
import type { Enemy, State, Vec } from './state';
import { sheltered } from './storms';
import { START_SECTOR, type EncounterSite } from './universe';
import { announce, type Voyage } from './voyage';

/** The system's patrol-role sites. The starting sector always has one, so the first spice run meets the Guild:
 * when its roll produced none, a pair flies the lane between the freighter and the exchange, clear of the launch point. */
export function patrolSites(v: Voyage): EncounterSite[] {
  const sites = v.system.encounters.filter(site => site.role === 'patrol');
  if (sites.length || v.sectorId !== START_SECTOR) return sites;
  const { cache, dock } = v.system;
  return [{ archetype: 'smuggler-patrol', role: 'patrol', count: 2 * ENEMY_DENSITY, seed: `${v.universe.seed}:${v.sectorId}:encounter:start-patrol`,
    triggerRadius: 900, x: (cache.x + dock.x) / 2, y: (cache.y + dock.y) / 2 }];
}

/** One squad per site, flying a loop from the site past the two stops (stations, gate arrivals) its seed favours. */
export function spawnPatrol(s: State, site: EncounterSite): Enemy[] {
  const system = s.voyage!.system, rng = makeRng(site.seed);
  const stops = [...system.stations, ...system.gates.map(g => g.arrival)]
    .map(p => ({ x: p.x, y: p.y, d: Math.hypot(p.x - site.x, p.y - site.y) + rng() * 600 }))
    .sort((a, b) => a.d - b.d).slice(0, 2);
  const loop = [site, ...stops];
  return Array.from({ length: site.count }, (_, i) => {
    // Wingmen trail the leader on alternating sides and keep that offset along the whole loop.
    const off = { x: -46 * i, y: (i % 2 ? 40 : -40) * Math.ceil(i / 2) };
    const e = spawnEnemy(s, 'patrol', { x: site.x + off.x, y: site.y + off.y });
    const route = loop.map(p => ({ x: p.x + off.x, y: p.y + off.y }));
    e.facing = Math.atan2(route[1 % route.length].y - e.y, route[1 % route.length].x - e.x);
    e.patrol = { mode: 'route', route, leg: 1 % route.length, scan: 0, cleared: 0, lost: 0, hostile: false, squad: site.seed };
    return e;
  });
}

/** The scan cone: within range and within arc of the patrol's heading. */
export function inScanCone(e: Enemy, at: Vec): boolean {
  const dx = at.x - e.x, dy = at.y - e.y;
  if (Math.hypot(dx, dy) > PATROL.scanRange) return false;
  const off = Math.atan2(dy, dx) - e.facing;
  return Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) <= PATROL.scanArc;
}

/** Send a patrol's squad, and any other patrol close enough to notice, after the player. */
export function alertSquad(s: State, e: Enemy, hostile = false): void {
  const squad = e.patrol!.squad, fresh = e.patrol!.mode !== 'pursue';
  for (const o of s.enemies) {
    const b = o.patrol;
    if (!b || (b.squad !== squad && Math.hypot(o.x - e.x, o.y - e.y) > PATROL.squadRange)) continue;
    if (b.mode !== 'pursue') o.timer = 0.4 + (o.id % 3) * 0.2;  // staggered first shots
    Object.assign(b, { mode: 'pursue', scan: 1, lost: 0, hostile: b.hostile || hostile });
  }
  if (fresh && s.voyage) announce(s.voyage, hostile ? 'GUILD PATROL: hostile vessel. Weapons free.' : 'GUILD PATROL: contraband detected. Outrun them or empty the hold.');
}

/** Per-tick brain for one patrol ship: the direction to steer, scaled by the fraction of top speed to fly at. */
export function steerPatrol(s: State, e: Enemy, dt: number): Vec {
  const b = e.patrol!, p = s.player, v = s.voyage, d = ENEMIES.patrol;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, to = { x: dx / dist, y: dy / dist };
  const cargo = (v?.cargo?.remaining ?? 0) + (v?.personalSpice ?? 0);
  if (b.mode === 'pursue') {
    b.lost = dist > PATROL.loseRange || sheltered(s) ? b.lost + dt : 0;  // a storm breaks the trail as surely as distance
    if (b.lost >= PATROL.loseSeconds || (!cargo && !b.hostile)) {
      // Back to the nearest waypoint, blind for a while so the same ship cannot rescan at once.
      const near = (q: Vec) => Math.hypot(q.x - e.x, q.y - e.y);
      Object.assign(b, { mode: 'route', scan: 0, lost: 0, hostile: false, cleared: PATROL.clearedSeconds,
        leg: b.route.indexOf([...b.route].sort((m, n) => near(m) - near(n))[0]) });
      if (v && !s.enemies.some(o => o.patrol?.mode === 'pursue')) announce(v, cargo ? 'Patrol lost your trail.' : 'Hold empty. Patrol stands down.');
      return { x: 0, y: 0 };
    }
    e.timer -= dt;
    if (e.timer <= 0 && dist <= d.range!) {
      e.timer = d.fireInterval!;
      spawnBullet(s, e, to, d.bulletSpeed!, d.dmg, 0, ENEMY_BULLET_TTL, 'enemy', d.color);
    }
    // Each pursuer takes its own bearing on a ring around the player, so a squad surrounds instead of stacking up.
    const a = e.id * 2.4, gx = p.x + Math.cos(a) * PATROL.standoff - e.x, gy = p.y + Math.sin(a) * PATROL.standoff - e.y, gd = Math.hypot(gx, gy) || 1;
    return gd > 30 ? { x: gx / gd, y: gy / gd } : { x: 0, y: 0 };
  }
  b.cleared = Math.max(0, b.cleared - dt);
  const seen = !b.cleared && inScanCone(e, p) && !sheltered(s);
  b.scan = Math.max(0, Math.min(1, b.scan + (seen ? dt : -dt) / PATROL.scanSeconds));
  if (b.scan >= 1) {
    if (cargo) { alertSquad(s, e); return to; }
    b.scan = 0;
    b.cleared = PATROL.clearedSeconds;
    if (v) announce(v, 'Guild scan complete. Manifest clean.');
  }
  const at = b.route[b.leg], tx = at.x - e.x, ty = at.y - e.y, td = Math.hypot(tx, ty) || 1;
  if (td < 60) b.leg = (b.leg + 1) % b.route.length;
  const k = PATROL.cruise * (b.scan > 0 ? 0.5 : 1);  // slows to hold a contact in the cone
  return { x: tx / td * k, y: ty / td * k };
}
