import { expect, test } from 'vitest';
import { portraitFrame } from './portrait-animation';

test('speech uses phoneme frames and quiet pauses close the mouth', () => {
  const talking = Array.from({length:30}, (_,i) => portraitFrame(i / 10,true,.7));
  expect(new Set(talking).size).toBe(12);
  expect(talking.every(f => f >= 4 && f < 16)).toBe(true);
  expect(portraitFrame(1,true,0)).toBeLessThan(4);
  expect(portraitFrame(1,false,.9)).toBeLessThan(4);
});
test('idle breathes and blinks without using talking frames', () => {
  expect(portraitFrame(4.62,false,0)).toBe(2);
  expect(portraitFrame(4.75,false,0)).toBe(3);
  expect(portraitFrame(NaN,true,NaN)).toBe(0);
  for (let t=0;t<20;t+=.05) expect(portraitFrame(t,false,0)).toBeLessThan(4);
});
