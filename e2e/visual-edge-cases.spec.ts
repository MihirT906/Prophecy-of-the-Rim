import { expect, test } from '@playwright/test';
import type { State } from '../src/state';
import type { LayoutIssue, LayoutItem } from '../src/ui-layout';

test('flight HUD remains coherent with critical hull, guide and large balances', async ({ page }, info) => {
  await page.addInitScript(() => { (window as any).__lintUI = true; });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  await press('Enter'); await press('Enter'); await page.keyboard.type('WWWWWWWWWWWWWWWW'); await press('Enter');
  await page.clock.runFor(800);
  for (const balance of [0, 99, 9999, 999999999]) {
    await page.evaluate(balance => {
      const s = (window as unknown as { __state: State }).__state;
      s.guide = true; s.player.hp = 1;
      s.voyage!.personalSpice = balance; s.voyage!.credits = balance; s.voyage!.reputation = 100;
      s.voyage!.elapsed = 360000; s.enemies = []; s.bullets = [];
    }, balance);
    await page.clock.runFor(32);
    const report = await page.evaluate(() => (window as any).__uiLayout()) as { items: LayoutItem[]; issues: LayoutIssue[] };
    expect(report.items.some(i => i.name.includes('HULL'))).toBe(true);
    await info.attach(`balance-${balance}`, { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    await page.screenshot({ path: info.outputPath(`balance-${balance}.png`) });
    expect.soft(report.issues, `balance ${balance}`).toEqual([]);
  }
});
