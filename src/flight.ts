import { updatePlanetHazards } from './planet-hazards';
import { engineFor, type EngineProfile } from './engines';
import { laneContains } from './hyperspace';
import { destroyPlayer } from './player';
import { burst, shake } from './fx';
import { SECTOR_CONFIG as tuning } from './sector-config';
import { moveVector } from './input';
import type { Body, State, Vec } from './state';
import { celestialPosition, debrisPosition } from './universe';
/** Responsive engine impulse plus mild frame-independent damping. */
export function impulse(body: Body, thrust: Vec, brake: boolean, dt: number, engine: EngineProfile = tuning): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (brake && speed) {
    const factor = Math.max(0, 1 - engine.brake * dt / speed);
    body.vx *= factor; body.vy *= factor;
  } else {
    body.vx += thrust.x * engine.thrust * dt; body.vy += thrust.y * engine.thrust * dt;
  }
  const damping = Math.exp(-engine.drag * dt);
  body.vx *= damping; body.vy *= damping;
  const limit = Math.hypot(body.vx, body.vy) / engine.cruiseSpeed;
  if (limit > 1) { body.vx /= limit; body.vy /= limit; }
  body.x += body.vx * dt; body.y += body.vy * dt;
}
export function updateFlight(s: State, dt: number): void {
  const v = s.voyage!, p = s.player, dir = p.stun ? { x: 0, y: 0 } : moveVector(s.input);
  const gravity = gravityAt(s, p);
  p.vx += gravity.x * dt; p.vy += gravity.y * dt;
  impulse(p, dir, s.input.held.has('Space'), dt, engineFor(s));
  if (dir.x || dir.y) p.aim = dir;
  if (v.lane && !laneContains(v.lane.course, p, p.r)) {
    destroyPlayer(s, 'FTL containment lost. You crossed the lane boundary.'); return;
  }
  for (const hazard of v.lane ? [] : v.system.hazards) {
    if (hazard.kind === 'ion-cloud' && Math.hypot(p.x - hazard.x, p.y - hazard.y) < hazard.radius) {
      p.vx += Math.sin(v.elapsed * .7) * hazard.strength * 8 * dt;
      p.vy += Math.cos(v.elapsed * .9) * hazard.strength * 8 * dt;
    }
  }
  if (dir.x || dir.y) p.aim = dir;
  const obstacles = v.lane ? v.lane.course.obstacles : [ ...v.system.debris.map(b => ({ ...debrisPosition(b, v.elapsed), radius: b.radius })),
    ...v.system.planets.map(b => ({ ...celestialPosition(v.system, b, v.elapsed), radius: b.radius })) ];
  for (const b of obstacles) {
    const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy), reach = p.r + b.radius;
    if (d >= reach) continue;
    const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
    p.x = b.x + nx * reach; p.y = b.y + ny * reach;
    const into = p.vx * nx + p.vy * ny;
    if (into < 0) { p.vx -= 1.5 * into * nx; p.vy -= 1.5 * into * ny; if (into < -40) { burst(s, p, '#dfc58b', 9); shake(s, 2); } }
  }
  if (v.lane && !laneContains(v.lane.course, p, p.r)) {
    destroyPlayer(s, 'FTL containment lost. You crossed the lane boundary.'); return;
  }
  updatePlanetHazards(s, dt);
  v.trailClock += dt;
  if (v.trailClock >= .08) {
    v.trailClock = 0; v.trail.push({ x: p.x, y: p.y, time: v.elapsed, thrust: !!(dir.x || dir.y) });
  }
  v.trail = v.trail.filter(t => v.elapsed - t.time < tuning.trailSeconds).slice(-110);
}

/** Softened, finite-range gravity; thrust dominates, so wells bend flight without trapping it. */
export function gravityAt(s: State, at: Vec): Vec {
  const v = s.voyage;
  if (!v || v.lane) return { x: 0, y: 0 };
  const bodies = [{ ...v.system.star, radius: v.system.star.radius, strength: 1 },
    ...v.system.planets.map(b => ({ ...celestialPosition(v.system, b, v.elapsed), radius: b.radius, strength: .55 }))];
  const acceleration = { x: 0, y: 0 };
  for (const b of bodies) {
    const dx = b.x - at.x, dy = b.y - at.y, d = Math.hypot(dx, dy), reach = b.radius * 6;
    if (d < 1 || d >= reach) continue;
    const pull = tuning.gravity * b.strength * Math.max(0, 1 - d / reach) / Math.max(1, (d / (b.radius * 2)) ** 2);
    acceleration.x += dx / d * pull; acceleration.y += dy / d * pull;
  }
  return acceleration;
}
