import { deliveryReceiver } from './contracts';
import { routeBetween } from './universe';
import type { Vec } from './state';
import type { Voyage } from './voyage';

/** Delivery guidance is independent of a temporary route selected on the galaxy chart. */
export function deliveryQuest(v: Voyage): { system: string; station: string; at: Vec; stage: 'transit' | 'depart' | 'deliver'; next: string; label: string } | null {
  const cargo = v.cargo, contract = cargo?.contract;
  if (!cargo || !contract) return null;
  const receiver = deliveryReceiver(v.universe, cargo.destination, contract.recipient);
  const system = v.universe.sectors[cargo.destination].name, station = receiver.name;
  if (v.lane) return { system, station, at: v.lane.course.exit, stage: 'transit', next: `EXIT TO ${v.universe.sectors[v.lane.to].name}`, label: `DELIVERY / FTL EXIT` };
  if (v.sectorId === cargo.destination) {
    const local = v.system.stations.find(st => st.id === contract.recipient);
    if (!local) return null;
    return { system, station, at: local, stage: 'deliver', next: `HAIL ${station}`, label: `DELIVERY / ${station}` };
  }
  const next = routeBetween(v.universe, v.sectorId, cargo.destination)[1], gate = v.system.gates.find(g => g.to === next);
  return gate ? { system, station, at: gate, stage: 'depart', next: `GATE TO ${v.universe.sectors[next].name}`, label: `DELIVERY GATE / ${v.universe.sectors[next].name}` } : null;
}
