import { expect, test } from '@playwright/test';
import type { State } from '../src/state';

test('a false planet reveals its eye, warns, and fires a tidal volley', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.clock.install();
  await page.goto('/');
  for (let i = 0; i < 2; i++) { await page.keyboard.press('Enter'); await page.clock.runFor(50); }
  await page.keyboard.type('Worldwatcher'); await page.keyboard.press('Enter'); await page.clock.runFor(800);
  await page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state, v = s.voyage!, p = v.system.planets[0];
    p.kind = 'ocean'; p.radius = 170;
    const angle = p.phase + v.elapsed / p.period * Math.PI * 2;
    Object.assign(s.player, { x: v.system.star.x + Math.cos(angle) * p.orbit + 390, y: v.system.star.y + Math.sin(angle) * p.orbit, vx: 0, vy: 0 });
    s.enemies = []; s.player.hp = 100; s.player.maxHp = 100;
  });
  await page.clock.runFor(4100);
  expect(await page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    return s.voyage!.worlds[`${s.voyage!.sectorId}:0`]?.awake;
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('sentient-ocean.png') });
  await page.clock.runFor(1100);
  expect(await page.evaluate(() => (window as unknown as { __state: State }).__state.bullets.some(b => b.color === '#65e1d5'))).toBe(true);
  expect(errors).toEqual([]);
});
