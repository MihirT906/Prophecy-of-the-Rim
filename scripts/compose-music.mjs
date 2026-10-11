// Composes the game's score as Standard MIDI Files (type 1) and an embedded base64 module.
// Brief: Wendy Carlos' Moog counterpoint meets the 1984 Dune score: D-centred, Phrygian,
// bassy, warm, wrong in interesting places. Run: node scripts/compose-music.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

const PPQ = 480;
// Channel layout shared with src/music.ts patches (General MIDI program numbers as patch ids).
const CH = { bass: 0, pad: 1, lead: 2, choir: 3, bell: 4, drone: 5, drum: 9 };
const PROGRAM = { 0: 38, 1: 89, 2: 81, 3: 91, 4: 11, 5: 95 };
const NAMES = { 0: 'Moog bass', 1: 'Warm pad', 2: 'Carlos lead', 3: 'Bene Gesserit choir', 4: 'Glass bell', 5: 'Sietch drone', 9: 'Ritual drums' };
const DRUM = { kick: 36, snare: 38, hat: 42, taiko: 47, metal: 49, shaker: 70 };

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'D2' -> 38, 'Bb3' -> 58, 'C#4' -> 61; numbers pass through. */
const p = n => {
  if (typeof n === 'number') return n;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
  if (!m) throw new Error(`bad note ${n}`);
  return NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
};

class Song {
  constructor(id, title, bpm, num, bars, den = 4) {
    Object.assign(this, { id, title, bpm, num, den, bars, events: [] });
    this.beatsPerBar = num * 4 / den;
  }
  get length() { return this.bars * this.beatsPerBar; }
  note(ch, beat, len, pitch, vel = 90) {
    if (beat >= this.length) return this;
    const t = Math.round(beat * PPQ), end = Math.round(Math.min(beat + len, this.length) * PPQ);
    this.events.push({ ch, t, kind: 'on', a: p(pitch), b: Math.max(1, Math.min(127, Math.round(vel))) });
    this.events.push({ ch, t: Math.max(t + 1, end - 2), kind: 'off', a: p(pitch), b: 0 });
    return this;
  }
  chord(ch, beat, len, pitches, vel = 80) { pitches.forEach(n => this.note(ch, beat, len, n, vel)); return this; }
  /** 'D4:2 F4:1 r:1 D3+A3:4' from a start beat; returns the end beat. */
  seq(ch, beat, text, vel = 90) {
    for (const token of text.trim().split(/\s+/)) {
      if (token === '|') continue;
      const [pitches, dur] = token.split(':'); const len = Number(dur ?? 1);
      if (pitches !== 'r') for (const n of pitches.split('+')) this.note(ch, beat, len * .95, n, vel);
      beat += len;
    }
    return beat;
  }
  /** Pitch bend in semitones (range ±2). */
  bend(ch, beat, semis) {
    const v = Math.max(0, Math.min(16383, Math.round(8192 + semis / 2 * 8191)));
    this.events.push({ ch, t: Math.round(beat * PPQ), kind: 'bend', a: v & 127, b: v >> 7 });
    return this;
  }
  glide(ch, from, to, a, b, steps = 12) {
    for (let i = 0; i <= steps; i++) this.bend(ch, from + (to - from) * i / steps, a + (b - a) * i / steps);
    return this;
  }
  drum(beat, name, vel = 90) { return this.note(CH.drum, beat, .25, DRUM[name], vel); }
}

