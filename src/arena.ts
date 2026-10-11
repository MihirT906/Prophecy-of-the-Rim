import type { Arena, Body } from './state';
import { ARENA_H, ARENA_W, TILE } from './data';
import { makeRng, randInt } from './rng';

export function generateArena(seed: string, n: number): Arena {
  const rng = makeRng(`${seed}:${n}`);
  const w = ARENA_W, h = ARENA_H, mid = Math.floor(h / 2);
  const tiles = new Uint8Array(w * h);
  const doors = [
    [0, randInt(rng, 2, h - 3)], [w - 1, randInt(rng, 2, h - 3)],
    [randInt(rng, 2, w - 3), 0], [randInt(rng, 2, w - 3), h - 1],
  ];
  while (Math.abs(doors[1][1] - mid) <= 2) doors[1][1] = randInt(rng, 2, h - 3);
  const a: Arena = {
    w, h, tiles, start: { x: 3.5 * TILE, y: (mid + 0.5) * TILE },
    spawns: doors.map(([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE })),
    exit: { x: (w - 0.5) * TILE, y: (mid + 0.5) * TILE },
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) tiles[y * w + x] = 1;
    }
  }
  for (const [x, y] of doors) tiles[y * w + x] = 0;
  tiles[mid * w + w - 1] = 2;

  const count = randInt(rng, 6, 12);
  for (let placed = 0; placed < count;) {
    const x = randInt(rng, 2, w - 3), y = randInt(rng, 2, h - 3);
    const length = rng() < 0.5 ? 1 : randInt(rng, 2, 5);
    const horizontal = rng() < 0.5;
    const cells: number[] = [];
    for (let j = 0; j < length; j++) {
      const tx = x + (horizontal ? j : 0), ty = y + (horizontal ? 0 : j);
      // Keep the inner perimeter connected so every door stays reachable.
      if (tx >= w - 2 || ty >= h - 2 || tiles[ty * w + tx] !== 0
        || (Math.abs(tx - 3) <= 3 && Math.abs(ty - mid) <= 3)
        || [...doors, [w - 1, mid]].some(([dx, dy]) => Math.abs(tx - dx) <= 2 && Math.abs(ty - dy) <= 2)) break;
      cells.push(ty * w + tx);
    }
    if (cells.length !== length) continue;
    for (const index of cells) tiles[index] = 1;
    placed++;
  }

  const reached = new Uint8Array(tiles.length);
  const queue = [mid * w + 3];
  reached[queue[0]] = 1;
  for (let i = 0; i < queue.length; i++) {
    const x = queue[i] % w, y = Math.floor(queue[i] / w);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const index = (y + dy) * w + x + dx;
      if (tileAt(a, x + dx, y + dy) === 0 && !reached[index]) {
        reached[index] = 1;
        queue.push(index);
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === 0 && !reached[i]) tiles[i] = 1;
  return a;
}
/** Out of bounds = 1. */
export function tileAt(a: Arena, tx: number, ty: number): number {
  return tx < 0 || ty < 0 || tx >= a.w || ty >= a.h ? 1 : a.tiles[ty * a.w + tx];
}
/** 1 or 2. */
export function isSolid(a: Arena, tx: number, ty: number): boolean {
  const tile = tileAt(a, tx, ty);
  return tile === 1 || tile === 2;
}
/** Integrate velocity, then slide. */
export function moveBody(a: Arena, b: Body, dt: number): void {
  slide(a, b, b.vx * dt, b.vy * dt);
}
/** Move by (dx, dy) per axis, x then y, stopping flush at the first solid tile so bodies slide along walls.
 * Velocity into a blocking wall is dropped. The body spans r on each side (a square against the grid, radius < TILE / 2). */
export function slide(a: Arena, b: Body, dx: number, dy: number): void {
  if (dx) { const x = sweep(a, b.x, b.y, b.r, dx, true); if (x !== b.x + dx && b.vx * dx > 0) b.vx = 0; b.x = x; }
  if (dy) { const y = sweep(a, b.y, b.x, b.r, dy, false); if (y !== b.y + dy && b.vy * dy > 0) b.vy = 0; b.y = y; }
}
/** New position along one axis. Checks every tile row/column the leading edge crosses, so no speed tunnels through a wall. */
function sweep(a: Arena, pos: number, side: number, r: number, d: number, horizontal: boolean): number {
  const lo = Math.floor((side - r) / TILE + 1e-6), hi = Math.floor((side + r) / TILE - 1e-6);  // tiles the body spans across
  const step = Math.sign(d);
  const from = d > 0 ? Math.ceil((pos + r) / TILE) : Math.floor((pos - r) / TILE) - 1;
  const to = d > 0 ? Math.ceil((pos + r + d) / TILE) - 1 : Math.floor((pos - r + d) / TILE);
  for (let t = from; d > 0 ? t <= to : t >= to; t += step) {
    for (let o = lo; o <= hi; o++) {
      if (horizontal ? isSolid(a, t, o) : isSolid(a, o, t)) return d > 0 ? t * TILE - r : (t + 1) * TILE + r;
    }
  }
  return pos + d;
}
/** Tile 2 -> 3. */
export function openExit(a: Arena): void {
  const index = Math.floor(a.exit.y / TILE) * a.w + Math.floor(a.exit.x / TILE);
  if (a.tiles[index] === 2) a.tiles[index] = 3;
}
export function inExit(a: Arena, b: Body): boolean {
  if (tileAt(a, Math.floor(a.exit.x / TILE), Math.floor(a.exit.y / TILE)) !== 3) return false;
  const dx = Math.max(Math.abs(b.x - a.exit.x) - TILE / 2, 0);
  const dy = Math.max(Math.abs(b.y - a.exit.y) - TILE / 2, 0);
  return dx * dx + dy * dy <= b.r * b.r;
}
