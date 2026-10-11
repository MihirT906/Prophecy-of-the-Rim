import { spawnBullet } from './bullets';
import { burst, shake } from './fx';
import { damagePlayer } from './player';
import type { Bullet, State } from './state';
import { celestialPosition, type Planet } from './universe';
import { announce } from './voyage';

export const WORLD_HP = 180;
export const livingWorld = (p: Planet): boolean => p.kind === 'ocean' || p.kind === 'mimic';
export const worldKey = (s: State, index: number): string => `${s.voyage!.sectorId}:${index}`;
export const planetLabel = (p: Planet): string => ({ safe: 'STABLE WORLD', radiation: 'RADIATION / HULL DAMAGE', storm: 'ION STORMS / SHEAR', ocean: 'SENTIENT OCEAN', mimic: 'WORLD EATER' })[p.kind];
function awaken(s: State, index: number) {
  const v = s.voyage!, p = v.system.planets[index];
  const life = v.worlds[worldKey(s, index)] ??= { hp: WORLD_HP, awake: false, clock: 0 };
  if (life.hp > 0 && !life.awake) {
    life.awake = true;
    announce(v, `${p.name}: ${planetLabel(p)} AWAKENS. Evade the marked pulse or fire to destroy it.`);
    shake(s, 7);
  }
  return life;
}

export function updatePlanetHazards(s: State, dt: number): void {
  const v = s.voyage;
  if (!v || v.lane || s.screen !== 'playing') return;
  for (const [index, planet] of v.system.planets.entries()) {
    const at = celestialPosition(v.system, planet, v.elapsed), dx = s.player.x - at.x, dy = s.player.y - at.y;
    const distance = Math.hypot(dx, dy), reach = planet.radius + 150;
    if (planet.kind === 'radiation' && distance < reach) damagePlayer(s, .5, null);
    if (planet.kind === 'storm' && distance < reach) {
      s.player.vx += -dy / Math.max(1, distance) * 220 * dt;
      s.player.vy += dx / Math.max(1, distance) * 220 * dt;
      if (v.elapsed % 4 > 3) damagePlayer(s, 1, null);
    }
    if (s.screen !== 'playing') return;
    if (!livingWorld(planet)) continue;
    let life = v.worlds[worldKey(s, index)];
    if (distance < planet.radius + 330) life = awaken(s, index);
    if (!life?.awake || life.hp <= 0) continue;
    life.clock += dt;
    const cycle = life.hp < WORLD_HP / 2 ? 3.5 : 5;
    if (life.clock < cycle) continue;
    life.clock %= cycle;
    if (distance > planet.radius + 950) continue;
    // Slow radial volleys leave navigable gaps. The ocean also emits a close-range tidal pulse.
    const count = planet.kind === 'ocean' ? 12 : 18;
    const bearing = Math.atan2(dy, dx);
    for (let i = 0; i < count; i++) {
      const angle = bearing + i / count * Math.PI * 2, dir = { x: Math.cos(angle), y: Math.sin(angle) };
      spawnBullet(s, { x: at.x + dir.x * (planet.radius + 12), y: at.y + dir.y * (planet.radius + 12) }, dir, 170, 1, 0, 5, 'enemy', planet.kind === 'ocean' ? '#65e1d5' : '#f19484');
    }
    if (planet.kind === 'ocean' && distance < planet.radius + 190) damagePlayer(s, 2, at);
  }
}

/** Called at each swept projectile sample, so shots cannot tunnel through a world. */
export function hitLivingWorld(s: State, bullet: Bullet): boolean {
  const v = s.voyage;
  if (!v || v.lane) return false;
  for (const [index, planet] of v.system.planets.entries()) {
    if (!livingWorld(planet)) continue;
    const at = celestialPosition(v.system, planet, v.elapsed);
    if (Math.hypot(bullet.x - at.x, bullet.y - at.y) > planet.radius + bullet.r) continue;
    const life = awaken(s, index);
    if (life.hp <= 0) continue;
    life.hp = Math.max(0, life.hp - bullet.dmg);
    burst(s, bullet, '#65e1d5', 4);
    if (!life.hp) {
      v.credits += 30; s.player.kills++;
      burst(s, at, '#65e1d5', 60); shake(s, 10);
      announce(v, `${planetLabel(planet)} silenced. Salvaged 30 credits. Its remains are inert.`);
    }
    return true;
  }
  return false;
}