// ---------- Standard MIDI File writer ----------
const vlq = n => { const out = [n & 127]; while ((n >>= 7)) out.unshift((n & 127) | 128); return out; };
const u32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const text = (type, s) => { const b = [...Buffer.from(s, 'latin1')]; return [0xff, type, ...vlq(b.length), ...b]; };
function chunk(id, bytes) { return [...Buffer.from(id, 'latin1'), ...u32(bytes.length), ...bytes]; }
function trackBytes(timed, endTick) {
  const order = { off: 0, prog: 1, bend: 2, meta: 3, on: 4 };
  timed.sort((x, y) => x.t - y.t || order[x.kind] - order[y.kind]);
  const out = []; let last = 0;
  for (const e of timed) { out.push(...vlq(e.t - last), ...e.bytes); last = e.t; }
  out.push(...vlq(Math.max(0, endTick - last)), 0xff, 0x2f, 0);
  return chunk('MTrk', out);
}
function writeMidi(song) {
  const end = song.length * PPQ, tempo = Math.round(60e6 / song.bpm);
  const tracks = [trackBytes([
    { t: 0, kind: 'meta', bytes: text(3, song.title) },
    { t: 0, kind: 'meta', bytes: [0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255] },
    { t: 0, kind: 'meta', bytes: [0xff, 0x58, 4, song.num, Math.log2(song.den), 24, 8] },
    { t: 0, kind: 'meta', bytes: text(1, 'Prophecy of the Rim score. Composed for the game; loops seamlessly.') },
  ], end)];
  for (const ch of [...new Set(song.events.map(e => e.ch))].sort((a, b) => a - b)) {
    const timed = [{ t: 0, kind: 'meta', bytes: text(3, NAMES[ch]) }];
    if (ch !== 9) timed.push({ t: 0, kind: 'prog', bytes: [0xc0 | ch, PROGRAM[ch]] }, { t: 0, kind: 'bend', bytes: [0xe0 | ch, 0, 64] });
    for (const e of song.events.filter(e => e.ch === ch)) {
      const status = { on: 0x90, off: 0x80, bend: 0xe0 }[e.kind] | ch;
      timed.push({ t: e.t, kind: e.kind, bytes: [status, e.a, e.b] });
    }
    tracks.push(trackBytes(timed, end));
  }
  return Buffer.from([...chunk('MThd', [0, 1, 0, tracks.length, PPQ >> 8, PPQ & 255]), ...tracks.flat()]);
}

// ---------- Harmony helpers ----------
const up = (n, semis) => p(n) + semis;
/** Triad-ish chord tones from a root and intervals. */
const tones = (root, ...iv) => iv.map(i => p(root) + i);
const MIN = [0, 3, 7], MAJ = [0, 4, 7];

// ---------- 1. PROPHECY (title) ----------
function prophecy() {
  const s = new Song('prophecy', 'Prophecy of the Rim', 66, 4, 16);
  // D minor wandering through a Phrygian Eb and an A chord with a sour flat nine.
  const prog = [['D2', MIN], ['Bb1', MAJ], ['G1', MIN], ['A1', [0, 4, 7, 13]], ['D2', MIN], ['Bb1', MAJ], ['Eb2', MAJ], ['A1', [0, 4, 7, 13]]];
  s.chord(CH.drone, 0, 64, ['D1', 'A1'], 62);
  prog.forEach(([root, iv], i) => {
    const b = i * 8, r = p(root);
    for (let bar = 0; bar < 2; bar++) {
      const o = b + bar * 4;
      s.note(CH.bass, o, 1.4, r, 112).note(CH.bass, o + 1.5, .45, r + 12, 84)
        .note(CH.bass, o + 2, .9, r, 100).note(CH.bass, o + 3, .45, r + 7, 80).note(CH.bass, o + 3.5, .45, r - 2 + (bar ? 3 : 0), 76);
    }
    s.chord(CH.pad, b, 8, iv.map(x => r + 24 + x), 66);
    if (i >= 2) s.drum(b, 'taiko', 110).drum(b + 4, 'taiko', 80);
    if (i % 2) s.drum(b + 7.5, 'metal', 70);
  });
  s.seq(CH.choir, 8, 'D4:3 F4:1 E4:4 D4:2 Bb3:2 A3:4 G3:3 Bb3:1 A3:4 C#4:4 E4:2 D4:2 F4:3 G4:1 A4:4 Bb4:3 G4:1 Eb4:4 E4:2 C#4:2 D4:4', 78);
  // Carlos: switched-on baroque arpeggios with ornaments, entering halfway.
  prog.slice(4).forEach(([root, iv], i) => {
    const b = 32 + i * 8, chord = [...iv.slice(0, 3), 12].map(x => p(root) + 36 + x);
    for (let k = 0; k < 16; k++) s.note(CH.lead, b + k * .25, .22, chord[[0, 2, 1, 2, 3, 2, 1, 2, 0, 1, 2, 3, 2, 3, 1, 2][k]], 70 + (k % 4 === 0 ? 18 : 0));
    // Trill then a sighing quarter-tone droop.
    for (let k = 0; k < 8; k++) s.note(CH.lead, b + 4 + k * .125, .11, chord[3] + (k % 2 ? 1 : 0), 64);
    s.note(CH.lead, b + 5, 2.5, chord[2], 80).glide(CH.lead, b + 6, b + 7.4, 0, -.5).bend(CH.lead, b + 7.6, 0);
  });
  [0, 16, 32, 48].forEach(b => s.note(CH.bell, b, 3, 'A5', 60).note(CH.bell, b + 2.5, 3, 'G#5', 44));
  return s;
}

