import { expect, test } from 'vitest';
import { makeRng } from './rng';

const draws = (seed: string, n: number) => { const r = makeRng(seed); return Array.from({ length: n }, r); };

test('same seed, same draws; different seeds differ', () => {
  expect(draws('abc', 5)).toEqual(draws('abc', 5));
  expect(draws('abc', 5)).not.toEqual(draws('abd', 5));
});

test('1000 draws in [0,1)', () => {
  for (const x of draws('range', 1000)) expect(x >= 0 && x < 1).toBe(true);
});
