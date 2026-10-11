import { expect, test } from 'vitest';
import { spawnBullet, updateBullets } from './bullets';
import { hitLivingWorld, updatePlanetHazards, WORLD_HP } from './planet-hazards';
import { newState } from './state';
import { celestialPosition, generateSystem, generateUniverse, spiceContacts } from './universe';
import { captureVoyage, startVoyage } from './voyage';

function setup(kind: 'safe' | 'radiation' | 'storm' | 'ocean' | 'mimic') {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'hazards');
  startVoyage(s, 'hazards');
  const v = s.voyage!, p = v.system.planets[0]; p.kind = kind;
  const at = celestialPosition(v.system, p, v.elapsed);
  Object.assign(s.player, { x: at.x + p.radius + 80, y: at.y });
  return { s, v, p, at, key: `${v.sectorId}:0` };
}
test('seeded worlds include all five types and guarantee a safe first port', () => {
  const u = generateUniverse('ecology'), kinds = new Set();
  for (const sector of u.sectors) {
    const system = generateSystem(u, sector.id);
    expect(system).toEqual(generateSystem(u, sector.id));
    expect(system.planets[0].kind).toBe('safe');
    system.planets.forEach(p => kinds.add(p.kind));
    for (const [i, p] of system.planets.entries()) expect(spiceContacts(system, 0).some(c => c.id === `port-${i}`)).toBe(!['ocean', 'mimic'].includes(p.kind));
  }
  expect(kinds.size).toBe(5);
});
test('safe worlds do not damage; radiation respects invulnerability and range', () => {
  const { s, p } = setup('safe'), hp = s.player.hp;
  updatePlanetHazards(s, 1 / 60); expect(s.player.hp).toBe(hp);
  p.kind = 'radiation'; updatePlanetHazards(s, 1 / 60); expect(s.player.hp).toBe(hp - .5);
  updatePlanetHazards(s, 1 / 60); expect(s.player.hp).toBe(hp - .5);
  s.player.iframes = 0; s.player.x = -10000;
  updatePlanetHazards(s, 1 / 60); expect(s.player.hp).toBe(hp - .5);
});
test('ocean awakens with a warning interval before firing and storm shears velocity', () => {
  const { s, v, key } = setup('ocean');
  updatePlanetHazards(s, .1); expect(v.worlds[key].awake).toBe(true); expect(s.bullets).toHaveLength(0);
  for (let i = 0; i < 50; i++) updatePlanetHazards(s, .1);
  expect(s.bullets).toHaveLength(12);
  const storm = setup('storm'); updatePlanetHazards(storm.s, .1); expect(storm.s.player.vy).toBeGreaterThan(0);
});
test('swept shots hit bosses, defeat pays once, and save restores defeated state', () => {
  const { s, v, p, at, key } = setup('mimic');
  spawnBullet(s, { x: at.x + p.radius + 40, y: at.y }, { x: -1, y: 0 }, 1000, WORLD_HP, 0, 2, 'player', '#fff');
  const bullet = s.bullets[0], credits = v.credits;
  updateBullets(s, .1);
  expect(v.worlds[key].hp).toBe(0); expect(v.credits).toBe(credits + 30); expect(s.bullets).toHaveLength(0);
  hitLivingWorld(s, bullet); expect(v.credits).toBe(credits + 30);
  const save = captureVoyage(s)!; startVoyage(s, 'ignored', save);
  expect(s.voyage!.worlds[key].hp).toBe(0); expect(s.voyage!.credits).toBe(credits + 30);
});