// ---------- 2. GUILD LEDGER (menus) ----------
function ledger() {
  const s = new Song('ledger', 'Guild Ledger (Invention in D Phrygian)', 92, 4, 8);
  // Two-voice Moog invention over a pedal; the answer comes a tritone away, which is the joke.
  const subject = 'D4:.5 Eb4:.25 F4:.25 G4:.5 A4:.5 Bb4:.25 A4:.25 G4:.25 F4:.25 Eb4:.5 D4:.5';
  for (let bar = 0; bar < 8; bar += 2) {
    s.seq(CH.lead, bar * 4, subject, 82);
    s.seq(CH.lead, bar * 4 + 4, 'A4:.25 G4:.25 F4:.25 Eb4:.25 D4:.5 C4:.25 D4:.25 Eb4:1 D4:1', 74);
  }
  for (let bar = 1; bar < 8; bar += 2) {
    // Answer at the tritone, in the bell, an octave down then up.
    let b = bar * 4;
    for (const n of ['G#3', 'A3', 'B3', 'C#4', 'D#4', 'E4', 'D#4', 'C#4']) { s.note(CH.bell, b, .45, up(n, 12), 58); b += .5; }
  }
  for (let beat = 0; beat < 32; beat += .5) {
    const bar = Math.floor(beat / 4), root = ['D2', 'D2', 'Eb2', 'D2', 'C2', 'Bb1', 'Eb2', 'A1'][bar];
    const step = Math.round(beat * 2) % 8;
    s.note(CH.bass, beat, .42, p(root) + [0, 12, 7, 12, 0, 10, 7, 3][step], step % 2 ? 76 : 104);
  }
  s.chord(CH.pad, 0, 16, ['D3', 'A3', 'Eb4'], 52).chord(CH.pad, 16, 16, ['C3', 'G3', 'D4'], 52);
  s.note(CH.drone, 0, 32, 'D1', 58);
  for (let b = 0; b < 32; b += 1) s.drum(b + .5, 'hat', b % 4 === 3 ? 60 : 36);
  for (let b = 0; b < 32; b += 4) s.drum(b, 'kick', 90).drum(b + 2.75, 'kick', 60);
  // Every second phrase the whole lead sags a quarter tone, like a tape stretching.
  s.glide(CH.lead, 14, 16, 0, -.5).bend(CH.lead, 16, 0).glide(CH.lead, 30, 31.7, 0, .5).bend(CH.lead, 31.9, 0);
  return s;
}

