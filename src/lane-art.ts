import { reducedMotion } from './accessibility';
import { laneCenter, type LaneCourse } from './hyperspace';
import { makeRng } from './rng';
import { drawDeepSpace } from './retro-render';
import type { State } from './state';

/** Cached pixel art shared by every lane. No asset generation or gameplay RNG in the frame loop. */
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(kind: 'edge' | 'beacon' | 'arrow' | 'gate'): HTMLCanvasElement {
  const cached = sprites.get(kind); if (cached) return cached;
  const c = document.createElement('canvas'); c.width = 32; c.height = 64;
  const g = c.getContext('2d')!;
  if (kind === 'edge') {
    for (let y=0;y<64;y++) {
      g.fillStyle = `rgba(125,53,49,${.26*(1-y/64)})`; g.fillRect(0,y,32,1);
      if(y%8===0) {g.fillStyle='#713c3528';g.fillRect(0,y,32,1);}
    }
    g.fillStyle='#db9478';g.fillRect(0,0,32,2);
    g.fillStyle='#6f403b';g.fillRect(0,3,32,2);
    for(let x=0;x<32;x+=8) {g.fillStyle='#ffcd9433';g.fillRect(x,7,3,14);}
  } else if(kind==='arrow') {
    for(let i=0;i<10;i++) {g.fillStyle=i<7?'#7196a670':'#b6c7bd99';g.fillRect(8+i,22+i,3,3);g.fillRect(8+i,42-i,3,3);}
  } else {
    const gate=kind==='gate';
    g.fillStyle='#101923';g.fillRect(6,5,20,54);
    g.fillStyle='#455465';g.fillRect(8,7,16,50);
    g.fillStyle='#a3977c';g.fillRect(8,7,3,50);g.fillRect(8,7,16,3);
    g.fillStyle='#222f3b';g.fillRect(12,12,11,40);
    for(let y=16;y<50;y+=8) {g.fillStyle=gate?'#afdace':'#d79571';g.fillRect(13,y,8,3);g.fillStyle='#e6d9b6';g.fillRect(9,y,2,2);}
    g.fillStyle='#71858a';g.fillRect(5,4,22,4);g.fillRect(5,56,22,4);
  }
  sprites.set(kind,c);return c;
}

export function drawLaneSpace(ctx: CanvasRenderingContext2D,s: State,w:number,h:number):void {
  drawDeepSpace(ctx,s,w,h);
  if(reducedMotion()) return;
  const speed=Math.hypot(s.player.vx,s.player.vy), stretch=Math.min(38,speed/45);
  if(stretch<3) return;
  const left=s.player.x-w/2,top=s.player.y-h/2;
  // Sparse world-anchored streaks: they stop stretching when the ship brakes.
  const cell=240;
  ctx.save();ctx.fillStyle='#84a5bc38';
  for(let x=Math.floor(left/cell);x<Math.ceil((left+w)/cell);x++) for(let y=Math.floor(top/cell);y<Math.ceil((top+h)/cell);y++) {
    const rng=makeRng(`${s.voyage!.universe.seed}:fold:${x}:${y}`);
    for(let i=0;i<3;i++) ctx.fillRect(Math.round(x*cell+rng()*cell),Math.round(y*cell+rng()*cell),stretch,1);
  }
  ctx.restore();
}

export function drawLaneEdges(ctx:CanvasRenderingContext2D,course:LaneCourse,left:number,w:number):void {
  ctx.save();ctx.imageSmoothingEnabled=false;
  for(const side of [-1,1]) {
    for(let x=Math.max(0,Math.floor(left/32)*32);x<Math.min(course.length,left+w+32);x+=32) {
      const y=laneCenter(course,x)+side*course.width/2;
      const slope=(laneCenter(course,x+32)-laneCenter(course,x))/32;
      ctx.save();ctx.translate(x,y);ctx.transform(1,slope,0,side,0,0);
      ctx.drawImage(sprite('edge'),0,0,32,90);ctx.restore();
    }
    for(let x=Math.max(0,Math.floor(left/256)*256);x<Math.min(course.length,left+w+256);x+=256) {
      const y=laneCenter(course,x)+side*(course.width/2+30);
      ctx.drawImage(sprite('beacon'),x-16,y-32,32,64);
    }
  }
  for(let x=Math.max(400,Math.floor(left/400)*400);x<Math.min(course.exit.x,left+w+80);x+=400)
    ctx.drawImage(sprite('arrow'),x-32,laneCenter(course,x)-64,64,128);
  ctx.restore();
}

export function drawFoldGate(ctx:CanvasRenderingContext2D,course:LaneCourse):void {
  const x=course.exit.x,y=laneCenter(course,x),half=course.width/2;
  ctx.save();ctx.imageSmoothingEnabled=false;
  // Stable exit field, not flashing: the bright centre is the actual crossing plane.
  const glow=ctx.createLinearGradient(x-60,0,x+60,0);glow.addColorStop(0,'#81bdb900');glow.addColorStop(.5,'#81bdb933');glow.addColorStop(1,'#81bdb900');
  ctx.fillStyle=glow;ctx.fillRect(x-60,y-half,120,course.width);
  for(const side of [-1,1]) ctx.drawImage(sprite('gate'),x-48,y+side*(half-40)-96,96,192);
  ctx.fillStyle='#b7e6d7';ctx.fillRect(x-2,y-half,4,course.width);
  ctx.restore();
}
