import { expect, test } from 'vitest';
import { PALETTE } from './data';
import { blood, burst, shake, splat, updateFx } from './fx';
import { newState, type State } from './state';

const state = () => newState({ held: new Set(), pressed: [], typed: [] }, 'fx');
const run = (s: State, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) updateFx(s, 1 / 60); };

test('blood settles into still decals, burst fades away', () => {
  const s = state();
  blood(s, { x: 100, y: 100 }, { x: 1, y: 0 }, 5);
  burst(s, { x: 100, y: 100 }, '#fff', 4);
  expect(s.particles.length).toBe(9);
  expect(s.particles.every(p => !p.decal)).toBe(true);
  run(s, 2);
  expect(s.particles.length).toBe(5);
  for (const p of s.particles) {
    expect(p).toMatchObject({ decal: true, vx: 0, vy: 0, ttl: Infinity, color: PALETTE.blood });
    expect(p.size >= 2 && p.size <= 4).toBe(true);
  }
});

test('splat pushes one decal with a variant 0..3', () => {
  const s = state();
  splat(s, { x: 0, y: 0 }, { x: 1, y: 0 });
  expect(s.particles).toHaveLength(1);
  expect(s.particles[0].decal && [0, 1, 2, 3].includes(s.particles[0].splat!)).toBe(true);
});

test('shake uses a small non-additive peak and decays', () => {
  const s = state();
  shake(s, 10);
  shake(s, 10);
  expect(s.shake).toBe(2.5);
  updateFx(s, 1 / 60);
  expect(s.shake).toBeCloseTo(2.5 * Math.exp(-22 / 60));
});

test('particles capped at 2000 by dropping the oldest decals', () => {
  const s = state();
  for (let i = 0; i < 2100; i++) s.particles.push({ x: i, y: 0, vx: 0, vy: 0, ttl: Infinity, maxTtl: 1, size: 2, color: PALETTE.blood, decal: true });
  updateFx(s, 1 / 60);
  expect(s.particles.length).toBe(2000);
  expect(s.particles[0].x).toBe(100);
});

test('reduce motion suppresses screen shake and is remembered', async () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  const { reducedMotion, setReducedMotion } = await import('./accessibility');
  const s = state();
  setReducedMotion(true);
  shake(s, 5);
  expect([s.shake, reducedMotion()]).toEqual([0, true]);
  expect(JSON.parse(store.get('arena.accessibility.v1')!)).toMatchObject({ reduceMotion: true });
  setReducedMotion(false);
  shake(s, 5);
  expect(s.shake).toBe(1.25);
});