// ---------- 3. DEEP DESERT (system flight) ----------
function desert() {
  const s = new Song('desert', 'Deep Desert Drift', 76, 7, 16, 8);
  // 7/8 ostinato: 2+2+3. Bar = 3.5 beats.
  const riff = [['D2', 1, 112], ['D3', .5, 70], ['A1', 1, 96], ['C2', .5, 80], ['D2', .5, 90]];
  const roots = [0, 0, 0, 0, -2, -2, 1, 1, 0, 0, 0, 0, -4, -4, 1, -1];
  for (let bar = 0; bar < 16; bar++) {
    let b = bar * 3.5;
    for (const [n, len, v] of riff) { s.note(CH.bass, b, len * .9, p(n) + roots[bar], v); b += len; }
    s.drum(bar * 3.5, 'taiko', bar % 4 ? 84 : 112).drum(bar * 3.5 + 2, 'taiko', 64);
    if (bar % 2) s.drum(bar * 3.5 + 3, 'shaker', 52).drum(bar * 3.5 + 3.25, 'shaker', 40);
    if (bar % 4 === 3) s.drum(bar * 3.5 + 2.5, 'metal', 66);
  }
  s.chord(CH.drone, 0, 56, ['D1', 'A1'], 64);
  s.chord(CH.pad, 0, 14, ['D3', 'F3', 'A3', 'E4'], 58).chord(CH.pad, 14, 7, ['C3', 'F3', 'G3', 'D4'], 58)
    .chord(CH.pad, 21, 7, ['Eb3', 'G3', 'Bb3', 'D4'], 58).chord(CH.pad, 28, 14, ['D3', 'F3', 'A3', 'E4'], 58)
    .chord(CH.pad, 42, 7, ['Bb2', 'D3', 'F3', 'A3'], 58).chord(CH.pad, 49, 7, ['Eb3', 'G#3', 'C#4'], 58);
  // A wailing lead with glides between pitches that do not exist on a piano.
  s.note(CH.lead, 14, 5, 'A4', 72).glide(CH.lead, 16, 18.5, 0, 1).note(CH.lead, 19.5, 1.5, 'G4', 64).bend(CH.lead, 19.4, 0)
    .note(CH.lead, 21, 6, 'F4', 70).glide(CH.lead, 23, 26.5, 0, -1.5).bend(CH.lead, 27.5, 0);
  s.seq(CH.choir, 28, 'D4:3.5 E4:3.5 F4:7 Eb4:7 D4:7', 66);
  s.glide(CH.choir, 52, 55.5, 0, -.5).bend(CH.choir, 55.9, 0);
  for (let b = 3; b < 56; b += 7) s.note(CH.bell, b, 4, b % 14 === 3 ? 'D6' : 'G#5', 40);
  return s;
}

// ---------- 4. FOLDING SPACE (FTL lanes) ----------
function fold() {
  const s = new Song('fold', 'Folding Space', 138, 7, 8, 8);
  // Octatonic 16th arpeggios in 7, the bass pumping eighths, everything slightly too fast.
  const octa = ['D4', 'E4', 'F4', 'G4', 'Ab4', 'Bb4', 'B4', 'C#5'].map(p);
  for (let bar = 0; bar < 8; bar++) {
    const b0 = bar * 3.5, shift = [0, 0, 3, 3, 6, 6, 1, -2][bar];
    for (let k = 0; k < 14; k++) s.note(CH.bell, b0 + k * .25, .2, octa[(k * 3 + bar) % 8] + shift, 50 + (k % 7 === 0 ? 24 : 0));
    for (let k = 0; k < 7; k++) s.note(CH.bass, b0 + k * .5, .4, p('D2') + shift + (k === 4 ? 6 : k === 6 ? 12 : 0), k % 2 ? 80 : 110);
    s.drum(b0, 'kick', 115).drum(b0 + 1, 'kick', 90).drum(b0 + 2, 'snare', 90).drum(b0 + 3, 'metal', 60);
    for (let k = 0; k < 7; k++) s.drum(b0 + k * .5 + .25, 'hat', 40);
  }
  s.note(CH.lead, 7, 3, 'D5', 78).glide(CH.lead, 8, 10, 0, 2).bend(CH.lead, 10.4, 0)
    .note(CH.lead, 14, 3, 'Ab5', 78).glide(CH.lead, 15, 17, 0, -2).bend(CH.lead, 17.4, 0)
    .seq(CH.lead, 21, 'C#5:.5 D5:.5 F5:.5 E5:.5 D5:1.5 Bb4:.5 B4:.5 C#5:2.5', 76);
  s.chord(CH.pad, 0, 14, ['D3', 'Ab3', 'C4'], 50).chord(CH.pad, 14, 14, ['F3', 'B3', 'E4'], 50);
  s.note(CH.drone, 0, 28, 'D1', 60);
  return s;
}

