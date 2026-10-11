import { ownedSpice, spendOwned } from './contracts';
import { SHOP, WEAPONS, type WeaponId } from './data';
import { takePress } from './input';
import { writeSave } from './save';
import type { State } from './state';
import type { Station } from './universe';
import { announce } from './voyage';
import { openMarket } from './market';

export const SHOP_RANGE = 100;  // from the station's hull, the same reach as hailing it
export type ShopItem = Exclude<WeaponId, 'pistol'>;
export interface ShopOffer { id: ShopItem; price: number; rounds: number; refill: boolean; blocked: string | null }
export const SHOP_ITEMS = Object.keys(SHOP) as ShopItem[];

/** The station whose armory is in reach, if any. Lanes have none. */
export function shopStation(s: State): Station | null {
  const v = s.voyage, p = s.player;
  if (!v || v.lane || v.status !== 'active') return null;
  return v.system.stations.find(st => Math.hypot(st.x - p.x, st.y - p.y) <= st.radius + SHOP_RANGE) ?? null;
}

/** Every weapon on sale: its price in spice, the rounds it comes with, and why it cannot be bought right now. */
export function shopOffers(s: State): ShopOffer[] {
  const p = s.player, aboard = s.voyage ? ownedSpice(s.voyage) : 0;
  return SHOP_ITEMS.map(id => {
    const rounds = WEAPONS[id].ammo, refill = p.weapon === id;
    return { id, price: SHOP[id], rounds, refill, blocked: refill && p.ammo >= rounds ? 'Magazine already full.'
      : aboard < SHOP[id] ? `Need ${SHOP[id]} spice aboard (${aboard} in the hold).` : null };
  });
}

/** Pay spice out of the hold for a weapon with a full pool. Buying the weapon already mounted refills it. */
export function buyWeapon(s: State, id: ShopItem): boolean {
  const v = s.voyage, offer = shopOffers(s).find(o => o.id === id);
  if (!v || !offer || !shopStation(s)) return false;
  if (offer.blocked) { announce(v, offer.blocked); return false; }
  if (!spendOwned(v, offer.price)) return false;
  v.spent += offer.price;
  if (!v.cargo) v.navTarget = v.sectorId;
  s.player.weapon = id; s.player.ammo = offer.rounds; s.player.cooldown = 0;
  announce(v, `${WEAPONS[id].name} ${offer.refill ? 'rearmed' : 'mounted'} · ${offer.rounds} rounds · ${offer.price} spice paid.`);
  writeSave(s);
  return true;
}

/** F beside a station opens the armory and freezes the flight. */
export function openShop(s: State): boolean {
  if (s.screen !== 'playing' || !shopStation(s)) return false;
  s.screen = 'shop'; s.cursor = 0;
  return true;
}

/** The armory screen: Up/Down picks a row, Enter buys it, Esc or F undocks, Tab turns to the air-support page. */
export function updateShop(s: State): void {
  const i = s.input, n = SHOP_ITEMS.length;
  if (takePress(i, 'Escape', 'KeyF') || !shopStation(s)) { s.screen = 'playing'; return; }
  if (takePress(i, 'Tab', 'ArrowRight', 'ArrowLeft') && openMarket(s)) return;
  s.cursor = (s.cursor + Number(takePress(i, 'ArrowDown', 'KeyS')) - Number(takePress(i, 'ArrowUp', 'KeyW')) + n) % n;
  if (takePress(i, 'Enter', 'Space')) buyWeapon(s, SHOP_ITEMS[s.cursor]);
}
