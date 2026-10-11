import { spawnBullet } from './bullets';
import { ENEMIES, ENEMY_BULLET_TTL, PLAYER, RAIDER } from './data';
import { spawnEnemy } from './enemies';
import { damagePlayer, steer } from './player';
import type { Enemy, State, Vec } from './state';
import { announce } from './voyage';

/** A pack lying dark in a staggered wedge around `at`. */
export function spawnRaiders(s: State, at: Vec, count: number, pack: string): Enemy[] {
  return Array.from({ length: count }, (_, i) => {
    const e = spawnEnemy(s, 'raider', { x: at.x - 34 * Math.ceil(i / 2), y: at.y + (i % 2 ? 38 : -38) * Math.ceil(i / 2) });
    e.raider = { mode: 'dark', dir: { x: 1, y: 0 }, t: 0, pack };
    e.facing = Math.PI;
    return e;
  });
}

/** Light the whole pack's engines. Each ship comes about for a slightly different time, so the runs arrive in a string. */
export function springAmbush(s: State, e: Enemy): void {
  if (e.raider!.mode !== 'dark') return;
  let k = 0;
  for (const o of s.enemies) if (o.raider?.pack === e.raider!.pack && o.raider.mode === 'dark') Object.assign(o.raider, { mode: 'wheel', t: .2 + .25 * k++ });
  if (s.voyage) announce(s.voyage, 'HARKONNEN AMBUSH: raiders lit their drives. Break across their attack runs.');
}

export function updateRaider(s: State, e: Enemy, dt: number): void {
  const b = e.raider!, p = s.player, d = ENEMIES.raider;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, to = { x: dx / dist, y: dy / dist };
  if (b.mode === 'dark') {
    e.vx *= PLAYER.friction; e.vy *= PLAYER.friction;
    if (dist <= ((s.voyage?.cargo || s.voyage?.personalSpice) ? RAIDER.ambush : RAIDER.quiet)) springAmbush(s, e);
  } else if (dist > RAIDER.giveUp) {
    b.mode = 'dark';
  } else if (b.mode === 'wheel') {
    b.t -= dt;
    steer(e, to, d.speed * .45, d.accel, PLAYER.friction, dt);
    e.facing = Math.atan2(dy, dx);
    if (b.t <= 0) {
      // Commit to where the target will be, not where it is: a ship that holds its course gets hit.
      const ax = dx + p.vx * RAIDER.lead, ay = dy + p.vy * RAIDER.lead, an = Math.hypot(ax, ay) || 1;
      Object.assign(b, { mode: 'run', t: RAIDER.runSeconds, dir: { x: ax / an, y: ay / an } });
    }
  } else {
    b.t -= dt;
    steer(e, b.dir, d.speed, d.accel, PLAYER.friction, dt);
    e.facing = Math.atan2(b.dir.y, b.dir.x);
    const ahead = to.x * b.dir.x + to.y * b.dir.y;  // cosine of the target's bearing off the nose
    e.timer -= dt;
    if (e.timer <= 0 && dist <= d.range! && ahead >= Math.cos(RAIDER.fireArc)) {
      e.timer = d.fireInterval!;
      spawnBullet(s, e, b.dir, d.bulletSpeed!, d.dmg, 0, ENEMY_BULLET_TTL, 'enemy', d.color);  // fixed guns fire down the heading
    }
    if (b.t <= 0 || (ahead < 0 && dist > RAIDER.overshoot)) Object.assign(b, { mode: 'wheel', t: RAIDER.wheelSeconds });
  }
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (b.mode !== 'dark' && dist < e.r + p.r) damagePlayer(s, d.dmg, e);
}