// ---------- 5. SARDAUKAR (combat) ----------
function sardaukar() {
  const s = new Song('sardaukar', 'Sardaukar Chant', 112, 5, 8);
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 5, lift = bar >= 4 ? (bar % 2 ? 1 : 0) : 0;
    s.seq(CH.bass, b, `D2:.75 D2:.25 Eb2:.5 D2:.5 r:.5 A1:.5 D2:.5 C2:.5 Bb1:.5 Eb2:.5`.replace(/Eb2/g, lift ? 'E2' : 'Eb2'), 112);
    s.drum(b, 'taiko', 120).drum(b + 1.5, 'taiko', 90).drum(b + 3, 'taiko', 110).drum(b + 3.5, 'taiko', 80).drum(b + 4.5, 'snare', 96);
    for (let k = 0; k < 10; k++) s.drum(b + k * .5, 'hat', k % 2 ? 34 : 54);
    // Shouted choir stabs: "HA!" on the off-kilter beat.
    s.chord(CH.choir, b + 2.5, .4, ['D4', 'Eb4', 'A4'], 92);
    if (bar % 2) s.chord(CH.choir, b + 4, .4, ['C#4', 'D4', 'G#4'], 88);
  }
  s.chord(CH.pad, 0, 20, ['D3', 'Eb3', 'A3'], 56).chord(CH.pad, 20, 20, ['D3', 'E3', 'Bb3'], 56);
  s.seq(CH.lead, 20, 'A4:1 Bb4:.5 A4:.5 G#4:1 A4:2 D5:1.5 Eb5:.5 D5:.5 C5:.5 Bb4:1 A4:2.5 r:.5 G4:1 F4:1 Eb4:1 D4:3', 88);
  s.glide(CH.lead, 37, 39.8, 0, -1).bend(CH.lead, 39.95, 0);
  s.note(CH.drone, 0, 40, 'D1', 66);
  return s;
}

// ---------- 6. NAVIGATOR (comms) ----------
function navigator() {
  const s = new Song('navigator', 'Navigator Whisper', 54, 4, 8);
  // Whole-tone choir and a bass that slides like something breathing in a tank.
  s.seq(CH.choir, 0, 'D4+F#4+C5:4 E4+G#4+D5:4 C4+E4+Bb4:4 D4+F#4+C5:4 Bb3+D4+G#4:4 C4+E4+Bb4:4 D4+G#4+C5:8', 62);
  s.note(CH.bass, 0, 8, 'D2', 100).glide(CH.bass, 6, 8, 0, -2).bend(CH.bass, 8, 0)
    .note(CH.bass, 8, 8, 'C2', 96).glide(CH.bass, 14, 16, 0, 2).bend(CH.bass, 16, 0)
    .note(CH.bass, 16, 8, 'Bb1', 100).note(CH.bass, 24, 8, 'D2', 100).glide(CH.bass, 28, 32, 0, -1).bend(CH.bass, 32, 0);
  for (let b = 0; b < 32; b += 1.5) s.note(CH.bell, b, 2.5, ['F#5', 'C6', 'G#5', 'D6', 'E5', 'Bb5'][Math.round(b / 1.5) % 6], 32 + (b % 6 === 0 ? 18 : 0));
  s.chord(CH.drone, 0, 32, ['D1', 'G#1'], 60);
  for (let b = 0; b < 32; b += 8) s.drum(b, 'metal', 58);
  return s;
}

