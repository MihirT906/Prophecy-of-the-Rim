import { drawLaneSpace, drawLaneEdges, drawFoldGate } from './lane-art';
import { drawAsteroid } from './retro-render';
import { drawQuestTracker } from './quest-render';
import { contractCountdown } from './contracts';
import { uiPanel } from './raster-ui';
import { reducedMotion } from './accessibility';
import type { State } from './state';
import { laneCenter } from './hyperspace';
import { engineFor } from './engines';
import { ACCENT, DIM, INK, label, line, text } from './space-render';
import { drawGuide, drawLaneMission } from './mission-render';
/** World-space geometry under the same following camera as a star system. */
export function drawLane(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const course = s.voyage!.lane!.course, left = s.player.x - w / 2, top = s.player.y - h / 2;
  drawLaneSpace(ctx, s, w, h);
  drawLaneEdges(ctx, course, left, w);
  for (const obstacle of course.obstacles) {
    if (obstacle.x + obstacle.radius < left || obstacle.x - obstacle.radius > left + w || obstacle.y + obstacle.radius < top || obstacle.y - obstacle.radius > top + h) continue;
    drawAsteroid(ctx, obstacle, obstacle.radius, `fold:${s.voyage!.universe.seed}:${obstacle.x}:${obstacle.y}`);
  }
  const trail = s.voyage!.trail;
  for (let i = 1; i < trail.length; i++) {
    ctx.globalAlpha = i / trail.length * .55;
    line(ctx, trail[i - 1], trail[i], trail[i].thrust ? ACCENT : '#657384', trail[i].thrust ? 3 : 1);
  }
  ctx.globalAlpha = 1;
  const exitY = laneCenter(course, course.exit.x);
  if (course.exit.x > left - 120 && course.exit.x < left + w + 120) drawFoldGate(ctx, course);
  label(ctx, 'EXIT / SUBLIGHT', course.exit.x - 20, exitY - 80, 17, ACCENT, 'right');
  label(ctx, 'CROSS THE FINISH LINE >', course.exit.x - 20, exitY - 52, 12, INK, 'right');
  const entranceY = laneCenter(course, 0);
  line(ctx, { x: 0, y: entranceY - course.width / 2 }, { x: 0, y: entranceY + course.width / 2 }, '#e27676', 5);

}
export function drawLaneHud(ctx: CanvasRenderingContext2D, s: State, w: number, h: number): void {
  const v = s.voyage!, lane = v.lane!, engine = engineFor(s), speed = Math.hypot(s.player.vx, s.player.vy);
  const distance = Math.hypot(s.player.x - lane.course.exit.x, s.player.y - lane.course.exit.y);
  uiPanel(ctx, 'hudTop', 0, 0, w, 88); uiPanel(ctx, 'hudBottom', 0, h - 72, w, 72);
  text(ctx, `FTL > ${v.universe.sectors[lane.to].name.toUpperCase()}`, 22, 28, 19, ACCENT);
  text(ctx, `HULL ${Math.ceil(s.player.hp)}/${s.player.maxHp} / YOUR SPICE ${v.personalSpice} / CARGO ${v.cargo?.remaining ?? 0}`, 22, 52, 13);
  text(ctx, `SPEED ${speed.toFixed(0)} / ${engine.cruiseSpeed}`, w / 2, 28, 16, INK, 'center');
  text(ctx, `BRAKING ${Math.ceil(speed * speed / (2 * engine.brake))}m / WIDE TURNS`, w / 2, 52, 11, DIM, 'center');
  text(ctx, `EXIT ${(distance / 1000).toFixed(1)}km >`, w - 22, 28, 18, ACCENT, 'right');
  const margin = lane.course.width / 2 - Math.abs(s.player.y - laneCenter(lane.course, s.player.x)) - s.player.r;
  text(ctx, `LETHAL EDGE ${Math.max(0, Math.floor(margin))}m`, w - 22, 52, 12, margin < 250 ? '#ec857a' : DIM, 'right');
  ctx.fillStyle = '#26333a'; ctx.fillRect(22, 70, w - 44, 5);
  ctx.fillStyle = ACCENT; ctx.fillRect(22, 70, (w - 44) * Math.max(0, Math.min(1, s.player.x / lane.course.exit.x)), 5);
  text(ctx, 'WASD steer / thrust   SPACE brake   Z / ARROWS fire   1-4 arms   ESC pause   V mute', 22, h - 25, 13, INK);
  text(ctx, v.cargo?.contract ? `DELIVERY ${contractCountdown(v)} / +${v.cargo.contract.bonus} SPICE ON TIME / EXPIRY COUNTS AS THEFT` : v.noticeTimer > 0 ? v.notice : 'LEAVING THE RED BOUNDARY IS FATAL. REACH THE EXIT LINE TO RETURN TO SUBLIGHT.', 22, h - 49, 12, DIM);
  drawQuestTracker(ctx, s, w);
  drawLaneMission(ctx, s, w);
  drawGuide(ctx, s, w, h);
  if (s.player.iframes > .35 && !reducedMotion()) { ctx.strokeStyle = '#ee806e'; ctx.lineWidth = 8; ctx.strokeRect(4, 4, w - 8, h - 8); }
}
