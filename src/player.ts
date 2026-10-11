import { damageAssist } from './accessibility';
import { playEffect } from './alien-voice';
import { updateFlight } from './flight';
import { moveBody } from './arena';
import { IFRAMES, KNOCKBACK, PLAYER, STUN } from './data';
import { burst, shake } from './fx';
import { aimVector, moveVector } from './input';
import { writeSave } from './save';
import type { Body, Player, State, Vec } from './state';
import { fire, updatePickups } from './weapons';

export function newPlayer(): Player {
  return {
    x: 0, y: 0, vx: 0, vy: 0, r: PLAYER.r, hp: PLAYER.hp, maxHp: PLAYER.hp,
    speed: PLAYER.speed, accel: PLAYER.accel, friction: PLAYER.friction,
    weapon: 'pistol', ammo: Infinity,
    cooldown: 0, iframes: 0, stun: 0, muzzle: 0,
    aim: { x: 1, y: 0 },
    kills: 0,
  };
}

/** Move velocity toward dir * speed by accel * dt; with no input also apply friction. Shared with enemies. */
export function steer(b: Body, dir: Vec, speed: number, accel: number, friction: number, dt: number): void {
  const dx = dir.x * speed - b.vx, dy = dir.y * speed - b.vy;
  const d = Math.hypot(dx, dy), step = accel * dt;
  const k = d <= step ? 1 : step / d;
  b.vx += dx * k;
  b.vy += dy * k;
  if (!dir.x && !dir.y) { b.vx *= friction; b.vy *= friction; }
}

export function updatePlayer(s: State, dt: number): void {
  const p = s.player;
  p.cooldown -= dt;
  p.iframes = Math.max(0, p.iframes - dt);
  p.stun = Math.max(0, p.stun - dt);
  p.muzzle = Math.max(0, p.muzzle - dt);
  if (s.voyage) updateFlight(s, dt);
  else {
  steer(p, p.stun > 0 ? { x: 0, y: 0 } : moveVector(s.input), p.speed, p.accel, p.friction, dt);
  moveBody(s.arena, p, dt);
  }
  if (s.screen !== 'playing') return;
  let aim = aimVector(s.input);
  if (!aim.x && !aim.y && s.input.held.has('KeyZ')) aim = p.aim;
  if (aim.x || aim.y) {
    p.aim = aim;
    const fired = p.cooldown <= 1e-9;
    fire(s, aim);
    if (fired && s.voyage) playEffect('shot');
  } else p.cooldown = Math.max(0, p.cooldown);  // leftover only carries while the trigger is held
  updatePickups(s);
}

export function damagePlayer(s: State, dmg: number, from: Vec | null, stun = false): void {
  const p = s.player;
  if (p.iframes > 0 || s.screen === 'dead') return;
  p.hp -= damageAssist() ? dmg / 2 : dmg; if (s.voyage) playEffect('hit');
  p.iframes = IFRAMES;
  if (stun) p.stun = STUN;
  if (from) {
    const dx = p.x - from.x, dy = p.y - from.y, d = Math.hypot(dx, dy) || 1;
    p.vx = (dx / d) * KNOCKBACK;
    p.vy = (dy / d) * KNOCKBACK;
  }
  shake(s, 3 + dmg * 2);
  if (p.hp <= 0) destroyPlayer(s);

}

/** Fatal environmental failures bypass combat invulnerability and persist immediately. */
export function destroyPlayer(s: State, reason = 'Ship destroyed.'): void {
  if (s.screen === 'dead') return;
  s.player.hp = 0; s.player.vx = 0; s.player.vy = 0; s.screen = 'dead';
  if (s.voyage) { s.voyage.status = 'lost'; s.voyage.notice = reason; s.voyage.noticeTimer = 5; }
  burst(s, s.player, '#ed8a75', 26); shake(s, 10); playEffect('hit'); writeSave(s);
}
