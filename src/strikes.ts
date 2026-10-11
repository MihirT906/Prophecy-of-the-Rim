// Friendly aircraft bought at the armory: ornithopter pass, bombing run, gunship escort, scout drone, carryall.
// Each launch* puts an Aircraft into s.aircraft; updateAircraft flies, fires, lifts and retires them.
import { aimPoint, bounds, clampToBounds, nearestEnemy, power, spawnHazard, tier } from './arms';
import { spawnBullet } from './bullets';
import { ARMS, type ArmsId } from './data';
import { burst } from './fx';
import { nextId, type Aircraft, type AircraftKind, type ArsenalItem, type State, type Vec } from './state';

/** Runtime-only extras: a flight target and a stage counter. Aircraft are never saved, so the shape stays in this module. */
type Strike = Aircraft & { target: Vec; stage: number };
const ARMS_OF: Record<AircraftKind, ArmsId> = { thopter: 'thopter', bomber: 'bombing', gunship: 'gunship', drone: 'drone', carryall: 'carryall' };
const THOPTER = { speed: 480, behind: 420, interval: 0.3, range: 360, pairs: 8, ttl: 4.5, linger: 0.4 };
const BOMBER = { speed: 400, behind: 260, wing: 60, span: 70, interval: 0.22, bombs: 6, ttl: 3.5, fuse: 0.6, radius: 46, selfDmg: 2 };
const GUNSHIP = { orbit: 95, spin: 1.4, follow: 6, interval: 1.6, warmup: 0.6, range: 460, salvo: 4, spread: 0.12, ttl: 12, ttlPerTier: 3 };
const DRONE = { speed: 300, roam: 320, retarget: 2, arrive: 20, interval: 0.9, range: 260, ttl: 25 };
const CARRYALL = { speed: 520, behind: 300, reach: 260, hover: 0.8, grab: 90, lift: 3, depart: 3 };
const OUTSIDE = 200;  // px beyond the room before an aircraft is retired

function aimOf(s: State): Vec { return s.voyage?.lane ? { x: 1, y: 0 } : s.player.aim; }
function unit(v: Vec): Vec { const d = Math.hypot(v.x, v.y) || 1; return { x: v.x / d, y: v.y / d }; }
function behind(s: State, px: number, side = 0): Vec {
  const p = s.player, a = aimOf(s);
  return clampToBounds(s, { x: p.x - a.x * px - a.y * side, y: p.y - a.y * px + a.x * side });
}
function spawn(s: State, kind: AircraftKind, item: ArsenalItem, at: Vec, dir: Vec, speed: number, ammo: number, ttl: number, target = at): Strike {
  const a: Strike = { id: nextId(s), kind, x: at.x, y: at.y, vx: dir.x * speed, vy: dir.y * speed, r: 14, hp: 1, dir, timer: 0, ammo, ttl,
    power: power(item), rarity: item.rarity, cargo: 0, phase: 0, target: { ...target }, stage: 0 };
  s.aircraft.push(a);
  return a;
}
/** n rockets from the aircraft toward `at`, each off by up to ±spread radians (gameplay rng). */
function rockets(s: State, a: Aircraft, at: Vec, n: number, dmg: number, speed: number, blast: number, ttl: number, spread = 0, r = 3): void {
  const base = Math.atan2(at.y - a.y, at.x - a.x), color = ARMS[ARMS_OF[a.kind]].color;
  for (let i = 0; i < n; i++) {
    const angle = base + (spread ? (s.rng() * 2 - 1) * spread : 0);
    spawnBullet(s, a, { x: Math.cos(angle), y: Math.sin(angle) }, speed, dmg, 0, ttl, 'player', color, { blast, r });
  }
}
function fly(a: Aircraft, dt: number): void { a.x += a.vx * dt; a.y += a.vy * dt; }
function outside(s: State, a: Aircraft): boolean {
  const b = bounds(s);
  return a.x < b.x0 - OUTSIDE || a.x > b.x1 + OUTSIDE || a.y < b.y0 - OUTSIDE || a.y > b.y1 + OUTSIDE;
}

