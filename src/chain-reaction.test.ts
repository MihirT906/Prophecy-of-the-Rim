import { beforeEach, expect, test } from 'vitest';
import { newState } from './state';
import { startVoyage } from './voyage';
import { damageEnemy, spawnEnemy } from './enemies';
import { updateBullets } from './bullets';
import { fire } from './weapons';
import { shredderTargets } from './shredder';
beforeEach(()=>Object.assign(globalThis,{localStorage:{getItem:()=>null,setItem:()=>{}}}));
function setup(){const s=newState({held:new Set(),pressed:[],typed:[]},'chain');startVoyage(s,'chain');s.enemies=[];s.bullets=[];s.voyage!.system.planets=[];Object.assign(s.player,{x:100,y:100,vx:0,vy:0});return s;}
test('death shards hurt another enemy, propagate, and survive the bullet update',()=>{
 const s=setup(),a=spawnEnemy(s,'rusher',{x:500,y:500}),b=spawnEnemy(s,'rusher',{x:560,y:500}),c=spawnEnemy(s,'rusher',{x:620,y:500});
 damageEnemy(s,a,99,{x:1,y:0});expect(s.bullets.filter(b=>b.debris)).toHaveLength(8);
 for(let i=0;i<40;i++)updateBullets(s,1/60);
 expect(s.enemies.some(e=>e.id===b.id || e.id===c.id)).toBe(false);
 expect(s.player.kills).toBe(3);expect(s.bullets.some(b=>(b.chainDepth??0)>=2)).toBe(true);
});
test('neutral death shards also hurt the player',()=>{
 const s=setup();Object.assign(s.player,{x:560,y:500,iframes:0}); const e=spawnEnemy(s,'rusher',{x:500,y:500});damageEnemy(s,e,99,{x:1,y:0});
 const hp=s.player.hp;for(let i=0;i<15;i++)updateBullets(s,1/60);expect(s.player.hp).toBeLessThan(hp);
});
test('propagation stops at its bounded depth',()=>{const s=setup(),e=spawnEnemy(s,'rusher',{x:500,y:500});damageEnemy(s,e,99,{x:1,y:0},6);expect(s.bullets).toHaveLength(0);});
test('starter salvo assigns distinct forward targets and never selects enemies behind',()=>{
 const s=setup();for(const y of [60,100,140])spawnEnemy(s,'rusher',{x:350,y});spawnEnemy(s,'rusher',{x:30,y:100});
 expect(shredderTargets(s,{x:1,y:0})).toHaveLength(3);fire(s,{x:1,y:0});expect(s.bullets).toHaveLength(3);
 expect(new Set(s.bullets.map(b=>b.targetId)).size).toBe(3);expect(s.bullets.every(b=>b.blast===64)).toBe(true);expect(s.player.ammo).toBe(Infinity);
});
