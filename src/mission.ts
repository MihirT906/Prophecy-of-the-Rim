// The one thing the pilot should do next, derived from the run state. Pure: the HUD, the lane HUD and tests read it.
import { contractCountdown, deliveryOffer, ownedSpice } from './contracts';
import { deliveryQuest } from './quest';
import type { State, Vec } from './state';
import { TRANSCENDENCE_DOSES, nextInwardSector, routeBetween, spiceContacts } from './universe';
import { passage } from './voyage';

export const MISSION_STEPS = 5;  // one leg of the race: accept, dose, gate, course, hand in
export interface Mission {
  step: number;          // 1..5 within a leg, or 6 for the final beacon
  title: string;         // what to do, imperative
  detail: string;        // how, with the key
  next: string;          // what follows, so the pilot can plan
  at: Vec | null;        // where to fly, if anywhere
  label: string;         // short name of the target for arrows and chevrons
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : word === word.toUpperCase() ? 'S' : 's'}`;

export function mission(s: State): Mission | null {
  const v = s.voyage;
  if (!v || v.status !== 'active') return null;
  const p = s.player, cargo = v.cargo, contract = cargo?.contract, owned = ownedSpice(v);
  if (v.lane) {
    const exit = v.lane.course.exit, km = (Math.hypot(exit.x - p.x, exit.y - p.y) / 1000).toFixed(1);
    return { step: 4, title: 'SURVIVE THE FTL COURSE', detail: `Fly right inside the red edges and cross the exit line · ${km}km${contract ? ` · ${contractCountdown(v)} left` : ''}`,
      next: contract ? 'Then hand the delivery in at its receiver' : 'Then sell the spice at the next station', at: exit, label: 'EXIT LINE' };
  }
  const quest = deliveryQuest(v);
  // Where the spice goes: the contract's receiver, or the local buyer for unbonded cargo.
  if (quest?.stage === 'deliver' || (cargo && !contract && v.navTarget === v.sectorId)) {
    const at = quest?.at ?? v.system.dock;
    return { step: 5, title: contract ? 'HAND IN THE DELIVERY' : 'SELL THE SPICE',
      detail: contract ? `Dock at ${quest!.station}, press E · +${contract.bonus} spice, +${contract.reward} credits · ${contractCountdown(v)} left` : 'Dock at the station, press E · 1 credit per unit',
      next: 'Then accept the next contract', at, label: contract ? 'DELIVERY STATION' : 'STATION' };
  }
  if (v.sectorId === 0 && v.consumed >= TRANSCENDENCE_DOSES) {
    return { step: 6, title: 'TRANSCEND AT THE CENTER', detail: 'Fly to the beacon and press E', next: 'The run ends when you do', at: v.system.beacon, label: 'CENTER BEACON' };
  }
  if (v.sectorId === 0 && (cargo || owned >= TRANSCENDENCE_DOSES - v.consumed)) {
    const left = TRANSCENDENCE_DOSES - v.consumed;
    return { step: 2, title: `DOSE ${plural(left, 'MORE TIME')} (C)`, detail: `Prescience ${v.consumed}/${TRANSCENDENCE_DOSES} opens the beacon · ${owned} personal spice`,
      next: 'Then press E at the center beacon', at: v.system.beacon, label: 'CENTER BEACON' };
  }
  if (!cargo) {
    const contacts = [...spiceContacts(v.system, v.elapsed)].filter(c => c.kind !== 'station')
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - a.radius - (Math.hypot(b.x - p.x, b.y - p.y) - b.radius));
    const contact = contacts.find(c => !deliveryOffer(v, c.id).blocked) ?? contacts[0];
    const waiting = Math.max(0, Math.ceil(Math.max(v.embargoUntil, v.stockReadyAt[v.sectorId] ?? 0) - v.elapsed));
    if (waiting > 0) return { step: 1, title: 'WAIT FOR THE NEXT CONTRACT',
      detail: `${waiting}s of flight time left. Stay in flight; menus pause the clock.`,
      next: `Then hail ${contact.name} with E for a contract`, at: contact, label: contact.name.toUpperCase() };
    const required = v.sectorId === 0 ? TRANSCENDENCE_DOSES : passage(v, nextInwardSector(v.universe, v.sectorId)).required;
    return { step: 1, title: 'ACCEPT A DELIVERY CONTRACT', detail: `Fly within 100m of ${contact.name}, press E, confirm with Enter · your cut is paid up front`,
      next: `Then dose with C until prescience ${Math.min(TRANSCENDENCE_DOSES, required)}`, at: contact, label: contact.name.toUpperCase() };
  }
  const next = contract ? routeBetween(v.universe, v.sectorId, cargo.destination)[1] : routeBetween(v.universe, v.sectorId, v.navTarget)[1];
  if (next === undefined) return { step: 5, title: 'SELL THE SPICE', detail: 'Dock at the station, press E', next: 'Then accept the next contract', at: v.system.dock, label: 'STATION' };
  const cost = passage(v, next), gate = v.system.gates.find(g => g.to === next) ?? null, name = v.universe.sectors[next].name.toUpperCase();
  const doses = Math.max(0, cost.required - v.consumed), gateLabel = contract ? `DELIVERY GATE / ${name}` : `GATE TO ${name}`;
  if (doses > 0 && owned >= doses) {
    return { step: 2, title: `DOSE ${plural(doses, 'TIME')} (C)`, detail: `Each press of C turns one personal spice into prescience · ${owned} personal spice${contract ? ` · ${contractCountdown(v)} left` : ''}`,
      next: `Then fly to the gate marked ${name}`, at: gate, label: gateLabel };
  }
  if (doses > 0) {
    return { step: 2, title: 'NOT ENOUGH PERSONAL SPICE', detail: `${owned} owned, ${plural(doses, 'dose')} needed for ${name}. Doses and the armory share your cut; a delivery bonus pays more.`,
      next: `Then dose with C and fly to the gate marked ${name}`, at: gate, label: gateLabel };
  }
  if (cost.blocked) return { step: 3, title: 'NOT ENOUGH SPICE FOR THE FARE', detail: cost.blocked, next: `Then fly to the gate marked ${name}`, at: v.system.dock, label: 'STATION' };
  return { step: 3, title: `FLY TO THE GATE: ${name}`, detail: `Press E at the edge marker, confirm on the chart · fare ${cost.fare} ${contract ? 'from reserved fuel' : 'spice'}${contract ? ` · ${contractCountdown(v)} left` : ''}`,
    next: 'Then survive the FTL course', at: gate, label: gateLabel };
}
