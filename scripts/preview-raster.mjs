import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const browser = await chromium.launch({channel:'chrome',headless:true});
const page = await browser.newPage({viewport:{width:1280,height:800}});
mkdirSync('artifacts/raster-ui',{recursive:true});
try {
 await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5173'); await page.waitForTimeout(900);
 await page.screenshot({path:'artifacts/raster-ui/title.png'});
 const press = async key => { await page.keyboard.press(key); await page.waitForTimeout(120); };
 await press('Enter'); await page.screenshot({path:'artifacts/raster-ui/menu.png'});
 await press('Enter'); await page.keyboard.type('Raster'); await press('Enter'); await page.waitForTimeout(800);
 await page.screenshot({path:'artifacts/raster-ui/flight.png'});
 await press('m'); await page.screenshot({path:'artifacts/raster-ui/map.png'}); await press('Escape');
 await page.evaluate(() => { const s=window.__state; Object.assign(s.player,s.voyage.system.cache,{vx:0,vy:0}); s.voyage.jumpTimer=0; });
 await press('e'); await page.waitForTimeout(500);
 for (const kind of ['navigator','facedancer','ghola','smuggler']) {
  await page.evaluate(kind => {const s=window.__state; s.comms.entity.kind=kind; s.comms.shown=0; s.comms.wait=0;},kind);
  await page.waitForTimeout(800); await page.screenshot({path:`artifacts/raster-ui/${kind}.png`});
 }
} finally { await browser.close(); }
