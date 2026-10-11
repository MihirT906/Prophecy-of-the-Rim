import { expect, test } from '@playwright/test';
import type { State } from '../src/state';

test('generated UI sheets load and all four portraits play talking then idle frames', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    const frames: number[][] = [];
    (window as any).__portraitFrames = frames;
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      if (args.length === 9 && args[7] === 433 && args[8] === 433 && args[0] instanceof HTMLImageElement) frames.push([args[1],args[2]]);
      return (draw as any).apply(this,args);
    } as typeof draw;
  });
  await page.goto('/');
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.press('Enter'); await page.waitForTimeout(100);
  await page.keyboard.type('Raster'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = (window as unknown as {__state:State}).__state;
    Object.assign(s.player,s.voyage!.system.cache,{vx:0,vy:0}); s.voyage!.jumpTimer=0;
  });
  await page.keyboard.press('e'); await page.waitForTimeout(150);
  for (const kind of ['navigator','facedancer','ghola','smuggler'] as const) {
    await page.evaluate(kind => {
      const s = (window as unknown as {__state:State}).__state;
      s.comms!.entity.kind=kind; s.comms!.shown=0; s.comms!.wait=0; s.comms!.elapsed=0;
      (window as any).__portraitFrames.length=0;
    },kind);
    await page.waitForTimeout(1400);
    const frames = await page.evaluate(() => (window as any).__portraitFrames as number[][]);
    expect(frames.length).toBeGreaterThan(5);
    expect(new Set(frames.map(f => f.join(','))).size).toBeGreaterThan(1);
    expect(frames.some(f => f[1] > 0)).toBe(true);
    await page.screenshot({path:`test-results/raster-${kind}.png`});
  }
  await page.keyboard.press('Space'); await page.waitForTimeout(250);
  await page.evaluate(() => { (window as any).__portraitFrames.length=0; });
  await page.waitForTimeout(350);
  const idle = await page.evaluate(() => (window as any).__portraitFrames as number[][]);
  expect(idle.length).toBeGreaterThan(0);
  expect(idle.every(f => f[1] === 0)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as {__state:State}).__state.screen)).toBe('comms');
  expect(errors).toEqual([]);
});


test('all interface screens use bitmap glyphs and raster panels instead of live text', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as any).__liveText = 0; (window as any).__lintUI = true;
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (...args: Parameters<typeof fill>) {
      if (this.canvas.id === 'game') (window as any).__liveText++;
      return fill.apply(this, args);
    };
  });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(50); };
  const check = async (name: string) => { const report = await page.evaluate(() => (window as any).__uiLayout()); await info.attach(name + '-layout.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' }); expect.soft(report.issues, name).toEqual([]); };
  await check('title');
  await page.screenshot({ path: info.outputPath('title.png') });
  await press('Enter'); await press('Enter'); await page.keyboard.type('Hux'); await press('Enter'); await page.clock.runFor(800);
  await check('flight'); await page.screenshot({ path: info.outputPath('flight.png') });
  await press('m'); await check('map'); await page.screenshot({ path: info.outputPath('map.png') }); await press('Escape');
  await page.evaluate(() => { const s = (window as any).__state as State; Object.assign(s.player, s.voyage!.system.dock, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; });
  await press('f'); await check('shop'); await page.screenshot({ path: info.outputPath('shop.png') });
  await press('Tab'); expect(await page.evaluate(() => (window as any).__state.screen)).toBe('market');
  await check('air-support'); await page.screenshot({ path: info.outputPath('air-support.png') }); await press('Escape');
  await page.evaluate(() => { const s = (window as any).__state as State; Object.assign(s.player, s.voyage!.system.cache, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; });
  await press('e'); await press('Space'); await check('comms'); await page.screenshot({ path: info.outputPath('comms.png') });
  await press('Enter'); await press('Enter'); await check('delivery-flight');
  await press('m'); await check('delivery-map'); await press('Escape');
  for (let i = 0; i < 4; i++) await press('c');
  await page.evaluate(() => { const s = (window as any).__state as State; const v=s.voyage!; Object.assign(s.player, v.system.gates.find(g=>g.to===v.cargo!.destination), {vx:0,vy:0}); v.jumpTimer=0; s.enemies=[]; });
  await press('e'); await check('departure-map'); await page.screenshot({ path: info.outputPath('departure-map.png') });
  await press('Enter');
  expect(await page.evaluate(() => !!(window as any).__state.voyage.lane)).toBe(true);
  await check('delivery-ftl'); await page.screenshot({path:info.outputPath('delivery-ftl.png')});
  await page.evaluate(() => {
    const s=(window as any).__state as State, c=s.voyage!.lane!.course, obstacle=c.obstacles[0];
    const x=obstacle.x-240, center=c.height/2+Math.sin(x/c.length*Math.PI*4)*c.bend;
    Object.assign(s.player,{x,y:center-c.width/2+220,vx:900,vy:0,iframes:5}); s.enemies=[];s.bullets=[];
  });
  await page.clock.runFor(50); await check('ftl-raster-boundary');
  await page.screenshot({path:info.outputPath('ftl-raster-boundary.png')});
  await page.evaluate(() => {const s=(window as any).__state as State,c=s.voyage!.lane!.course;Object.assign(s.player,{x:c.exit.x-300,y:c.exit.y,vx:0,vy:0});});
  await page.clock.runFor(50); await check('ftl-exit-gate');
  await page.screenshot({path:info.outputPath('ftl-exit-gate.png')});
  await page.evaluate(() => {const s=(window as any).__state as State; Object.assign(s.player,s.voyage!.lane!.course.exit,{vx:0,vy:0}); s.enemies=[];});
  await page.clock.runFor(50); await check('delivery-arrival');

  for (const screen of ['paused', 'settings', 'dead', 'transcended'] as const) {
    await page.evaluate(screen => { (window as any).__state.screen = screen; }, screen);
    await page.clock.runFor(50); await check(screen); await page.screenshot({ path: info.outputPath(`${screen}.png`) });
  }
  expect(await page.evaluate(() => (window as any).__liveText)).toBe(0);
  expect(errors).toEqual([]);
});
