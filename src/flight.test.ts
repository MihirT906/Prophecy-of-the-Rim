import { expect, test } from 'vitest';
import { gravityAt, impulse, updateFlight } from './flight';
import { newPlayer } from './player';
import { newState } from './state';
import { SECTOR_CONFIG, validateSectorConfig } from './sector-config';
import { celestialPosition, debrisPosition, generateSystem, generateUniverse } from './universe';
import { startVoyage } from './voyage';

test('JSON tuning rejects missing, unknown, fractional and unsafe values', () => {
  expect(validateSectorConfig(SECTOR_CONFIG)).toEqual(SECTOR_CONFIG);
  for (const v of [null, {}, { ...SECTOR_CONFIG, width: 2 }, { ...SECTOR_CONFIG, planetCount: 2.2 }, { ...SECTOR_CONFIG, thrust: Infinity }, { ...SECTOR_CONFIG, typo: 1 }]) expect(() => validateSectorConfig(v)).toThrow();
});
test('shooter steering accelerates quickly, coasts with light drag, and brakes without reversal', () => {
  const p = newPlayer();
  for (let i = 0; i < 12; i++) impulse(p, { x: 1, y: 0 }, false, 1 / 60);
  expect(p.vx).toBeGreaterThan(250);
  const speed = p.vx;
  for (let i = 0; i < 30; i++) impulse(p, { x: 0, y: 0 }, false, 1 / 60);
  expect(p.vx).toBeLessThan(speed * .6); expect(p.vx).toBeGreaterThan(speed * .4);
  for (let i = 0; i < 12; i++) impulse(p, { x: 0, y: 0 }, true, 1 / 60);
  expect(p.vx).toBe(0);
});
test('compact systems cross in seconds and gravity is bounded and attracts toward bodies', () => {
  const p = newPlayer(); let seconds = 0;
  while (p.x < SECTOR_CONFIG.width * 32 - 300) { impulse(p, { x: 1, y: 0 }, false, 1 / 60); seconds += 1 / 60; }
  expect(seconds).toBeGreaterThan(12); expect(seconds).toBeLessThan(20);
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'gravity'); startVoyage(s, 'gravity');
  const star = s.voyage!.system.star;
  const g = gravityAt(s, { x: star.x + star.radius * 2, y: star.y });
  expect(g.x).toBeLessThan(0); expect(Math.hypot(g.x, g.y)).toBeLessThan(250);
  expect(gravityAt(s, { x: -10000, y: -10000 })).toEqual({ x: 0, y: 0 });
  expect(Number.isFinite(gravityAt(s, star).x)).toBe(true);
});
test('dynamic bodies are reproducible over time and trail history stays bounded', () => {
  const system = generateSystem(generateUniverse('orbit'), 25);
  expect(celestialPosition(system, system.planets[0], 0)).not.toEqual(celestialPosition(system, system.planets[0], 100));
  expect(debrisPosition(system.debris[0], 0)).not.toEqual(debrisPosition(system.debris[0], 100));
  const s = newState({ held: new Set(['KeyD']), pressed: [], typed: [] }, 'trail'); startVoyage(s, 'trail');
  for (let i = 0; i < 1200; i++) { s.voyage!.elapsed += 1 / 60; updateFlight(s, 1 / 60); }
  expect(s.voyage!.trail.length).toBeGreaterThan(10); expect(s.voyage!.trail.length).toBeLessThanOrEqual(110);
  expect(s.voyage!.trail[0].time).toBeGreaterThan(11);
});
