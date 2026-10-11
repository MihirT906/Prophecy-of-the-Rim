import { ownedSpice, spendOwned } from './contracts';
// Station armory: seeded semi-random stock, purchases paid in cargo spice, the market screen's update.
// Stock is a pure function of universe seed, sector and jump count, so two visits to the same sector in one
// leg show the same shelves; slots already bought are remembered in v.purchased under the same key.
import { ARMS, MARKET, RARITIES, RARITY_ORDER, type ArmsId, type Rarity } from './data';
import { takePress } from './input';
import { makeRng } from './rng';
import { writeSave } from './save';
import type { MarketItem, State } from './state';
import type { Station } from './universe';
import { announce, type Voyage } from './voyage';

export const MARKET_RANGE = 100;  // px beyond a station's hull, the same reach as hailing it

/** One shelf per sector visit: the key changes with every completed jump. */
export function marketKey(v: Voyage): string { return `${v.sectorId}:${v.jumps}`; }

export function armsPrice(id: ArmsId, rarity: Rarity): number {
  return Math.min(MARKET.maxPrice, Math.max(1, Math.round(ARMS[id].price * RARITIES[rarity].price)));
}

function pickWeighted<T>(rng: () => number, entries: { value: T; weight: number }[]): T {
  let roll = rng() * entries.reduce((sum, e) => sum + e.weight, 0);
  return (entries.find(e => (roll -= e.weight) < 0) ?? entries[entries.length - 1]).value;
}

/** Slots 0-1 are the common staples; slots 2-4 are distinct seeded rolls whose rarity odds improve toward the center. */
export function marketStock(v: Voyage): MarketItem[] {
  const key = marketKey(v), rng = makeRng(`${v.universe.seed}:market:${key}`), bought = v.purchased[key] ?? [];
  const ring = v.universe.sectors[v.sectorId].ring, odds = MARKET.rarityByRing[ring];
  const ids = Object.keys(ARMS) as ArmsId[], pool = ids.filter(id => !ARMS[id].staple && ARMS[id].weight > 0);
  const stock: MarketItem[] = ids.filter(id => ARMS[id].staple).map((id, slot) => ({ slot, id, rarity: 'common', price: armsPrice(id, 'common'), sold: false }));
  while (stock.length < MARKET.slots && pool.length) {
    const id = pickWeighted(rng, pool.map(value => ({ value, weight: ARMS[value].weight })));
    pool.splice(pool.indexOf(id), 1);
    const rarity = pickWeighted(rng, RARITY_ORDER.map((value, i) => ({ value, weight: odds[i] })));
    stock.push({ slot: stock.length, id, rarity, price: armsPrice(id, rarity), sold: false });
  }
  for (const item of stock) item.sold = bought.includes(item.slot);
  return stock;
}

/** The station whose armory is in reach, if any. Lanes have none. */
export function marketStation(s: State): Station | null {
  const v = s.voyage, p = s.player;
  if (!v || v.lane || v.status !== 'active') return null;
  return v.system.stations.find(st => Math.hypot(st.x - p.x, st.y - p.y) <= st.radius + MARKET_RANGE) ?? null;
}

/** Opens the air-support page when docked at a station, from flight or from the gun shop's page; otherwise says how to reach one. */
export function openMarket(s: State): boolean {
  const v = s.voyage;
  if (!v || v.lane || (s.screen !== 'playing' && s.screen !== 'shop') || v.status !== 'active') return false;
  const station = marketStation(s);
  if (!station) { announce(v, 'Dock within 100m of a station to open its armory.'); return false; }
  s.market = { key: marketKey(v), station: station.name, stock: marketStock(v), notice: '' };
  s.screen = 'market'; s.cursor = 0;
  return true;
}

export function closeMarket(s: State): void {
  s.market = null; s.screen = 'playing'; writeSave(s);
}

/** Buys stock slot `slot` into the arsenal, charging cargo spice and recording v.armed and v.purchased. Atomic: refusals change nothing. */
export function buyArms(s: State, slot: number): boolean {
  const v = s.voyage, m = s.market, item = m?.stock[slot];
  if (!v || !m || !item) return false;
  const have = ownedSpice(v);
  const refusal = item.sold ? 'Sold out.' : v.arsenal.length >= MARKET.arsenal ? 'Arsenal full. Use something first.'
    : have < item.price ? `Need ${item.price} spice aboard (${have} available).` : null;
  if (refusal) { m.notice = refusal; return false; }
  if (!spendOwned(v, item.price)) return false;
  if (!v.cargo) v.navTarget = v.sectorId;
  v.armed += item.price;
  const durability = RARITIES[item.rarity].durability;
  v.arsenal.push({ id: item.id, rarity: item.rarity, durability });
  (v.purchased[m.key] ??= []).push(slot);
  item.sold = true;
  m.notice = `${ARMS[item.id].name} bought · ${durability} uses`;
  writeSave(s);
  return true;
}

/** The market screen's input: cursor, buy, close, or Tab back to the gun page. The flight clock stays frozen while open. */
export function updateMarket(s: State, dt: number): void {
  void dt;
  const m = s.market, i = s.input;
  if (!m || s.screen !== 'market') { if (s.screen === 'market') s.screen = 'playing'; return; }
  const n = m.stock.length || 1;
  const d = Number(takePress(i, 'ArrowDown', 'KeyS')) - Number(takePress(i, 'ArrowUp', 'KeyW'));
  s.cursor = (s.cursor + d + n) % n;
  if (takePress(i, 'Enter', 'Space')) buyArms(s, s.cursor);
  else if (takePress(i, 'Tab', 'ArrowLeft', 'ArrowRight')) { s.market = null; s.screen = 'shop'; s.cursor = 0; }
  else if (takePress(i, 'Escape', 'KeyF')) closeMarket(s);
}
