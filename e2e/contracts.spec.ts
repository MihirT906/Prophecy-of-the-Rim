import { expect, test } from '@playwright/test';
import type { State } from '../src/state';

test('contract terms, theft confirmation, reputation and reduced offers survive reload', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  const read = () => page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; return { c: s.comms, v: s.voyage, screen: s.screen }; });
  await press('Enter'); await press('Enter'); await page.keyboard.type('Courier'); await press('Enter'); await page.clock.runFor(800);
  const stipend = (await read()).v!.personalSpice;
  await page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; Object.assign(s.player, s.voyage!.system.cache, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; });
  await press('e'); await press('Space');
  expect((await read()).c!.details.join(' ')).toContain('YOUR CUT: 4 SPICE NOW');
  await page.screenshot({ path: info.outputPath('contract-offer.png') });
  await press('Enter'); await press('Enter');
  expect((await read()).v!.personalSpice).toBe(stipend + 4);
  await press('e'); await press('x'); expect((await read()).v!.reputation).toBe(60);
  await page.screenshot({ path: info.outputPath('theft-confirmation.png') });
  await press('x'); expect((await read()).v!.reputation).toBe(35); expect((await read()).v!.personalSpice).toBe(stipend + 12);
  await press('Enter');
  await page.reload(); await page.clock.runFor(100); await press('Enter'); await press('Enter'); await page.clock.runFor(800);
  expect((await read()).v!.reputation).toBe(35); expect((await read()).v!.thefts).toBe(1);
  // Restock is active-flight time only; wait without exposing this UI test to combat.
  await page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; s.voyage!.elapsed = s.voyage!.embargoUntil; s.voyage!.stockReadyAt[s.voyage!.sectorId] = 0; Object.assign(s.player, s.voyage!.system.cache, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; });
  await press('e'); await press('Space');
  expect((await read()).c!.details.join(' ')).toContain('YOUR CUT: 2 SPICE NOW');
  await page.screenshot({ path: info.outputPath('low-trust-offer.png') });
  expect(errors).toEqual([]);
});


test('mission countdown pauses in comms, expires in flight and reload retains the theft penalty', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  const read = () => page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state, v = s.voyage!;
    return { cargo: v.cargo, remaining: (v.cargo?.contract?.deadline ?? v.elapsed) - v.elapsed, rep: v.reputation, thefts: v.thefts, bonus: v.earnedSpice, notice: v.notice, embargo: v.embargoUntil - v.elapsed };
  });
  await press('Enter'); await press('Enter'); await page.keyboard.type('Deadline'); await press('Enter'); await page.clock.runFor(800);
  const stipend = (await read()).bonus;  // the launch stipend; a forfeited bonus adds nothing to it
  await page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; Object.assign(s.player, s.voyage!.system.cache, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; });
  await press('e'); await press('Enter');
  expect((await read()).remaining).toBe(180); expect((await read()).cargo!.contract!.bonus).toBe(8);
  await page.clock.runFor(5000); expect((await read()).remaining).toBe(180);
  await press('Enter'); await page.clock.runFor(1000); expect((await read()).remaining).toBeLessThan(180);
  // Shorten this mission for a real ticking expiry without a three-minute test wait.
  await page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; s.voyage!.cargo!.contract!.deadline = s.voyage!.elapsed + 2; s.enemies = []; });
  // Denser encounters can bank a level-up from nearby kills; choose it so the clock runs again.
  while (await page.evaluate(() => (window as unknown as { __state: State }).__state.screen === 'levelup')) await press('1');
  await page.clock.runFor(500); await page.screenshot({ path: info.outputPath('deadline-warning.png') });
  await page.clock.runFor(2000);
  expect((await read()).cargo).toBeNull(); expect((await read()).rep).toBe(35); expect((await read()).thefts).toBe(1); expect((await read()).bonus).toBe(stipend);
  expect((await read()).notice).toContain('DEADLINE EXPIRED'); expect((await read()).embargo).toBeGreaterThan(89);
  await page.screenshot({ path: info.outputPath('mission-expired.png') });
  await page.reload(); await page.clock.runFor(100); await press('Enter'); await press('Enter'); await page.clock.runFor(800);
  expect((await read()).thefts).toBe(1); expect((await read()).cargo).toBeNull(); expect((await read()).embargo).toBeGreaterThan(88);
  expect(errors).toEqual([]);
});