export function launchThopter(s: State, item: ArsenalItem): void {
  spawn(s, 'thopter', item, behind(s, THOPTER.behind), aimOf(s), THOPTER.speed, THOPTER.pairs, THOPTER.ttl);
}
export function launchBombingRun(s: State, item: ArsenalItem): void {
  const aim = aimOf(s);
  for (const [back, side] of [[0, 0], [BOMBER.wing, BOMBER.span], [BOMBER.wing, -BOMBER.span]]) {
    const b = spawn(s, 'bomber', item, behind(s, BOMBER.behind + back, side), aim, BOMBER.speed, BOMBER.bombs, BOMBER.ttl);
    b.phase = BOMBER.interval;  // time to the next drop
  }
}
export function launchGunship(s: State, item: ArsenalItem): void {
  const p = s.player, g = spawn(s, 'gunship', item, { x: p.x + GUNSHIP.orbit, y: p.y }, aimOf(s), 0, Infinity, GUNSHIP.ttl + GUNSHIP.ttlPerTier * tier(item));
  g.timer = GUNSHIP.warmup;
}
export function launchDrone(s: State, item: ArsenalItem): void {
  const p = s.player, d = spawn(s, 'drone', item, { x: p.x, y: p.y }, aimOf(s), 0, Infinity, DRONE.ttl);
  roam(s, d);
}
export function launchCarryall(s: State, item: ArsenalItem): void {
  const c = spawn(s, 'carryall', item, behind(s, CARRYALL.behind), aimOf(s), CARRYALL.speed, CARRYALL.lift + tier(item), Infinity, aimPoint(s, CARRYALL.reach));
  c.vx = c.vy = 0;
}

/** Moves every aircraft, fires, lifts, and removes the ones whose ttl ran out or that left the room. */
export function updateAircraft(s: State, dt: number): void {
  for (const a of [...s.aircraft] as Strike[]) {
    if (s.screen !== 'playing') return;
    a.ttl -= dt;
    let done = a.ttl <= 0;
    switch (a.kind) {
      case 'thopter': done = thopter(s, a, dt) || done; break;
      case 'bomber': bomber(s, a, dt); break;
      case 'gunship': gunship(s, a, dt); break;
      case 'drone': drone(s, a, dt); break;
      case 'carryall': done = carryall(s, a, dt) || done; break;
    }
    if (a.kind !== 'gunship' && outside(s, a)) done = true;
    if (done) s.aircraft.splice(s.aircraft.indexOf(a), 1);
  }
}

