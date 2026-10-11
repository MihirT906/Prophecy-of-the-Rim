import { expect, test } from 'vitest';
import { TILE } from './data';
import { generateSystem, generateUniverse, moveMapSelection, nextInwardSector, oppositeEdge, OUTER_RING, RING_SIZES, routeBetween, SECTOR_COUNT, START_SECTOR } from './universe';

test('radial graphs are deterministic, reciprocal, connected, and always lead inward', () => {
  for (let seed = 0; seed < 100; seed++) {
    const u = generateUniverse(String(seed));
    expect(u).toEqual(generateUniverse(String(seed)));
    expect(u.sectors).toHaveLength(SECTOR_COUNT);
    for (let ring = 0; ring <= OUTER_RING; ring++) expect(u.sectors.filter(s => s.ring === ring)).toHaveLength(RING_SIZES[ring]);
    expect(u.sectors[START_SECTOR].ring).toBe(OUTER_RING);
    for (const sector of u.sectors) {
      expect(Math.hypot(sector.x, sector.y)).toBeCloseTo(sector.ring / OUTER_RING);
      expect(new Set(sector.neighbors).size).toBe(sector.neighbors.length);
      expect(sector.neighbors).not.toContain(sector.id);
      for (const id of sector.neighbors) {
        expect(u.sectors[id].neighbors).toContain(sector.id);
        expect(Math.abs(u.sectors[id].ring - sector.ring)).toBeLessThanOrEqual(1);
      }
      const route = routeBetween(u, sector.id, 0);
      expect(route[0]).toBe(sector.id); expect(route.at(-1)).toBe(0);
      let here = sector.id;
      while (u.sectors[here].ring > 0) {
        const next = nextInwardSector(u, here);
        expect(u.sectors[next].ring).toBe(u.sectors[here].ring - 1);
        here = next;
      }
      expect(here).toBe(0);
    }
  }
  expect(generateUniverse('one')).not.toEqual(generateUniverse('two'));
});

test('every boundary gate has a reciprocal endpoint and every objective is reachable by the ship', () => {
  for (let seed = 0; seed < 3; seed++) {
    const u = generateUniverse(`corridors-${seed}`);
    for (const sector of u.sectors) {
      const system = generateSystem(u, sector.id), a = system.arena;
      const cell = (p: { x: number; y: number }) => Math.floor(p.y / TILE) * a.w + Math.floor(p.x / TILE);
      expect(a.tiles.every(t => t === 0)).toBe(true);
      for (const p of [system.cache, system.dock, system.beacon, ...system.gates, ...system.gates.map(g => g.arrival)]) {
        expect(p.x).toBeGreaterThan(12); expect(p.y).toBeGreaterThan(12);
        expect(p.x).toBeLessThan(a.w * TILE - 12); expect(p.y).toBeLessThan(a.h * TILE - 12);
        for (const dx of [-12, 12]) for (const dy of [-12, 12]) expect(a.tiles[cell({ x: p.x + dx, y: p.y + dy })]).toBe(0);
      }
      for (const gate of system.gates) {
        const reverse = generateSystem(u, gate.to).gates.find(g => g.to === sector.id)!;
        expect(reverse.edge).toBe(oppositeEdge(gate.edge));
        expect(Math.min(gate.x, gate.y, a.w * TILE - gate.x, a.h * TILE - gate.y)).toBeLessThanOrEqual(90);
        expect(Math.hypot(gate.x - gate.arrival.x, gate.y - gate.arrival.y)).toBeGreaterThan(48);
      }
    }
  }
});

test('system generation is independent of travel order and map selection follows rings', () => {
  const u = generateUniverse('stable'), original = generateSystem(u, START_SECTOR);
  for (let id = u.sectors.length - 1; id >= 0; id--) generateSystem(u, id);
  expect(generateSystem(u, START_SECTOR)).toEqual(original);
  expect(generateSystem(generateUniverse('other'), START_SECTOR)).not.toEqual(original);
  expect(moveMapSelection(u, moveMapSelection(u, START_SECTOR, 'left'), 'right')).toBe(START_SECTOR);
  expect(u.sectors[moveMapSelection(u, START_SECTOR, 'in')].ring).toBe(OUTER_RING - 1);
  expect(moveMapSelection(u, 0, 'in')).toBe(0);
  expect(u.sectors[moveMapSelection(u, 0, 'out')].ring).toBe(1);
  expect(routeBetween(u, -1, 0)).toEqual([]);
});
