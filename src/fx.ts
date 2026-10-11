import { MAX_PARTICLES, MAX_SHAKE, PALETTE } from './data';
import { reducedMotion } from './accessibility';
import type { State, Vec } from './state';

function spawn(s: State, at: Vec, angle: number, speed: number, ttl: number, size: number, color: string): void {
  s.particles.push({ x: at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, ttl, maxTtl: ttl, size, color, decal: false });
}

/** Spray along dir; settles into decals in updateFx. Blood is recognised by PALETTE.blood. */
export function blood(s: State, at: Vec, dir: Vec, n: number): void {
  const a = Math.atan2(dir.y, dir.x);
  for (let i = 0; i < n; i++) {
    spawn(s, at, a + (Math.random() - 0.5) * 1.2, 80 + Math.random() * 220, 0.15 + Math.random() * 0.25, 2 + Math.random() * 2, PALETTE.blood);
  }
}

/** One blood-splats.png decal, variant picked at random, rotated to point along dir. */
export function splat(s: State, at: Vec, dir: Vec): void {
  const v = Math.floor(Math.random() * 4);
  s.particles.push({ x: at.x, y: at.y, vx: 0, vy: 0, ttl: Infinity, maxTtl: Infinity, size: 0, color: PALETTE.blood, decal: true,
    splat: v, rot: Math.atan2(dir.y, dir.x) + (v === 1 ? Math.PI / 4 : 0) });  // variant 1 streaks to the upper right
}

export function burst(s: State, at: Vec, color: string, n: number): void {
  for (let i = 0; i < n; i++) {
    spawn(s, at, Math.random() * Math.PI * 2, 60 + Math.random() * 200, 0.25 + Math.random() * 0.35, 2 + Math.random() * 3, color);
  }
}

export function muzzle(s: State, at: Vec, dir: Vec, color: string): void {
  const a = Math.atan2(dir.y, dir.x);
  for (let i = 0; i < 3; i++) spawn(s, at, a + (Math.random() - 0.5) * 0.8, 120 + Math.random() * 120, 0.06, 3, i ? color : '#ffffff');
}

export function shake(s: State, amount: number): void {
  if (reducedMotion()) return;
  s.shake = Math.max(s.shake, Math.min(MAX_SHAKE, amount * .25));
}

/** Particles settle into decals, shake decays. */
export function updateFx(s: State, dt: number): void {
  const k = 0.9;  // per-tick velocity damping
  s.particles = s.particles.filter(p => {
    if (p.decal) return true;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= k;
    p.vy *= k;
    p.ttl -= dt;
    if (p.ttl > 0) return true;
    if (p.color !== PALETTE.blood) return false;
    p.decal = true;
    p.vx = p.vy = 0;
    p.ttl = Infinity;
    p.size = 2 + Math.random() * 2;
    return true;
  });
  let excess = s.particles.length - MAX_PARTICLES;
  if (excess > 0) s.particles = s.particles.filter(p => !(p.decal && excess-- > 0));
  s.shake *= Math.exp(-22 * dt);
  if (s.shake < 0.05) s.shake = 0;
}
