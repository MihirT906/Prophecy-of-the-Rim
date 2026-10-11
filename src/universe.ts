import { DEFAULT_GALAXY, type GalaxyCatalog, type SystemProfile } from './galaxy/catalog';
import { shortestPath } from './galaxy/graph';
import { SECTOR_CONTENT } from './sector-content';
import { SECTOR_CONFIG } from './sector-config';
import { ENEMY_DENSITY, TILE } from './data';
import { makeRng } from './rng';
import type { Arena, Vec } from './state';

/** All race tuning is here. Ring 0 is the center; ring 4 is the starting rim. */
export const RING_SIZES = [1, 5, 8, 11, 14] as const;
export const OUTER_RING = RING_SIZES.length - 1;
export const SECTOR_COUNT = RING_SIZES.reduce((a, b) => a + b, 0);
export const START_SECTOR = SECTOR_COUNT - RING_SIZES[OUTER_RING];
export const PRESCIENCE_REQUIRED = [12, 12, 8, 4, 0] as const;
export const INWARD_FARE = [4, 4, 3, 3, 0] as const;
export const TRANSCENDENCE_DOSES = 16, LOT_SIZE = 12, RESTOCK_SECONDS = 15;
// A new run launches with a personal stipend: enough for the first inward jump (4 doses + 3 fare) or a few same-ring hops.
export const STARTING_CREDITS = 6, STARTING_SPICE = 8, SYSTEM_W = SECTOR_CONFIG.width, SYSTEM_H = SECTOR_CONFIG.height;
export const UNIVERSE_VERSION = 2;
export type Edge = 'north' | 'east' | 'south' | 'west';
export interface Sector { key: string; profile: SystemProfile; id: number; name: string; ring: number; angle: number; x: number; y: number; neighbors: number[]; danger: number }
export interface Universe { catalog: GalaxyCatalog; seed: string; sectors: Sector[] }
export interface Gate extends Vec { to: number; edge: Edge; arrival: Vec }
export interface Station extends Vec { id: string; name: string; radius: number; services: ('trade' | 'spice')[] }
export interface EncounterSite extends Vec { archetype: string; role: string; count: number; seed: string; triggerRadius: number }
export interface HazardSite extends Vec { kind: string; radius: number; strength: number }
export type PlanetKind = 'safe' | 'radiation' | 'storm' | 'ocean' | 'mimic';
export interface Planet extends Vec { name: string; radius: number; orbit: number; phase: number; period: number; kind: PlanetKind }
export interface SolarSystem {
  stations: Station[]; encounters: EncounterSite[]; hazards: HazardSite[];
  sectorId: number; arena: Arena; gates: Gate[]; cache: Vec; dock: Vec; beacon: Vec;
  star: Vec & { radius: number }; planets: Planet[];
  debris: (Vec & { radius: number; phase: number; drift: number })[];
}
const OPPOSITE: Record<Edge, Edge> = { north: 'south', south: 'north', east: 'west', west: 'east' };
export const oppositeEdge = (edge: Edge): Edge => OPPOSITE[edge];

/** A passage chart, not a claim about canonical Dune star locations. Every node has an inward path. */
export function generateUniverse(seed: string, catalog: GalaxyCatalog = DEFAULT_GALAXY): Universe {
  const nodes = [...catalog.graph.nodes.values()], indices = new Map(nodes.map((n, i) => [n.id, i]));
  const sectors: Sector[] = nodes.map((node, id) => {
    const definition = catalog.systems.get(node.id)!, radius = definition.ring / OUTER_RING;
    const angle = definition.angle + (makeRng(`${seed}:${node.id}:chart`)() - .5) * .025;
    return { id, key: node.id, profile: catalog.systemProfiles[definition.content], ring: definition.ring,
      angle, name: node.label, danger: definition.danger, x: Math.cos(angle) * radius, y: Math.sin(angle) * radius,
      neighbors: catalog.graph.adjacency.get(node.id)!.map(key => indices.get(key)!).sort((a, b) => a - b) };
  });
  return { seed, sectors, catalog };
}

function distance(a: Vec, b: Vec): number { return (a.x - b.x) ** 2 + (a.y - b.y) ** 2; }
export function nextInwardSector(u: Universe, from: number): number {
  const s = u.sectors[from];
  return s.neighbors.filter(id => u.sectors[id].ring < s.ring).sort((a, b) => distance(s, u.sectors[a]) - distance(s, u.sectors[b]))[0] ?? s.neighbors[0] ?? 0;
}

