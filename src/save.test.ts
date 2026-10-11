import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { OLD_SAVE_KEY, SAVE_KEY } from './data';
import { newPlayer } from './player';
import { BACKUP_KEY, applySave, createSave, deleteSave, listSaves, loadSave, selectSave, writeSave } from './save';
import { newState } from './state';

const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
};
beforeEach(() => store.clear());
afterEach(() => vi.restoreAllMocks());

const fresh = () => newState({ held: new Set(), pressed: [], typed: [] }, 'save');

test('loadSave is null when missing', () => {
  expect(loadSave()).toBeNull();
  expect(listSaves()).toEqual([]);
});

test('writeSave then loadSave round-trips, bestArena keeps the max', () => {
  const s = fresh();
  const { id } = createSave('ZED');
  Object.assign(s, { name: 'ZED', arenaN: 4 });
  s.player.kills = 21;
  writeSave(s);
  expect(loadSave()).toEqual({ id, name: 'ZED', bestArena: 4, kills: 21 });
  s.arenaN = 2;
  writeSave(s);
  expect(loadSave()?.bestArena).toBe(4);
});

test('writeSave only touches the current character', () => {
  const s = fresh();
  createSave('A');
  createSave('B');
  Object.assign(s, { name: 'B', arenaN: 3 });
  s.player.kills = 4;
  writeSave(s);
  expect(listSaves().map(c => [c.name, c.kills, c.bestArena])).toEqual([['A', 0, 0], ['B', 4, 3]]);
});

test('createSave, selectSave and deleteSave manage the list and current', () => {
  const a = createSave('A'), b = createSave('B');
  expect(a.id).not.toBe(b.id);
  expect(loadSave()?.name).toBe('B');
  selectSave(a.id);
  expect(loadSave()?.name).toBe('A');
  selectSave('nope');
  expect(loadSave()?.name).toBe('A');
  deleteSave(b.id);
  expect(listSaves().map(c => c.name)).toEqual(['A']);
  expect(loadSave()?.name).toBe('A');
  createSave('C');
  deleteSave(listSaves()[1].id);  // deleting the current one falls back to the first
  expect(loadSave()?.name).toBe('A');
  deleteSave(a.id);  // the last one can go too
  expect(listSaves()).toEqual([]);
  expect(loadSave()).toBeNull();
  expect(createSave('D').name).toBe('D');
});

test('the old single-character key migrates once into the list', () => {
  store.set(OLD_SAVE_KEY, JSON.stringify({ name: 'OLD', level: 2, xp: 1, upgrades: ['damage'], bestArena: 5, kills: 8 }));
  expect(loadSave()).toEqual({ id: '1', name: 'OLD', bestArena: 5, kills: 8 });  // retired level, xp and upgrades are dropped
  expect(store.has(OLD_SAVE_KEY)).toBe(false);
  expect(createSave('NEW').id).toBe('2');
  store.set(OLD_SAVE_KEY, JSON.stringify({ name: 'IGNORED', level: 1, xp: 0, upgrades: [], bestArena: 0, kills: 0 }));
  expect(listSaves().map(c => c.name)).toEqual(['OLD', 'NEW']);  // new key exists: no second migration
});

test('malformed JSON gives an empty list', () => {
  store.set(SAVE_KEY, '{nope');
  expect(loadSave()).toBeNull();
  store.set(SAVE_KEY, '{"current":"1","list":[{"id":"1","name":1}]}');
  expect(loadSave()).toBeNull();
  expect(listSaves()).toEqual([]);
});

test('applySave restores name and kills on a base ship', () => {
  const s = fresh();
  applySave(s, { id: '1', name: 'ZED', bestArena: 3, kills: 9 });
  expect(s.name).toBe('ZED');
  expect(s.player.kills).toBe(9);
  expect(s.player).toEqual({ ...newPlayer(), kills: 9 });
});

test('pilots saved with ship upgrades still load, on a base ship, and lose them on the next write', () => {
  store.set(SAVE_KEY, JSON.stringify({ current: '1', list: [{ id: '1', name: 'VET', level: 5, xp: 2, upgrades: ['damage', 'maxhp'], bestArena: 3, kills: 9 }] }));
  const s = fresh();
  applySave(s, loadSave()!);
  expect(s.player).toEqual({ ...newPlayer(), kills: 9 });
  writeSave(s);
  expect(JSON.parse(store.get(SAVE_KEY)!).list[0]).toEqual({ id: '1', name: 'VET', bestArena: 3, kills: 9 });
});

