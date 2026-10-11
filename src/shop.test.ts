import { beforeEach, expect, test } from 'vitest';
import { SHOP, WEAPONS } from './data';
import { fire } from './weapons';
import { applySave, createSave, loadSave, writeSave } from './save';
import { buyWeapon, openShop, SHOP_ITEMS, shopOffers, shopStation, updateShop } from './shop';
import { newState, type State } from './state';
import { LOT_SIZE, nextInwardSector } from './universe';
import { captureVoyage, readVoyageSave, startVoyage } from './voyage';

const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  Object.assign(globalThis, { localStorage: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => { storage.set(k, v); }, removeItem: (k: string) => { storage.delete(k); },
  } });
});
/** A pilot docked at the sector's first station with `spice` units in the hold. */
function docked(spice = LOT_SIZE): State {
  const s = newState({ held: new Set(), pressed: [], typed: [] }, 'shop');
  applySave(s, createSave('Pilot')); startVoyage(s, 'shop');
  const v = s.voyage!, st = v.system.stations[0];
  v.personalSpice = v.earnedSpice = 0;  // only the hold pays, without the launch stipend
  Object.assign(s.player, { x: st.x + st.radius + 40, y: st.y });
  if (spice) {
    v.collected = LOT_SIZE; v.sold = LOT_SIZE - spice;
    v.cargo = { serial: 1, origin: v.sectorId, destination: nextInwardSector(v.universe, v.sectorId), remaining: spice, commodity: 'melange', illegal: true };
  }
  return s;
}
const ledger = (s: State) => { const v = s.voyage!; return v.sold + v.consumed + v.spent + (v.cargo?.remaining ?? 0); };
const press = (s: State, ...codes: string[]) => { s.input.pressed.push(...codes); updateShop(s); s.input.pressed.length = 0; };

test('the armory is only in reach beside a station, never in a lane', () => {
  const s = docked(), st = s.voyage!.system.stations[0];
  expect(shopStation(s)).toBe(st);
  s.player.x = st.x + st.radius + 101;
  expect(shopStation(s)).toBeNull();
  expect(openShop(s)).toBe(false);
  expect(buyWeapon(s, 'smg')).toBe(false);
  expect(s.player.weapon).toBe('pistol');
  s.player.x = st.x;
  s.voyage!.lane = {} as never;
  expect(shopStation(s)).toBeNull();
});

test('every weapon but the pistol is on sale at its spice price', () => {
  const s = docked();
  expect(shopOffers(s).map(o => o.id)).toEqual(['smg', 'shotgun', 'rifle', 'rocket', 'swarm', 'lance']);
  for (const o of shopOffers(s)) expect(o).toMatchObject({ price: SHOP[o.id], rounds: WEAPONS[o.id].ammo, refill: false, blocked: null });
});

test('buying mounts the weapon with a full pool and takes the spice out of the hold for good', () => {
  const s = docked(), v = s.voyage!;
  expect(buyWeapon(s, 'rifle')).toBe(true);
  expect(s.player).toMatchObject({ weapon: 'rifle', ammo: WEAPONS.rifle.ammo });
  expect(v.cargo!.remaining).toBe(LOT_SIZE - SHOP.rifle);
  expect(v.spent).toBe(SHOP.rifle);
  expect(ledger(s)).toBe(v.collected);
  expect(readVoyageSave(captureVoyage(s))).not.toBeNull();  // the run's spice accounting still validates
  expect(v.notice).toContain('RIFLE mounted');
  expect(buyWeapon(s, 'shotgun')).toBe(true);  // a second purchase replaces the first
  expect(s.player).toMatchObject({ weapon: 'shotgun', ammo: WEAPONS.shotgun.ammo });
  expect(v.spent).toBe(SHOP.rifle + SHOP.shotgun);
  expect(ledger(s)).toBe(v.collected);
});

test('too little spice blocks the sale, and spending the last unit empties the hold', () => {
  const poor = docked(SHOP.smg - 1);
  expect(shopOffers(poor).every(o => o.blocked?.startsWith('Need'))).toBe(true);
  expect(buyWeapon(poor, 'smg')).toBe(false);
  expect(poor.player.weapon).toBe('pistol');
  expect(poor.voyage!.cargo!.remaining).toBe(SHOP.smg - 1);
  expect(poor.voyage!.notice).toContain(`Need ${SHOP.smg} spice`);

  const empty = docked(0);
  expect(buyWeapon(empty, 'smg')).toBe(false);

  const exact = docked(SHOP.shotgun);
  expect(shopOffers(exact).map(o => !o.blocked)).toEqual([true, true, false, false, false, false]);
  expect(buyWeapon(exact, 'shotgun')).toBe(true);
  expect(exact.voyage!.cargo).toBeNull();
  expect(exact.voyage!.navTarget).toBe(exact.voyage!.sectorId);
  expect(ledger(exact)).toBe(exact.voyage!.collected);
  expect(readVoyageSave(captureVoyage(exact))).not.toBeNull();
});

test('the mounted weapon can be rearmed, but not while its magazine is full', () => {
  const s = docked(), v = s.voyage!;
  buyWeapon(s, 'shotgun');
  expect(shopOffers(s)[1]).toMatchObject({ refill: true, blocked: 'Magazine already full.' });
  expect(buyWeapon(s, 'shotgun')).toBe(false);
  expect(v.spent).toBe(SHOP.shotgun);
  fire(s, { x: 1, y: 0 });
  expect(s.player.ammo).toBe(WEAPONS.shotgun.ammo - 1);
  expect(shopOffers(s)[1]).toMatchObject({ refill: true, blocked: null });
  expect(buyWeapon(s, 'shotgun')).toBe(true);
  expect(s.player.ammo).toBe(WEAPONS.shotgun.ammo);
  expect(v.notice).toContain('rearmed');
});

test('B docks, the cursor picks a row, Enter buys, Esc undocks', () => {
  const s = docked();
  expect(openShop(s)).toBe(true);
  expect(s).toMatchObject({ screen: 'shop', cursor: 0 });
  press(s, 'ArrowUp');
  expect(s.cursor).toBe(SHOP_ITEMS.length - 1);
  press(s, 'ArrowDown'); press(s, 'KeyS');
  expect(s.cursor).toBe(1);
  press(s, 'Enter');
  expect(s.player.weapon).toBe('shotgun');
  expect(s.screen).toBe('shop');
  press(s, 'Escape');
  expect(s.screen).toBe('playing');
  expect(openShop(s)).toBe(true);
  press(s, 'KeyF');
  expect(s.screen).toBe('playing');
});

test('a bought weapon and its rounds survive a reload; the pistol stores nothing', () => {
  const s = docked();
  writeSave(s);
  expect(loadSave()!.weapon).toBeUndefined();
  buyWeapon(s, 'smg');
  s.player.ammo = 41;
  writeSave(s);
  expect(loadSave()!.weapon).toEqual({ id: 'smg', ammo: 41 });
  const again = newState({ held: new Set(), pressed: [], typed: [] }, 'shop');
  applySave(again, loadSave()!);
  expect(again.player).toMatchObject({ weapon: 'smg', ammo: 41 });
  applySave(again, { ...loadSave()!, weapon: { id: 'railgun' as never, ammo: 5 } });
  expect(again.player.weapon).toBe('pistol');
  applySave(again, { ...loadSave()!, weapon: { id: 'smg', ammo: -3 } });
  expect(again.player.weapon).toBe('pistol');
});