export function moveMapSelection(u: Universe, id: number, direction: 'left' | 'right' | 'in' | 'out'): number {
  const selected = u.sectors[id];
  if (direction === 'in') return selected.ring ? nextInwardSector(u, id) : id;
  if (direction === 'out') return selected.neighbors.filter(n => u.sectors[n].ring > selected.ring)
    .sort((a, b) => distance(selected, u.sectors[a]) - distance(selected, u.sectors[b]))[0] ?? id;
  const ring = u.sectors.filter(s => s.ring === selected.ring).map(s => s.id), index = ring.indexOf(id);
  return ring[(index + (direction === 'right' ? 1 : ring.length - 1)) % ring.length];
}

/** Routes prefer inward progress when hop counts are equal; lateral and outward travel remain possible. */
export function routeBetween(u: Universe, from: number, to: number): number[] {
  if (!u.sectors[from] || !u.sectors[to]) return [];
  const indices = new Map(u.sectors.map(s => [s.key, s.id]));
  return shortestPath(u.catalog.graph, u.sectors[from].key, u.sectors[to].key,
    (a, b) => u.sectors[indices.get(a)!].ring - u.sectors[indices.get(b)!].ring).map(key => indices.get(key)!);
}

export function gateEdge(u: Universe, from: number, to: number): Edge {
  const a = u.sectors[from], b = u.sectors[to], dx = b.x - a.x, dy = b.y - a.y;
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'east' : 'west' : dy > 0 ? 'south' : 'north';
}

/** Spread same-edge gates to avoid overlapping interactions, preserving reciprocal bearings. */
export function sectorGates(u: Universe, sectorId: number): Gate[] {
  const width = SYSTEM_W * TILE, height = SYSTEM_H * TILE;
  const grouped: Record<Edge, number[]> = { north: [], east: [], south: [], west: [] };
  for (const to of u.sectors[sectorId].neighbors) grouped[gateEdge(u, sectorId, to)].push(to);
  return (Object.keys(grouped) as Edge[]).flatMap(edge => grouped[edge].map((to, index, all) => {
    const fraction = .12 + .76 * (index + 1) / (all.length + 1);
    const x = edge === 'west' ? 66 : edge === 'east' ? width - 66 : width * fraction;
    const y = edge === 'north' ? 90 : edge === 'south' ? height - 90 : height * fraction;
    return { to, edge, x, y, arrival: { x: x + (edge === 'west' ? 94 : edge === 'east' ? -94 : 0),
      y: y + (edge === 'north' ? 94 : edge === 'south' ? -94 : 0) } };
  }));
}

