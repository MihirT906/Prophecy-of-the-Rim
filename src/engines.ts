import { SECTOR_CONFIG } from './sector-config';
import type { State } from './state';
export interface EngineProfile { cruiseSpeed: number; thrust: number; brake: number; drag: number }
/** One flight model and one control scheme; the environment selects the engine envelope. */
export function engineFor(s: State): EngineProfile {
  return s.voyage?.lane?.course.engine ?? SECTOR_CONFIG;
}
export function engineMode(s: State): 'SUBLIGHT' | 'FTL' { return s.voyage?.lane ? 'FTL' : 'SUBLIGHT'; }
