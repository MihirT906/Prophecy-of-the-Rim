/**
 * Plays the composed MIDI score (src/music/*.mid, embedded via score.ts) on a small Web Audio
 * synth: resonant Moog bass, detuned pads, a scooping Carlos lead, formant choir, FM bells,
 * a sub drone and synthesized ritual drums, all through a warm saturated bus and a dark hall.
 * Presentation only: never touches simulation state, saves or gameplay RNG.
 */
import { decodeBase64, parseMidi, type MidiSong } from './midi';
import { SCORE, type TrackId } from './music/score';
import { musicEnabled } from './accessibility';
import type { State } from './state';

/** Which piece belongs to the screen the player is looking at. */
export function chooseTrack(s: State, combat: boolean): TrackId {
  switch (s.screen) {
    case 'title': return 'prophecy';
    case 'menu': case 'characters': case 'settings': case 'naming': return 'ledger';
    case 'playing': return s.voyage?.lane ? 'fold' : combat ? 'sardaukar' : 'desert';
    case 'comms': return 'navigator';
    case 'shop': case 'market': return 'bazaar';
    case 'map': return 'chart';
    case 'paused': return 'trance';
    case 'dead': return 'requiem';
    case 'transcended': return 'kwisatz';
  }
}

export function enemiesNear(s: State, radius = 760): boolean {
  return s.enemies.some(e => Math.hypot(e.x - s.player.x, e.y - s.player.y) < radius);
}

const LEVEL: Partial<Record<TrackId, number>> = { navigator: .55, trance: .8, chart: .85 };
const songs = new Map<TrackId, MidiSong>();
function song(id: TrackId): MidiSong {
  let parsed = songs.get(id);
  if (!parsed) songs.set(id, parsed = parseMidi(decodeBase64(SCORE[id])));
  return parsed;
}

interface Voice { channel: number; end: number; sources: AudioScheduledSourceNode[]; detune: AudioParam[] }
interface Deck { id: TrackId; song: MidiSong; start: number; cursor: number; loop: number; gain: GainNode; voices: Voice[]; bend: number[] }

let ctx: AudioContext | null = null, master: GainNode | null = null, bus: GainNode | null = null, noise: AudioBuffer | null = null;
let deck: Deck | null = null, combatUntil = 0, unlocked = false;

function build(c: AudioContext): void {
  master = c.createGain(); master.gain.value = musicEnabled() ? .62 : 0;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = .02; comp.release.value = .3;
  // Warmth: bass shelf up, fizz down, then soft tape-ish saturation.
  bus = c.createGain();
  const low = c.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 170; low.gain.value = 5;
  const high = c.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 4200; high.gain.value = -7;
  const drive = c.createWaveShaper(), curve = new Float32Array(1024);
  for (let i = 0; i < curve.length; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  drive.curve = curve; drive.oversample = '2x';
  // A dark, long hall from decaying filtered noise.
  const hall = c.createConvolver(), seconds = 3.8, ir = c.createBuffer(2, Math.floor(c.sampleRate * seconds), c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch); let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += ((Math.random() * 2 - 1) - lp) * .18; d[i] = lp * Math.pow(1 - i / d.length, 2.6) * 2.2; }
  }
  hall.buffer = ir;
  const wet = c.createGain(); wet.gain.value = .38;
  bus.connect(low); low.connect(high); high.connect(drive);
  drive.connect(comp); drive.connect(hall); hall.connect(wet); wet.connect(comp);
  comp.connect(master); master.connect(c.destination);
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const n = noise.getChannelData(0); for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
}

/** Called at startup and on every user gesture: autoplay policies may hold audio until one. */
export function unlockMusic(): void {
  try {
    if (!ctx) { ctx = new AudioContext(); build(ctx); }
    unlocked = true;
    if (musicEnabled() && ctx.state === 'suspended' && !document.hidden) void ctx.resume().catch(() => {});
  } catch { ctx = null; /* Game remains fully playable in silence. */ }
}

export function pauseMusic(): void { if (ctx?.state === 'running') void ctx.suspend().catch(() => {}); }
export function resumeMusic(): void { if (ctx && unlocked && musicEnabled() && ctx.state === 'suspended') void ctx.resume().catch(() => {}); }
/** Applies the mute setting immediately. */
export function syncMusicSetting(): void {
  if (!ctx || !master) return;
  master.gain.setTargetAtTime(musicEnabled() ? .62 : 0, ctx.currentTime, .05);
  if (musicEnabled()) resumeMusic(); else setTimeout(() => { if (!musicEnabled()) pauseMusic(); }, 250);
}

const hz = (pitch: number) => 440 * Math.pow(2, (pitch - 69) / 12);

function osc(c: AudioContext, type: OscillatorType, f: number, cents: number, v: Voice): OscillatorNode {
  const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents;
  v.sources.push(o); v.detune.push(o.detune); return o;
}
function env(g: AudioParam, t: number, attack: number, level: number, sustain: number, release: number, off: number): void {
  g.setValueAtTime(0, t); g.linearRampToValueAtTime(level, t + attack);
  g.setTargetAtTime(sustain, t + attack, .25); g.setTargetAtTime(0, Math.max(off, t + attack), release);
}

