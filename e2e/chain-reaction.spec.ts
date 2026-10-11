import { expect, test } from '@playwright/test';
test('starter salvo produces dangerous debris and world combo feedback',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install({time:new Date('2026-10-09T12:00:00Z')});await page.goto('/');await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
 const press=async(key:string)=>{await page.keyboard.press(key);await page.clock.runFor(50);};
 await press('Enter');await press('Enter');await page.keyboard.type('Hux');await press('Enter');await page.clock.runFor(800);
 await page.evaluate(()=>{const s=(window as any).__state;Object.assign(s.player,{x:1200,y:1200,vx:0,vy:0,iframes:5,aim:{x:1,y:0}});s.enemies=[];s.bullets=[];s.voyage.system.planets=[];s.voyage.system.debris=[];
 for(let i=0;i<6;i++)s.enemies.push({id:++s.nextId,kind:'rusher',x:1420+i*45,y:1200+(i%2)*35,vx:0,vy:0,r:12,hp:2,maxHp:2,timer:0,flash:0,facing:0});});
 await page.keyboard.down('ArrowRight');await page.clock.runFor(220);await page.keyboard.up('ArrowRight');await page.clock.runFor(180);
 const result=await page.evaluate(()=>{const s=(window as any).__state;return {kills:s.player.kills,shards:s.bullets.filter((b:any)=>b.debris).length};});
 expect(result.kills).toBeGreaterThan(1);expect(result.shards).toBeGreaterThan(0);
 await page.screenshot({path:info.outputPath('chain-combos.png')});expect(errors).toEqual([]);
});