// ---------- 7. BAZAAR (shop, market) ----------
function bazaar() {
  const s = new Song('bazaar', 'Bazaar of Arrakeen', 104, 6, 8, 8);
  // 6/8 in D Phrygian dominant; Moog bass hopping like a camel with a gyroscope.
  for (let bar = 0; bar < 8; bar++) {
    const b = bar * 3, r = p(bar % 4 === 2 ? 'Eb2' : bar % 4 === 3 ? 'C2' : 'D2');
    s.note(CH.bass, b, .9, r, 112).note(CH.bass, b + 1, .45, r + 12, 70).note(CH.bass, b + 1.5, .9, r + 7, 96).note(CH.bass, b + 2.5, .45, r + 6, 80);
    s.drum(b, 'kick', 100).drum(b + 1, 'shaker', 60).drum(b + 1.5, 'taiko', 84).drum(b + 2, 'shaker', 50).drum(b + 2.5, 'shaker', 64);
  }
  const tune = 'A4:.5 Bb4:.5 C#5:.5 D5:1 C#5:.25 Bb4:.25 A4:1.5 G4:.5 F#4:.5 Eb4:.5 D4:1.5 r:.5 '
    + 'F#4:.5 G4:.5 A4:.5 Bb4:.25 A4:.25 G4:.25 F#4:.25 G4:.5 Eb4:1 D4:.5 C#4:.5 D4:1.5 r:1.5';
  s.seq(CH.lead, 0, tune, 86);
  // Second time round the bell answers, a minor ninth higher, which should not work and kind of does.
  let b = 12;
  for (const token of tune.split(' ').filter(Boolean)) {
    const [n, d] = token.split(':');
    if (n !== 'r') s.note(CH.bell, b, Number(d) * .9, p(n) + 13, 56);
    b += Number(d);
  }
  s.chord(CH.pad, 0, 6, ['D3', 'F#3', 'A3'], 50).chord(CH.pad, 6, 3, ['Eb3', 'G3', 'Bb3'], 50).chord(CH.pad, 9, 3, ['C3', 'Eb3', 'G3'], 50)
    .chord(CH.pad, 12, 6, ['D3', 'F#3', 'A3'], 50).chord(CH.pad, 18, 3, ['Eb3', 'G3', 'Bb3'], 50).chord(CH.pad, 21, 3, ['C3', 'F#3', 'A3'], 50);
  for (let k = 0; k < 8; k++) s.note(CH.lead, 22.5 + k * .1875, .17, k % 2 ? 'C#5' : 'D5', 60);
  return s;
}

// ---------- 8. CHART (map) ----------
function chart() {
  const s = new Song('chart', 'Spacing Guild Chart', 60, 4, 8);
  const cells = ['D5', 'E5', 'F#5', 'G#5', 'A#5', 'C6', 'D6', 'A#5', 'G#5', 'E5'];
  for (let k = 0; k < 64; k++) s.note(CH.bell, k * .5, 1.8, cells[(k * 7) % cells.length], k % 8 === 0 ? 70 : 36 + (k * 13) % 20);
  s.chord(CH.pad, 0, 8, ['D3', 'A3', 'E4'], 56).chord(CH.pad, 8, 8, ['Bb2', 'F3', 'C4'], 56)
    .chord(CH.pad, 16, 8, ['G2', 'D3', 'A3'], 56).chord(CH.pad, 24, 8, ['Eb3', 'Bb3', 'F4'], 56);
  s.seq(CH.bass, 0, 'D2:3 A1:1 D2:4 Bb1:3 F1:1 Bb1:4 G1:3 D2:1 G1:4 Eb2:2 D2:2 C#2:4', 96);
  s.note(CH.drone, 0, 32, 'D1', 52);
  s.note(CH.lead, 20, 6, 'A5', 50).glide(CH.lead, 21, 25, 0, .5).bend(CH.lead, 26.5, 0);
  return s;
}

// ---------- 9. SPICE TRANCE (pause, level up) ----------
function trance() {
  const s = new Song('trance', 'Spice Trance', 48, 4, 8);
  s.chord(CH.drone, 0, 32, ['D1', 'A1', 'D2'], 70);
  s.seq(CH.choir, 0, 'D4+A4:8 Eb4+Bb4:8 D4+G#4:8 D4+A4:8', 58);
  s.glide(CH.choir, 20, 24, 0, -.5).glide(CH.choir, 24, 26, -.5, 0);
  for (let b = 0; b < 32; b += 4) s.note(CH.bass, b, 3.5, b % 16 < 8 ? 'D2' : 'Eb2', 82);
  for (let b = 0; b < 32; b += .75) s.note(CH.bell, b, 1, ['D6', 'A5', 'E6', 'Bb5'][Math.round(b / .75) % 4], 22 + Math.round(16 * Math.sin(b / 3) ** 2));
  return s;
}

