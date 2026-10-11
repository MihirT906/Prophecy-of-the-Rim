import {beforeEach,expect,test} from 'vitest';
import {newState} from './state';
import {startVoyage} from './voyage';
import {installLane,laneCenter} from './hyperspace';
import {nextInwardSector} from './universe';
import {updateLaneTraffic} from './lane-traffic';
beforeEach(()=>Object.assign(globalThis,{localStorage:{getItem:()=>null,setItem:()=>{}}}));
function setup(){const s=newState({held:new Set(),pressed:[],typed:[]},'traffic');startVoyage(s,'traffic');installLane(s,{from:s.voyage!.sectorId,to:nextInwardSector(s.voyage!.universe,s.voyage!.sectorId)});return s;}
test('fresh lane has denser oncoming traffic, not stationary pursuit enemies',()=>{const s=setup();expect(s.enemies.length).toBeGreaterThanOrEqual(18);expect(s.enemies.every(e=>e.vx<0)).toBe(true);const e=s.enemies[0],x=e.x;updateLaneTraffic(s,e,.1);expect(e.x).toBeLessThan(x);});
test('crossing the lane boundary kills an enemy instead of clamping it back inside',()=>{const s=setup(),e=s.enemies[0],c=s.voyage!.lane!.course;e.y=laneCenter(c,e.x)+c.width;updateLaneTraffic(s,e,.016);expect(s.enemies).not.toContain(e);expect(s.bullets.some(b=>b.debris)).toBe(true);});
test('asteroids push traffic to their surface and reflect inward velocity',()=>{
 const s=setup(),e=s.enemies[0],c=s.voyage!.lane!.course;
 const x=e.x,y=laneCenter(c,x);c.obstacles=[{x,y,radius:100}];Object.assign(e,{x:x+100+e.r-2,y,vx:-500,vy:0});
 updateLaneTraffic(s,e,0);expect(e.x).toBeCloseTo(x+100+e.r);expect(e.vx).toBeGreaterThan(0);
});
