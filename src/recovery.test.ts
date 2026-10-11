import { afterEach, expect, test, vi } from 'vitest';
import { FAULT_LIMIT, FAULT_WINDOW, guardFrame } from './recovery';
import { newState } from './state';
import type { Voyage } from './voyage';

const crash = () => { throw new Error('boom'); };
function playing() {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'fault');
  s.screen = 'playing';
  s.voyage = { notice: '', noticeTimer: 0 } as Voyage;
  return s;
}

test('a thrown frame restores the last save instead of freezing the loop', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const s = playing(), faults: number[] = [], restore = vi.fn();
  expect(guardFrame(s, faults, 0, () => {}, restore)).toBe(true);
  expect(guardFrame(s, faults, 1, crash, restore)).toBe(false);
  expect(restore).toHaveBeenCalledWith(s);
  expect(s.voyage!.notice).toContain('FAULT RECOVERED');
});

test('repeated faults or a failing restore fall back to the flight deck', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const s = playing(), faults: number[] = [];
  for (let i = 0; i < FAULT_LIMIT; i++) guardFrame(s, faults, i, crash, () => {});
  expect([s.screen, s.voyage]).toEqual(['menu', null]);
  const t = playing();
  guardFrame(t, [], 0, crash, crash);
  expect([t.screen, t.voyage]).toEqual(['menu', null]);
});


afterEach(() => vi.restoreAllMocks());

test('faults at the window boundary expire and permit recovery again', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const s = playing(), faults = [0, 1], restore = vi.fn();
  guardFrame(s, faults, FAULT_WINDOW, crash, restore);
  expect(faults).toEqual([1, FAULT_WINDOW]);
  expect(restore).toHaveBeenCalledOnce();
  expect(s.screen).toBe('playing');
});

test('menu faults return to a clean flight deck without attempting a restore', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const s = playing(), restore = vi.fn();
  s.voyage = null; s.cursor = 7; s.screen = 'settings';
  guardFrame(s, [], 0, crash, restore);
  expect(restore).not.toHaveBeenCalled();
  expect(s).toMatchObject({ screen: 'menu', cursor: 0, voyage: null, comms: null });
});

test('a successful frame does not restore or mutate fault history', () => {
  const s = playing(), faults = [1], restore = vi.fn();
  expect(guardFrame(s, faults, 2, () => { s.time = 42; }, restore)).toBe(true);
  expect(s.time).toBe(42);
  expect(faults).toEqual([1]);
  expect(restore).not.toHaveBeenCalled();
});
