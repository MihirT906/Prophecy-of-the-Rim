import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { updatePlayer, damagePlayer } from '../player';
import { spawnEnemy, updateEnemies } from '../enemies';
import { updateBullets } from '../bullets';
import { updateArms } from '../arms';
import { updateFx } from '../fx';
import { newState, type State } from '../state';
import { startVoyage, updateVoyage, consumeUniverseEvents, captureVoyage, readVoyageSave } from '../voyage';
import { installLane, laneCenter } from '../hyperspace';
import { nextInwardSector } from '../universe';
import { lintGameplay, type Measurement, type Rule } from './design-lint';

beforeEach(() => vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} }));
afterEach(() => vi.unstubAllGlobals());
const seeds = ['design-rim', 'design-spice', 'design-storm', 'design-witness', 'design-patrol'];
function fresh(seed: string, isolated = false) {
  const s = newState({ held: new Set<string>(), pressed: [], typed: [] }, seed);
  startVoyage(s, seed);
  if (isolated) {
    // Explicit test range: retain real flight/weapons/collisions, remove procedural interference.
    consumeUniverseEvents(s); s.enemies = []; s.storms = [];
    Object.assign(s.player, { x: 300, y: 100, vx: 0, vy: 0 });
    s.voyage!.system.planets = []; s.voyage!.system.debris = []; s.voyage!.system.hazards = [];
  }
  return s;
}
function tick(s: State, dt = 1 / 60) {
  s.time += dt;
  for (const update of [updatePlayer, updateEnemies, updateBullets, updateArms, updateVoyage, updateFx])
    if (s.screen === 'playing') update(s, dt);
  s.input.pressed.length = 0;
}
function gate(rule: Rule, value: number, scenario: string) {
  const sample: Measurement = { rule, value, scenario };
  expect(lintGameplay([sample]), JSON.stringify(sample)).toEqual([]);
}
for (const seed of seeds) {
  test(`responsive thrust, directional fire and braking: ${seed}`, () => {
    const s = fresh(seed, true); s.input.held.add('KeyD'); s.input.held.add('ArrowDown');
    tick(s); gate('response', s.player.x > 300 && s.bullets.length > 0 && s.player.muzzle > 0 ? 1 / 60 : Infinity, seed);
    expect(s.player.aim.y).toBe(1); // Moving right must not override independent downward aim.
    s.input.held.delete('ArrowDown');
    let elapsed = 1 / 60;
    while (s.player.vx < 200 && elapsed < 2) { tick(s); elapsed += 1 / 60; }
    gate('accelerate', s.player.vx >= 200 ? elapsed : Infinity, seed);
    s.input.held.clear(); s.input.held.add('Space'); elapsed = 0;
    while (Math.hypot(s.player.vx, s.player.vy) > 1 && elapsed < 2) { tick(s); elapsed += 1 / 60; }
    gate('brake', Math.hypot(s.player.vx, s.player.vy) <= 1 ? elapsed : Infinity, seed);
  });
  test(`starter weapon resolves a live moving threat: ${seed}`, () => {
    const s = fresh(seed, true);
    const enemy = spawnEnemy(s, 'rusher', { x: s.player.x + 300, y: s.player.y });
    const initialX = enemy.x; s.input.held.add('ArrowRight'); let elapsed = 0;
    while (s.enemies.includes(enemy) && s.screen === 'playing' && elapsed < 3) { tick(s); elapsed += 1 / 60; }
    expect(enemy.x).not.toBe(initialX);
    gate('kill', s.enemies.includes(enemy) ? Infinity : elapsed, seed);
    expect(s.player.hp).toBeGreaterThan(0); expect(s.player.kills).toBeGreaterThan(0);
    expect(s.player.weapon).toBe('pistol'); expect(s.player.ammo).toBe(Infinity);
  });
  test(`unmodified opening gives orientation time: ${seed}`, () => {
    const s = fresh(seed); let elapsed = 0;
    while (s.screen === 'playing' && elapsed < 10 - 1e-8) { tick(s); elapsed += 1 / 60; }
    gate('opening', Math.min(10, elapsed), seed);
    expect(s.enemies.length).toBeGreaterThan(0); // Cannot pass by disabling encounters.
  });
}
test('sustained overlapping damage leaves a bounded recovery window', () => {
  const s = fresh(seeds[0], true); damagePlayer(s, 1, null); const hp = s.player.hp;
  let elapsed = 0;
  while (s.player.hp === hp && elapsed < 2) { tick(s); damagePlayer(s, 1, null); elapsed += 1 / 60; }
  gate('recovery', s.player.hp < hp ? elapsed : Infinity, 'continuous overlapping hits');
});
test('equal held input has comparable travel at 30, 60 and 120 Hz', () => {
  const distances = [30, 60, 120].map(hz => {
    const s = fresh(seeds[0], true); const x = s.player.x; s.input.held.add('KeyD');
    for (let i = 0; i < hz * 2; i++) tick(s, 1 / hz);
    expect(s.screen).toBe('playing'); return s.player.x - x;
  });
  gate('frameDrift', (Math.max(...distances) - Math.min(...distances)) / distances[1], 'two seconds thrust');
});

test('releasing fire stops new shots and a fresh press responds immediately after cooldown', () => {
  const s = fresh('design-release', true);
  s.input.held.add('ArrowRight'); tick(s);
  expect(s.bullets.filter(b => b.owner === 'player')).toHaveLength(3);
  s.input.held.clear();
  // A released trigger must never emit another shot, including when its cooldown expires.
  let previous = s.bullets.length;
  for (let frame = 0; frame < 90; frame++) {
    tick(s);
    expect(s.bullets.length, `released trigger at frame ${frame}`).toBeLessThanOrEqual(previous);
    previous = s.bullets.length;
  }
  expect(s.bullets).toHaveLength(0); expect(s.player.muzzle).toBe(0);
  s.input.held.add('ArrowLeft'); tick(s);
  gate('response', s.bullets.length === 3 && s.player.muzzle > 0 ? 1 / 60 : Infinity, 'fresh trigger after release');
  expect(s.bullets.every(b => b.vx < 0)).toBe(true);
});


