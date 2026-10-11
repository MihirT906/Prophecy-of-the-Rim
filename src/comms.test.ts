import { ENEMY_DENSITY } from './data';
import { expect, test } from 'vitest';
import { advanceDialogue, createComms, generateEntity, glyphDelay } from './comms';
import { newState } from './state';
import { startVoyage, updateVoyage, confirmComms, closeComms, updateComms } from './voyage';
import { generateSystem, generateUniverse, spiceContacts } from './universe';
import { validateContract } from './json-contract';
import content from './sector-content.json';
import schema from './sector-content.schema.json';

test('procedural transmissions and encounter sites are deterministic and obey danger tiers', () => {
  expect(createComms('one', 'Vesper', 'collect', null)).toEqual(createComms('one', 'Vesper', 'collect', null));
  expect(createComms('one', 'Vesper', 'collect', null)).not.toEqual(createComms('two', 'Vesper', 'collect', null));
  const universe = generateUniverse('horror');
  for (const sector of universe.sectors) {
    const system = generateSystem(universe, sector.id);
    expect(system.stations.length).toBeGreaterThan(0);
    expect(system.encounters).toHaveLength(sector.danger * ENEMY_DENSITY);
    for (const site of system.encounters) {
      const archetype = content.encounters.find(e => e.id === site.archetype)!;
      expect(archetype.minDanger).toBeLessThanOrEqual(sector.danger);
      expect(site.count).toBeGreaterThanOrEqual(archetype.countMin);
      expect(site.count).toBeLessThanOrEqual(archetype.countMax);
    }
    expect(system.encounters).toEqual(generateSystem(universe, sector.id).encounters);
    expect(spiceContacts(system, 0).some(c => c.kind === 'station')).toBe(true);
  }
  expect(() => validateContract({ ...content, hazards: [{ kind: 'typo' }] }, schema)).toThrow();
  expect(() => validateContract({ ...content, greetings: [] }, schema)).toThrow();
});

test('comms pauses flight, supports cancellation, and transfers exactly once on confirmation', () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'comms'); startVoyage(s, 'comms');
  const v = s.voyage!; v.jumpTimer = 0; Object.assign(s.player, v.system.cache);
  v.personalSpice = v.earnedSpice = 0;  // the transfer is traced from an empty wallet, without the launch stipend
  const hail = () => { s.input.pressed.push('KeyE'); updateVoyage(s, 1 / 60); };
  hail(); expect(s.screen).toBe('comms'); expect(v.cargo).toBeNull();
  const elapsed = v.elapsed; updateVoyage(s, 5); updateComms(s, 1);
  expect(v.elapsed).toBe(elapsed); expect(s.comms!.shown).toBe(1);
  closeComms(s); expect(v.cargo).toBeNull();
  hail(); confirmComms(s); expect(v.cargo?.remaining).toBe(8); expect(v.personalSpice).toBe(4);
  confirmComms(s); expect(s.screen).toBe('playing'); expect(v.collected).toBe(12);
});


test('contact identities span four reproducible morphologies and voice profiles', () => {
  const contacts = Array.from({ length: 80 }, (_, i) => generateEntity(`contact-${i}`));
  expect(new Set(contacts.map(c => c.kind)).size).toBe(4);
  expect(new Set(contacts.map(c => c.timbre)).size).toBe(8);
  expect(contacts).toEqual(Array.from({ length: 80 }, (_, i) => generateEntity(`contact-${i}`)));
});

test('dialogue reveals individual letters, pauses at punctuation and never bursts after a stall', () => {
  const c = createComms('timing', 'Contact', 'collect', null);
  c.text = 'Ah. Go!'; const heard: string[] = [];
  const tick = (dt: number) => advanceDialogue(c, dt, char => heard.push(char));
  tick(.016); expect(c.shown).toBe(1); expect(heard).toEqual(['A']);
  expect(glyphDelay(c, 2)).toBeGreaterThan(glyphDelay(c, 1) * 4);
  tick(10); expect(c.shown).toBe(2);
  for (let i = 0; i < 180; i++) tick(1 / 60);
  expect(c.shown).toBe(c.text.length); expect(heard.join('')).toBe('AhGo');
});