test('a corrupted save record is repaired from the last good backup', () => {
  const s = fresh();
  createSave('KEEP');
  Object.assign(s, { name: 'KEEP' });
  s.player.kills = 6;
  writeSave(s);
  store.set(SAVE_KEY, '{"list": [truncated');
  expect(loadSave()).toMatchObject({ name: 'KEEP', kills: 6 });
  expect(JSON.parse(store.get(SAVE_KEY)!).list[0].name).toBe('KEEP');
  store.delete(SAVE_KEY);
  expect(listSaves().map(c => c.name)).toEqual(['KEEP']);
});


test('backup remains playable when repairing the primary exceeds storage quota', () => {
  createSave('KEEP');
  store.set(SAVE_KEY, '{broken');
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadSave()?.name).toBe('KEEP');
  expect(listSaves()).toHaveLength(1);
  expect(store.has(BACKUP_KEY)).toBe(true);
});

test('backup takes priority over stale or malformed legacy data', () => {
  createSave('CURRENT');
  store.delete(SAVE_KEY);
  store.set(OLD_SAVE_KEY, '{broken');
  expect(loadSave()?.name).toBe('CURRENT');
  store.delete(SAVE_KEY);
  store.set(OLD_SAVE_KEY, JSON.stringify({ name: 'STALE', level: 1, xp: 0, upgrades: [], bestArena: 0, kills: 0 }));
  expect(loadSave()?.name).toBe('CURRENT');
});

test('failed legacy migration preserves the original and retries successfully later', () => {
  const legacy = JSON.stringify({ name: 'OLD', level: 2, xp: 1, upgrades: [], bestArena: 0, kills: 0 });
  store.set(OLD_SAVE_KEY, legacy);
  const blocked = vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  expect(loadSave()?.name).toBe('OLD');
  expect(store.get(OLD_SAVE_KEY)).toBe(legacy);
  expect(store.has(SAVE_KEY)).toBe(false);
  blocked.mockRestore();
  expect(loadSave()?.name).toBe('OLD');
  expect(store.has(OLD_SAVE_KEY)).toBe(false);
  expect(store.has(SAVE_KEY)).toBe(true);
});

test('legacy cleanup failure does not hide the migrated save', () => {
  store.set(OLD_SAVE_KEY, JSON.stringify({ name: 'OLD', level: 2, xp: 1, upgrades: [], bestArena: 0, kills: 0 }));
  vi.spyOn(localStorage, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
  expect(loadSave()?.name).toBe('OLD');
  expect(loadSave()?.name).toBe('OLD');
});


test('unavailable storage reads degrade to an empty character list', () => {
  vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('denied'); });
  expect(listSaves()).toEqual([]);
  expect(loadSave()).toBeNull();
});

test('a backup write failure keeps the successfully written primary', () => {
  const original = localStorage.setItem;
  vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
    if (key === BACKUP_KEY) throw new Error('quota');
    original(key, value);
  });
  createSave('PRIMARY');
  expect(loadSave()?.name).toBe('PRIMARY');
  expect(store.has(SAVE_KEY)).toBe(true);
});

test('an intentionally empty primary does not resurrect deleted backup characters', () => {
  createSave('DELETED');
  store.set(SAVE_KEY, JSON.stringify({ current: '', list: [] }));
  expect(loadSave()).toBeNull();
  expect(listSaves()).toEqual([]);
});

test('invalid pilot counters recover the backup instead of poisoning resumed state', () => {
  createSave('BACKUP');
  for (const kills of [-1, 1.5, 1e100]) {
    store.set(SAVE_KEY, JSON.stringify({ current: '1', list: [
      { id: '1', name: 'BROKEN', bestArena: 0, kills },
    ] }));
    expect(loadSave()?.name).toBe('BACKUP');
  }
  store.set(SAVE_KEY, '{"current":"1","list":[{"id":"1","name":"BROKEN","bestArena":0,"kills":1e999}]}');
  expect(loadSave()?.name).toBe('BACKUP');
});

test('partially corrupt lists retain valid pilots and repair a dangling current selection', () => {
  store.set(SAVE_KEY, JSON.stringify({ current: 'missing', list: [
    { id: 'bad', name: 'BAD', bestArena: -1, kills: 0 },
    { id: '2', name: 'KEEP', bestArena: 0, kills: 4 },
    { id: '2', name: 'DUPLICATE', bestArena: 0, kills: 0 },
    { id: '', name: 'NO ID', bestArena: 0, kills: 0 },
  ] }));
  expect(listSaves()).toEqual([{ id: '2', name: 'KEEP', bestArena: 0, kills: 4 }]);
  expect(loadSave()?.name).toBe('KEEP');
});
