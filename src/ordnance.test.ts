import { beforeEach, expect, test } from 'vitest';
import { updateArms } from './arms';
import { updateBullets } from './bullets';
import { spawnEnemy, updateEnemies } from './enemies';
import { installLane, laneCenter } from './hyperspace';
import { dropMine, launchDeathHand, launchHawkStrike, launchSeeker, updateHazards } from './ordnance';
import { newPlayer } from './player';
import { newState, type ArsenalItem, type State } from './state';
import { nextInwardSector } from './universe';
import { startVoyage } from './voyage';

const STEP = 1 / 60;
const common: ArsenalItem = { id: 'seeker', rarity: 'common', durability: 2 };
const legendary: ArsenalItem = { id: 'seeker', rarity: 'legendary', durability: 6 };

beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));

/** An open 40x24 room with no walls, the player at (400, 384) aiming right. */
function mkState(): State {
  const w = 40, h = 24;
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'ordnance');
  s.arena = { w, h, tiles: new Uint8Array(w * h), start: { x: 400, y: 384 }, spawns: [], exit: { x: 0, y: 0 } };
  s.player = { ...newPlayer(), x: 400, y: 384, aim: { x: 1, y: 0 } };
  s.screen = 'playing';
  return s;
}
/** Ordnance plus bullets, like the playing tick without enemies and the voyage; the player only counts its i-frames down. */
function tick(s: State, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    s.player.iframes = Math.max(0, s.player.iframes - STEP);
    updateBullets(s, STEP); updateHazards(s, STEP);
  }
}

test('a hunter-seeker turns toward an off-axis rusher and kills it', () => {
  const s = mkState();
  const target = spawnEnemy(s, 'rusher', { x: 560, y: 504 });
  launchSeeker(s, common);
  expect(s.bullets).toHaveLength(1);
  expect(s.bullets[0]).toMatchObject({ homing: 5, dmg: 8, vx: 240, vy: 0 });
  tick(s, 3);
  expect(s.enemies).not.toContain(target);
  expect(s.player.kills).toBe(1);
  expect(s.bullets).toHaveLength(0);
  launchSeeker(s, legendary);
  expect(s.bullets[0].dmg).toBe(16);
});

test('a mine waits for a hostile inside its trigger radius, then bursts into homing missiles that kill it', () => {
  const s = mkState();
  dropMine(s, common);
  expect(s.hazards).toHaveLength(1);
  expect(s.hazards[0]).toMatchObject({ kind: 'mine', x: 370, y: 384, r: 90, dmg: 2 });
  spawnEnemy(s, 'gunner', { x: 200, y: 384 });  // 170 px away: outside the trigger
  tick(s, 1);
  expect(s.hazards).toHaveLength(1);
  expect(s.bullets).toHaveLength(0);
  const gunner = spawnEnemy(s, 'gunner', { x: 300, y: 384 });
  updateHazards(s, STEP);
  expect(s.hazards).toHaveLength(0);
  expect(s.bullets).toHaveLength(6);
  expect(s.bullets.every(b => b.homing === 6 && b.blast === 20 && b.dmg === 2)).toBe(true);
  tick(s, 1.5);
  expect(s.enemies).not.toContain(gunner);
  const l = mkState();
  dropMine(l, legendary);
  spawnEnemy(l, 'rusher', { x: 340, y: 384 });
  updateHazards(l, STEP);
  expect(l.bullets).toHaveLength(12);
  expect(l.bullets[0].dmg).toBe(4);
  const stale = mkState();
  dropMine(stale, common);
  tick(stale, 20.1);
  expect(stale.hazards).toHaveLength(0);
});

test('Death Hand: siren, scattered warheads, then a radiation pool', () => {
  const s = mkState();
  s.rng = () => 0;  // every warhead lands on the marker
  launchDeathHand(s, common);
  expect(s.hazards).toHaveLength(1);
  const marker = s.hazards[0];
  expect(marker).toMatchObject({ kind: 'marker', x: 660, y: 384, r: 110, timer: 2.5, dmg: 10, selfDmg: 3 });
  const rusher = spawnEnemy(s, 'rusher', { x: 660, y: 384 });
  const spectator = spawnEnemy(s, 'rusher', { x: 660, y: 384 + 200 });
  Object.assign(s.player, { x: 660, y: 384 });
  tick(s, 2.4);
  expect(s.hazards).toEqual([marker]);  // the siren is still sounding
  expect(s.enemies).toContain(rusher);
  tick(s, 0.2);
  expect(s.hazards.filter(h => h.kind === 'warhead')).toHaveLength(5);
  expect(s.hazards.filter(h => h.kind === 'pool')).toHaveLength(1);
  expect(s.hazards.filter(h => h.kind === 'marker')).toHaveLength(0);
  const brute = spawnEnemy(s, 'brute', { x: 660 + 90, y: 384 });  // beyond the warheads' 60 + 15 px, inside the pool's 110
  tick(s, 1.2);  // every staggered fuse has burnt down
  expect(s.hazards.filter(h => h.kind === 'warhead')).toHaveLength(0);
  expect(s.enemies).not.toContain(rusher);
  expect(s.enemies).toContain(spectator);
  expect(s.player.hp).toBe(10 - 3 - 1);  // one warhead through the i-frames, then the pool's first tick
  Object.assign(s.player, { x: 100, y: 100 });  // step out of the pool
  tick(s, 5.2);  // the pool's six seconds are up
  expect(s.hazards).toHaveLength(0);
  expect(brute.hp).toBeGreaterThanOrEqual(15 - 12.5);
  expect(brute.hp).toBeLessThanOrEqual(15 - 11);
  const l = mkState();
  launchDeathHand(l, legendary);
  expect(l.hazards[0].dmg).toBe(20);
  tick(l, 2.6);
  expect(l.hazards.filter(h => h.kind === 'warhead')).toHaveLength(8);
  expect(l.hazards.find(h => h.kind === 'pool')?.dmg).toBe(4);
});