// ---------- 10. REQUIEM (death) ----------
function requiem() {
  const s = new Song('requiem', 'Tleilaxu Requiem', 52, 4, 8);
  // Lamento bass falling by step, choir holding on as the floor drops.
  s.seq(CH.bass, 0, 'D2:4 C2:4 Bb1:4 A1:4 G1:4 F1:4 E1:4 A1:4', 108);
  s.seq(CH.choir, 0, 'D4+F4+A4:4 E4+G4+C5:4 D4+F4+Bb4:4 C#4+E4+A4:4 D4+G4+Bb4:4 D4+F4+A4:4 E4+G4+Bb4:4 C#4+E4+G4+A4:4', 66);
  s.seq(CH.lead, 8, 'A4:2 G4:1 F4:1 E4:3 D4:1 F4:2 E4:1 D4:1 C#4:6', 66);
  s.glide(CH.lead, 23, 26, 0, -1).bend(CH.lead, 26.5, 0);
  for (let b = 0; b < 32; b += 4) s.note(CH.bell, b, 3.5, 'D5', 54).note(CH.bell, b + .02, 3.5, 'Eb5', 30).drum(b, 'taiko', 90);
  s.note(CH.drone, 0, 32, 'D1', 64);
  return s;
}

// ---------- 11. KWISATZ (victory) ----------
function kwisatz() {
  const s = new Song('kwisatz', 'Kwisatz Haderach', 76, 4, 8);
  // bVI - bVII - I in D, Lydian at the top: triumph, but the sky is the wrong colour.
  const prog = [['Bb1', MAJ], ['C2', MAJ], ['D2', [0, 4, 7, 18]], ['D2', [0, 4, 7, 18]], ['G1', [0, 4, 7]], ['A1', [0, 4, 7, 10]], ['Bb1', [0, 4, 7]], ['D2', [0, 4, 7, 11]]];
  prog.forEach(([root, iv], i) => {
    const b = i * 4, r = p(root);
    s.note(CH.bass, b, 1.5, r, 112).note(CH.bass, b + 1.5, .5, r + 12, 80).note(CH.bass, b + 2, 2, r + 7, 96);
    s.chord(CH.pad, b, 4, iv.map(x => r + 24 + x), 64);
    s.drum(b, 'taiko', 110).drum(b + 2, 'taiko', 86).drum(b + 3.5, 'metal', 60);
  });
  s.seq(CH.choir, 0, 'D4:4 E4:4 F#4:6 E4:2 D4:4 C#4:4 D4:4 F#4:4', 74);
  s.seq(CH.lead, 8, 'A4:.5 D5:.5 E5:.5 F#5:.5 G#5:2 A5:1 G#5:.5 F#5:.5 E5:2 D5:1 E5:.5 F#5:.5 A5:4', 88);
  s.glide(CH.lead, 19.5, 20, 0, -.5).bend(CH.lead, 20, 0);
  for (let b = 16; b < 32; b += .25) s.note(CH.bell, b, .2, [p('D5'), p('F#5'), p('A5'), p('G#5')][Math.round(b * 4) % 4] + 12, 34);
  s.chord(CH.drone, 0, 32, ['D1', 'A1'], 62);
  return s;
}

const songs = [prophecy(), ledger(), desert(), fold(), sardaukar(), navigator(), bazaar(), chart(), trance(), requiem(), kwisatz()];
const dir = new URL('../src/music/', import.meta.url);
mkdirSync(dir, { recursive: true });
const lines = [];
for (const song of songs) {
  const bytes = writeMidi(song);
  writeFileSync(new URL(`${song.id}.mid`, dir), bytes);
  lines.push(`  ${song.id}: '${bytes.toString('base64')}',`);
  console.log(`${song.id}.mid  ${song.title}  ${bytes.length} bytes  ${(song.length * 60 / song.bpm).toFixed(1)}s loop`);
}
writeFileSync(new URL('score.ts', dir), `// Generated by scripts/compose-music.mjs from the .mid files beside it. Do not edit.\n`
  + `export const SCORE = {\n${lines.join('\n')}\n} as const;\nexport type TrackId = keyof typeof SCORE;\n`);
