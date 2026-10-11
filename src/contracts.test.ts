import { buyArms, openMarket } from './market';
import { beforeEach, expect, test } from 'vitest';
import { completionSpice, CONTRACT_SECONDS, DEFAULT_EMBARGO_SECONDS, deliveryOffer, ownedSpice, spendTransit, transitSpice } from './contracts';
import { buyWeapon } from './shop';
import { newState, type State, type Vec } from './state';
import { generateSystem, spiceContacts } from './universe';
import { captureVoyage, closeComms, confirmComms, consumeSpice, enterSector, expireContract, finishLane, objective, interactionAt, openDeparture, readVoyageSave, startVoyage, stealShipment, updateComms, updateVoyage } from './voyage';

beforeEach(() => Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {} } }));
// Contract accounting is checked from an empty wallet, without the launch stipend.
function fresh() { const s = newState({ held: new Set(), pressed: [], typed: [] }, 'contracts'); startVoyage(s, 'contracts'); s.voyage!.personalSpice = s.voyage!.earnedSpice = 0; return s; }
function hail(s: State, at: Vec = s.voyage!.system.cache) {
  Object.assign(s.player, at, { vx: 0, vy: 0 }); s.voyage!.jumpTimer = 0;
  s.input.pressed.push('KeyE'); updateVoyage(s, 0); expect(s.screen).toBe('comms');
}
function accept(s: State) { hail(s); confirmComms(s); closeComms(s); }
function deliver(s: State) {
  const v = s.voyage!, to = v.cargo!.destination;
  while (v.personalSpice && v.consumed < 4) consumeSpice(s);
  v.jumpTimer = 0; openDeparture(s, to); expect(enterSector(s, to)).toBe(true);
  Object.assign(s.player, v.lane!.course.exit); expect(finishLane(s)).toBe(true);
  hail(s, v.system.dock); confirmComms(s);
}
function ledger(s: State) { const v = s.voyage!; expect(v.collected + v.earnedSpice).toBe(v.sold + v.consumed + v.spent + v.armed + v.personalSpice + (v.cargo?.remaining ?? 0)); expect(readVoyageSave(captureVoyage(s))).not.toBeNull(); }

test('an offer discloses the receiver and split; acceptance pays the cut exactly once', () => {
  const s = fresh(), v = s.voyage!; hail(s);
  expect(s.comms!.details.join(' ')).toContain('YOUR CUT: 4 SPICE NOW');
  expect(v.collected).toBe(0); closeComms(s); expect(v.collected).toBe(0);
  accept(s); expect(ownedSpice(v)).toBe(4); expect(v.cargo?.contract).toMatchObject({ due: 5, fuel: 3, cut: 4 });
  accept(s); expect(v.collected).toBe(12); expect(ownedSpice(v)).toBe(4); ledger(s);
});

test('stations are receivers and do not silently create missions', () => {
  const s = fresh(); hail(s, s.voyage!.system.dock);
  expect(s.comms!.action).toBe('sell'); expect(s.comms!.blocked).toContain('No shipment');
  confirmComms(s); expect(s.voyage!.collected).toBe(0);
});

test('sealed cargo cannot be consumed, used in the armory or sold to a wrong receiver', () => {
  const s = fresh(), v = s.voyage!; accept(s);
  for (let i = 0; i < 4; i++) consumeSpice(s);
  expect(consumeSpice(s)).toBe(false); expect(v.cargo!.remaining).toBe(8);
  hail(s, v.system.dock); expect(interactionAt(s)?.blocked).toContain('Wrong receiver');
  const before = captureVoyage(s); confirmComms(s); expect(captureVoyage(s)).toEqual(before);
  closeComms(s); expect(buyWeapon(s, 'smg')).toBe(false);
  expect(v.cargo!.remaining).toBe(8); expect(v.reputation).toBe(60); ledger(s);
});

test('fuel funds passage without cutting into the delivery; excess spending fails atomically', () => {
  const s = fresh(), v = s.voyage!; accept(s);
  expect(transitSpice(v)).toBe(7);
  expect(spendTransit(v, 8)).toBe(false); expect(v.cargo!.remaining).toBe(8);
  expect(spendTransit(v, 3)).toBe(true); v.spent += 3;
  expect(v.cargo?.contract?.due).toBe(5); expect(v.cargo?.contract?.fuel).toBe(0);
  expect(v.personalSpice).toBe(4); ledger(s);
});

test('delivery pays the promised reward, restores trust and cannot be claimed twice', () => {
  const s = fresh(), v = s.voyage!; accept(s); const reward = v.cargo!.contract!.reward, credits = v.credits;
  deliver(s); expect(v.credits).toBe(credits + reward); expect(v.reputation).toBe(68); expect(v.deliveries).toBe(1);
  expect(v.cargo).toBeNull(); confirmComms(s); hail(s, v.system.dock); confirmComms(s);
  expect(v.credits).toBe(credits + reward); expect(v.reputation).toBe(68); ledger(s);
});

