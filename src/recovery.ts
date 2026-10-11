import type { State } from './state';
import { announce } from './voyage';

export const FAULT_LIMIT = 3, FAULT_WINDOW = 10;  // faults within this many seconds stop retrying the run

function toFlightDeck(s: State): void {
  s.voyage = null; s.comms = null; s.screen = 'menu'; s.cursor = 0;
}

/** Runs one frame so a thrown error cannot kill the animation loop. A fault restores the last save;
 *  repeated faults (or a failed restore) fall back to the flight deck instead of looping. */
export function guardFrame(s: State, faults: number[], now: number, frame: () => void, restore: (s: State) => void): boolean {
  try { frame(); return true; } catch (error) {
    console.error('Frame fault', error);
    const recent = faults.filter(t => now - t < FAULT_WINDOW);
    faults.splice(0, faults.length, ...recent, now);
    try {
      if (s.voyage && faults.length < FAULT_LIMIT) {
        restore(s);
        if (s.voyage) announce(s.voyage, 'FAULT RECOVERED / resumed from the last save.');
      } else toFlightDeck(s);
    } catch { toFlightDeck(s); }
    return false;
  }
}
