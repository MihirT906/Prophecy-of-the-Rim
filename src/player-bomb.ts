import { playEffect } from './alien-voice';
import { safeDamageEnemy } from './enemies';
import { uiPanel } from './raster-ui';
import { label, text } from './space-render';
import type { State, Vec } from './state';
export const PLAYER_BOMB = { fuse:.8, wave:.55, radius:340, damage:10, recharge:4 };
interface Bomb extends Vec { age:number; hit:Set<number> }
const states=new WeakMap<State,{ cooldown:number; bombs:Bomb[]; sector: number; lane:unknown; voyage:State['voyage'] }>();
function state(s:State) {
 let b=states.get(s);
 if(!b || b.voyage!==s.voyage || b.sector!==s.voyage?.sectorId || b.lane!==s.voyage?.lane) {
  b={cooldown:b?.voyage===s.voyage?b.cooldown:0,bombs:[],sector:s.voyage?.sectorId??-1,lane:s.voyage?.lane,voyage:s.voyage};states.set(s,b);
 }
 return b;
}
export function placePlayerBomb(s:State):boolean {
 if(s.screen!=='playing'||!s.voyage)return false;
 const b=state(s);if(b.cooldown>0){playEffect('hit');return false;}
 b.bombs.push({x:s.player.x,y:s.player.y,age:0,hit:new Set()});b.cooldown=PLAYER_BOMB.recharge;playEffect('shot');return true;
}
export function updatePlayerBombs(s:State,dt:number):void {
 const b=state(s);b.cooldown=Math.max(0,b.cooldown-dt);
 for(const bomb of b.bombs){const before=bomb.age;bomb.age+=dt;
  if(bomb.age<PLAYER_BOMB.fuse)continue;
  if(before<PLAYER_BOMB.fuse)playEffect('hit');
  const r=PLAYER_BOMB.radius*Math.min(1,(bomb.age-PLAYER_BOMB.fuse)/PLAYER_BOMB.wave);
  for(const e of [...s.enemies])if(!bomb.hit.has(e.id)&&Math.hypot(e.x-bomb.x,e.y-bomb.y)<=r+e.r){bomb.hit.add(e.id);safeDamageEnemy(s,e,PLAYER_BOMB.damage,{x:0,y:0});}
 }
 b.bombs=b.bombs.filter(b=>b.age<PLAYER_BOMB.fuse+PLAYER_BOMB.wave+.2);
}
export function drawPlayerBombs(ctx:CanvasRenderingContext2D,s:State):void {
 for(const b of state(s).bombs){
  const armed=b.age<PLAYER_BOMB.fuse,r=armed?PLAYER_BOMB.radius:PLAYER_BOMB.radius*Math.min(1,(b.age-PLAYER_BOMB.fuse)/PLAYER_BOMB.wave);
  ctx.save();ctx.fillStyle=armed?'#7ae8d866':'#a4fff0';
  for(let i=0;i<96;i++){const a=i*Math.PI/48;ctx.fillRect(Math.round(b.x+Math.cos(a)*r),Math.round(b.y+Math.sin(a)*r),armed?2:5,armed?2:5);}
  ctx.fillStyle='#173938';ctx.fillRect(b.x-10,b.y-10,20,20);ctx.fillStyle='#9affdf';ctx.fillRect(b.x-5,b.y-5,10,10);ctx.restore();
  if(armed)label(ctx,`BOMB ${(PLAYER_BOMB.fuse-b.age).toFixed(1)}s / PLAYER SAFE`,b.x,b.y-24,11,'#9affdf','center');
 }
}
export function drawBombHud(ctx:CanvasRenderingContext2D,s:State,w:number,h:number):void {
 const b=state(s);uiPanel(ctx,'well',w-242,h-132,224,38);
 text(ctx,b.cooldown>0?`B: BOMB RECHARGE ${b.cooldown.toFixed(1)}s`:'B: AREA BOMB / READY',w-228,h-108,12,b.cooldown>0?'#b7b3a0':'#9affdf');
}