test('theft requires two X presses, persists its penalty and conserves ownership exactly once', () => {
  const s = fresh(), v = s.voyage!; accept(s); hail(s);
  s.input.pressed.push('KeyX'); updateComms(s, 0); expect(v.reputation).toBe(60); expect(s.comms!.theftArmed).toBe(true);
  closeComms(s); hail(s); expect(s.comms!.theftArmed).toBe(false);
  s.input.pressed.push('KeyX'); updateComms(s, 0); s.input.pressed.push('KeyX'); updateComms(s, 0);
  expect(v.reputation).toBe(35); expect(v.thefts).toBe(1); expect(v.personalSpice).toBe(12); expect(v.cargo).toBeNull();
  expect(stealShipment(s)).toBe(false); ledger(s);
  const next = fresh(); startVoyage(next, 'ignored', captureVoyage(s));
  expect(next.voyage).toMatchObject({ reputation: 35, thefts: 1, personalSpice: 12, cargo: null });
});

test('low trust reduces sender access and cut, favors the riskiest lateral route, and leaves recovery work', () => {
  const s = fresh(), v = s.voyage!, contacts = spiceContacts(v.system, 0).filter(c => c.kind !== 'station');
  const healthy = contacts.map(c => deliveryOffer(v, c.id));
  v.reputation = 10;
  const poor = contacts.map(c => deliveryOffer(v, c.id));
  expect(poor.filter(o => !o.blocked).length).toBeLessThan(healthy.filter(o => !o.blocked).length);
  const recovery = deliveryOffer(v, 'freighter'); expect(recovery.blocked).toBeNull(); expect(recovery.cut).toBeLessThan(healthy[0].cut);
  const source = v.universe.sectors[v.sectorId], target = v.universe.sectors[recovery.destination];
  expect(target.ring).toBe(source.ring);
  expect(target.danger).toBe(Math.max(...source.neighbors.filter(n => v.universe.sectors[n].ring === source.ring).map(n => v.universe.sectors[n].danger)));
  expect(deliveryOffer(v, contacts.at(-1)!.id)).toEqual(poor.at(-1));
  accept(s); deliver(s); expect(v.reputation).toBe(18); ledger(s);
});

test('save validation rejects invalid ownership and preserves legacy personal cargo', () => {
  const s = fresh(); accept(s); const save = captureVoyage(s)!;
  for (const change of [{ reputation: -1 }, { reputation: 101 }, { personalSpice: 900 }, { thefts: -1 }]) expect(readVoyageSave({ ...save, ...change })).toBeNull();
  expect(readVoyageSave({ ...save, cargo: { ...save.cargo, contract: { ...save.cargo!.contract, due: 99 } } })).toBeNull();
  const legacy = { ...save, version: 5, cargo: { ...save.cargo, remaining: 12, contract: undefined } };
  const migrated = readVoyageSave(legacy)!;
  expect(migrated.version).toBe(7); expect(migrated.personalSpice).toBe(0); expect(migrated.reputation).toBe(60);
  expect(migrated.cargo?.contract).toBeUndefined();
});


test('honest repeat deliveries earn more spice than repeatedly stealing the same number of jobs', () => {
  const honest = fresh(), thief = fresh();
  const pays: number[] = [];
  for (let i = 0; i < 6; i++) {
    const h = honest.voyage!, t = thief.voyage!;
    h.stockReadyAt[h.sectorId] = 0; t.stockReadyAt[t.sectorId] = 0;
    accept(honest); pays.push(h.cargo!.contract!.cut + h.cargo!.contract!.bonus);
    // Focus on actual hand-in settlement; travel/ledger are separately exercised above.
    h.sectorId = h.cargo!.destination;
    h.system = generateSystem(h.universe, h.sectorId);
    hail(honest, h.system.dock); confirmComms(honest); closeComms(honest);
    accept(thief); hail(thief); expect(stealShipment(thief)).toBe(true); closeComms(thief);
    expect(deliveryOffer(t, 'freighter').blocked).toContain('suspended');
    updateVoyage(thief, DEFAULT_EMBARGO_SECONDS);
    ledger(honest); ledger(thief);
  }
  expect(pays).toEqual([12, 12, 21, 21, 29, 29]);
  expect(honest.voyage!.personalSpice).toBe(124);
  expect(thief.voyage!.personalSpice).toBe(72);
  expect(honest.voyage!.reputation).toBe(100); expect(thief.voyage!.reputation).toBe(0);
  expect(completionSpice(100)).toBeGreaterThan(completionSpice(60));
});

