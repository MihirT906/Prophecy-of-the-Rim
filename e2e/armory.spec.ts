import { expect, test, type Page } from '@playwright/test';
import type { State, Vec } from '../src/state';

async function read(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state, v = s.voyage!;
    return { screen: s.screen, lane: v.lane, cargo: v.cargo, personalSpice: v.personalSpice, lateral: v.universe.sectors[v.sectorId].neighbors.find(id => v.universe.sectors[id].ring === v.universe.sectors[v.sectorId].ring), consumed: v.consumed, armed: v.armed, arsenal: v.arsenal.map(item => ({ ...item })),
      cache: v.system.cache, stations: v.system.stations.map(st => ({ x: st.x, y: st.y })), gates: v.system.gates, bullets: s.bullets.length };
  });
}
async function press(page: Page, key: string) { await page.keyboard.press(key); await page.clock.runFor(50); }
async function trade(page: Page) {
  await press(page, 'e'); expect((await read(page)).screen).toBe('comms');
  await press(page, 'Enter'); await press(page, 'Enter');
}
// Fixtures position the ship at contacts; the market and the arms are driven with real key presses.
async function stageAt(page: Page, at: Vec) {
  await page.evaluate(at => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, at, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; s.voyage!.trail = [];
  }, at);
  await page.clock.runFor(20);
}
async function resume(page: Page) {
  await page.reload(); await page.clock.runFor(100); await press(page, 'Enter'); await press(page, 'Enter');
}

test('station armory sells a weapon for personal spice, survives a reload, and fires in the lane', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  await press(page, 'Enter'); await press(page, 'Enter');
  // Keys typed into the callsign survive into the first playing tick, so the name avoids every flight hotkey.
  await page.keyboard.type('Hux'); await press(page, 'Enter'); await page.clock.runFor(800);
  let state = await read(page);
  expect(state.arsenal).toEqual([]); expect(state.armed).toBe(0);
  const stipend = state.personalSpice; expect(stipend).toBeGreaterThan(0);  // a new run launches with spending spice
  await stageAt(page, state.cache); await trade(page);
  state = await read(page); expect(state.cargo?.remaining).toBe(8); expect(state.personalSpice).toBe(stipend + 4);
  // The armory only opens when docked at a station; elsewhere F does nothing to the screen.
  await press(page, 'f'); expect((await read(page)).screen).toBe('playing');
  await stageAt(page, state.stations[0]); await press(page, 'f');
  expect((await read(page)).screen).toBe('shop');  // the gun page first; Tab turns to air support
  await press(page, 'Tab'); expect((await read(page)).screen).toBe('market');
  await press(page, 'Enter');
  state = await read(page);
  expect(state.arsenal).toHaveLength(1); expect(state.cargo?.remaining).toBe(8); expect(state.personalSpice).toBe(stipend + 3); expect(state.armed).toBe(1);
  const bought = state.arsenal[0];
  expect(bought.durability).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('armory.png') });
  await press(page, 'Escape'); expect((await read(page)).screen).toBe('playing');
  await page.clock.runFor(2500);  // autosave window
  await resume(page);
  state = await read(page);
  expect(state.arsenal).toEqual([bought]); expect(state.armed).toBe(1); expect(state.cargo?.remaining).toBe(8); expect(state.personalSpice).toBe(stipend + 3);
  // Use a lateral lane: the first advance funded this weapon, not inward prescience.
  state = await read(page);
  const to = state.lateral!, gate = state.gates.find(g => g.to === to)!;
  await stageAt(page, gate); await press(page, 'e');
  expect((await read(page)).screen).toBe('map');
  await press(page, 'Enter'); await page.clock.runFor(1000);
  state = await read(page); expect(state.lane?.to).toBe(to); expect(state.screen).toBe('playing');
  await press(page, '1'); await page.clock.runFor(100);
  state = await read(page);
  const left = state.arsenal.find(item => item.id === bought.id);
  expect(left ? left.durability : 0).toBe(bought.durability - 1);
  expect(state.bullets).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('armory-lane.png') });
  expect(errors).toEqual([]);
});
