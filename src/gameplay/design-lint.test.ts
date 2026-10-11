import { expect, test } from 'vitest';
import { budgets, lintGameplay, type Rule } from './design-lint';
test('every design rule detects regressions and invalid or missing telemetry', () => {
  for (const rule of Object.keys(budgets) as Rule[]) {
    const b = budgets[rule];
    for (const value of [b.min - .01, b.max + .01, NaN, Infinity]) {
      const errors = lintGameplay([{ rule, value, scenario: 'deliberately broken gameplay' }]);
      expect(errors).toHaveLength(1); expect(errors[0]).toContain(b.principle); expect(errors[0]).toContain('observed');
    }
    expect(lintGameplay([{ rule, value: (b.min + b.max) / 2, scenario: 'boundary control' }])).toEqual([]);
  }
  expect(lintGameplay([])).toHaveLength(1);
});