function play(d: Deck, channel: number, pitch: number, t: number, dur: number, vel: number): void {
  const c = ctx!, program = d.song.programs[channel] ?? 0, cents = (d.bend[channel] ?? 0) * 100;
  const v: Voice = { channel, end: t + dur, sources: [], detune: [] }, out = c.createGain(), off = t + dur;
  out.connect(d.gain);
  const f = hz(pitch);
  if (channel === 9) { drum(c, out, pitch, t, vel, v); }
  else if (program === 38) { // Moog bass: two oscillators and a sub into a squelchy resonant ladder.
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 9;
    lp.frequency.setValueAtTime(160, t); lp.frequency.linearRampToValueAtTime(240 + 2300 * vel, t + .008); lp.frequency.setTargetAtTime(260 + 220 * vel, t + .01, .09);
    for (const o of [osc(c, 'sawtooth', f, cents, v), osc(c, 'square', f, cents + 7, v)]) o.connect(lp);
    const sub = osc(c, 'sine', f / 2, cents, v), subGain = c.createGain(); subGain.gain.value = .9; sub.connect(subGain); subGain.connect(out);
    lp.connect(out); env(out.gain, t, .006, .3 * vel, .2 * vel, .05, off); v.end = off + .4;
  } else if (program === 89) { // Warm pad: detuned saw choir, slowly opening.
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.6;
    lp.frequency.setValueAtTime(350, t); lp.frequency.linearRampToValueAtTime(800 + 700 * vel, t + 1.6);
    for (const k of [-12, 0, 11]) osc(c, 'sawtooth', f, cents + k, v).connect(lp);
    lp.connect(out); env(out.gain, t, 1.2, .07 * vel, .06 * vel, .45, off); v.end = off + 2.5;
  } else if (program === 81) { // Carlos lead: scoop up into pitch, delayed vibrato, buzzy and nasal.
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6; lp.frequency.value = 1300 + 1800 * vel;
    const vib = c.createOscillator(), depth = c.createGain(); vib.frequency.value = 5.6;
    depth.gain.setValueAtTime(0, t); depth.gain.linearRampToValueAtTime(14, t + .45); vib.connect(depth); v.sources.push(vib);
    for (const [type, k] of [['sawtooth', 0], ['square', 5]] as const) {
      const o = osc(c, type, f, cents - 40 + k, v); o.detune.setTargetAtTime(cents + k, t, .025); depth.connect(o.detune); o.connect(lp);
    }
    lp.connect(out); env(out.gain, t, .015, .085 * vel, .065 * vel, .05, off); v.end = off + .3;
  } else if (program === 91) { // Choir: buzzing saws through 'ah' formants with a breathy vibrato.
    const vib = c.createOscillator(), depth = c.createGain(); vib.frequency.value = 4.7; depth.gain.value = 9; vib.connect(depth); v.sources.push(vib);
    const sum = c.createGain();
    for (const k of [-8, 7]) { const o = osc(c, 'sawtooth', f, cents + k, v); depth.connect(o.detune); o.connect(sum); }
    for (const [freq, gain] of [[700, 1], [1220, .55], [2600, .25]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 7;
      const g = c.createGain(); g.gain.value = gain; sum.connect(bp); bp.connect(g); g.connect(out);
    }
    env(out.gain, t, Math.min(.5, dur / 3), .5 * vel, .42 * vel, .3, off); v.end = off + 1.5;
  } else if (program === 11) { // FM bell, inharmonic 3.5 ratio: glassy, a bit wrong.
    const carrier = osc(c, 'sine', f, cents, v), mod = osc(c, 'sine', f * 3.5, cents, v), index = c.createGain();
    index.gain.setValueAtTime(f * 3 * vel, t); index.gain.exponentialRampToValueAtTime(f * .15, t + 1.4);
    mod.connect(index); index.connect(carrier.frequency); carrier.connect(out);
    const ring = Math.min(dur + 1.6, 4.5);
    out.gain.setValueAtTime(.0001, t); out.gain.exponentialRampToValueAtTime(.09 * vel, t + .004); out.gain.exponentialRampToValueAtTime(.0001, t + ring);
    v.end = t + ring;
  } else { // 95: sietch drone, sub sine and buzzing triangle, filter breathing very slowly.
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 4;
    const lfo = c.createOscillator(), depth = c.createGain(); lfo.frequency.value = .09; depth.gain.value = 170; lfo.connect(depth); depth.connect(lp.frequency); v.sources.push(lfo);
    osc(c, 'sine', f, cents, v).connect(out); osc(c, 'triangle', f * 2, cents + 4, v).connect(lp); osc(c, 'sawtooth', f, cents - 6, v).connect(lp);
    lp.connect(out); env(out.gain, t, 2.5, .2 * vel, .18 * vel, .8, off); v.end = off + 3;
  }
  for (const s of v.sources) { s.start(t); s.stop(v.end + .05); }
  v.sources[0]?.addEventListener('ended', () => out.disconnect());
  d.voices.push(v);
}

function drum(c: AudioContext, out: GainNode, pitch: number, t: number, vel: number, v: Voice): void {
  const hit = (type: BiquadFilterType, freq: number, level: number, decay: number) => {
    const src = c.createBufferSource(); src.buffer = noise; v.sources.push(src);
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = c.createGain();
    g.gain.setValueAtTime(level * vel, t); g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    src.connect(f); f.connect(g); g.connect(out);
  };
  const thump = (from: number, to: number, level: number, decay: number) => {
    const o = c.createOscillator(); o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + decay * .5); v.sources.push(o);
    const g = c.createGain(); g.gain.setValueAtTime(level * vel, t); g.gain.exponentialRampToValueAtTime(.0001, t + decay);
    o.connect(g); g.connect(out);
  };
  out.gain.value = 1;
  if (pitch === 36) { thump(130, 38, .7, .38); v.end = t + .4; }
  else if (pitch === 38) { hit('bandpass', 1700, .35, .2); thump(200, 150, .2, .12); v.end = t + .22; }
  else if (pitch === 42) { hit('highpass', 7200, .12, .05); v.end = t + .06; }
  else if (pitch === 47) { thump(92, 48, .9, .9); hit('lowpass', 380, .35, .35); v.end = t + .95; }
  else if (pitch === 70) { hit('bandpass', 5200, .14, .07); v.end = t + .08; }
  else { // 49: ritual metal, two clangorous squares ring-modulated.
    const a = c.createOscillator(), b = c.createOscillator(), ringer = c.createGain(), bp = c.createBiquadFilter(), g = c.createGain();
    a.type = 'square'; b.type = 'square'; a.frequency.value = 541; b.frequency.value = 811; v.sources.push(a, b);
    ringer.gain.value = 0; b.connect(ringer.gain); a.connect(ringer);
    bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 2;
    g.gain.setValueAtTime(.12 * vel, t); g.gain.exponentialRampToValueAtTime(.0001, t + 1.2);
    ringer.connect(bp); bp.connect(g); g.connect(out); v.end = t + 1.25;
  }
}

