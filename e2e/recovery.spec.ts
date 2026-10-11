import { expect, test, type Page } from '@playwright/test';

const key = 'arena.characters.v1';
async function resume(page: Page) {
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__state.screen)).toBe('menu');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__state.screen)).toBe('playing');
}

for (const blocked of [false, true]) {
  test(`corrupt primary resumes backup with repair writes ${blocked ? 'blocked' : 'available'}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.addInitScript(({ key, blocked }) => {
      localStorage.setItem(key, '{broken');
      localStorage.setItem(`${key}.backup`, JSON.stringify({ current: '7', list: [
        { id: '7', name: 'RECOVERED', level: 3, xp: 0, upgrades: [], bestArena: 0, kills: 12 },
      ] }));
      if (blocked) Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
    }, { key, blocked });
    await page.goto('/');
    await resume(page);
    expect(await page.evaluate(() => {
      const s = (window as any).__state;
      return { name: s.name, kills: s.player.kills, storageError: s.voyage.storageError };
    })).toMatchObject({ name: 'RECOVERED', kills: 12, storageError: blocked });
    if (!blocked) expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).current, key)).toBe('7');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => (window as any).__state.screen)).toBe('paused');
    expect(errors).toEqual([]);
  });
}

test('a frame exception restores the saved pilot and the animation loop remains responsive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.addInitScript(key => {
    localStorage.setItem(key, JSON.stringify({ current: '1', list: [
      { id: '1', name: 'SURVIVOR', level: 2, xp: 0, upgrades: [], bestArena: 0, kills: 5 },
    ] }));
  }, key);
  await page.goto('/');
  await resume(page);
  const fault = page.waitForEvent('console', message => message.type() === 'error' && message.text().includes('Frame fault'));
  await page.evaluate(() => { (window as any).__state.enemies = null; });
  await fault;
  await expect.poll(() => page.evaluate(() => Array.isArray((window as any).__state.enemies))).toBe(true);
  expect(await page.evaluate(() => {
    const s = (window as any).__state;
    return { name: s.name, screen: s.screen, enemiesValid: Array.isArray(s.enemies), finite: Number.isFinite(s.player.x) };
  })).toEqual({ name: 'SURVIVOR', screen: 'playing', enemiesValid: true, finite: true });
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => (window as any).__state.screen)).toBe('paused');
  expect(errors).toEqual([]);
});
