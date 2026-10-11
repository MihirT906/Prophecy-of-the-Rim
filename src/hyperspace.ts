import { laneProfile } from './galaxy/catalog';
import { ENEMY_DENSITY, TILE, WEAPONS, type WeaponId, type EnemyKind } from './data';
import { spawnEnemy } from './enemies';
import { makeRng } from './rng';
import type { Bullet, Enemy, State, Vec } from './state';
import type { EngineProfile } from './engines';
import type { Universe } from './universe';

export interface CourseObstacle extends Vec { radius: number }
export interface LaneCourse {
  version: 1; length: number; width: number; height: number; bend: number;
  engine: EngineProfile; obstacles: CourseObstacle[]; exit: Vec;
  encounters: (Vec & { kind: EnemyKind })[];
}
export interface Lane { from: number; to: number; elapsed: number; course: LaneCourse }
export interface LaneSave extends Lane {
  ship: { weapon: WeaponId; ammo: number | null; cooldown: number; iframes: number; stun: number };
  enemies: Enemy[]; bullets: (Omit<Bullet, 'hit'> & { hit: number[] })[];
}
export function laneCenter(course: LaneCourse, x: number): number {
  return course.height / 2 + Math.sin(Math.max(0, Math.min(1, x / course.length)) * Math.PI * 4) * course.bend;
}
export function laneContains(course: LaneCourse, at: Vec, radius = 0): boolean {
  return at.x >= radius && at.x <= course.length - radius && Math.abs(at.y - laneCenter(course, at.x)) <= course.width / 2 - radius;
}
/** A seeded world-space course, not a moving screen or timer. The central passage remains traversable. */
export function generateLane(u: Universe, from: number, to: number): LaneCourse {
  const profile = laneProfile(u.catalog, u.sectors[from].key, u.sectors[to].key);
  const rng = makeRng(`${u.seed}:course:${u.sectors[from].key}:${u.sectors[to].key}`);
  const course: LaneCourse = { version: 1, length: profile.length, width: profile.width, height: Math.ceil((profile.width + 800) / TILE) * TILE,
    bend: 170, engine: { ...profile.engine }, obstacles: [], encounters: [], exit: { x: profile.length - 200, y: 0 } };
  course.exit.y = laneCenter(course, course.exit.x);
  for (let i = 0; i < profile.obstacleCount; i++) {
    const x = 1400 + (i + .25 + rng() * .5) / Math.max(1, profile.obstacleCount) * (course.length - 2800);
    const side = i % 2 ? -1 : 1;
    const y = laneCenter(course, x) + side * (course.width * (.19 + rng() * .16));
    course.obstacles.push({ x, y, radius: 65 + rng() * Math.min(70, course.width * .06) });
  }
  const encounterCount = profile.encounterCount * ENEMY_DENSITY;
  for (let i = 0; i < encounterCount; i++) {
    const x = 2200 + (i + 1) / (encounterCount + 1) * (course.length - 4400);
    let roll = rng() * profile.enemies.reduce((sum, e) => sum + e.weight, 0);
    const kind = profile.enemies.find(e => (roll -= e.weight) < 0)!.kind;
    course.encounters.push({ x, y: laneCenter(course, x) + (rng() - .5) * course.width * .55, kind });
  }
  return course;
}
export function installLane(s: State, route: { from: number; to: number }, saved?: LaneSave): void {
  const course = saved?.course ?? generateLane(s.voyage!.universe, route.from, route.to);
  s.voyage!.lane = { from: route.from, to: route.to, elapsed: saved?.elapsed ?? 0, course };
  const w = Math.ceil(course.length / TILE), h = Math.ceil(course.height / TILE), tiles = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const center = laneCenter(course, (x + .5) * TILE);
    for (let y = 0; y < h; y++) if (Math.abs((y + .5) * TILE - center) > course.width / 2) tiles[y * w + x] = 1;
  }
  const start = { x: 240, y: laneCenter(course, 240) };
  s.arena = { w, h, tiles, start, spawns: course.encounters, exit: course.exit };
  s.enemies = saved?.enemies.map(e => ({ ...e })) ?? [];
  s.bullets = saved?.bullets.map(b => ({ ...b, hit: new Set(b.hit) })) ?? [];
  s.nextId = Math.max(s.nextId, ...s.enemies.map(e => e.id + 1));
  if (!saved) for (const encounter of course.encounters) {
    const e=spawnEnemy(s, encounter.kind, encounter); e.vx=-course.engine.cruiseSpeed*.75; e.facing=Math.PI; e.timer=.6+(e.id%4)*.25;
  }
  s.pickups = []; s.particles = []; s.aircraft = []; s.hazards = []; s.voyage!.trail = [];
  if (saved) Object.assign(s.player, saved.ship, { ammo: saved.ship.ammo ?? Infinity });
  else Object.assign(s.player, start, { vx: 0, vy: 0, cooldown: 0, aim: { x: 1, y: 0 } });
}
export function captureLane(s: State): LaneSave | null {
  const lane = s.voyage?.lane;
  return lane ? { ...lane, ship: { weapon: s.player.weapon, ammo: Number.isFinite(s.player.ammo) ? s.player.ammo : null, cooldown: s.player.cooldown, iframes: s.player.iframes, stun: s.player.stun }, enemies: s.enemies.map(e => ({ ...e })), bullets: s.bullets.map(b => ({ ...b, hit: [...b.hit] })) } : null;
}
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v); }
function finite(v: unknown, min: number, max: number): v is number { return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max; }
/** Snapshot geometry is saved so editing the content JSON cannot move a resumed course under the ship. */
export function readLane(value: unknown): LaneSave | null {
  if (!object(value) || !['from', 'to'].every(k => finite(value[k], 0, 10000) && Number.isInteger(value[k]))
    || !finite(value.elapsed, 0, 1e9)
    || !Array.isArray(value.enemies) || value.enemies.length > 100 || !Array.isArray(value.bullets) || value.bullets.length > 500) return null;
  const c = value.course;
  if (!object(c) || c.version !== 1 || !finite(c.length, 6000, 60000) || !finite(c.width, 800, 2400)
    || !finite(c.height, c.width + 400, 4000) || !finite(c.bend, 0, 200) || !object(c.engine) || !object(c.exit)
    || !finite(c.exit.x, c.length - 400, c.length - 100) || !finite(c.exit.y, 300, c.height - 300)
    || !Array.isArray(c.obstacles) || c.obstacles.length > 150 || !Array.isArray(c.encounters) || c.encounters.length > 30) return null;
  if (!finite(c.engine.cruiseSpeed, 400, 1600) || !finite(c.engine.thrust, 300, 3000) || !finite(c.engine.brake, 300, 3000) || !finite(c.engine.drag, .05, 2)) return null;
  for (const b of c.obstacles) if (!object(b) || !finite(b.x, 0, c.length) || !finite(b.y, 0, c.height) || !finite(b.radius, 1, 250)) return null;
  for (const e of c.encounters) if (!object(e) || !finite(e.x, 0, c.length) || !finite(e.y, 0, c.height) || !['rusher', 'gunner', 'brute'].includes(String(e.kind))) return null;
  if (!object(value.ship) || !Object.keys(WEAPONS).includes(String(value.ship.weapon))
    || !(value.ship.ammo === null && value.ship.weapon === 'pistol' || finite(value.ship.ammo, 0, 1e9))
    || !['cooldown', 'iframes', 'stun'].every(k => finite((value.ship as Record<string, unknown>)[k], -10, 100))) return null;
  const body = (b: Record<string, unknown>) => ['x', 'y', 'vx', 'vy'].every(k => finite(b[k], -100000, 100000)) && finite(b.r, 1, 100) && finite(b.hp, 0, 10000);
  for (const e of value.enemies) {
    if (!object(e) || !body(e) || !['rusher', 'gunner', 'brute'].includes(String(e.kind)) || !finite(e.id, 1, 1e9)
      || !['maxHp', 'timer', 'flash', 'facing'].every(k => finite(e[k], -100, 10000))) return null;
  }
  for (const b of value.bullets) {
    if (!object(b) || !body(b) || !['player', 'enemy'].includes(String(b.owner)) || typeof b.color !== 'string'
      || !['dmg', 'pierce', 'ttl'].every(k => finite(b[k], -1, 10000)) || !Array.isArray(b.hit) || b.hit.length > 100 || !b.hit.every(id => finite(id, 0, 1e9))) return null;
  }
  return structuredClone(value) as unknown as LaneSave;
}
