import { expect, test, type Page } from '@playwright/test';
import type { State } from '../src/state';
async function read(page: Page) {
  return page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    return { screen: s.screen, p: { x: s.player.x, y: s.player.y, vx: s.player.vx, vy: s.player.vy, hp: s.player.hp },
      lane: s.voyage!.lane, sector: s.voyage!.sectorId, bullets: s.bullets.filter(b => b.owner === 'player' && !b.debris).length, spent: s.voyage!.spent, jumps: s.voyage!.jumps };
  });
}
test('same controls fly a real FTL course; crossing a lane boundary kills and persists', async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => {
    // Dense encounters can bank a level-up from nearby kills; take it so scripted keys reach the voyage.
    while (await page.evaluate(() => (window as unknown as { __state: State }).__state.screen === 'levelup')) { await page.keyboard.press('1'); await page.clock.runFor(50); }
    await page.keyboard.press(key); await page.clock.runFor(50);
  };
  await press('Enter'); await press('Enter'); await page.keyboard.type('Course'); await press('Enter'); await page.clock.runFor(800);
  await page.evaluate(() => { const s = (window as unknown as { __state: State }).__state; Object.assign(s.player, s.voyage!.system.cache); });
  await press('e'); await press('Enter'); await press('Enter');
  for (let i = 0; i < 4; i++) await press('c');
  await page.evaluate(() => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, s.voyage!.system.gates.find(g => g.to === s.voyage!.cargo!.destination)); s.voyage!.jumpTimer = 0;
  });
  await press('e'); await press('Enter');
  const entered = await read(page); expect(entered.lane).not.toBeNull();
  await page.clock.runFor(2500);
  const idle = await read(page); expect(idle.p.x).toBe(entered.p.x); expect(idle.bullets).toBe(0); expect(idle.sector).toBe(entered.sector);
  await page.keyboard.down('d'); await page.keyboard.down('ArrowRight');
  let vertical = '';
  for (let tick = 0; tick < 240; tick++) {
    const state = await read(page); if (!state.lane) break;
    expect(state.screen).toBe('playing');
    const course = state.lane.course;
    const lookahead = Math.min(course.length, state.p.x + 450);
    const targetY = course.height / 2 + Math.sin(lookahead / course.length * Math.PI * 4) * course.bend;
    const error = (targetY - state.p.y) * 1.5 - state.p.vy;
    const key = error > 65 ? 's' : error < -65 ? 'w' : '';
    if (key !== vertical) { if (vertical) await page.keyboard.up(vertical); if (key) await page.keyboard.down(key); vertical = key; }
    await page.clock.runFor(150);
    if (tick === 35) await page.screenshot({ path: info.outputPath('ftl-course.png') });
  }
  if (vertical) await page.keyboard.up(vertical);
  await page.keyboard.up('d'); await page.keyboard.up('ArrowRight');
  const arrived = await read(page); expect(arrived.lane).toBeNull(); expect(arrived.sector).toBe(entered.lane!.to); expect(arrived.jumps).toBe(1);
  expect(arrived.spent).toBe(entered.spent);
  // Hand in the first contract and take another before funding reciprocal transit.
  for (const stop of ['dock', 'cache'] as const) {
    await page.evaluate(stop => {
      const s = (window as unknown as { __state: State }).__state;
      Object.assign(s.player, s.voyage!.system[stop], { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0;
    }, stop);
    await press('e'); await press('Enter'); await press('Enter');
  }
  // Launch the reciprocal lane and deliberately breach its side with real thrust input.
  await page.evaluate(from => {
    const s = (window as unknown as { __state: State }).__state;
    Object.assign(s.player, s.voyage!.system.gates.find(g => g.to === from), { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0;
  }, entered.sector);
  await press('e'); await press('Enter'); expect((await read(page)).lane).not.toBeNull();
  await page.keyboard.down('w'); await page.clock.runFor(2500); await page.keyboard.up('w');
  expect((await read(page)).screen).toBe('dead'); expect((await read(page)).p.hp).toBe(0);
  await page.screenshot({ path: info.outputPath('boundary-death.png') });
  await page.reload(); await page.clock.runFor(100); await press('Enter'); await press('Enter');
  expect((await read(page)).screen).toBe('dead'); expect(errors).toEqual([]);
});
