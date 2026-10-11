import { bitmapText } from './bitmap-text';
import { contractCountdown } from './contracts';
import { deliveryQuest } from './quest';
import { uiPanel } from './raster-ui';
import type { State } from './state';
import { passage } from './voyage';
import { routeBetween } from './universe';

export function drawQuestTracker(ctx: CanvasRenderingContext2D, s: State, w: number): void {
  const v = s.voyage!, quest = deliveryQuest(v), contract = v.cargo?.contract;
  if (!quest || !contract) return;
  const x = w - 350, y = 332, gold = '#f0d486', dim = '#b7b3a0';
  uiPanel(ctx, 'well', x, y, 334, 184);
  const row = (value: string, i: number, color = dim, size = 12) => bitmapText(ctx, value, x + 14, y + 25 + i * 21, size, color);
  row(`DELIVERY #${v.cargo!.serial} / ${contractCountdown(v)}`, 0, gold, 14);
  row(`SYSTEM: ${quest.system.toUpperCase()}`, 1, '#ffffff');
  row(`STATION: ${quest.station.toUpperCase()}`, 2, '#ffffff');
  row(`${contract.due} SPICE / REWARD +${contract.bonus} SPICE +${contract.reward}cr`, 3);
  row(quest.next.toUpperCase(), 4, gold);
  const next = routeBetween(v.universe, v.sectorId, v.cargo!.destination)[1];
  const blocked = quest.stage === 'depart' && next !== undefined ? passage(v, next).blocked : null;
  row(blocked ? blocked.replace(' consumed doses', ' doses').slice(0, 42) : quest.stage === 'deliver' ? 'APPROACH STATION / E TO HAND IN' : quest.stage === 'transit' ? 'REACH THE FTL EXIT LINE' : 'FLY TO THE GOLD DELIVERY MARKER', 5, blocked ? '#e8a28f' : dim, 11);
  row('M: GALAXY MAP / R: DELIVERY ROUTE', 6, gold, 11);
}
