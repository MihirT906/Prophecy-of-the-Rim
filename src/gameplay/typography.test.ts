import { expect, test } from 'vitest';
import { wrap } from '../mission-render';
import { bitmapWidth } from '../bitmap-text';
import { lintLayout, type LayoutItem } from '../ui-layout';

test('mission wrapping obeys its line box for long names, identifiers and Unicode', () => {
  const cases = [
    'Fly to the receiver and confirm your delivery',
    'W'.repeat(90),
    `CONTACT ${'PORT'.repeat(24)} NOW`,
    '🪐'.repeat(60),
    'long-name/'.repeat(18),
  ];
  for (const value of cases) for (const rows of [1, 2]) {
    const lines = wrap(value, 24, rows);
    expect(lines.length, value).toBeLessThanOrEqual(rows);
    expect(lines.join(''), value).not.toBe('');
    const items: LayoutItem[] = lines.map((line, i) => ({
      kind: 'text', name: line, x: 8, y: 8 + i * 16,
      w: bitmapWidth(line, 10), h: 10, inset: 0,
    }));
    expect(lintLayout(items, { x: 0, y: 0, w: 24 * 6 + 16, h: 48 }), value).toEqual([]);
    for (const line of lines) expect(Array.from(line).length, value).toBeLessThanOrEqual(24);
    // Surrogate pairs must remain intact when truncating or splitting labels.
    for (const line of lines) expect(Array.from(line).some(char => char.length === 1 && /[\uD800-\uDFFF]/.test(char))).toBe(false);
  }
});
