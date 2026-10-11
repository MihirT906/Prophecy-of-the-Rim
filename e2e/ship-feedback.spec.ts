import { expect, test } from '@playwright/test';

test('raster ship animates under input and armory does not mute keyboard feedback', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.addInitScript(() => {
    (window as any).__tones = 0; (window as any).__shipFrames = new Set();
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) { (window as any).__tones++; return start.apply(this, args); };
    const draw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      if (args[0] instanceof HTMLCanvasElement && args[0].width === 40 && args[0].height === 24)
        (window as any).__shipFrames.add(args[0].toDataURL());
      return (draw as any).apply(this, args);
    } as typeof draw;
  });
  await page.clock.install({ time: new Date('2026-10-09T12:00:00Z') });
  await page.goto('/'); await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
  const press = async (key: string) => { await page.keyboard.press(key); await page.clock.runFor(80); };
  await press('Enter'); await press('Enter'); await page.keyboard.type('Hux'); await press('Enter'); await page.clock.runFor(800);
  await page.evaluate(() => { const s = (window as any).__state; s.enemies = []; Object.assign(s.player, { x: 300, y: 100, vx: 0, vy: 0 }); });
  await page.keyboard.down('d'); await page.clock.runFor(250);
  await page.screenshot({ path: info.outputPath('raster-thrust.png') }); await page.keyboard.up('d');
  await page.keyboard.down('Space'); await page.clock.runFor(100);
  await page.screenshot({ path: info.outputPath('raster-brake.png') }); await page.keyboard.up('Space');
  expect(await page.evaluate(() => (window as any).__shipFrames.size)).toBeGreaterThan(3);
  await press('f');
  const before = await page.evaluate(() => (window as any).__tones);
  await press('q'); await press('q');
  expect(await page.evaluate(() => (window as any).__tones)).toBeGreaterThanOrEqual(before + 2);
  expect(errors).toEqual([]);
});