test('the radiation pool hits the player once per i-frame window', () => {
  const s = mkState();
  s.rng = () => 0;
  launchDeathHand(s, common);
  tick(s, 3.8);  // marker gone, warheads spent, pool alive
  expect(s.hazards.map(h => h.kind)).toEqual(['pool']);
  Object.assign(s.player, { x: 660, y: 384, hp: 10, iframes: 0 });
  tick(s, 1.2);  // ticks at 0.25 and 1.0; 0.5 and 0.75 fall inside the 0.6 s i-frames
  expect(s.player.hp).toBe(8);
});

test('Hawk Strike makes every hostile flee and hold fire; fear counts down', () => {
  const s = mkState();
  const rusher = spawnEnemy(s, 'rusher', { x: 500, y: 384 });
  const gunner = spawnEnemy(s, 'gunner', { x: 600, y: 384 });
  gunner.timer = 0;
  launchHawkStrike(s, common);
  expect(rusher.fear).toBe(3);
  expect(gunner.fear).toBe(3);
  expect(s.hazards[0]).toMatchObject({ kind: 'marker', x: 400, y: 384, r: 140, dmg: 0 });
  const before = Math.hypot(rusher.x - s.player.x, rusher.y - s.player.y);
  for (let i = 0; i < 30; i++) updateEnemies(s, STEP);
  expect(Math.hypot(rusher.x - s.player.x, rusher.y - s.player.y)).toBeGreaterThan(before + 40);
  expect(s.bullets).toHaveLength(0);
  gunner.fear = 0; gunner.timer = 0;
  updateEnemies(s, STEP);
  expect(s.bullets).toHaveLength(1);
  launchHawkStrike(s, legendary);
  expect(rusher.fear).toBe(6);
  for (let i = 0; i < 400; i++) updateArms(s, STEP);
  expect(rusher.fear).toBe(0);
  expect(s.hazards).toHaveLength(0);
});

test('on an FTL course, afraid interceptors flee the ship and hold their fire', () => {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, 'lane-fear');
  startVoyage(s, 'lane-fear');
  const v = s.voyage!;
  installLane(s, { from: v.sectorId, to: nextInwardSector(v.universe, v.sectorId) });
  s.enemies = [];
  const course = v.lane!.course, x = 3000, y = laneCenter(course, x);
  Object.assign(s.player, { x, y, vx: 0, vy: 0 });
  const e = spawnEnemy(s, 'gunner', { x: x + 150, y });
  e.timer = 0;
  launchHawkStrike(s, common);
  for (let i = 0; i < 60; i++) { updateEnemies(s, STEP); updateArms(s, STEP); }
  expect(e.x).toBeGreaterThan(x + 150);
  expect(s.bullets).toHaveLength(0);
});

test('a bomb detonates after its fuse, killing hostiles inside and bruising the player', () => {
  const s = mkState();
  s.hazards.push({ id: 99, kind: 'bomb', x: 500, y: 384, r: 46, timer: 0.6, ttl: 0.6, dmg: 6, selfDmg: 2, color: '#fff', power: 1 });
  const inside = spawnEnemy(s, 'rusher', { x: 510, y: 384 });
  const outside = spawnEnemy(s, 'rusher', { x: 600, y: 384 });
  Object.assign(s.player, { x: 500, y: 384 });
  tick(s, 0.5);
  expect(s.hazards).toHaveLength(1);
  expect(s.player.hp).toBe(10);
  tick(s, 0.15);
  expect(s.hazards).toHaveLength(0);
  expect(s.enemies).toEqual([outside]);
  expect(s.enemies).not.toContain(inside);
  expect(s.player.hp).toBe(8);
});