test('deadline expires exactly once, cancels payout and counts as theft at the boundary', () => {
  const s = fresh(), v = s.voyage!; accept(s);
  const due = v.cargo!.contract!.deadline;
  updateVoyage(s, CONTRACT_SECONDS - .001); expect(v.cargo).not.toBeNull();
  updateVoyage(s, .001); expect(v.elapsed).toBeCloseTo(due);
  expect(v.cargo).toBeNull(); expect(v.earnedSpice).toBe(0); expect(v.deliveries).toBe(0);
  expect(v.reputation).toBe(35); expect(v.thefts).toBe(1); expect(v.personalSpice).toBe(12);
  expect(v.notice).toContain('DEADLINE EXPIRED'); expect(objective(s)?.label).toContain('SUSPENDED');
  expect(expireContract(s)).toBe(false); updateVoyage(s, 1); expect(v.thefts).toBe(1); ledger(s);
  const saved = captureVoyage(s)!; const resumed = fresh(); startVoyage(resumed, 'ignored', saved);
  expect(resumed.voyage!.embargoUntil).toBe(v.embargoUntil); expect(resumed.voyage!.thefts).toBe(1);
  expect(deliveryOffer(resumed.voyage!, 'freighter').blocked).toContain('suspended');
  updateVoyage(resumed, DEFAULT_EMBARGO_SECONDS); expect(deliveryOffer(resumed.voyage!, 'freighter').blocked).toBeNull();
});

test('deadline runs during FTL, pauses in menus, and neither reload nor late hand-in can reset it', () => {
  const s = fresh(), v = s.voyage!; accept(s); const deadline = v.cargo!.contract!.deadline;
  for (const screen of ['comms', 'map', 'paused', 'shop', 'market'] as const) { s.screen = screen; updateVoyage(s, 1000); }
  expect(v.elapsed).toBeLessThan(deadline); s.screen = 'playing';
  for (let i = 0; i < 4; i++) consumeSpice(s);
  openDeparture(s, v.cargo!.destination); expect(enterSector(s, v.cargo!.destination)).toBe(true);
  updateVoyage(s, 70); const save = captureVoyage(s)!;
  const resumed = fresh(); startVoyage(resumed, 'ignored', save);
  expect(resumed.voyage!.cargo!.contract!.deadline).toBe(deadline);
  updateVoyage(resumed, deadline - resumed.voyage!.elapsed);
  expect(resumed.voyage!.cargo).toBeNull(); expect(resumed.voyage!.thefts).toBe(1); ledger(resumed);
  // Exact-deadline hand-in is a default even if the ship is already at the receiver.
  const late = fresh(); accept(late); const lv = late.voyage!;
  lv.sectorId = lv.cargo!.destination; lv.system = generateSystem(lv.universe, lv.sectorId);
  hail(late, lv.system.dock); lv.elapsed = lv.cargo!.contract!.deadline;
  confirmComms(late); expect(lv.deliveries).toBe(0); expect(lv.thefts).toBe(1); expect(late.comms!.text).toContain('deadline');
  confirmComms(late); expect(lv.thefts).toBe(1); ledger(late);
});

test('expired active saves settle on load and old contracts migrate with an honest grace period', () => {
  const s = fresh(); accept(s); const save = captureVoyage(s)!;
  const resumed = fresh(); startVoyage(resumed, 'ignored', { ...save, elapsed: save.cargo!.contract!.deadline });
  expect(resumed.voyage!.cargo).toBeNull(); expect(resumed.voyage!.thefts).toBe(1);
  const old = readVoyageSave({ ...save, version: 6, cargo: { ...save.cargo, contract: { ...save.cargo!.contract, deadline: undefined, bonus: undefined } } })!;
  expect(old.cargo!.contract!.deadline).toBe(old.elapsed + CONTRACT_SECONDS); expect(old.cargo!.contract!.bonus).toBe(0);
  for (const change of [{ deadline: NaN }, { deadline: -1 }, { bonus: 25 }, { bonus: -1 }]) {
    expect(readVoyageSave({ ...save, cargo: { ...save.cargo, contract: { ...save.cargo!.contract, ...change } } })).toBeNull();
  }
  expect(readVoyageSave({ ...save, earnedSpice: 10 })).toBeNull();
});


test('team armory spends personal spice while preserving sealed cargo and both save systems', () => {
  const s = fresh(), v = s.voyage!; accept(s);
  Object.assign(s.player, v.system.dock); expect(openMarket(s)).toBe(true);
  const cargo = structuredClone(v.cargo);
  expect(buyArms(s, 0)).toBe(true); expect(v.personalSpice).toBe(3); expect(v.armed).toBe(1);
  expect(v.cargo).toEqual(cargo); ledger(s);
  const resumed = fresh(); startVoyage(resumed, 'ignored', captureVoyage(s));
  expect(resumed.voyage!.arsenal).toEqual(v.arsenal); expect(resumed.voyage!.cargo).toEqual(cargo);
  expect(resumed.voyage!.personalSpice).toBe(3); ledger(resumed);
});