test('FTL pilot can accelerate and brake before losing containment', () => {
  for (const seed of seeds) {
    const s = fresh(seed);
    const v = s.voyage!;
    installLane(s, { from: v.sectorId, to: nextInwardSector(v.universe, v.sectorId) });
    // Test engine agency, not incoming fire; retain the authored corridor and rocks.
    s.enemies = [];
    const startX = s.player.x;
    s.input.held.add('KeyD');
    for (let frame = 0; frame < 60; frame++) tick(s);
    expect(s.player.vx, seed).toBeGreaterThan(300);
    expect(s.player.x, seed).toBeGreaterThan(startX + 150);
    s.input.held.clear(); s.input.held.add('Space');
    let elapsed = 0;
    while (Math.hypot(s.player.vx, s.player.vy) > 1 && elapsed < 3 && s.screen === 'playing') {
      tick(s); elapsed += 1 / 60;
    }
    gate('ftlBrake', Math.hypot(s.player.vx, s.player.vy) <= 1 ? elapsed : Infinity, seed);
    expect(s.screen, seed).toBe('playing'); expect(v.lane, seed).not.toBeNull();
    const stoppedX = s.player.x;
    s.input.held.clear();
    for (let frame = 0; frame < 60; frame++) tick(s);
    expect(s.player.x, seed).toBeCloseTo(stoppedX, 4);
  }
});

test('a starter pilot can complete a live FTL crossing by steering the corridor and firing', () => {
  for (const seed of seeds) {
    const s = fresh(seed), v = s.voyage!;
    const to = nextInwardSector(v.universe, v.sectorId);
    installLane(s, { from: v.sectorId, to });
    const course = v.lane!.course;
    expect(s.enemies.length).toBeGreaterThan(0); expect(course.obstacles.length).toBeGreaterThan(0);
    const startX = s.player.x;
    const fareBefore = v.spent;
    s.input.held.add('KeyD'); s.input.held.add('ArrowRight');
    let elapsed = 0, furthest = startX;
    while (v.lane && s.screen === 'playing' && elapsed < 90) {
      // Input-only pilot: follow the visible bend with velocity-aware lookahead.
      const error = laneCenter(course, s.player.x + s.player.vx * .8) - s.player.y - s.player.vy * .8;
      s.input.held.delete('KeyW'); s.input.held.delete('KeyS');
      if (error > 15) s.input.held.add('KeyS');
      if (error < -15) s.input.held.add('KeyW');
      furthest = Math.max(furthest, s.player.x);
      tick(s); elapsed += 1 / 60;
    }
    expect(s.screen, `${seed}: ${elapsed.toFixed(2)}s, x=${furthest}, hull=${s.player.hp}`).toBe('playing');
    gate('ftlCrossing', v.lane ? Infinity : elapsed, seed);
    expect(furthest, seed).toBeGreaterThan(course.exit.x - course.engine.cruiseSpeed / 30);
    expect(v.sectorId, seed).toBe(to); expect(v.jumps, seed).toBe(1);
    expect(v.spent, 'finishing an already installed lane must not charge another fare').toBe(fareBefore);
    expect(s.player.hp, seed).toBeGreaterThan(0);
  }
});


test('saving during live FTL preserves danger, momentum and the ability to finish', () => {
  for (const seed of seeds) {
    let s = fresh(seed);
    const v = s.voyage!, to = nextInwardSector(v.universe, v.sectorId);
    installLane(s, { from: v.sectorId, to });
    const course = v.lane!.course;
    let elapsed = 0, resumed = false;
    while (s.voyage!.lane && s.screen === 'playing' && elapsed < 60) {
      s.input.held.clear(); s.input.held.add('KeyD'); s.input.held.add('ArrowRight');
      const error = laneCenter(course, s.player.x + s.player.vx * .8) - s.player.y - s.player.vy * .8;
      if (error > 15) s.input.held.add('KeyS');
      if (error < -15) s.input.held.add('KeyW');
      tick(s); elapsed += 1 / 60;
      if (!resumed && elapsed >= 5) {
        expect(s.screen, seed).toBe('playing'); expect(s.voyage!.lane, seed).not.toBeNull();
        const snapshot = readVoyageSave(JSON.parse(JSON.stringify(captureVoyage(s))))!;
        expect(snapshot, `live save must validate: ${seed}`).not.toBeNull();
        const restored = fresh(seed);
        startVoyage(restored, seed, snapshot);
        expect([restored.player.x, restored.player.y, restored.player.vx, restored.player.vy, restored.player.hp], seed)
          .toEqual([s.player.x, s.player.y, s.player.vx, s.player.vy, s.player.hp]);
        expect(restored.enemies, 'resume must not remove live threats').toEqual(s.enemies);
        expect(restored.bullets, 'resume must retain incoming and outgoing shots').toEqual(s.bullets);
        expect(restored.voyage!.spent).toBe(s.voyage!.spent);
        expect(restored.voyage!.elapsed).toBe(s.voyage!.elapsed);
        s = restored; resumed = true;
      }
    }
    expect(resumed, seed).toBe(true);
    expect(s.player.hp, seed).toBeGreaterThan(0);
    gate('ftlCrossing', s.voyage!.lane ? Infinity : elapsed, `resumed ${seed}`);
    expect(s.voyage!.sectorId, seed).toBe(to); expect(s.voyage!.jumps, seed).toBe(1);
  }
});
