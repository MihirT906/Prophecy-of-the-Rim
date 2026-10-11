import { expect, test } from 'vitest';
import { newState } from './state';
import { setReducedMotion } from './accessibility';
import { shake, updateFx } from './fx';
test('repeated impacts cannot stack camera shake and it settles quickly',()=>{
 setReducedMotion(false);
 const s=newState({held:new Set(),pressed:[],typed:[]},'shake');
 shake(s,8);expect(s.shake).toBe(2);
 for(let i=0;i<30;i++)shake(s,8);
 expect(s.shake).toBe(2);shake(s,100);expect(s.shake).toBe(3);
 updateFx(s,.2);expect(s.shake).toBeLessThan(.05);
});
test('reduced motion still suppresses shake entirely',()=>{
 setReducedMotion(true);const s=newState({held:new Set(),pressed:[],typed:[]},'shake');shake(s,100);expect(s.shake).toBe(0);setReducedMotion(false);
});
