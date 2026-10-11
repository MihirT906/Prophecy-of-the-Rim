/** 4x4 sheet: four closed-mouth idle frames followed by twelve phonemes. */
export function portraitFrame(elapsed: number, speaking: boolean, level: number): number {
  const t = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const amplitude = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  if (speaking && amplitude > .06) return 4 + (Math.floor(t * 10) + Math.floor(amplitude * 3)) % 12;
  const blink = t % 4.8;
  if (blink > 4.58 && blink < 4.7) return 2;
  if (blink >= 4.7) return 3;
  return Math.floor(t * .8) % 2;
}
