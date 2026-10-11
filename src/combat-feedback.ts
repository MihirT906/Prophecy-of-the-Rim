import { playEffect } from './alien-voice';
import { reducedMotion } from './accessibility';
import type { State, Vec } from './state';
import { label } from './space-render';
interface Floater extends Vec { text: string; until: number }
interface Pulse extends Vec { radius: number; until: number }
const memory = new WeakMap<State, { kills: number; last: number; floaters: Floater[]; pulses: Pulse[]; sector: number; lane: unknown }>();
function feedback(s: State) {
  let f = memory.get(s);
  if (!f || f.sector !== s.voyage?.sectorId || f.lane !== s.voyage?.lane) {
    f = {kills:0,last:-10,floaters:[],pulses:[],sector:s.voyage?.sectorId ?? -1,lane:s.voyage?.lane}; memory.set(s,f);
  }
  return f;
}
export function killFeedback(s: State, at: Vec, depth: number): void {
  const f=feedback(s); if(s.time-f.last>.05) playEffect('hit'); f.kills=s.time-f.last < 2 ? f.kills+1 : 1; f.last=s.time;
  const text=depth ? `${f.kills}x COMBO / CHAIN ${depth}` : f.kills > 1 ? `${f.kills}x COMBO` : 'DEBRIS!';
  // Nearby kills update one world-space readout instead of laying text over text.
  const nearby=f.floaters.find(p=>p.until>s.time && Math.hypot(p.x-at.x,p.y-at.y)<260);
  if(nearby) {nearby.text=text;nearby.until=s.time+1.1;}
  else f.floaters.push({...at,text,until:s.time+1.1});
  f.floaters=f.floaters.filter(x=>x.until>s.time).slice(-4);
}
export function blastFeedback(s: State, at: Vec, radius: number): void {
  const f=feedback(s); f.pulses.push({...at,radius,until:s.time+.25}); f.pulses=f.pulses.filter(x=>x.until>s.time).slice(-8);
}
export function drawCombatFeedback(ctx: CanvasRenderingContext2D,s: State): void {
  const f=feedback(s);
  for(const p of f.pulses) if(p.until>s.time) {
    ctx.save(); ctx.globalAlpha=(p.until-s.time)*3; ctx.fillStyle='#ffc47c';
    // Pixel ring: the visible footprint is the actual damage radius.
    for(let i=0;i<48;i++) {const a=i*Math.PI/24;ctx.fillRect(Math.round(p.x+Math.cos(a)*p.radius),Math.round(p.y+Math.sin(a)*p.radius),3,3);} ctx.restore();
  }
  for(const p of f.floaters) if(p.until>s.time) label(ctx,p.text,p.x,p.y-35-(reducedMotion()?0:(1.1-p.until+s.time)*30),12,'#ffd58e','center');
}
