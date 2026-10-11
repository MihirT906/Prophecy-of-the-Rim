import { hitLivingWorld } from './planet-hazards';
import { isSolid } from './arena';
import { TILE } from './data';
import { damageEnemy, safeDamageEnemy } from './enemies';
import { damagePlayer } from './player';
import { explode, nearestEnemy } from './arms';
import type { Bullet, State, Vec } from './state';

const SUBSTEP = 4;  // px between path samples; smaller than any enemy radius, so fast shots can't skip a body or clip a corner

/** extra.homing (rad/s) steers a player bullet toward the nearest enemy; extra.blast (px) makes it explode on its first hit. */
export function spawnBullet(s: State, at: Vec, dir: Vec, speed: number, dmg: number, pierce: number, ttl: number, owner: 'player' | 'enemy', color: string,
  extra: { homing?: number; blast?: number; r?: number } = {}): Bullet {
  const b: Bullet = { x: at.x, y: at.y, vx: dir.x * speed, vy: dir.y * speed, r: extra.r ?? (owner === 'player' ? 3 : 5), hp: 1,
    dmg, pierce, owner, ttl, color, hit: new Set() };
  if (extra.homing) b.homing = extra.homing;
  if (extra.blast) b.blast = extra.blast;
  s.bullets.push(b);
  return b;
}

export function updateBullets(s: State, dt: number): void {
  const current=[...s.bullets];
  const survivors = current.filter(b => {
    if (s.screen !== 'playing') return true;  // a hit ended play mid-loop: the rest wait
    if ((b.ttl -= dt) <= 0) { if(b.fuse && b.blast) explode(s,b,b.blast,b.dmg,0,b.color); return false; }
    if (b.homing && b.owner === 'player') steerHoming(s, b, dt);
    const speed = Math.hypot(b.vx, b.vy) || 1, dir = { x: b.vx / speed, y: b.vy / speed };
    const n = Math.ceil(speed * dt / SUBSTEP);
    for (let k = 0; k < n; k++) {  // walk the path, so the nearest wall or body is hit first
      b.x += b.vx * dt / n;
      b.y += b.vy * dt / n;
      if (!alive(s, b, dir)) return false;
    }
    return true;
  });
  s.bullets = [...survivors,...s.bullets.slice(current.length)]; // Retain debris spawned by kills during this update.
}

/** Rotate the velocity toward the nearest enemy by at most homing * dt radians, keeping the speed. */
function steerHoming(s: State, b: Bullet, dt: number): void {
  const target = b.targetId !== undefined ? s.enemies.find(e=>e.id===b.targetId) : nearestEnemy(s, b);
  if (!target) return;
  const speed = Math.hypot(b.vx, b.vy) || 1, want = Math.atan2(target.y - b.y, target.x - b.x), have = Math.atan2(b.vy, b.vx);
  let delta = want - have;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const a = have + Math.max(-b.homing! * dt, Math.min(b.homing! * dt, delta));
  b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
}

/** One point on the path: false once the bullet hits a wall, the player, or runs out of pierce. */
function alive(s: State, b: Bullet, dir: Vec): boolean {
  if (isSolid(s.arena, Math.floor(b.x / TILE), Math.floor(b.y / TILE))) {
    if (b.blast && b.owner === 'player') explode(s, b, b.blast, b.dmg, 0, b.color);
    return false;
  }
  const p = s.player;
  if (b.debris && !b.safeForPlayer && Math.hypot(p.x-b.x,p.y-b.y)<p.r+b.r) { damagePlayer(s,1,b); return false; }
  if (b.owner === 'enemy') {
    if (Math.hypot(p.x - b.x, p.y - b.y) >= p.r + b.r) return true;
    damagePlayer(s, b.dmg, b);
    return false;
  }
  if (hitLivingWorld(s, b)) return false;
  for (const e of [...s.enemies]) {
    if (b.hit.has(e.id) || Math.hypot(e.x - b.x, e.y - b.y) >= e.r + b.r) continue;
    if (b.blast) { explode(s, b, b.blast, b.dmg, 0, b.color); return false; }  // the blast covers the body it struck
    b.hit.add(e.id);
    (b.safeForPlayer ? safeDamageEnemy : damageEnemy)(s, e, b.dmg, dir, b.chainDepth ?? 0);
    if (--b.pierce < 0) return false;
  }
  return true;
}
