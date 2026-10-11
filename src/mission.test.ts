import { beforeEach, expect, test } from 'vitest';
import { mission } from './mission';
import { wrap } from './mission-render';
import { deliveryReceiver } from './contracts';
import { applySave, createSave } from './save';
import { newState, type State, type Vec } from './state';
import { generateSystem, STARTING_SPICE, TRANSCENDENCE_DOSES } from './universe';
import { closeComms, confirmComms, consumeSpice, enterSector, finishLane, openDeparture, startVoyage, updateVoyage } from './voyage';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, { localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); },
  } });
});
function fresh(seed = 'mission'): State {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, seed);
  applySave(s, createSave('Pilot')); startVoyage(s, seed); s.voyage!.jumpTimer = 0; s.enemies = [];
  return s;
}
function at(s: State, p: Vec): void { Object.assign(s.player, { x: p.x, y: p.y, vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0; }
function interact(s: State, p: Vec): void { at(s, p); s.input.pressed.push('KeyE'); updateVoyage(s, 1 / 60); if (s.screen === 'comms') { confirmComms(s); closeComms(s); } }

test('a leg walks through accept, dose, gate, course and hand in, each naming where to go', () => {
  const s = fresh(), v = s.voyage!;
  let m = mission(s)!;
  expect(m.step).toBe(1); expect(m.title).toContain('ACCEPT'); expect(m.at).not.toBeNull(); expect(m.detail).toContain('press E');
  interact(s, v.system.cache);
  expect(v.cargo?.contract).toBeDefined(); expect(v.personalSpice).toBe(STARTING_SPICE + 4);
  m = mission(s)!;
  expect(m.step).toBe(2); expect(m.title).toBe('DOSE 4 TIMES (C)'); expect(m.detail).toContain(`${STARTING_SPICE + 4} personal spice`); expect(m.next).toContain('gate');
  consumeSpice(s);
  expect(mission(s)!.title).toBe('DOSE 3 TIMES (C)');
  for (let i = 0; i < 3; i++) consumeSpice(s);
  m = mission(s)!;
  const to = v.cargo!.destination, gate = v.system.gates.find(g => g.to === to)!;
  expect(m.step).toBe(3); expect(m.at).toBe(gate); expect(m.title).toContain(v.universe.sectors[to].name.toUpperCase()); expect(m.detail).toContain('reserved fuel');
  at(s, gate); openDeparture(s, to); expect(enterSector(s, to)).toBe(true);
  m = mission(s)!;
  expect(m.step).toBe(4); expect(m.at).toEqual(v.lane!.course.exit); expect(m.title).toContain('FTL');
  Object.assign(s.player, v.lane!.course.exit); expect(finishLane(s)).toBe(true);
  m = mission(s)!;
  const receiver = deliveryReceiver(v.universe, to, v.cargo!.contract!.recipient);
  expect(m.step).toBe(5); expect(m.title).toBe('HAND IN THE DELIVERY'); expect(m.detail).toContain(receiver.name);
  expect(m.at).toEqual(v.system.stations.find(st => st.id === receiver.id));
  interact(s, m.at!);
  expect(v.cargo).toBeNull(); expect(mission(s)!.step).toBe(1);
});

test('spending the cut before dosing is called out instead of pointing at a locked gate silently', () => {
  const s = fresh(), v = s.voyage!;
  interact(s, v.system.cache);
  v.personalSpice = 1;
  const m = mission(s)!;
  expect(m.step).toBe(2); expect(m.title).toBe('NOT ENOUGH PERSONAL SPICE'); expect(m.detail).toContain('1 owned, 4 doses');
});

test('the center asks for the remaining doses, then the beacon', () => {
  const s = fresh(), v = s.voyage!;
  interact(s, v.system.cache);
  v.sectorId = 0; v.navTarget = 0; v.consumed = TRANSCENDENCE_DOSES - 2;
  let m = mission(s)!;
  expect(m.step).toBe(2); expect(m.title).toBe('DOSE 2 MORE TIMES (C)'); expect(m.at).toBe(v.system.beacon);
  v.consumed = TRANSCENDENCE_DOSES;
  m = mission(s)!;
  expect(m.step).toBe(6); expect(m.title).toContain('TRANSCEND'); expect(m.at).toBe(v.system.beacon);
  v.status = 'won';
  expect(mission(s)).toBeNull();
});

test('panel rows wrap to the width and never overflow', () => {
  expect(wrap('one two three four', 9, 3)).toEqual(['one two', 'three', 'four']);
  expect(wrap('one two three four five six', 9, 2)).toEqual(['one two', 'three fo…']);
  expect(wrap('short', 20, 2)).toEqual(['short']);
});


test('final delivery points at its receiver before offering the center beacon', () => {
  const s = fresh(), v = s.voyage!;
  interact(s, v.system.cache);
  v.sectorId = 0; v.system = generateSystem(v.universe, 0);
  v.cargo!.destination = 0; v.cargo!.contract!.recipient = v.system.stations[0].id;
  v.consumed = TRANSCENDENCE_DOSES;
  expect(mission(s)!.step).toBe(5);
  expect(mission(s)!.at).toEqual(v.system.stations[0]);
  interact(s, mission(s)!.at!);
  expect(v.cargo).toBeNull(); expect(mission(s)!.step).toBe(6);
});

test('center arrival with enough personal spice points to dosing without an unnecessary contract', () => {
  const s = fresh(), v = s.voyage!;
  v.sectorId = 0; v.system = generateSystem(v.universe, 0); v.consumed = 14;
  expect(mission(s)!.step).toBe(2); expect(mission(s)!.at).toEqual(v.system.beacon);
  consumeSpice(s); consumeSpice(s);
  expect(mission(s)!.step).toBe(6);
});

test('contract cooldown guidance names the waiting condition and an actual source', () => {
  const s = fresh(), v = s.voyage!;
  for (const reason of ['restock', 'embargo']) {
    v.stockReadyAt[v.sectorId] = reason === 'restock' ? v.elapsed + 45 : 0;
    v.embargoUntil = reason === 'embargo' ? v.elapsed + 90 : 0;
    const m = mission(s)!;
    expect(m.title).toContain('WAIT'); expect(m.detail).toContain('flight time');
    expect(m.at).not.toBeNull(); expect(m.next).toContain('contract');
  }
});
