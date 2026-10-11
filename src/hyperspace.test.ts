import { beforeEach, expect, test } from 'vitest';
import { newState } from './state';
import { generateLane, installLane, laneCenter } from './hyperspace';
import { captureVoyage, finishLane, readVoyageSave, startVoyage, updateVoyage } from './voyage';
import { updatePlayer } from './player';
import { updateBullets } from './bullets';
import { nextInwardSector } from './universe';
import { spawnEnemy } from './enemies';
import { engineFor } from './engines';
import { impulse } from './flight';

beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));
function setup() {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, 'lane-test'); startVoyage(s, 'lane-test');
  const v = s.voyage!;
  installLane(s, { from: v.sectorId, to: nextInwardSector(v.universe, v.sectorId) });
  return s;
}
test('waiting never completes transit; crossing the exit alive completes exactly once', () => {
  const s = setup(), v = s.voyage!, from = v.sectorId, to = v.lane!.to;
  updateVoyage(s, 500); expect(finishLane(s)).toBe(false); expect(v.sectorId).toBe(from);
  s.screen = 'paused'; const elapsed = v.lane!.elapsed; updateVoyage(s, 3); expect(v.lane!.elapsed).toBe(elapsed);
  s.screen = 'playing'; Object.assign(s.player, v.lane!.course.exit);
  s.player.hp = 0; expect(finishLane(s)).toBe(false);
  s.player.hp = 10; expect(finishLane(s)).toBe(true); expect(v.sectorId).toBe(to); expect(v.jumps).toBe(1);
  expect(finishLane(s)).toBe(false); expect(v.jumps).toBe(1);
});
test('FTL uses the same manual fire controls and inherits ship momentum', () => {
  const s = setup(); s.enemies = [];
  updatePlayer(s, 1 / 60); expect(s.bullets).toHaveLength(0);
  const target = spawnEnemy(s, 'rusher', { x: s.player.x + 180, y: s.player.y });
  s.input.held.add('KeyZ'); s.player.iframes = 10; // Isolate trajectory from death-shard knockback near the entry boundary.
  for (let i = 0; i < 90; i++) { updatePlayer(s, 1 / 60); updateBullets(s, 1 / 60); }
  expect(s.enemies.some(e => e.id === target.id)).toBe(false); expect(s.player.kills).toBe(1);
  s.player.cooldown = 0; s.player.vx = 850; updatePlayer(s, 1 / 60);
  expect(s.bullets.at(-1)!.vx).toBeGreaterThan(s.player.vx + 500);
});
test('FTL has higher speed but slower acceleration, turning and braking response', () => {
  const s = setup(), ftl = engineFor(s); s.voyage!.lane = null; const sublight = engineFor(s);
  expect(ftl.cruiseSpeed).toBeGreaterThan(sublight.cruiseSpeed * 2);
  expect(ftl.cruiseSpeed / ftl.thrust).toBeGreaterThan(sublight.cruiseSpeed / sublight.thrust);
  expect(ftl.cruiseSpeed / ftl.brake).toBeGreaterThan(sublight.cruiseSpeed / sublight.brake);
  const body = { x: 0, y: 0, vx: ftl.cruiseSpeed, vy: 0, hp: 10, r: 12 };
  impulse(body, { x: 0, y: 1 }, false, .1, ftl);
  expect(body.vx).toBeGreaterThan(body.vy * 5);
});
test('all corridor boundaries kill even during combat invulnerability; the exit is safe', () => {
  for (const side of ['top', 'bottom', 'back', 'front']) {
    const s = setup(), course = s.voyage!.lane!.course;
    s.player.iframes = 99;
    if (side === 'back') s.player.x = -1;
    else if (side === 'front') s.player.x = course.length + 1;
    else s.player.y = laneCenter(course, s.player.x) + (side === 'top' ? -1 : 1) * (course.width / 2 + 1);
    updatePlayer(s, 1 / 60);
    expect(s.screen).toBe('dead'); expect(s.player.hp).toBe(0); expect(s.voyage!.jumps).toBe(0);
    expect(readVoyageSave(captureVoyage(s))?.status).toBe('lost');
  }
  const s = setup(); Object.assign(s.player, s.voyage!.lane!.course.exit); updatePlayer(s, 1 / 60); updateVoyage(s, 1 / 60);
  expect(s.screen).toBe('playing'); expect(s.voyage!.lane).toBeNull();
});
test('mid-course save retains world position, geometry, actors and loadout with no new fare', () => {
  const s = setup(); s.player.weapon = 'shotgun'; s.player.ammo = 7; s.input.held.add('KeyZ');
  s.voyage!.lane!.elapsed = 40; s.player.x = 12000; s.player.y = laneCenter(s.voyage!.lane!.course, 12000); updatePlayer(s, 1 / 60);
  const snapshot = captureVoyage(s)!; expect(readVoyageSave(snapshot)).not.toBeNull();
  const restored = setup(); startVoyage(restored, 'ignored', snapshot);
  expect(restored.player.x).toBe(s.player.x); expect(restored.player.y).toBe(s.player.y);
  expect(restored.voyage!.lane!.course).toEqual(s.voyage!.lane!.course);
  expect(restored.enemies).toEqual(s.enemies); expect(restored.bullets).toEqual(s.bullets);
  expect(restored.player.weapon).toBe('shotgun'); expect(restored.player.ammo).toBe(s.player.ammo);
  expect(restored.voyage!.spent).toBe(s.voyage!.spent);
  expect(readVoyageSave({ ...snapshot, lane: { ...snapshot.lane, elapsed: NaN } })).toBeNull();
});
test('courses are deterministic and provide a clear continuous center route', () => {
  const s = setup(), v = s.voyage!, c = v.lane!.course;
  expect(generateLane(v.universe, v.lane!.from, v.lane!.to)).toEqual(c);
  for (const rock of c.obstacles) expect(Math.abs(rock.y - laneCenter(c, rock.x)) - rock.radius).toBeGreaterThan(24);
});

test('old timed-lane saves restart the course without charging the toll again', () => {
  const s = setup(), v = s.voyage!, lane = v.lane!;
  v.collected = 12; v.consumed = 4; v.spent = 3;
  v.cargo = { serial: 1, origin: lane.from, destination: lane.to, remaining: 5, commodity: 'melange', illegal: true };
  const snapshot = captureVoyage(s)!;
  const oldLane = { from: lane.from, to: lane.to, elapsed: 12, duration: 28, wave: 3, nextSpawn: 13, wallCooldown: 0,
    ship: snapshot.lane!.ship, enemies: [], bullets: [] };
  const migrated = readVoyageSave({ ...snapshot, version: 4, lane: oldLane })!;
  expect(migrated.version).toBe(7); expect(migrated.lane!.elapsed).toBe(0);
  expect(migrated.position.x).toBe(240); expect(migrated.spent).toBe(3); expect(migrated.cargo!.remaining).toBe(5);
  const restored = setup(); startVoyage(restored, 'ignored', migrated);
  expect(restored.voyage!.lane).not.toBeNull(); expect(restored.voyage!.spent).toBe(3);
});
