import { beforeEach, expect, test } from 'vitest';
import { ARMS, MARKET, RARITIES, type ArmsId } from './data';
import { armsPrice, buyArms, closeMarket, marketKey, marketStock, openMarket, updateMarket } from './market';
import { applySave, createSave, loadSave } from './save';
import { newState, type State } from './state';
import { LOT_SIZE, nextInwardSector, OUTER_RING } from './universe';
import { captureVoyage, readVoyageSave, startVoyage } from './voyage';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, { localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); },
  } });
});
function fresh(seed = 'market'): State {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, seed);
  applySave(s, createSave('Pilot')); startVoyage(s, seed); s.voyage!.jumpTimer = 0;
  s.voyage!.personalSpice = s.voyage!.earnedSpice = 0;  // prices are checked against the hold alone, without the launch stipend
  return s;
}
function dock(s: State): void { const st = s.voyage!.system.stations[0]; Object.assign(s.player, { x: st.x, y: st.y, vx: 0, vy: 0 }); }
/** A collected lot with `units` left aboard; the rest counts as already spent so the save invariant holds. */
function load(s: State, units = LOT_SIZE): void {
  const v = s.voyage!;
  v.collected += LOT_SIZE; v.spent += LOT_SIZE - units;
  v.cargo = { serial: v.collected / LOT_SIZE, origin: v.sectorId, destination: nextInwardSector(v.universe, v.sectorId), remaining: units, commodity: 'melange', illegal: true };
}
const balanced = (s: State) => { const v = s.voyage!; return v.collected === v.sold + v.consumed + v.spent + v.armed + (v.cargo?.remaining ?? 0); };

test('stock is seeded per sector visit: fixed staples, three distinct rolls, formula prices, no legendary on the rim', () => {
  const s = fresh('stock'), v = s.voyage!, stock = marketStock(v);
  expect(marketStock(v)).toEqual(stock);
  expect(stock).toHaveLength(MARKET.slots);
  expect(stock[0]).toEqual({ slot: 0, id: 'seeker', rarity: 'common', price: 1, sold: false });
  expect(stock[1]).toEqual({ slot: 1, id: 'aamine', rarity: 'common', price: 1, sold: false });
  const rolls = stock.slice(2);
  expect(rolls.map(r => r.slot)).toEqual([2, 3, 4]);
  expect(new Set(rolls.map(r => r.id)).size).toBe(3);
  for (const r of rolls) expect(ARMS[r.id].staple).toBeUndefined();
  let differs = 0;
  for (let i = 0; i < 50; i++) {
    const t = fresh(`rim-${i}`), u = t.voyage!;
    expect(u.universe.sectors[u.sectorId].ring).toBe(OUTER_RING);
    for (const item of marketStock(u)) {
      expect(item.rarity).not.toBe('legendary');
      expect(item.price).toBe(armsPrice(item.id, item.rarity));
      expect(item.price).toBeGreaterThanOrEqual(1); expect(item.price).toBeLessThanOrEqual(MARKET.maxPrice);
      expect(item.price).toBe(Math.min(MARKET.maxPrice, Math.max(1, Math.round(ARMS[item.id].price * RARITIES[item.rarity].price))));
    }
    const before = marketStock(u); u.jumps = 1;
    if (JSON.stringify(marketStock(u)) !== JSON.stringify(before)) differs++;
  }
  expect(differs).toBeGreaterThan(10);  // a new leg restocks the shelves
  let legendary = 0;
  for (let i = 0; i < 50; i++) { const t = fresh(`center-${i}`); t.voyage!.sectorId = 0; legendary += marketStock(t.voyage!).filter(r => r.rarity === 'legendary').length; }
  expect(legendary).toBeGreaterThan(0);
  expect(armsPrice('deathhand', 'legendary')).toBe(12);
  expect(armsPrice('seeker', 'uncommon')).toBe(2);
});

test('the armory opens only when docked at a station, never in a lane, and keeps the flight clock frozen', () => {
  const s = fresh('dock'), v = s.voyage!;
  expect(openMarket(s)).toBe(false);
  expect(s.screen).toBe('playing'); expect(v.notice).toContain('Dock within 100m');
  dock(s);
  v.lane = {} as never;  // any FTL course: the armory is a station service
  expect(openMarket(s)).toBe(false); v.lane = null;
  expect(openMarket(s)).toBe(true);
  expect(s.screen).toBe('market'); expect(s.cursor).toBe(0);
  expect(s.market!.station).toBe(v.system.stations[0].name);
  expect(s.market!.key).toBe(marketKey(v)); expect(s.market!.stock).toEqual(marketStock(v));
  expect(openMarket(s)).toBe(false);  // already open: the screen is not playing
  const elapsed = v.elapsed;
  s.input.pressed.push('KeyS'); updateMarket(s, 5); expect(s.cursor).toBe(1);
  s.input.pressed.push('ArrowUp'); updateMarket(s, 5); expect(s.cursor).toBe(0);
  s.input.pressed.push('ArrowUp'); updateMarket(s, 5); expect(s.cursor).toBe(MARKET.slots - 1);  // wraps, one press per tick
  expect(v.elapsed).toBe(elapsed);
  s.input.pressed.push('Escape'); updateMarket(s, 1 / 60);
  expect(s.screen).toBe('playing'); expect(s.market).toBeNull();
  dock(s); openMarket(s); s.input.pressed.push('KeyF'); updateMarket(s, 1 / 60); expect(s.screen).toBe('playing');
});

