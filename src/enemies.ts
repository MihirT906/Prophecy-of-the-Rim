import { updateLaneTraffic } from './lane-traffic';
import { killFeedback } from './combat-feedback';
import { moveBody, slide } from './arena';
import { spawnBullet } from './bullets';
import { BOUNCE, ENEMIES, ENEMY_BULLET_TTL, PLAYER, type EnemyKind } from './data';
import { spawnEncounters } from './encounters';
import { alertSquad, steerPatrol } from './patrols';
import { springAmbush, updateRaider } from './raiders';
import { detonate, updateSeeker } from './seekers';
import { updateStorms } from './storms';
import { updateWitness } from './witness';
import { updateWorm } from './worms';
import { blood, burst, splat } from './fx';
import { damagePlayer, steer } from './player';
import { nextId, type Enemy, type State, type Vec } from './state';
import { rollDrop } from './weapons';

export function spawnEnemy(s: State, kind: EnemyKind, at: Vec): Enemy {
  const d = ENEMIES[kind];
  const e: Enemy = { id: nextId(s), kind, x: at.x, y: at.y, vx: 0, vy: 0, r: d.r, hp: d.hp, maxHp: d.hp, timer: d.fireInterval ?? 0, flash: 0, facing: -Math.PI / 2 };
  s.enemies.push(e);
  return e;
}

export function updateEnemies(s: State, dt: number): void {
  const p = s.player;
  spawnEncounters(s);
  updateStorms(s, dt);
  for (const e of [...s.enemies]) {  // a copy: blasts remove enemies mid-loop
    if (s.screen !== 'playing') return;  // player died mid-loop
    if (e.hp <= 0) continue;  // caught in an earlier blast this tick
    const d = ENEMIES[e.kind];
    e.flash = Math.max(0, e.flash - dt);
    if (s.voyage?.lane) { updateLaneTraffic(s, e, dt); continue; }
    if (e.kind === 'worm') { updateWorm(s, e, dt); continue; }  // flies and bites by its own rules
    if (e.kind === 'seeker') { updateSeeker(s, e, dt); continue; }
    if (e.kind === 'raider') { updateRaider(s, e, dt); continue; }
    if (e.kind === 'witness') { updateWitness(s, e, dt); continue; }
    const dx = p.x - e.x, dy = p.y - e.y, dist = Math.hypot(dx, dy) || 1;
    const to = { x: dx / dist, y: dy / dist }, afraid = (e.fear ?? 0) > 0;  // Hawk Strike: flee and hold fire
    let dir = afraid ? { x: -to.x, y: -to.y } : to;
    switch (e.kind) {
      case 'rusher':
      case 'brute':
        break;
      case 'gunner': {
        const range = d.range!;
        if (!afraid) dir = dist > range ? to : dist < range * 0.6 ? { x: -to.x, y: -to.y } : { x: 0, y: 0 };
        e.timer -= dt;
        if (e.timer <= 0 && dist <= range && !afraid) {
          e.timer = d.fireInterval!;
          spawnBullet(s, e, to, d.bulletSpeed!, d.dmg, 0, ENEMY_BULLET_TTL, 'enemy', d.color);
        }
        break;
      }
      case 'patrol':
        if (!afraid) dir = steerPatrol(s, e, dt);  // a Hawk Strike scatters a patrol like anything else
        break;
    }
    // Wedged on a wall: sidestep, switching side every second. Open space has no walls to wedge a patrol on.
    if (e.kind !== 'patrol' && (dir.x || dir.y) && Math.hypot(e.vx, e.vy) < d.speed * 0.2) {
      const k = (e.id + Math.floor(s.time)) % 2 ? 1 : -1;
      dir = { x: -dir.y * k, y: dir.x * k };
    }
    steer(e, dir, d.speed, d.accel, PLAYER.friction, dt);
    moveBody(s.arena, e, dt);
    // The gunner aims at the player; the others look where they walk, keeping the last facing when still.
    if (e.kind === 'gunner') e.facing = Math.atan2(dy, dx);
    else if (Math.hypot(e.vx, e.vy) > 20) e.facing = Math.atan2(e.vy, e.vx);
    if (dist < e.r + p.r && (!e.patrol || e.patrol.mode === 'pursue')) {  // a patrol on its route brushes past
      damagePlayer(s, d.dmg, e, d.stun);
      e.vx = -to.x * BOUNCE;
      e.vy = -to.y * BOUNCE;
    }
  }
  if (!s.voyage?.lane) separate(s); // Lane pilots collide with the real corridor, never the legacy tile clamp.
}

/** Push overlapping enemies apart so a crowd reads as a crowd. */
function separate(s: State): void {
  const es = s.enemies;
  for (let i = 0; i < es.length; i++) {
    for (let j = i + 1; j < es.length; j++) {
      if (es[i].kind === 'worm' || es[j].kind === 'worm') continue;  // nothing shoves a worm
      const a = es[i], b = es[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, o = a.r + b.r - d;
      if (o <= 0) continue;
      const px = dx / d * o / 2, py = dy / d * o / 2;
      slide(s.arena, a, -px, -py);  // through the grid, so a crowd can't shove anyone into a wall
      slide(s.arena, b, px, py);
    }
  }
}

export function damageEnemy(s: State, e: Enemy, dmg: number, dir: Vec, chainDepth = 0): void {
  if (e.hp <= 0) return;
  if (e.witness && !e.witness.seen) return;  // unwatched, it is not quite there
  e.hp -= dmg;
  e.flash = 0.08;
  if (e.patrol) alertSquad(s, e, true);
  if (e.raider) springAmbush(s, e);
  blood(s, e, dir, 6);
  if (e.hp > 0) return;
  const d = ENEMIES[e.kind];
  s.enemies.splice(s.enemies.indexOf(e), 1);
  s.player.kills++;
  if(s.voyage) {
    killFeedback(s,e,chainDepth);
    // Neutral shrapnel is dangerous to everyone. Bound propagation and projectile count.
    const shardCount=Math.max(0,Math.min(8,192-s.bullets.filter(b=>b.debris).length,450-s.bullets.length));
    if(chainDepth<6) for(let i=0;i<shardCount;i++) {
      const angle=i*Math.PI/4;
      const b=spawnBullet(s,e,{x:Math.cos(angle),y:Math.sin(angle)},360,2,0,1.1,'player','#ff845d',{r:4});
      b.debris=true;b.chainDepth=chainDepth+1;b.hit.add(e.id);
    }
  }
  burst(s, e, d.color, 16);
  splat(s, e, dir);
  if (e.seeker) detonate(s, e); else rollDrop(s, e);  // a drone leaves a blast, not salvage
}

/** Bomb-caused chains are player-safe, including immediate seeker blasts and emitted debris. */
export function safeDamageEnemy(s:State,e:Enemy,dmg:number,dir:Vec,depth=0):void {
 const immunity=s.player.iframes,first=s.bullets.length;
 s.player.iframes=Infinity;
 try { damageEnemy(s,e,dmg,dir,depth); }
 finally { s.player.iframes=immunity; for(const b of s.bullets.slice(first)) if(b.debris)b.safeForPlayer=true; }
}
