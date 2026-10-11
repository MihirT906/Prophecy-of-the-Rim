import { makeRng } from './rng';
import { generateSystem, INWARD_FARE, LOT_SIZE, nextInwardSector, PRESCIENCE_REQUIRED, type Universe, type Station } from './universe';
import type { Voyage } from './voyage';

const receivers = new WeakMap<Universe, Map<string, Station>>();
export function deliveryReceiver(universe: Universe, destination: number, recipient?: string): Station {
  let cache = receivers.get(universe);
  if (!cache) { cache = new Map(); receivers.set(universe, cache); }
  const key = `${destination}:${recipient ?? 'first'}`;
  let station = cache.get(key);
  if (!station) { const stations = generateSystem(universe, destination).stations; station = stations.find(st => st.id === recipient) ?? stations[0]; cache.set(key, station); }
  return station;
}
export interface DeliveryContract {
  issuer: string; recipient: string; due: number; fuel: number; cut: number; reward: number; bonus: number; deadline: number;
}
export interface DeliveryOffer extends Omit<DeliveryContract, 'deadline'> { duration: number; destination: number; blocked: string | null }
export const CONTRACT_SECONDS = 180, DEFAULT_EMBARGO_SECONDS = 90;
/** Spice paid only after a completed delivery, in addition to the advance cut. */
export function completionSpice(rep: number): number {
  return rep >= 90 ? 24 : rep >= 75 ? 16 : rep >= 60 ? 8 : rep >= 40 ? 4 : rep >= 20 ? 1 : 0;
}
export function contractCountdown(v: Voyage): string {
  const seconds = Math.max(0, Math.ceil((v.cargo?.contract?.deadline ?? v.elapsed) - v.elapsed));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
export const START_REPUTATION = 60, THEFT_PENALTY = 25, DELIVERY_TRUST = 8;
export function reputationLabel(rep: number): string { return rep >= 75 ? 'TRUSTED' : rep >= 40 ? 'RELIABLE' : rep >= 20 ? 'SUSPECT' : 'BLACKLISTED'; }
export function routeFare(v: Voyage, to: number): number {
  const a = v.universe.sectors[v.sectorId], b = v.universe.sectors[to];
  return a.ring === b.ring ? Math.max(1, 5 - Math.floor((a.danger + b.danger) / 2)) : b.ring < a.ring ? INWARD_FARE[b.ring] : 2;
}
/** A fixed contact's trust gate cannot be rerolled by reconnecting. The freighter offers recovery work. */
export function deliveryOffer(v: Voyage, issuer: string): DeliveryOffer {
  const rep = v.reputation, sector = v.universe.sectors[v.sectorId];
  const cut = rep >= 75 ? 5 : rep >= 40 ? 4 : rep >= 20 ? 2 : 1;
  let destination = nextInwardSector(v.universe, v.sectorId);
  if (rep < 40 || v.consumed + ownedSpice(v) + cut < PRESCIENCE_REQUIRED[v.universe.sectors[destination].ring]) {
    destination = sector.neighbors.filter(n => v.universe.sectors[n].ring === sector.ring)
      .sort((a, b) => v.universe.sectors[b].danger - v.universe.sectors[a].danger || a - b)[0] ?? destination;
  }
  const fuel = routeFare(v, destination), due = LOT_SIZE - cut - fuel;
  const receiver = deliveryReceiver(v.universe, destination);
  const threshold = 20 + Math.floor(makeRng(`${v.universe.seed}:${v.sectorId}:${issuer}:trust`)() * 40);
  return { issuer, recipient: receiver.id, destination, due, fuel, cut, bonus: completionSpice(rep), duration: CONTRACT_SECONDS, reward: due * (rep >= 40 ? 2 : 1),
    blocked: v.embargoUntil > v.elapsed ? `Contracts suspended for ${Math.ceil(v.embargoUntil - v.elapsed)}s of flight time after default.` : issuer !== 'freighter' && rep < threshold ? `No contract. Your reputation is ${rep}; this sender requires ${threshold}. Try the freighter.` : null };
}
/** Legacy unbonded cargo remains player-owned. New contract cargo is protected. */
export function ownedSpice(v: Voyage): number { return v.personalSpice + (v.cargo && !v.cargo.contract ? v.cargo.remaining : 0); }
export function transitSpice(v: Voyage): number { return ownedSpice(v) + (v.cargo?.contract?.fuel ?? 0); }
export function spendOwned(v: Voyage, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0 || ownedSpice(v) < amount) return false;
  const wallet = Math.min(v.personalSpice, amount); v.personalSpice -= wallet; amount -= wallet;
  if (amount && v.cargo && !v.cargo.contract) { v.cargo.remaining -= amount; if (!v.cargo.remaining) v.cargo = null; }
  return true;
}
export function spendTransit(v: Voyage, amount: number): boolean {
  if (!Number.isSafeInteger(amount) || amount < 0 || transitSpice(v) < amount) return false;
  const c = v.cargo, fuel = Math.min(c?.contract?.fuel ?? 0, amount);
  if (c?.contract) { c.contract.fuel -= fuel; c.remaining -= fuel; }
  return spendOwned(v, amount - fuel);
}
