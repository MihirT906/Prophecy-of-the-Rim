import { expect, test, type Page } from '@playwright/test';
import type { State, Vec } from '../src/state';

const read = (page: Page) => page.evaluate(() => {
  const s = (window as unknown as { __state: State }).__state, v = s.voyage!;
  return { screen: s.screen, cursor: s.cursor, sectorId: v.sectorId, navTarget: v.navTarget, spent: v.spent, notice: v.notice, lane: v.lane?.to ?? null,
    neighbors: v.universe.sectors[v.sectorId].neighbors, rings: v.universe.sectors.map(x => x.ring), cache: v.system.cache, gates: v.system.gates };
});
// Stars sit at the chart's fixed layout; translate canvas pixels through the letterboxed element.
async function star(page: Page, id: number): Promise<Vec> {
  return page.evaluate(id => {
    const s = (window as unknown as { __state: State }).__state, sector = s.voyage!.universe.sectors[id];
    const r = document.getElementById('game')!.getBoundingClientRect(), k = r.width / 1280;
    return { x: r.left + (430 + sector.x * 248) * k, y: r.top + (378 + sector.y * 248) * k };
  }, id);
}
async function stageAt(page: Page, at: Vec) {
  await page.evaluate(at => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, at, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; s.enemies = [];
  }, at);
  await page.clock.runFor(20);
}

test('the departure chart is driven by hovering and clicking stars, with an answer for every click', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as any).__tones = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { (window as any).__tones++; return start.apply(this, args); };
  });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  const click = async (at: Vec) => { await page.mouse.click(at.x, at.y); await page.clock.runFor(50); };
  const tones = () => page.evaluate(() => (window as any).__tones as number);
  await press('Enter'); await press('Enter'); await page.keyboard.type('Pointer'); await press('Enter'); await page.clock.runFor(800);

  let state = await read(page);
  const home = state.sectorId, inward = state.neighbors.find(n => state.rings[n] < state.rings[home])!;
  const far = state.rings.findIndex((_, id) => id && id !== home && !state.neighbors.includes(id));
  await stageAt(page, state.gates.find(g => g.to === inward)!); await press('e');
  expect((await read(page)).screen).toBe('map');

  // Hover previews; a resting mouse does not fight the keyboard.
  await page.mouse.move((await star(page, far)).x, (await star(page, far)).y); await page.clock.runFor(50);
  expect((await read(page)).cursor).toBe(far);
  expect(await page.evaluate(() => document.getElementById('game')!.style.cursor)).toBe('pointer');
  await press('ArrowLeft'); const keyed = (await read(page)).cursor;
  await page.clock.runFor(200); expect(keyed).not.toBe(far); expect((await read(page)).cursor).toBe(keyed);

  // A locked inward lane refuses the click with a reason and charges nothing.
  let before = await tones();
  await page.mouse.move((await star(page, inward)).x, (await star(page, inward)).y); await page.clock.runFor(50);
  await page.screenshot({ path: info.outputPath('map-hover-locked.png') });
  await click(await star(page, inward));
  state = await read(page);
  expect(state.screen).toBe('map'); expect(state.spent).toBe(0); expect(state.notice).toMatch(/consumed doses/);
  expect(await tones()).toBeGreaterThan(before);

  // Empty chart space is acknowledged without changing anything.
  before = await tones();
  const box = (await page.locator('#game').boundingBox())!;
  await click({ x: box.x + 120 * box.width / 1280, y: box.y + 110 * box.width / 1280 });
  expect((await read(page)).screen).toBe('map'); expect(await tones()).toBeGreaterThan(before);

  // A distant star plots a course without paying; your own star stays.
  await click(await star(page, far));
  state = await read(page); expect(state.navTarget).toBe(far); expect(state.screen).toBe('map'); expect(state.spent).toBe(0);
  await page.screenshot({ path: info.outputPath('map-plotted.png') });
  await click(await star(page, home));
  expect((await read(page)).screen).toBe('playing');

  // With cargo and doses the same click on a lit star launches the paid FTL course.
  await stageAt(page, state.cache); await press('e'); await press('Enter'); await press('Enter');
  for (let i = 0; i < 4; i++) await press('c');
  await stageAt(page, state.gates.find(g => g.to === inward)!); await press('e');
  expect((await read(page)).screen).toBe('map');
  await page.mouse.move((await star(page, inward)).x, (await star(page, inward)).y); await page.clock.runFor(50);
  await page.screenshot({ path: info.outputPath('map-hover-open.png') });
  await click(await star(page, inward));
  state = await read(page);
  expect(state.lane).toBe(inward); expect(state.spent).toBeGreaterThan(0); expect(state.screen).toBe('playing');

  // Outside the chart a click is answered too, but does nothing.
  before = await tones();
  await click({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  expect((await read(page)).screen).toBe('playing'); expect(await tones()).toBeGreaterThan(before);
  expect(errors).toEqual([]);
});
