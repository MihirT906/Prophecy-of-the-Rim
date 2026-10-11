import { describe, expect, it } from 'vitest';
import { decodeBase64, parseMidi } from './midi';
import { SCORE, type TrackId } from './music/score';
import { chooseTrack } from './music';
import { newState, type Screen } from './state';
import { installInput } from './input';

const PATCHES = new Set([38, 89, 81, 91, 11, 95]);

describe('score', () => {
  for (const id of Object.keys(SCORE) as TrackId[]) {
    it(`${id} parses into playable, loopable events`, () => {
      const song = parseMidi(decodeBase64(SCORE[id]));
      expect(song.length).toBeGreaterThan(8);
      const notes = song.events.filter(e => e.kind === 'note');
      expect(notes.length).toBeGreaterThan(10);
      for (const n of notes) {
        expect(n.time).toBeGreaterThanOrEqual(0);
        expect(n.time).toBeLessThan(song.length);
        expect(n.duration).toBeGreaterThan(0);
      }
      for (const [ch, program] of Object.entries(song.programs)) if (Number(ch) !== 9) expect(PATCHES.has(program)).toBe(true);
      for (const e of song.events) if (e.kind === 'bend') expect(Math.abs(e.semitones)).toBeLessThanOrEqual(2);
      expect(song.events.filter(e => e.kind === 'bend').at(-1)?.semitones ?? 0).toBeCloseTo(0, 2);  // loops start in tune
    });
  }
});

describe('chooseTrack', () => {
  const s = newState(installInput(new EventTarget() as unknown as Window), 'm');
  const cases: [Screen, TrackId][] = [['title', 'prophecy'], ['menu', 'ledger'], ['naming', 'ledger'], ['comms', 'navigator'], ['shop', 'bazaar'],
    ['market', 'bazaar'], ['map', 'chart'], ['paused', 'trance'], ['dead', 'requiem'], ['transcended', 'kwisatz'], ['playing', 'desert']];
  it.each(cases)('%s plays %s', (screen, track) => { s.screen = screen; expect(chooseTrack(s, false)).toBe(track); });
  it('flight turns to war near enemies', () => { s.screen = 'playing'; expect(chooseTrack(s, true)).toBe('sardaukar'); });
});