/** One strafing pass: rocket pairs at the nearest hostile in reach until the load is spent, then it leaves. */
function thopter(s: State, a: Strike, dt: number): boolean {
  fly(a, dt);
  a.timer -= dt;
  if (a.ammo > 0 && a.timer <= 0) {
    const target = nearestEnemy(s, a, THOPTER.range);
    if (target) { rockets(s, a, target, 2, 2 * a.power, 460, 24, 1.6, 0, 4); a.ammo--; a.timer = THOPTER.interval; }
  }
  if (a.ammo > 0) return false;
  a.phase += dt;  // time since the load ran out
  return a.phase >= THOPTER.linger;
}
/** Carpet bombs straight down along the line of flight. The bombs detonate in ordnance.ts. */
function bomber(s: State, a: Strike, dt: number): void {
  fly(a, dt);
  a.phase -= dt;
  while (a.ammo > 0 && a.phase <= 0) {
    spawnHazard(s, { kind: 'bomb', x: a.x, y: a.y, r: BOMBER.radius, timer: BOMBER.fuse, ttl: BOMBER.fuse, dmg: 6 * a.power, selfDmg: BOMBER.selfDmg, color: ARMS.bombing.color, power: a.power });
    a.ammo--; a.phase += BOMBER.interval;
  }
}
/** Orbits the player with a little lag and fires rocket salvos at the nearest hostile in reach. */
function gunship(s: State, a: Strike, dt: number): void {
  const p = s.player;
  a.phase += GUNSHIP.spin * dt;
  const want = { x: p.x + Math.cos(a.phase) * GUNSHIP.orbit, y: p.y + Math.sin(a.phase) * GUNSHIP.orbit }, k = 1 - Math.exp(-GUNSHIP.follow * dt);
  const dx = (want.x - a.x) * k, dy = (want.y - a.y) * k;
  a.x += dx; a.y += dy;
  a.vx = dx / dt; a.vy = dy / dt;
  if (Math.hypot(a.vx, a.vy) > 20) a.dir = unit({ x: a.vx, y: a.vy });
  a.timer -= dt;
  if (a.timer > 0) return;
  const target = nearestEnemy(s, a, GUNSHIP.range);
  if (!target) return;
  rockets(s, a, target, GUNSHIP.salvo, 3 * a.power, 380, 36, 1.8, GUNSHIP.spread);
  a.timer = GUNSHIP.interval;
}
function roam(s: State, a: Strike): void {
  const p = s.player, angle = s.rng() * Math.PI * 2, d = s.rng() * DRONE.roam;
  a.target = clampToBounds(s, { x: p.x + Math.cos(angle) * d, y: p.y + Math.sin(angle) * d });
  a.phase = DRONE.retarget;
}
/** Uncontrollable: wanders near the player and shoots whatever comes close. */
function drone(s: State, a: Strike, dt: number): void {
  const dx = a.target.x - a.x, dy = a.target.y - a.y, d = Math.hypot(dx, dy), step = DRONE.speed * dt;
  if (d <= step) { a.x = a.target.x; a.y = a.target.y; a.vx = a.vy = 0; }
  else { a.dir = { x: dx / d, y: dy / d }; a.vx = a.dir.x * DRONE.speed; a.vy = a.dir.y * DRONE.speed; fly(a, dt); }
  a.phase -= dt;
  if (d <= DRONE.arrive || a.phase <= 0) roam(s, a);
  a.timer -= dt;
  if (a.timer > 0) return;
  const target = nearestEnemy(s, a, DRONE.range);
  if (!target) return;
  rockets(s, a, target, 2, a.power, 420, 20, 1.4);
  a.timer = DRONE.interval;
}
/** Flies to the aim point, hovers, lifts the nearest hostiles off the field, then departs along the aim. */
function carryall(s: State, a: Strike, dt: number): boolean {
  if (a.stage === 0) {
    const dx = a.target.x - a.x, dy = a.target.y - a.y, d = Math.hypot(dx, dy), step = CARRYALL.speed * dt;
    if (d <= step) { a.x = a.target.x; a.y = a.target.y; a.vx = a.vy = 0; a.stage = 1; a.phase = CARRYALL.hover; }
    else { a.dir = { x: dx / d, y: dy / d }; a.vx = a.dir.x * CARRYALL.speed; a.vy = a.dir.y * CARRYALL.speed; fly(a, dt); }
    return false;
  }
  if (a.stage === 1) {
    a.phase -= dt;
    if (a.phase > 0) return false;
    const lifted = s.enemies.map(e => ({ e, d: Math.hypot(e.x - a.x, e.y - a.y) })).filter(c => c.d <= CARRYALL.grab)
      .sort((p, q) => p.d - q.d).slice(0, a.ammo).map(c => c.e);
    for (const e of lifted) { s.enemies.splice(s.enemies.indexOf(e), 1); burst(s, e, ARMS.carryall.color, 10); }
    a.cargo += lifted.length;
    a.stage = 2; a.phase = CARRYALL.depart;
    a.dir = aimOf(s); a.vx = a.dir.x * CARRYALL.speed; a.vy = a.dir.y * CARRYALL.speed;
    return false;
  }
  fly(a, dt);
  a.phase -= dt;
  return a.phase <= 0;
}