/** Gray-box system: background celestial landmarks, solid asteroid tiles, and guaranteed flight corridors. */
export function generateSystem(u: Universe, sectorId: number): SolarSystem {
  if (!u.sectors[sectorId]) throw new Error(`Unknown sector ${sectorId}`);
  const profile = u.sectors[sectorId].profile;
  const rng = makeRng(`${u.seed}:system-${UNIVERSE_VERSION}:${sectorId}`);
  const width = SYSTEM_W * TILE, height = SYSTEM_H * TILE, gates = sectorGates(u, sectorId);
  const cache = { x: 720, y: height / 2 };
  const dock = { x: width * (.4 + rng() * .2), y: height * (.3 + rng() * .4) };
  const start = { x: 300, y: height / 2 }, beacon = { x: width / 2, y: height / 2 };
  if (Math.hypot(dock.x - beacon.x, dock.y - beacon.y) < 700) dock.x += 900;
  // Empty collision grid preserves the combat API. Moving debris uses circle collisions.
  const tiles = new Uint8Array(SYSTEM_W * SYSTEM_H);
  const star = { x: width / 2, y: height / 2, radius: 140 };
  const planets: Planet[] = Array.from({ length: profile.planets }, (_, i) => {
    const phase = rng() * Math.PI * 2, orbit = Math.min(width, height) * (.14 + i * .065);
    const roll = makeRng(`${u.seed}:planet-nature:${sectorId}:${i}`)();
    const kind: PlanetKind = i === 0 ? 'safe' : roll < .4 ? 'safe' : roll < .62 ? 'radiation' : roll < .82 ? 'storm' : roll < .92 ? 'ocean' : 'mimic';
    return { kind, x: star.x + Math.cos(phase) * orbit, y: star.y + Math.sin(phase) * orbit,
      name: SECTOR_CONTENT.planetNames[i % SECTOR_CONTENT.planetNames.length], radius: (45 + rng() * 40) * (kind === 'ocean' || kind === 'mimic' ? 2.6 : 1), phase, orbit, period: SECTOR_CONFIG.orbitSeconds * (1 + i * .3) };
  });
  const danger = u.sectors[sectorId].danger;
  const debris = Array.from({ length: Math.round(SECTOR_CONFIG.asteroids * danger / 3 * profile.debrisMultiplier) }, () => ({
    x: 400 + rng() * (width - 800), y: 400 + rng() * (height - 800),
    radius: 18 + rng() * 32, phase: rng() * Math.PI * 2, drift: 4 + danger * 2,
  })).filter(b => [cache, dock, beacon, start].every(at => Math.hypot(b.x - at.x, b.y - at.y) > 350));
  const contentRng = makeRng(`${u.seed}:content:${sectorId}`);
  const stations: Station[] = Array.from({ length: profile.stations }, (_, i) => ({ x: dock.x, y: Math.min(height - 300, dock.y + i * 380), id: i ? `exchange-${i}` : 'exchange', name: SECTOR_CONTENT.stationNames[Math.floor(contentRng() * SECTOR_CONTENT.stationNames.length)], radius: 48, services: ['trade', 'spice'] }));
  const eligible = SECTOR_CONTENT.encounters.filter(e => e.minDanger <= danger && profile.encounterWeights[e.id]).map(e => ({ ...e, weight: profile.encounterWeights[e.id] }));
  const encounters: EncounterSite[] = Array.from({ length: Math.round(danger * profile.encounterMultiplier * ENEMY_DENSITY) }, (_, i) => {
    let roll = contentRng() * eligible.reduce((sum, e) => sum + e.weight, 0);
    const e = eligible.find(e => (roll -= e.weight) < 0) ?? eligible[0];
    return { archetype: e.id, role: e.role, count: e.countMin + Math.floor(contentRng() * (e.countMax - e.countMin + 1)),
      seed: `${u.seed}:${sectorId}:encounter:${i}`, triggerRadius: 900, x: width * (.15 + contentRng() * .7), y: height * (.15 + contentRng() * .7) };
  });
  const hazards: HazardSite[] = SECTOR_CONTENT.hazards.filter(h => h.minDanger <= danger && profile.hazards.includes(h.kind)).map(h => ({ ...h,
    x: width * (.2 + contentRng() * .6), y: height * (.2 + contentRng() * .6) }));
  return { stations, encounters, hazards, sectorId, gates, cache, dock, beacon, star, planets, debris,
    arena: { w: SYSTEM_W, h: SYSTEM_H, tiles, start, spawns: gates.map(g => ({ ...g.arrival })), exit: gates[0] ?? dock } };
}

export function celestialPosition(system: SolarSystem, planet: SolarSystem['planets'][number], time: number): Vec {
  const angle = planet.phase + time / planet.period * Math.PI * 2;
  return { x: system.star.x + Math.cos(angle) * planet.orbit, y: system.star.y + Math.sin(angle) * planet.orbit };
}
export function debrisPosition(body: SolarSystem['debris'][number], time: number): Vec {
  return { x: body.x + Math.sin(body.phase + time * body.drift / 200) * 160,
    y: body.y + Math.cos(body.phase + time * body.drift / 200) * 160 };
}

export interface SpiceContact extends Vec { id: string; name: string; kind: 'planet' | 'ship' | 'station'; radius: number }
/** Planet ports and waiting smugglers share the sector's shipment supply. */
export function spiceContacts(system: SolarSystem, time: number): SpiceContact[] {
  return [
    ...system.stations.map((station): SpiceContact => ({ ...station, kind: 'station' })),
    { ...system.cache, id: 'freighter', name: 'Smuggler freighter', kind: 'ship', radius: 28 },
    ...system.gates.map((g, i): SpiceContact => ({
      x: g.arrival.x + (g.edge === 'west' ? 400 : g.edge === 'east' ? -400 : 0),
      y: g.arrival.y + (g.edge === 'north' ? 400 : g.edge === 'south' ? -400 : 0),
      id: `courier-${i}`, name: `Spice courier ${i + 1}`, kind: 'ship', radius: 22,
    })),
    ...system.planets.flatMap((planet, i): SpiceContact[] => planet.kind === 'ocean' || planet.kind === 'mimic' ? [] : [({ ...celestialPosition(system, planet, time),
      id: `port-${i}`, name: `${planet.name} / smuggler port`, kind: 'planet', radius: planet.radius })]),
  ];
}
