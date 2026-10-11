import { STORM, TILE } from './data';
import { damagePlayer } from './player';
import type { State, Storm, Vec } from './state';
import { announce } from './voyage';

export function spawnStorm(s: State, at: Vec, drift: Vec, r: number = STORM.radius): Storm {
  const storm = { x: at.x, y: at.y, vx: drift.x, vy: drift.y, r, grit: 0 };
  s.storms.push(storm);
  return storm;
}

/** The storm the ship is inside, if any. Lanes have no weather. */
export function sheltered(s: State): Storm | null {
  if (!s.voyage || s.voyage.lane) return null;
  return s.storms.find(storm => Math.hypot(s.player.x - storm.x, s.player.y - storm.y) < storm.r) ?? null;
}

/** Drift each storm, turning it back at the sector edge, and grind the hull of a ship caught inside. */
export function updateStorms(s: State, dt: number): void {
  if (!s.voyage) return;
  if (s.voyage.lane) { s.storms.length = 0; return; }  // left behind with the sector
  const w = s.arena.w * TILE, h = s.arena.h * TILE, inside = sheltered(s);
  for (const storm of s.storms) {
    storm.x += storm.vx * dt; storm.y += storm.vy * dt;
    if ((storm.x < storm.r && storm.vx < 0) || (storm.x > w - storm.r && storm.vx > 0)) storm.vx = -storm.vx;
    if ((storm.y < storm.r && storm.vy < 0) || (storm.y > h - storm.r && storm.vy > 0)) storm.vy = -storm.vy;
    if (storm !== inside) { storm.grit = 0; continue; }
    if (!storm.grit) announce(s.voyage, 'CORIOLIS STORM: sand is stripping the hull, but no scan can find you in here.');
    storm.grit += dt;
    if (storm.grit < STORM.abrade) continue;
    storm.grit -= STORM.abrade - 1e-6;  // never back to exactly zero, which would repeat the warning
    damagePlayer(s, STORM.dmg, null);
  }
}
