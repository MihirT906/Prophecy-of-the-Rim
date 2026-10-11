import { expect, test } from 'vitest';

test('game speed assist cycles 100/75/50% and survives a reload', async () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  const { cycleGameSpeed, gameSpeed } = await import('./accessibility');
  expect(gameSpeed()).toBe(1);
  expect([cycleGameSpeed(), cycleGameSpeed(), cycleGameSpeed()]).toEqual([0.75, 0.5, 1]);
  cycleGameSpeed();
  expect(JSON.parse(store.get('arena.accessibility.v1')!)).toMatchObject({ gameSpeed: 0.75 });
});

test('damage assist halves every hit to the hull and is remembered', async () => {
  const store = new Map<string, string>();
  Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
  const { setDamageAssist } = await import('./accessibility');
  const { damagePlayer } = await import('./player');
  const { newState } = await import('./state');
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'assist');
  s.screen = 'playing';
  setDamageAssist(true);
  damagePlayer(s, 3, null);
  expect(s.player.hp).toBe(s.player.maxHp - 1.5);
  expect(JSON.parse(store.get('arena.accessibility.v1')!)).toMatchObject({ damageAssist: true });
  setDamageAssist(false);
  s.player.iframes = 0;
  damagePlayer(s, 3, null);
  expect(s.player.hp).toBe(s.player.maxHp - 4.5);
});
