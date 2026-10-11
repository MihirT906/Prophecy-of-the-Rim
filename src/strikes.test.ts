import { expect, test } from 'vitest';
import { bounds } from './arms';
import { updateBullets } from './bullets';
import { spawnEnemy } from './enemies';
import { newPlayer } from './player';
import { newState, type Arena, type ArsenalItem, type State } from './state';
import { launchBombingRun, launchCarryall, launchDrone, launchGunship, launchThopter, updateAircraft } from './strikes';

const STEP = 1 / 60;
/** A walled 1280x768 room with the player at (400, 400) aiming right; no voyage, so aimPoint follows p.aim. */
function mkState(): State {
  const w = 40, h = 24, tiles = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1;
  const arena: Arena = { w, h, tiles, start: { x: 400, y: 400 }, spawns: [], exit: { x: 39, y: 12 } };
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'strikes');
  s.arena = arena;
  s.player = { ...newPlayer(), x: 400, y: 400, aim: { x: 1, y: 0 } };
  s.screen = 'playing';
  return s;
}
const item = (id: ArsenalItem['id'], rarity: ArsenalItem['rarity'] = 'common'): ArsenalItem => ({ id, rarity, durability: 2 });
function tick(s: State, seconds: number, each?: () => void): void {
  for (let t = 0; t < seconds - 1e-9; t += STEP) { updateAircraft(s, STEP); updateBullets(s, STEP); each?.(); }
}

test('ornithopter pass kills a rusher ahead within two seconds, then leaves', () => {
  const s = mkState();
  const target = spawnEnemy(s, 'rusher', { x: 600, y: 400 });
  launchThopter(s, item('thopter'));
  expect(s.aircraft).toHaveLength(1);
  expect(s.aircraft[0].x).toBeLessThan(s.player.x);
  tick(s, 2);
  expect(s.enemies).not.toContain(target);
  expect(s.player.kills).toBe(1);
  tick(s, 3);
  expect(s.aircraft).toEqual([]);
});

test('bombing run drops exactly 18 fused bombs along the aim line', () => {
  const s = mkState();
  launchBombingRun(s, item('bombing', 'rare'));
  expect(s.aircraft.map(a => a.kind)).toEqual(['bomber', 'bomber', 'bomber']);
  tick(s, 2);
  expect(s.hazards).toHaveLength(18);
  for (const h of s.hazards) {
    expect(h.kind).toBe('bomb');
    expect(h.timer).toBe(0.6);
    expect(h.selfDmg).toBe(2);
    expect(h.dmg).toBe(9);  // 6 * rare power 1.5
    expect(Math.abs(h.y - 400)).toBeLessThanOrEqual(70);
  }
  const lead = s.hazards.filter(h => h.y === 400).map(h => h.x);
  expect(lead).toHaveLength(6);
  expect(lead).toEqual([...lead].sort((a, b) => a - b));
  tick(s, 2);
  expect(s.aircraft).toEqual([]);
});

test('gunship keeps close to a moving player and fires salvos of four', () => {
  const s = mkState();
  launchGunship(s, item('gunship'));
  tick(s, 0.5);
  tick(s, 3, () => {
    s.player.x += 200 * STEP;
    const g = s.aircraft[0];
    expect(Math.hypot(g.x - s.player.x, g.y - s.player.y)).toBeLessThan(160);
  });
  expect(s.bullets).toEqual([]);  // nothing to shoot at
  spawnEnemy(s, 'brute', { x: s.player.x + 300, y: 400 });
  updateAircraft(s, STEP);
  const salvo = s.bullets.filter(b => b.blast === 36);
  expect(salvo).toHaveLength(4);
  expect(salvo.every(b => b.owner === 'player' && b.dmg === 3)).toBe(true);
  tick(s, 8);
  expect(s.aircraft).toHaveLength(1);  // common ttl is 12 s
  tick(s, 1);
  expect(s.aircraft).toEqual([]);
});

test('legendary gunship outlasts a common one by nine seconds', () => {
  const s = mkState();
  launchGunship(s, item('gunship', 'legendary'));
  tick(s, 20);
  expect(s.aircraft).toHaveLength(1);
  tick(s, 1.1);
  expect(s.aircraft).toEqual([]);
});

test('scout drone roams inside the room, shoots what comes near, and expires', () => {
  const s = mkState(), b = bounds(s);
  launchDrone(s, item('drone'));
  let moved = false;
  tick(s, 24.9, () => {
    const d = s.aircraft[0];
    expect(d).toBeDefined();
    if (Math.hypot(d.vx, d.vy) > 0) moved = true;
    expect(d.x).toBeGreaterThanOrEqual(b.x0 - 1e-6); expect(d.x).toBeLessThanOrEqual(b.x1 + 1e-6);
    expect(d.y).toBeGreaterThanOrEqual(b.y0 - 1e-6); expect(d.y).toBeLessThanOrEqual(b.y1 + 1e-6);
  });
  expect(moved).toBe(true);
  tick(s, 0.2);
  expect(s.aircraft).toEqual([]);
  const t = mkState();
  launchDrone(t, item('drone'));
  const target = spawnEnemy(t, 'rusher', { x: 420, y: 400 });
  tick(t, 3);
  expect(t.enemies).not.toContain(target);
});

test('carryall lifts hostiles at the aim point without kills, then leaves the room', () => {
  for (const [rarity, lifted] of [['common', 3], ['legendary', 6]] as const) {
    const s = mkState(), at = { x: 660, y: 400 };
    for (let i = 0; i < 7; i++) spawnEnemy(s, 'rusher', { x: at.x + (i % 2 ? 20 : -20), y: at.y + i * 8 });
    const far = spawnEnemy(s, 'brute', { x: at.x + 300, y: at.y });
    launchCarryall(s, item('carryall', rarity));
    tick(s, 2.5);
    expect(s.enemies).toHaveLength(8 - lifted);
    expect(s.enemies).toContain(far);
    expect(s.aircraft[0].cargo).toBe(lifted);
    expect(s.player.kills).toBe(0);
    tick(s, 4);
    expect(s.aircraft).toEqual([]);
  }
});

test('an aircraft never outlives its ttl and a non-playing screen freezes the flight', () => {
  const s = mkState();
  launchThopter(s, item('thopter'));
  launchBombingRun(s, item('bombing'));
  launchDrone(s, item('drone'));
  const x = s.aircraft[0].x;
  s.screen = 'paused';
  updateAircraft(s, 1);
  expect(s.aircraft[0].x).toBe(x);
  s.screen = 'playing';
  tick(s, 26);
  expect(s.aircraft).toEqual([]);
});
