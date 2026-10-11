import {expect,test} from '@playwright/test';
test('B places a safe damage wave and F opens the expanded armory',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.clock.install({time:new Date('2026-10-09T12:00:00Z')});await page.goto('/');await page.clock.pauseAt(new Date('2026-10-09T12:00:10Z'));
 const press=async(key:string)=>{await page.keyboard.press(key);await page.clock.runFor(50);};
 await press('Enter');await press('Enter');await page.keyboard.type('BombPilot');await press('Enter');await page.clock.runFor(800);
 await page.evaluate(()=>{const s=(window as any).__state;Object.assign(s.player,{x:1200,y:1200,vx:0,vy:0,hp:10,maxHp:10,iframes:0});s.enemies=[];s.bullets=[];s.storms=[];s.voyage.system.planets=[];s.voyage.system.debris=[];s.voyage.system.hazards=[];
 for(const y of [1180,1240])s.enemies.push({id:++s.nextId,kind:'gunner',x:1280,y,vx:0,vy:0,r:12,hp:4,maxHp:4,timer:100,flash:0,facing:0});});
 const kills=await page.evaluate(()=>(window as any).__state.player.kills);
 await press('b');expect(await page.evaluate(()=>(window as any).__state.screen)).toBe('playing');
 await page.screenshot({path:info.outputPath('bomb-armed.png')});await page.clock.runFor(1000);
 await page.screenshot({path:info.outputPath('bomb-wave.png')});await page.clock.runFor(1000);
 expect(await page.evaluate(()=>(window as any).__state.player.kills)).toBeGreaterThanOrEqual(kills+2);
 expect(await page.evaluate(()=>(window as any).__state.player.hp)).toBe(10);
 await page.evaluate(()=>{const s=(window as any).__state;Object.assign(s.player,s.voyage.system.dock,{vx:0,vy:0});s.voyage.personalSpice=36;s.voyage.collected=36;s.voyage.jumpTimer=0;s.enemies=[];});
 await press('f');expect(await page.evaluate(()=>(window as any).__state.screen)).toBe('shop');
 for(let i=0;i<3;i++)await press('ArrowDown');await page.screenshot({path:info.outputPath('new-weapons.png')});await press('Enter');
 expect(await page.evaluate(()=>(window as any).__state.player.weapon)).toBe('rocket');expect(errors).toEqual([]);
});
