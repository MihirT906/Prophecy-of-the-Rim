import { test, expect } from '@playwright/test';
import type { State } from '../src/state';

test('fly to a freighter, hear its voice, cancel safely, and confirm through comms', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.addInitScript(() => {
    const stats = { samples: 0, state: '' };
    (window as unknown as { voiceTest: typeof stats }).voiceTest = stats;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      stats.samples++; stats.state = this.state;
      return create.call(this);
    };
  });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  const state = () => page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    return { screen: s.screen, cargo: s.voyage?.cargo, elapsed: s.voyage?.elapsed, comms: s.comms };
  });
  await press('Enter'); await press('Enter'); await page.keyboard.type('Witness'); await press('Enter');
  await page.keyboard.down('d'); await page.clock.runFor(1100); await page.keyboard.up('d');
  await page.keyboard.down('Space'); await page.clock.runFor(800); await page.keyboard.up('Space');
  await page.screenshot({ path: info.outputPath('freighter-approach.png') });
  await press('e'); expect((await state()).screen).toBe('comms'); expect((await state()).cargo).toBeNull();
  const clock = (await state()).elapsed;
  await page.clock.runFor(2300);
  expect((await state()).elapsed).toBe(clock); expect((await state()).comms!.shown).toBeGreaterThan(10);
  await page.screenshot({ path: info.outputPath('alien-transmission.png') });
  const audio = await page.evaluate(() => (window as unknown as { voiceTest: { samples: number; state: string } }).voiceTest);
  expect(audio.samples).toBeGreaterThan(10); expect(audio.state).toBe('running');
  await press('v'); await press('Space'); expect((await state()).comms!.shown).toBe((await state()).comms!.text.length);
  await press('Escape'); expect((await state()).cargo).toBeNull();
  await press('e'); await press('Enter'); expect((await state()).cargo?.remaining).toBe(8);
  await press('Enter'); expect((await state()).screen).toBe('playing');
  expect(errors).toEqual([]);
});

test('procedural comms portraits, letter pacing, reveal and transfer work in browser', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  await press('Enter'); await press('Enter'); await page.keyboard.type('Comms'); await press('Enter'); await page.clock.runFor(800);
  const seen = new Set<string>();
  for (let i = 0; i < 40 && seen.size < 4; i++) {
    await page.evaluate(i => {
      const s = (window as unknown as { __state: State }).__state;
      s.voyage!.universe.seed = `portrait-${i}`;
      Object.assign(s.player, s.voyage!.system.cache, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0;
    }, i);
    await press('e');
    const first = await page.evaluate(() => (window as unknown as { __state: State }).__state.comms!);
    expect(first.shown).toBeLessThan(first.text.length);
    await page.clock.runFor(1500);
    const later = await page.evaluate(() => (window as unknown as { __state: State }).__state.comms!);
    expect(later.shown).toBeGreaterThan(first.shown);
    await press('Space');
    const revealed = await page.evaluate(() => (window as unknown as { __state: State }).__state.comms!);
    expect(revealed.shown).toBe(revealed.text.length);
    if (!seen.has(first.entity.kind)) await page.screenshot({ path: info.outputPath(`${first.entity.kind}.png`) });
    seen.add(first.entity.kind);
    await press('Escape');
  }
  expect(seen.size).toBe(4);
  await press('e'); await press('v'); await press('Enter');
  expect(await page.evaluate(() => (window as unknown as { __state: State }).__state.voyage!.cargo?.remaining)).toBe(8);
  await press('Enter');
  expect(await page.evaluate(() => (window as unknown as { __state: State }).__state.screen)).toBe('playing');
  expect(errors).toEqual([]);
});
