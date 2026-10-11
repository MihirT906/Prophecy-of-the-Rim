import { expect, test } from 'vitest';
import { generateArena, inExit, isSolid, moveBody, openExit, tileAt } from './arena';
import { TILE } from './data';
import type { Arena, Body } from './state';

test('200 seeded arenas have reachable floors, four border spawns and a clear start', () => {
  for (let i = 0; i < 200; i++) {
    const a = generateArena(String(i), 1 + i % 8);
    expect(a).toEqual(generateArena(String(i), 1 + i % 8));
    const sx = Math.floor(a.start.x / TILE), sy = Math.floor(a.start.y / TILE);
    const reached = new Set([sy * a.w + sx]);
    const queue = [sy * a.w + sx];
    for (let j = 0; j < queue.length; j++) {
      const x = queue[j] % a.w, y = Math.floor(queue[j] / a.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const index = (y + dy) * a.w + x + dx;
        if (tileAt(a, x + dx, y + dy) === 0 && !reached.has(index)) {
          reached.add(index);
          queue.push(index);
        }
      }
    }
    expect(a.tiles.every((tile, index) => tile !== 0 || reached.has(index))).toBe(true);
    expect(a.spawns).toHaveLength(4);
    for (const p of a.spawns) {
      const x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE);
      expect(tileAt(a, x, y)).toBe(0);
      expect(x === 0 || y === 0 || x === a.w - 1 || y === a.h - 1).toBe(true);
    }
    const ex = Math.floor(a.exit.x / TILE), ey = Math.floor(a.exit.y / TILE);
    expect(tileAt(a, ex, ey)).toBe(2);
    expect(reached.has(ey * a.w + ex - 1)).toBe(true);
    // The fixed border is exactly three tiles left of the start.
    for (let y = sy - 3; y <= sy + 3; y++) {
      for (let x = sx - 3; x <= sx + 3; x++) {
        if (x > 0) expect(isSolid(a, x, y)).toBe(false);
      }
    }
  }
});

test('bodies stop at walls, slide along them, never tunnel and only enter an open exit', () => {
  const a: Arena = { w: 5, h: 5, tiles: new Uint8Array(25), start: { x: 48, y: 48 }, spawns: [], exit: { x: 112, y: 80 } };
  for (let y = 0; y < 5; y++) a.tiles[y * 5 + 3] = 1;
  const b: Body = { x: 80, y: 48, vx: 100, vy: 20, r: 12, hp: 1 };
  moveBody(a, b, 0.1);
  expect(b.x).toBe(3 * TILE - b.r);
  expect(b.y).toBe(50);
  expect(b.vx).toBe(0);
  expect(b.vy).toBe(20);
  // Far faster than a tile per tick still stops at the first wall.
  Object.assign(b, { x: 48, y: 48, vx: 5000, vy: 0 });
  moveBody(a, b, 0.1);
  expect(b.x).toBe(3 * TILE - b.r);
  a.tiles.fill(0);
  a.tiles[2 * 5 + 3] = 2;
  Object.assign(b, { x: 90, y: 80 });
  expect(inExit(a, b)).toBe(false);
  openExit(a);
  expect(tileAt(a, 3, 2)).toBe(3);
  expect(inExit(a, b)).toBe(true);
  expect(tileAt(a, -1, 0)).toBe(1);
});
