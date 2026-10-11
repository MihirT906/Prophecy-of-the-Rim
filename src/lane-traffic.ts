import { ENEMIES, ENEMY_BULLET_TTL } from './data';
import { spawnBullet } from './bullets';
import { damageEnemy } from './enemies';
import { impulse } from './flight';
import { laneCenter, laneContains } from './hyperspace';
import { damagePlayer } from './player';
import type { Enemy, State } from './state';

/** Oncoming pilots use the same impulse envelope and asteroid bounce as the player. */
export function updateLaneTraffic(s:State,e:Enemy,dt:number):void {
  const course=s.voyage!.lane!.course;
  if(!laneContains(course,e,e.r)) { damageEnemy(s,e,e.hp,{x:1,y:0}); return; }
  // Distributed tracks, with enough lookahead to follow bends without becoming pursuit swarms.
  const offset=((e.id%5)-2)*course.width*.1;
  const ahead=Math.max(0,e.x-420),wantY=laneCenter(course,ahead)+offset;
  let dx=-420,dy=wantY-e.y;
  for(const rock of course.obstacles) {
    if(rock.x>e.x || e.x-rock.x>650 || Math.abs(rock.y-e.y)>rock.radius+e.r+90) continue;
    dy+=(e.y<rock.y?-1:1)*(rock.radius+e.r+150);
  }
  if((e.fear??0)>0) {dx=e.x-s.player.x;dy=e.y-s.player.y;if(!dx&&!dy)dx=1;}
  const length=Math.hypot(dx,dy);impulse(e,{x:dx/length,y:dy/length},false,dt,course.engine);
  for(const rock of course.obstacles) {
    const rx=e.x-rock.x,ry=e.y-rock.y,d=Math.hypot(rx,ry),reach=e.r+rock.radius;
    if(d>=reach)continue;
    const nx=d?rx/d:1,ny=d?ry/d:0;
    e.x=rock.x+nx*reach;e.y=rock.y+ny*reach;
    const into=e.vx*nx+e.vy*ny;
    if(into<0){e.vx-=1.5*into*nx;e.vy-=1.5*into*ny;}
  }
  if(!laneContains(course,e,e.r)){damageEnemy(s,e,e.hp,{x:1,y:0});return;}
  e.facing=Math.atan2(e.vy,e.vx);
  const p=s.player,px=p.x-e.x,py=p.y-e.y,distance=Math.hypot(px,py)||1;
  if(distance<e.r+p.r){damagePlayer(s,ENEMIES[e.kind].dmg,e);damageEnemy(s,e,1,{x:-px/distance,y:-py/distance});}
  e.timer-=dt;
  if(e.hp>0 && distance<650 && e.timer<=0 && !(e.fear && e.fear>0)) {
    e.timer=1.2+(e.id%3)*.25;
    const b=spawnBullet(s,e,{x:px/distance,y:py/distance},650,1,0,ENEMY_BULLET_TTL,'enemy','#e88b78');
    b.vx+=e.vx;b.vy+=e.vy;
  }
}
