import { expect, test, type Page } from '@playwright/test';
import type { State, Vec } from '../src/state';

async function read(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state, v = s.voyage!;
    return { screen: s.screen, player: { x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy },
      lane: v.lane, hull: s.player.hp, seed: v.universe.seed, sectorId: v.sectorId, ring: v.universe.sectors[v.sectorId].ring,
      cache: v.system.cache, dock: v.system.dock, gates: v.system.gates, beacon: v.system.beacon,
      cargo: v.cargo, spent: v.spent, consumed: v.consumed, elapsed: v.elapsed, status: v.status, deliveries: v.deliveries };
  });
}
async function press(page: Page, key: string) { await page.keyboard.press(key); await page.clock.runFor(50); }
async function trade(page: Page) {
  await press(page, 'e'); expect((await read(page)).screen).toBe('comms');
  await press(page, 'Enter'); await press(page, 'Enter');
}
// Fixtures position the ship at contacts and exits; separate tests exercise actual FTL flight.
async function stageAt(page: Page, at: Vec) {
  await page.evaluate(at => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, at, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; s.voyage!.trail = [];
  }, at);
  await page.clock.runFor(20);
}

test('momentum controls, exit chart, spice fares, saved cargo, and a complete staged race', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  await press(page, 'Enter'); await press(page, 'Enter');
  await page.keyboard.type('Navigator'); await press(page, 'Enter'); await page.clock.runFor(800);
  const seed = (await read(page)).seed;
  // Isolate the free-flight measurement from random debris, planets and encounter sites.
  await stageAt(page, { x: 300, y: 100 });
  await page.keyboard.down('d'); await page.clock.runFor(3000); await page.keyboard.up('d');
  const moving = await read(page); expect(moving.player.vx).toBeGreaterThan(50);
  await page.clock.runFor(2000);
  const coasting = await read(page);
  expect(coasting.player.vx).toBeLessThan(moving.player.vx * .2); expect(coasting.player.x - moving.player.x).toBeGreaterThan(100);
  await page.screenshot({ path: testInfo.outputPath('momentum-trail.png') });
  // Autosave retains momentum when reloading.
  await page.reload(); await page.clock.runFor(100); await press(page, 'Enter'); await press(page, 'Enter');
  expect(Math.abs((await read(page)).player.vx - coasting.player.vx)).toBeLessThan(10);
  await page.keyboard.down('Space'); await page.clock.runFor(2000); await page.keyboard.up('Space');
  expect((await read(page)).player.vx).toBe(0);
  // A real thrust-driven boundary crossing opens the chart without charging anything.
  await stageAt(page, { x: 40, y: 1920 });
  await page.keyboard.down('a'); await page.clock.runFor(1500); await page.keyboard.up('a');
  expect((await read(page)).screen).toBe('map'); expect((await read(page)).spent).toBe(0);
  await press(page, 'Enter'); expect((await read(page)).screen).toBe('map');
  await press(page, 'Escape'); expect((await read(page)).screen).toBe('playing');
  for (let leg = 0; leg < 4; leg++) {
    let state = await read(page);
    await stageAt(page, state.cache); await trade(page);
    state = await read(page); expect(state.cargo?.remaining).toBe(state.cargo!.contract!.due + state.cargo!.contract!.fuel);
    const to = state.cargo!.destination, gate = state.gates.find(g => g.to === to)!;
    while ((await read(page)).consumed < [4, 8, 12, 16][leg]) await press(page, 'c');
    await page.screenshot({ path: testInfo.outputPath(`sector-${leg}.png`) });
    await stageAt(page, gate); await press(page, 'e');
    const departing = await read(page); expect(departing.screen).toBe('map');
    await page.clock.runFor(3000); expect((await read(page)).elapsed).toBe(departing.elapsed);
    if (leg === 0) await page.screenshot({ path: testInfo.outputPath('departure-map.png') });
    await press(page, 'Enter'); await page.clock.runFor(800);
    state = await read(page); expect(state.lane?.to).toBe(to); expect(state.sectorId).toBe(departing.sectorId);
    expect(state.spent).toBeGreaterThan(departing.spent);
    if (leg === 0) {
      await page.clock.runFor(3500);
      await page.screenshot({ path: testInfo.outputPath('hyperspace.png') });
      const inLane = await read(page);
      await page.reload(); await page.clock.runFor(100); await press(page, 'Enter'); await press(page, 'Enter');
      expect((await read(page)).lane?.to).toBe(to); expect((await read(page)).spent).toBe(inLane.spent);
    }
    // Combat balance is deliberately outside this handoff test. Stage the lane exit after
    // exercising real spawning, shooting, and mid-lane resume above.
    await page.evaluate(() => {
      const s = (window as unknown as { __state: State }).__state;
      Object.assign(s.player, s.voyage!.lane!.course.exit, { vx: 0, vy: 0 });
      s.enemies = []; s.bullets = [];
    });
    await page.clock.runFor(50);
    state = await read(page); expect(state.lane).toBeNull(); expect(state.sectorId).toBe(to);
    expect(state.cargo!.remaining).toBe(departing.cargo!.remaining - (state.spent - departing.spent));
    if (leg === 1) {
      await page.reload(); await page.clock.runFor(100); await press(page, 'Enter'); await press(page, 'Enter');
      expect((await read(page)).cargo).toEqual(state.cargo); expect((await read(page)).spent).toBe(state.spent);
    }
    await stageAt(page, state.dock); await trade(page);
    expect((await read(page)).deliveries).toBe(leg + 1);
  }
  const state = await read(page); await stageAt(page, state.beacon); await press(page, 'e');
  expect((await read(page)).status).toBe('won');
  await press(page, 'Enter');
  const restarted = await read(page); expect(restarted.seed).toBe(seed); expect(restarted.ring).toBe(4);
  expect(restarted.spent).toBe(0); expect(errors).toEqual([]);
});
