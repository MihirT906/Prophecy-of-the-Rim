import { SHREDDER, shredderTargets } from './shredder';
import { spawnBullet } from './bullets';
import { DROPS, PICKUP_R, WEAPONS, type WeaponId } from './data';
import { muzzle } from './fx';
import { randRange } from './rng';
import type { State, Vec } from './state';

export function fire(s: State, aim: Vec): void {
  const p = s.player;
  if (p.cooldown > 1e-9) return;  // epsilon: 15 ticks of 1/60 must clear a 0.25 s cooldown
  const w = WEAPONS[p.weapon];
  const at = { x: p.x + aim.x * (p.r + 4), y: p.y + aim.y * (p.r + 4) };
  const base = Math.atan2(aim.y, aim.x);
  if (s.voyage && p.weapon === 'pistol') {
    const targets=shredderTargets(s,aim);
    for(let i=0;i<3;i++) {
      const target=targets[i], angle=target ? Math.atan2(target.y-at.y,target.x-at.x) : base+(i-1)*.16;
      const b=spawnBullet(s,at,{x:Math.cos(angle),y:Math.sin(angle)},SHREDDER.speed,SHREDDER.damage,0,.8,'player','#ffd58e',{blast:SHREDDER.blast,r:5});
      b.vx+=p.vx;b.vy+=p.vy;b.fuse=true;
      if(target) {b.targetId=target.id;b.homing=3;}
    }
    p.cooldown+=SHREDDER.interval; p.muzzle=.12; muzzle(s,at,aim,'#ffd58e'); return;
  }
  const targets=w.homing?shredderTargets(s,aim):[];
  for (let i = 0; i < w.count; i++) {
    const a = base + randRange(s.rng, -w.spread / 2, w.spread / 2);
    const b = spawnBullet(s, at, { x: Math.cos(a), y: Math.sin(a) }, w.speed, w.dmg,
      w.pierce, w.ttl, 'player', w.color, {blast:w.blast,homing:w.homing,r:w.blast?6:undefined});
    if(w.blast)b.fuse=true;
    if(targets[i])b.targetId=targets[i].id;
    b.vx += p.vx; b.vy += p.vy;  // shots keep the ship's velocity, so a drifting or orbiting ship fires straight streams
  }
  p.cooldown += w.interval;  // carry the overshoot so the average rate is exact
  muzzle(s, at, aim, w.color);
  p.muzzle = 0.09;
  if (p.weapon !== 'pistol' && --p.ammo <= 0) {
    p.weapon = 'pistol';
    p.ammo = Infinity;
  }
}

/** amount is in rounds. hp 1 = armed, 0 = waits for the player to step off. */
export function spawnPickup(s: State, kind: 'weapon' | 'ammo', weapon: WeaponId, at: Vec): void {
  const pool = WEAPONS[weapon].ammo;
  s.pickups.push({ kind, weapon, amount: kind === 'weapon' ? pool : Math.ceil(pool / 2),
    x: at.x, y: at.y, vx: 0, vy: 0, r: PICKUP_R, hp: 1 });
}

export function rollDrop(s: State, at: Vec): void {
  if (s.rng() < DROPS.weapon) {
    const ids = (Object.keys(WEAPONS) as WeaponId[]).filter(id => id !== 'pistol');
    spawnPickup(s, 'weapon', ids[Math.floor(s.rng() * ids.length)], at);
  } else if (s.rng() < DROPS.ammo && s.player.weapon !== 'pistol') {
    spawnPickup(s, 'ammo', s.player.weapon, at);
  }
}

export function updatePickups(s: State): void {
  const p = s.player;
  for (const pk of [...s.pickups]) {
    if (Math.hypot(pk.x - p.x, pk.y - p.y) >= p.r + pk.r) { pk.hp = 1; continue; }
    if (!pk.hp) continue;
    if (pk.kind === 'ammo') {
      if (p.weapon === 'pistol') continue; // nothing to top up; the pickup stays on the floor
      p.ammo = Math.min(p.ammo + pk.amount, 2 * WEAPONS[p.weapon].ammo);
    } else {
      if (p.weapon !== 'pistol') {
        spawnPickup(s, 'weapon', p.weapon, p);
        const old = s.pickups[s.pickups.length - 1];
        old.amount = p.ammo;
        old.hp = 0;
      }
      p.weapon = pk.weapon;
      p.ammo = Math.round(pk.amount);
    }
    s.pickups.splice(s.pickups.indexOf(pk), 1);
  }
}
