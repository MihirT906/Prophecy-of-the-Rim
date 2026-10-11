import { expect, test } from '@playwright/test';

test('boots, names a pilot and draws the first sector without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(`${m.text()} (${m.location().url})`); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/');
  // Pauses let each screen see its own keys: S in the name would move the menu cursor otherwise.
  await page.keyboard.press('Enter');  // title -> menu
  await page.waitForTimeout(100);
  await page.keyboard.press('Enter');  // Play with no character -> naming
  await page.waitForTimeout(100);
  await page.keyboard.type('Smoke');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1000);
  const png = await page.locator('#game').screenshot();
  const lit = await page.evaluate(async b64 => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 30) n++;
    return n;
  }, png.toString('base64'));
  expect(lit).toBeGreaterThan(1000);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('arena.characters.v1') ?? 'null')?.list[0]?.name)).toBe('Smoke');
  expect(errors).toEqual([]);
});
