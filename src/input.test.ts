import { expect, test } from 'vitest';
import { aimVector, installInput, moveVector, takePress, type Input } from './input';

const mk = (held: string[] = [], pressed: string[] = []): Input => ({ held: new Set(held), pressed, typed: [] });

test('losing focus discards queued actions and text as well as held thrust', () => {
  const win = new EventTarget();
  const input = installInput(win as unknown as Window);
  const key = new Event('keydown');
  Object.assign(key, { code: 'KeyW', key: 'w', repeat: false });
  win.dispatchEvent(key);
  expect(moveVector(input).y).toBe(-1);
  expect(input.typed).toEqual(['w']);
  win.dispatchEvent(new Event('blur'));
  expect(moveVector(input)).toEqual({ x: 0, y: 0 });
  expect(input.typed).toEqual([]);
  expect(takePress(input, 'KeyW')).toBe(false);
  win.dispatchEvent(key);
  expect(takePress(input, 'KeyW')).toBe(true);
});

test('diagonal move is unit length', () => {
  const v = moveVector(mk(['KeyW', 'KeyD']));
  expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
  expect(v.x > 0 && v.y < 0).toBe(true);
});

test('aim with nothing held is zero', () => {
  expect(aimVector(mk())).toEqual({ x: 0, y: 0 });
});

test('an aim tap released before the update still aims', () => {
  expect(aimVector(mk([], ['ArrowUp']))).toEqual({ x: 0, y: -1 });
});

test('takePress consumes once', () => {
  const i = mk([], ['Enter']);
  expect(takePress(i, 'Enter', 'Space')).toBe(true);
  expect(takePress(i, 'Enter')).toBe(false);
});
