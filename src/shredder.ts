import type { State, Vec } from './state';
export const SHREDDER = {range:620, blast:64, damage:2, speed:800, interval:.38};
/** Stable, distinct targets in the forward cone; no lock-on delay or targets behind the pilot. */
export function shredderTargets(s: State, aim: Vec) {
  return s.enemies.filter(e=>{const dx=e.x-s.player.x,dy=e.y-s.player.y,d=Math.hypot(dx,dy);return e.hp>0 && d>0 && d<SHREDDER.range && (dx*aim.x+dy*aim.y)/d>.7;})
    .sort((a,b)=>Math.hypot(a.x-s.player.x,a.y-s.player.y)-Math.hypot(b.x-s.player.x,b.y-s.player.y)||a.id-b.id).slice(0,3);
}
export function drawShredderLocks(ctx:CanvasRenderingContext2D,s:State):void {
  if(!s.voyage || s.player.weapon!=='pistol') return;
  ctx.fillStyle='#ffd58e';
  for(const e of shredderTargets(s,s.player.aim)) for(const dx of [-1,1]) for(const dy of [-1,1]) {
    const x=Math.round(e.x+dx*(e.r+9)),y=Math.round(e.y+dy*(e.r+9));
    ctx.fillRect(x-(dx>0?7:0),y,8,2);ctx.fillRect(x,y-(dy>0?7:0),2,8);
  }
}
