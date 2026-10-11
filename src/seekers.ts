import { ENEMIES, PLAYER, SEEKER } from './data';
import { damageEnemy, spawnEnemy } from './enemies';
import { burst, shake } from './fx';
import { damagePlayer, steer } from './player';
import type { Enemy, State, Vec } from './state';
import { announce } from './voyage';

/** A ring of sleeping drones around `at`. */
export function spawnNest(s: State, at: Vec, nest: string, count = SEEKER.nest): Enemy[] {
  return Array.from({ length: count }, (_, k) => {
    const a = k / count * Math.PI * 2, home = { x: at.x + Math.cos(a) * 40, y: at.y + Math.sin(a) * 40 };
    const e = spawnEnemy(s, 'seeker', home);
    e.seeker = { awake: false, fuse: 0, home, nest };
    return e;
  });
}

/** Wake a drone, its whole nest, and any sleeper close enough to a waking one to be roused in turn. */
export function wakeSeekers(s: State, first: Enemy): void {
  const queue = [first];
  for (const e of queue) {
    if (e.seeker!.awake) continue;
    Object.assign(e.seeker!, { awake: true, fuse: SEEKER.fuse + (e.id % 3) * .3 });  // staggered, so they do not all fizzle on one tick
    for (const o of s.enemies) {
      if (o.seeker && !o.seeker.awake && (o.seeker.nest === e.seeker!.nest || Math.hypot(o.x - e.x, o.y - e.y) <= SEEKER.chain)) queue.push(o);
    }
  }
  if (s.voyage) announce(s.voyage, 'HUNTER-SEEKERS: nest awake. Shoot one and the blast takes its neighbours.');
}

export function updateSeeker(s: State, e: Enemy, dt: number): void {
  const b = e.seeker!, p = s.player, d = ENEMIES.seeker;
  const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1, to = { x: dx / dist, y: dy / dist };
  if (!b.awake) {
    // Asleep: a slow bob around the hover point.
    const hx = b.home.x + Math.cos(s.time * 1.3 + e.id) * 6 - e.x, hy = b.home.y + Math.sin(s.time * 1.7 + e.id) * 6 - e.y;
    e.vx = hx * 3; e.vy = hy * 3; e.x += e.vx * dt; e.y += e.vy * dt;
    if (dist <= SEEKER.wake) wakeSeekers(s, e);
    return;
  }
  b.fuse -= dt;
  if (b.fuse <= 0) {  // spent: it winks out without a blast
    e.hp = 0;
    s.enemies.splice(s.enemies.indexOf(e), 1);
    burst(s, e, '#77735f', 5);
    return;
  }
  // Low acceleration: it overshoots and swings wide, so a sharp turn throws it off.
  steer(e, to, d.speed, d.accel, PLAYER.friction, dt);
  e.x += e.vx * dt; e.y += e.vy * dt;
  if (Math.hypot(e.vx, e.vy) > 20) e.facing = Math.atan2(e.vy, e.vx);
  if (dist < e.r + p.r) {
    damagePlayer(s, d.dmg, e);
    damageEnemy(s, e, e.hp, to);  // it dies on the needle, and its blast still catches the others
  }
}

/** The blast a dead drone leaves: neighbours inside it die too, which is what makes a swarm chain. */
export function detonate(s: State, e: Enemy): void {
  burst(s, e, '#ffb347', 14);
  shake(s, 1.5);
  for (const o of [...s.enemies]) {
    const gap = Math.hypot(o.x - e.x, o.y - e.y);
    // Guild ships are left out: a drone's blast is not the player opening fire on a patrol.
    if (o.patrol || gap > SEEKER.blast + o.r) continue;
    damageEnemy(s, o, SEEKER.blastDmg, { x: (o.x - e.x) / (gap || 1), y: (o.y - e.y) / (gap || 1) });
  }
  if (Math.hypot(s.player.x - e.x, s.player.y - e.y) <= SEEKER.blast + s.player.r) damagePlayer(s, SEEKER.splashDmg, e);
}
