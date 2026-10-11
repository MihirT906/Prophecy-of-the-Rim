// Ground ordnance bought at the armory: Death Hand, Hawk Strike, AA mine, hunter-seeker, and the hazard update.
import { aimPoint, explode, nearestEnemy, power, spawnHazard, tier } from './arms';
import { spawnBullet } from './bullets';
import { ARMS, RARITIES, RARITY_ORDER } from './data';
import { damageEnemy } from './enemies';
import { burst, muzzle, shake } from './fx';
import { damagePlayer } from './player';
import type { ArsenalItem, Hazard, State, Vec } from './state';

const POOL_COLOR = '#5cff9c', POOL_TICK = 0.25, SCATTER = 90;

/** Forward in a lane, otherwise the player's last aim. */
function aimOf(s: State): Vec { return s.voyage?.lane ? { x: 1, y: 0 } : s.player.aim; }
/** A hazard only carries its power multiplier; recover the rarity tier from it. */
function tierOf(h: Hazard): number { return Math.max(0, RARITY_ORDER.findIndex(r => RARITIES[r].power === h.power)); }

/** Siren marker 260 px along the aim; the warheads and the pool follow when its timer runs out. */
export function launchDeathHand(s: State, item: ArsenalItem): void {
  const at = aimPoint(s, 260), p = power(item);
  spawnHazard(s, { kind: 'marker', x: at.x, y: at.y, r: 110, timer: 2.5, ttl: 2.5, dmg: 10 * p, selfDmg: 3, color: ARMS.deathhand.color, power: p });
  shake(s, 6);
}

/** Every hostile flees and holds fire for 3 + tier seconds. The short marker is only for the renderer. */
export function launchHawkStrike(s: State, item: ArsenalItem): void {
  const p = s.player;
  for (const e of s.enemies) e.fear = 3 + tier(item);
  burst(s, p, ARMS.hawk.color, 24);
  shake(s, 4);
  spawnHazard(s, { kind: 'marker', x: p.x, y: p.y, r: 140, timer: 0.5, ttl: 0.5, dmg: 0, selfDmg: 0, color: ARMS.hawk.color, power: power(item) });
}

/** A mine 30 px behind the ship. r is its trigger radius; dmg is per missile. */
export function dropMine(s: State, item: ArsenalItem): void {
  const p = s.player, aim = aimOf(s);
  spawnHazard(s, { kind: 'mine', x: p.x - aim.x * 30, y: p.y - aim.y * 30, r: 90, timer: 0, ttl: 20, dmg: 2 * power(item), selfDmg: 0, color: ARMS.aamine.color, power: power(item) });
}

/** One slow homing dart along the aim. */
export function launchSeeker(s: State, item: ArsenalItem): void {
  const p = s.player, aim = aimOf(s), at = { x: p.x + aim.x * (p.r + 4), y: p.y + aim.y * (p.r + 4) };
  spawnBullet(s, at, aim, 240, 8 * power(item), 0, 5, 'player', ARMS.seeker.color, { homing: 5, r: 4 });
  muzzle(s, at, aim, ARMS.seeker.color);
}

/** Bomb and warhead fuses, radiation pools, mine triggers, marker expiry. Stops early once play ends mid-tick. */
export function updateHazards(s: State, dt: number): void {
  const spent = new Set<number>();
  for (const h of [...s.hazards]) {
    if (s.screen !== 'playing') break;
    switch (h.kind) {
      case 'bomb':
      case 'warhead':
        if ((h.timer -= dt) <= 0) { spent.add(h.id); explode(s, h, h.r, h.dmg, h.selfDmg, h.color); }
        break;
      case 'pool':
        h.ttl -= dt; h.timer += dt;
        while (h.timer >= POOL_TICK && s.screen === 'playing') { h.timer -= POOL_TICK; poolTick(s, h); }
        if (h.ttl <= 0) spent.add(h.id);
        break;
      case 'mine':
        if ((h.ttl -= dt) <= 0) spent.add(h.id);
        else if (nearestEnemy(s, h, h.r)) { spent.add(h.id); triggerMine(s, h); }
        break;
      case 'marker':
        h.ttl -= dt; h.timer -= dt;
        if (h.dmg > 0 && h.timer <= 0) { spent.add(h.id); detonateDeathHand(s, h); }
        else if (h.ttl <= 0) spent.add(h.id);
        break;
    }
  }
  if (spent.size) s.hazards = s.hazards.filter(h => !spent.has(h.id));
}

/** 5 + tier warheads scattered inside SCATTER px, staggered fuses, then a 6 s radiation pool over the marker. */
function detonateDeathHand(s: State, marker: Hazard): void {
  const count = 5 + tierOf(marker);
  for (let i = 0; i < count; i++) {
    const a = s.rng() * Math.PI * 2, d = Math.sqrt(s.rng()) * SCATTER, fuse = 0.25 + i * 0.12;
    spawnHazard(s, { kind: 'warhead', x: marker.x + Math.cos(a) * d, y: marker.y + Math.sin(a) * d, r: 60, timer: fuse, ttl: fuse,
      dmg: marker.dmg, selfDmg: 3, color: marker.color, power: marker.power });
  }
  spawnHazard(s, { kind: 'pool', x: marker.x, y: marker.y, r: 110, timer: 0, ttl: 6, dmg: 2 * marker.power, selfDmg: 1, color: POOL_COLOR, power: marker.power });
}

/** One quarter-second of radiation: dmg is per second for enemies; the player's i-frames gate selfDmg. */
function poolTick(s: State, h: Hazard): void {
  for (const e of [...s.enemies]) {
    const dx = e.x - h.x, dy = e.y - h.y, d = Math.hypot(dx, dy);
    if (d < h.r + e.r) damageEnemy(s, e, h.dmg * POOL_TICK, d ? { x: dx / d, y: dy / d } : { x: 1, y: 0 });
  }
  const p = s.player;
  if (h.selfDmg > 0 && Math.hypot(p.x - h.x, p.y - h.y) < h.r + p.r) damagePlayer(s, h.selfDmg, h);
}

/** An even ring of 6 + 2 * tier homing missiles. */
function triggerMine(s: State, mine: Hazard): void {
  const count = 6 + 2 * tierOf(mine);
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, dir = { x: Math.cos(a), y: Math.sin(a) };
    spawnBullet(s, { x: mine.x + dir.x * 6, y: mine.y + dir.y * 6 }, dir, 340, mine.dmg, 0, 3, 'player', mine.color, { homing: 6, blast: 20, r: 4 });
  }
  burst(s, mine, mine.color, 14);
  shake(s, 3);
}
