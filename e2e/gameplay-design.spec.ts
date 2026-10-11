import { expect, test } from '@playwright/test';
import type { State } from '../src/state';
import { lintGameplay, type Measurement } from '../src/gameplay/design-lint';

test('keyboard response, sustained control and safe planning meet design budgets', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  await press('Enter'); await press('Enter'); await page.keyboard.type('DesignPilot'); await press('Enter');
  await page.clock.runFor(800);
  // Set up a clear flight range once. All subsequent movement uses keyboard input.
  await page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, { x: 300, y: 100, vx: 0, vy: 0 });
    s.enemies = []; s.bullets = [];
  });
  const read = () => page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    return { screen: s.screen, x: s.player.x, y: s.player.y, speed: Math.hypot(s.player.vx, s.player.vy),
      shots: s.bullets.filter(b => !b.debris && b.owner === 'player').length,
      muzzle: s.player.muzzle, aim: s.player.aim, elapsed: s.voyage!.elapsed, hp: s.player.hp };
  });
  const samples: Measurement[] = [];
  const before = await read(); expect(before.screen).toBe('playing');
  await page.keyboard.down('d'); await page.keyboard.down('ArrowDown'); await page.clock.runFor(32);
  const response = await read();
  expect(response.x).toBeGreaterThan(before.x); expect(response.shots).toBeGreaterThan(0);
  expect(response.muzzle).toBeGreaterThan(0); expect(response.aim.y).toBe(1);
  samples.push({ rule: 'response', value: .032, scenario: 'browser: motion, shot and muzzle feedback visible by 32ms' });
  await page.keyboard.up('ArrowDown'); await page.clock.runFor(218);
  const moving = await read(); expect(moving.speed).toBeGreaterThan(200);
  samples.push({ rule: 'accelerate', value: .25, scenario: 'browser: reach 200 units/s with held D' });
  await page.keyboard.up('d'); await page.keyboard.down('Space'); await page.clock.runFor(300);
  const stopped = await read();
  samples.push({ rule: 'brake', value: stopped.speed <= 1 ? .3 : Infinity, scenario: 'browser: brake after thrust' });
  await page.keyboard.up('Space');
  await press('m'); const paused = await read(); expect(paused.screen).toBe('map');
  await page.clock.runFor(3000); const later = await read();
  expect(later.elapsed).toBe(paused.elapsed); expect(later.hp).toBe(paused.hp);
  expect(later.x).toBe(paused.x); expect(later.y).toBe(paused.y);
  await press('Escape'); expect((await read()).screen).toBe('playing');
  await page.keyboard.down('d'); await page.clock.runFor(100); await page.keyboard.up('d');
  expect((await read()).x).toBeGreaterThan(later.x);
  await info.attach('gameplay-measurements', { body: JSON.stringify({ samples, response, moving, stopped }, null, 2), contentType: 'application/json' });
  expect(lintGameplay(samples)).toEqual([]); expect(errors).toEqual([]);
});