test('buying charges cargo spice, counts it as armed, marks the slot sold, and survives a save round-trip', () => {
  const s = fresh('buy'), v = s.voyage!;
  dock(s); load(s); openMarket(s);
  const item = s.market!.stock[2], key = s.market!.key;
  s.cursor = 2; s.input.pressed.push('Enter'); updateMarket(s, 1 / 60);
  expect(v.cargo?.remaining).toBe(LOT_SIZE - item.price); expect(v.armed).toBe(item.price);
  expect(balanced(s)).toBe(true);
  expect(v.arsenal).toEqual([{ id: item.id, rarity: item.rarity, durability: RARITIES[item.rarity].durability }]);
  expect(s.market!.stock[2].sold).toBe(true); expect(v.purchased[key]).toEqual([2]);
  expect(s.market!.notice).toContain(`${ARMS[item.id].name} bought`);
  expect(buyArms(s, 2)).toBe(false); expect(s.market!.notice).toBe('Sold out.');
  expect(v.armed).toBe(item.price); expect(v.arsenal).toHaveLength(1);
  expect(loadSave()?.voyage?.arsenal).toEqual(v.arsenal);
  const snapshot = captureVoyage(s)!, read = readVoyageSave(snapshot)!;
  expect(read.arsenal).toEqual(v.arsenal); expect(read.armed).toBe(item.price); expect(read.purchased).toEqual({ [key]: [2] });
  const restored = fresh('elsewhere'); startVoyage(restored, 'ignored', snapshot);
  expect(restored.voyage!.arsenal).toEqual(v.arsenal); expect(restored.voyage!.armed).toBe(item.price);
  expect(marketStock(restored.voyage!)).toEqual(s.market!.stock);
  expect(marketStock(restored.voyage!)[2].sold).toBe(true);
  expect(readVoyageSave({ ...snapshot, armed: snapshot.armed + 1 })).toBeNull();
  expect(readVoyageSave({ ...snapshot, arsenal: [{ id: 'nope', rarity: 'common', durability: 1 }] })).toBeNull();
  expect(readVoyageSave({ ...snapshot, arsenal: [{ ...snapshot.arsenal[0], durability: 99 }] })).toBeNull();
  const { arsenal, armed, purchased, ...older } = snapshot;
  void arsenal; void armed; void purchased;
  expect(readVoyageSave(older)).toBeNull();  // a pre-armory save whose spice left the hold without a record
  expect(readVoyageSave({ ...older, cargo: { ...older.cargo!, remaining: LOT_SIZE } })).toMatchObject({ arsenal: [], armed: 0, purchased: {} });
});

test('refusals leave everything unchanged: empty hold, full arsenal, unaffordable; an exact spend empties the hold', () => {
  const s = fresh('refuse'), v = s.voyage!;
  dock(s); openMarket(s);
  expect(buyArms(s, 0)).toBe(false); expect(s.market!.notice).toBe('Need 1 spice aboard (0 available).');
  expect(v.arsenal).toEqual([]); expect(v.armed).toBe(0);
  load(s);
  expect(buyArms(s, 0)).toBe(true); expect(buyArms(s, 1)).toBe(true);
  expect(v.arsenal.map(a => a.id)).toEqual(['seeker', 'aamine']); expect(v.cargo?.remaining).toBe(LOT_SIZE - 2);
  v.arsenal.push({ id: 'thopter', rarity: 'rare', durability: 4 }, { id: 'hawk', rarity: 'common', durability: 1 });
  const before = captureVoyage(s);
  expect(buyArms(s, 2)).toBe(false); expect(s.market!.notice).toBe('Arsenal full. Use something first.');
  expect(captureVoyage(s)).toEqual(before);
  expect(buyArms(s, 9)).toBe(false);
  expect(balanced(s)).toBe(true);

  const poor = fresh('poor'), pv = poor.voyage!;
  dock(poor); load(poor, 1); openMarket(poor);
  const pricey = poor.market!.stock.find(item => item.price > 1)!;
  expect(buyArms(poor, pricey.slot)).toBe(false);
  expect(poor.market!.notice).toBe(`Need ${pricey.price} spice aboard (1 available).`);
  expect(pv.cargo?.remaining).toBe(1); expect(pv.arsenal).toEqual([]);

  const exact = fresh('exact'), ev = exact.voyage!;
  dock(exact); openMarket(exact);
  const pick = exact.market!.stock[3]; load(exact, pick.price);
  ev.navTarget = 0;
  expect(buyArms(exact, 3)).toBe(true);
  expect(ev.cargo).toBeNull(); expect(ev.navTarget).toBe(ev.sectorId); expect(ev.armed).toBe(pick.price);
  expect(balanced(exact)).toBe(true);
  expect(readVoyageSave(captureVoyage(exact))).not.toBeNull();
  closeMarket(exact); expect(exact.screen).toBe('playing'); expect(exact.market).toBeNull();
  expect(loadSave()?.voyage?.armed).toBe(pick.price);
  const ids = Object.keys(ARMS) as ArmsId[];
  expect(ids.filter(id => ARMS[id].staple)).toEqual(['seeker', 'aamine']);
});
