/** Entirely local syllable synthesis: no recordings, speech service, or microphone. */
let context: AudioContext | null = null, analyser: AnalyserNode | null = null;
let output: GainNode | null = null;
const active = new Set<OscillatorNode | AudioBufferSourceNode>();
const syllables: AudioBuffer[] = [];
export let voiceMuted = false;
export function unlockVoice(): void {
  try {
    context ??= new AudioContext();
    if (!output) {
      output = context.createGain(); output.gain.value = .16;
      analyser = context.createAnalyser(); analyser.fftSize = 256;
      output.connect(analyser); analyser.connect(context.destination);
    }
    if (context.state === 'suspended') void context.resume().catch(() => {});
  } catch { /* Text and portrait remain usable when browser audio is unavailable. */ }
}
export function stopVoice(): void {
  for (const oscillator of active) { try { oscillator.stop(); } catch { /* already ended */ } }
  active.clear();
}
export function toggleVoice(): void { voiceMuted = !voiceMuted; if (voiceMuted) stopVoice(); }
export function voiceAvailable(): boolean { return context?.state === 'running'; }
export function voiceLevel(): number {
  if (!analyser || voiceMuted) return 0;
  const samples = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(samples);
  return Math.min(1, Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length) * 20);
}
/** Eight reusable synthesized samples: warped vowels, subharmonic throat tones, and metallic breath textures. */
function buildSyllables(ctx: AudioContext): void {
  if (syllables.length) return;
  for (let variant = 0; variant < 8; variant++) {
    const duration = .23, buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let noise = 731 + variant * 187;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate, u = t / duration;
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const hiss = noise / 2147483648;
      // Slightly incompatible pitches beat against each other like an impossible throat.
      const phase = 2 * Math.PI * (140 * t + (variant % 2 ? -100 : 180) * t * t)
        + .32 * Math.sin(2 * Math.PI * (23 + variant * 2.7) * t);
      const throat = Math.sin(phase * .497) * .3 + Math.sin(phase * 1.013 + .8) * .18;
      const vowel = Math.sin(phase) * .5 + Math.sin(phase * (3 + variant % 3)) * .24
        + Math.sin(phase * (6 + variant)) * .12;
      const texture = variant < 3 ? hiss * .08 : variant < 6 ? Math.sin(phase * 1.51) * .22 : hiss * .28;
      const envelope = Math.min(1, t / .009) * Math.pow(1 - u, 1.25);
      const flutter = .76 + .24 * Math.sin(2 * Math.PI * (31 + variant * 3.1) * t);
      data[i] = Math.tanh((vowel + throat + texture) * 1.3) * envelope * flutter;
    }
    syllables.push(buffer);
  }
}
export function speakGlyph(char: string, index: number, pitch: number, timbre = 0, duration = .06): void {
  if (!context || context.state !== 'running' || !output || voiceMuted || !/[a-z0-9]/i.test(char)) return;
  buildSyllables(context);
  const now = context.currentTime, code = char.toLowerCase().charCodeAt(0);
  const source = context.createBufferSource(), gain = context.createGain(), filter = context.createBiquadFilter();
  const resonance = context.createBiquadFilter();
  source.buffer = syllables[(code + timbre + Math.floor(index / 5)) % syllables.length];
  const rate = Math.max(.5, Math.min(2.7, pitch / 175 * (1 + (code % 5 - 2) * .09)));
  source.playbackRate.setValueAtTime(rate, now);
  source.playbackRate.exponentialRampToValueAtTime(rate * (index % 3 ? .76 : 1.19), now + .045);
  source.playbackRate.exponentialRampToValueAtTime(rate * (index % 4 ? .91 : .63), now + .12);
  filter.type = 'lowpass'; filter.frequency.value = 2100 + timbre * 300;
  resonance.type = 'peaking'; resonance.Q.value = 3.5; resonance.gain.value = 7;
  resonance.frequency.setValueAtTime(620 + (code % 4) * 170 + timbre * 65, now);
  resonance.frequency.exponentialRampToValueAtTime(390 + (index % 3) * 130, now + .12);
  const length = Math.min(.23, Math.max(.095, duration * 1.9));
  // Voice-only gain lift; weapon effect volume is unchanged.
  gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(2.4, now + .009);
  gain.gain.exponentialRampToValueAtTime(.001, now + length);
  source.connect(filter); filter.connect(resonance); resonance.connect(gain); gain.connect(output); active.add(source);
  source.onended = () => { active.delete(source); source.disconnect(); filter.disconnect(); resonance.disconnect(); gain.disconnect(); };
  source.start(now); source.stop(now + length);
}

/** Brief, low-volume arcade feedback on the same user-unlocked audio bus. */
export function playEffect(kind: 'shot' | 'hit'): void {
  if (!context || context.state !== 'running' || !output || voiceMuted) return;
  const oscillator = context.createOscillator(), gain = context.createGain(), now = context.currentTime;
  oscillator.type = kind === 'shot' ? 'triangle' : 'sawtooth';
  oscillator.frequency.setValueAtTime(kind === 'shot' ? 650 : 130, now);
  oscillator.frequency.exponentialRampToValueAtTime(kind === 'shot' ? 220 : 35, now + .07);
  gain.gain.setValueAtTime(kind === 'shot' ? .12 : .22, now); gain.gain.exponentialRampToValueAtTime(.001, now + .08);
  oscillator.connect(gain); gain.connect(output); active.add(oscillator);
  oscillator.onended = () => { active.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
  oscillator.start(now); oscillator.stop(now + .09);
}
