import { expect, test } from 'vitest';
import { lintLayout, type LayoutItem } from './ui-layout';
const viewport = {x:0,y:0,w:400,h:300};
const panel: LayoutItem = {kind:'panel',name:'frame',x:10,y:10,w:200,h:100,inset:8};
const text: LayoutItem = {kind:'text',name:'delivery',x:20,y:30,w:100,h:16,inset:0};
test('well-padded text passes',()=>expect(lintLayout([panel,text],viewport)).toEqual([]));
test('border intrusion produces an overfull box diagnostic',()=>expect(lintLayout([panel,{...text,x:12}],viewport).map(x=>x.rule)).toContain('overfull-panel'));
test('offscreen text and overlapping lines fail',()=>{
 const issues=lintLayout([text,{...text,name:'reward',x:25},{...text,name:'overflow',x:390}],viewport);
 expect(issues.map(x=>x.rule)).toEqual(expect.arrayContaining(['overfull-viewport','text-collision']));
});
test('later panels cannot partially obscure a label',()=>expect(lintLayout([text,{...panel,x:80}],viewport).map(x=>x.rule)).toContain('panel-occludes-text'));
test('fully obscuring a label also fails',()=>expect(lintLayout([text,panel],viewport).map(x=>x.rule)).toContain('panel-occludes-text'));

test('invalid geometry cannot silently disappear from visual lint', () => {
  for (const patch of [{x: NaN}, {y: Infinity}, {w: 0}, {h: -1}, {inset: -1}, {inset: Infinity}, {inset: 50}]) {
    expect(lintLayout([{...panel, ...patch}], viewport).map(i => i.rule), JSON.stringify(patch)).toContain('invalid-geometry');
  }
  expect(lintLayout([text], {...viewport, w: 0}).map(i => i.rule)).toContain('invalid-viewport');
});

test('panel borders must fit even when their text fits or they contain no text', () => {
  for (const patch of [{x: -1}, {y: -1}, {x: 201}, {y: 201}]) {
    expect(lintLayout([{...panel, ...patch}], viewport).map(i => i.rule)).toContain('overfull-panel-viewport');
  }
  expect(lintLayout([{...panel, x: 0, y: 0, w: 400, h: 300}], viewport)).toEqual([]);
});
