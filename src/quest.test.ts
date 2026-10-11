import { beforeEach, expect, test } from 'vitest';
import { newState } from './state';
import { deliveryQuest } from './quest';
import { closeComms, confirmComms, consumeSpice, enterSector, finishLane, objective, openDeparture, startVoyage, updateVoyage } from './voyage';

beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));
test('delivery guidance survives manual plotting, follows FTL, identifies the receiver and clears on hand-in', () => {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'contracts'); startVoyage(s, 'contracts');
  const v = s.voyage!;
  expect(deliveryQuest(v)).toBeNull();
  Object.assign(s.player, v.system.cache, { vx: 0, vy: 0 }); v.jumpTimer = 0;
  s.input.pressed.push('KeyE'); updateVoyage(s, 0); confirmComms(s); closeComms(s);
  const to = v.cargo!.destination;
  v.navTarget = v.sectorId;
  const gate = v.system.gates.find(g => g.to === to)!;
  expect(deliveryQuest(v)).toMatchObject({ stage: 'depart', system: v.universe.sectors[to].name, at: gate });
  expect(objective(s)!.at).toEqual(gate);
  for (let i = 0; i < 4; i++) consumeSpice(s);
  openDeparture(s, to); expect(enterSector(s, to)).toBe(true);
  expect(deliveryQuest(v)).toMatchObject({ stage: 'transit', at: v.lane!.course.exit });
  Object.assign(s.player, v.lane!.course.exit); expect(finishLane(s)).toBe(true);
  const receiver = v.system.stations.find(st => st.id === v.cargo!.contract!.recipient)!;
  expect(deliveryQuest(v)).toMatchObject({ stage: 'deliver', station: receiver.name, at: receiver });
  Object.assign(s.player, receiver, { vx: 0, vy: 0 }); v.jumpTimer = 0;
  s.input.pressed.push('KeyE'); updateVoyage(s, 0); confirmComms(s);
  expect(v.deliveries).toBe(1); expect(deliveryQuest(v)).toBeNull();
});
