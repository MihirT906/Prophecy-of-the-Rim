/** Design budgets are product choices, not universal laws or a score for fun. */
export const budgets = {
  response: { min: 0, max: 1 / 30, unit: 's', principle: 'Immediate response', remedy: 'Inspect input handling, cooldown initialization and the first simulation tick.' },
  accelerate: { min: .05, max: .5, unit: 's', principle: 'Player agency', remedy: 'Inspect thrust and drag; the pilot should quickly reach useful sublight speed.' },
  brake: { min: 0, max: .5, unit: 's', principle: 'Recoverable movement', remedy: 'Inspect braking force; stopping should remain a deliberate available action.' },
  ftlBrake: { min: 0, max: 1.5, unit: 's', principle: 'Recoverable FTL movement', remedy: 'Inspect FTL braking and corridor geometry; a one-second acceleration must permit a controlled stop.' },
  ftlCrossing: { min: 5, max: 60, unit: 's', principle: 'Achievable progression', remedy: 'Inspect lane length, obstacles, traffic and starter survivability; a pilot steering the center corridor and firing should clear the sampled first inward lanes.' },
  kill: { min: .05, max: 2, unit: 's', principle: 'Combat pacing', remedy: 'Inspect starter weapon damage, travel speed, targeting and enemy health.' },
  opening: { min: 3, max: 10, unit: 's survived (capped)', principle: 'Fair onboarding', remedy: 'Inspect arrival placement and threat timing; allow time to orient before unavoidable death.' },
  recovery: { min: .25, max: 1.5, unit: 's', principle: 'Damage recovery', remedy: 'Inspect invulnerability duration; avoid instant stacked damage or prolonged immunity.' },
  frameDrift: { min: 0, max: .08, unit: 'relative distance difference', principle: 'Consistent controls', remedy: 'Inspect time-based integration; equal input duration should produce similar travel.' },
} as const;
export type Rule = keyof typeof budgets;
export interface Measurement { rule: Rule; value: number; scenario: string }
export function lintGameplay(samples: Measurement[]): string[] {
  if (!samples.length) return ['No gameplay measurements: the design gate did not exercise gameplay.'];
  return samples.flatMap(({ rule, value, scenario }) => {
    const b = budgets[rule];
    return Number.isFinite(value) && value >= b.min && value <= b.max ? [] :
      [`[${rule}] ${b.principle}: ${scenario}: observed ${value} ${b.unit}; expected ${b.min}..${b.max}. ${b.remedy}`];
  });
}