function bend(d: Deck, channel: number, semitones: number, t: number): void {
  d.bend[channel] = semitones;
  for (const v of d.voices) if (v.channel === channel && v.end > t) for (const p of v.detune) p.setTargetAtTime(semitones * 100, t, .03);
}

function startDeck(id: TrackId, at: number): Deck {
  const c = ctx!, gain = c.createGain();
  gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(LEVEL[id] ?? 1, at + 1.2);
  gain.connect(bus!);
  return { id, song: song(id), start: at, cursor: 0, loop: 0, gain, voices: [], bend: [] };
}

function retire(d: Deck, now: number): void {
  d.gain.gain.cancelScheduledValues(now); d.gain.gain.setValueAtTime(d.gain.gain.value, now); d.gain.gain.linearRampToValueAtTime(0, now + 1.4);
  for (const v of d.voices) for (const s of v.sources) { try { s.stop(now + 1.5); } catch { /* not started or already stopped */ } }
  setTimeout(() => d.gain.disconnect(), 2000);
}

function pump(d: Deck, now: number): void {
  const horizon = now + .35, events = d.song.events, length = d.song.length;
  if (!events.length || length <= 0) return;
  for (let guard = 0; guard < 4000; guard++) {
    const e = events[d.cursor], at = d.start + d.loop * length + e.time;
    if (at > horizon) break;
    if (at >= now - .04) {
      if (e.kind === 'note') play(d, e.channel, e.pitch, at, e.duration, e.velocity);
      else bend(d, e.channel, e.semitones, at);
    }
    if (++d.cursor >= events.length) { d.cursor = 0; d.loop++; }
  }
  d.voices = d.voices.filter(v => v.end > now);
}

/** Once per rendered frame: choose the screen's piece, crossfade if it changed, schedule ahead. */
export function updateMusic(s: State): void {
  if (!ctx || !bus || ctx.state !== 'running' || !musicEnabled()) return;
  try {
    const now = ctx.currentTime;
    if (s.screen === 'playing' && enemiesNear(s)) combatUntil = now + 6;
    const want = chooseTrack(s, now < combatUntil);
    if (deck?.id !== want) {
      if (deck) retire(deck, now);
      deck = startDeck(want, now + .08);
    }
    // If the tab was throttled and we fell far behind, re-anchor the loop instead of bursting notes.
    const length = deck.song.length, position = now - deck.start - deck.loop * length;
    if (position > length + 1) { deck.loop = Math.floor((now - deck.start) / length); deck.cursor = 0; }
    pump(deck, now);
  } catch { /* Music is decoration; a synthesis fault must never break the frame. */ }
}
