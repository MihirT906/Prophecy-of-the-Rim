import { bitmapText } from './bitmap-text';
import type { State } from './state';
import { metalPanel } from './retro-render';

/** Sound for an acknowledgement: selection, success, cancel, or a refused action. */
export type Cue = 'select' | 'confirm' | 'back' | 'blocked';
export interface Feedback {
  draw(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  /** Acknowledges an input whose outcome is only known after the update, such as a map click. */
  ack(label: string, cue: Cue): void;
}

/** UI acknowledgements are independent of dialogue voice and simulation state. */
export function installFeedback(win: Window, state: State): Feedback {
  let audio: AudioContext | undefined, engine: OscillatorNode | undefined, engineGain: GainNode | undefined;
  let label = 'SYSTEM READY', until = 0;
  const names: Record<string, string> = { KeyW: 'THRUST / NORTH', KeyS: 'THRUST / SOUTH', KeyA: 'THRUST / WEST', KeyD: 'THRUST / EAST', Space: 'RETRO BRAKE', KeyZ: 'FIRE', KeyE: 'INTERACT', KeyC: 'SPICE DOSE', KeyM: 'NAV CHART', KeyR: 'RESTORE ROUTE', Escape: 'BACK / PAUSE', Enter: 'CONFIRM', KeyV: 'VOICE', KeyB: 'AREA BOMB', KeyF: 'ARMORY', KeyU: 'MUSIC', Tab: 'AIR SUPPORT', KeyX: 'THEFT / DELETE', Digit1: 'ARMAMENT 1', Digit2: 'ARMAMENT 2', Digit3: 'ARMAMENT 3', Digit4: 'ARMAMENT 4', Backspace: 'ERASE', ArrowUp: 'AIM / UP', ArrowDown: 'AIM / DOWN', ArrowLeft: 'AIM / LEFT', ArrowRight: 'AIM / RIGHT', KeyI: 'AIM / UP', KeyJ: 'AIM / LEFT', KeyK: 'AIM / DOWN', KeyL: 'AIM / RIGHT' };
  const tone = (frequency: number, delay = 0) => {
    if (!audio || audio.state !== 'running') return;
    const now = audio.currentTime + delay;
    const o = audio.createOscillator(), gain = audio.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(frequency, now); o.frequency.exponentialRampToValueAtTime(frequency * .55, now + .08);
    gain.gain.setValueAtTime(.035, now); gain.gain.exponentialRampToValueAtTime(.001, now + .1);
    o.connect(gain); gain.connect(audio.destination); o.start(now); o.stop(now + .11);
    o.onended = () => { o.disconnect(); gain.disconnect(); };
  };
  // A refusal is two falling blips so it never sounds like a confirmation.
  const chime = (cue: Cue) => {
    if (cue === 'blocked') { tone(220); tone(140, .09); } else tone(cue === 'confirm' ? 640 : cue === 'back' ? 180 : 360);
  };
  const play = (cue: Cue) => {
    if (audio?.state === 'suspended') void audio.resume().then(() => chime(cue)).catch(() => {});
    else chime(cue);
  };
  const wake = () => {
    try {
      audio ??= new AudioContext(); if (audio.state === 'suspended') void audio.resume().catch(() => {});
      if (!engine) {
        engine = audio.createOscillator(); engine.type = 'triangle'; engine.frequency.value = 48;
        engineGain = audio.createGain(); engineGain.gain.value = 0;
        engine.connect(engineGain); engineGain.connect(audio.destination); engine.start();
      }
    } catch { /* Visual controls remain available without Web Audio. */ }
  };
  const ack = (text: string, cue: Cue) => { wake(); label = text; until = performance.now() + 650; play(cue); };
  win.addEventListener('pointerdown', wake);
  win.addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    wake();
    // Map Enter can jump, stay, plot or be refused; the update acknowledges the actual outcome.
    if (state.screen === 'map' && e.code === 'Enter') return;
    label = state.screen === 'naming' && e.key.length === 1 ? 'CALLSIGN / KEY' : names[e.code] ?? e.code.replace(/^(Key|Digit|Arrow)/, '').toUpperCase();
    if (state.screen !== 'playing' && /^(Key[WASD]|Arrow)/.test(e.code)) label = 'SELECT / ' + e.key.toUpperCase();
    if (state.screen === 'comms') {
      if (e.code === 'Space') label = 'REVEAL TRANSMISSION';
      if (e.code === 'KeyX') label = state.comms?.theftArmed ? 'STEAL SHIPMENT' : 'CONFIRM THEFT WITH X';
      if (e.code === 'Enter') label = state.comms?.response ? 'DISCONNECT' : state.comms?.prompt ?? 'CONFIRM';
    }
    until = performance.now() + 650;
    play(e.code === 'Escape' ? 'back' : e.code === 'Enter' || e.code === 'KeyE' ? 'confirm' : 'select');
  });
  const silence = () => { if (audio && engineGain) engineGain.gain.setTargetAtTime(0, audio.currentTime, .02); };
  win.addEventListener('blur', silence);
  win.document.addEventListener('visibilitychange', () => { if (win.document.hidden) silence(); });
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const active = state.screen === 'playing' && !win.document.hidden && win.document.hasFocus();
    const held = state.input.held, thrust = active && ['KeyW', 'KeyA', 'KeyS', 'KeyD'].some(k => held.has(k));
    const brake = active && held.has('Space'), firing = active && ['KeyZ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyI', 'KeyJ', 'KeyK', 'KeyL'].some(k => held.has(k));
    if (audio && engineGain && engine) {
      engineGain.gain.setTargetAtTime((thrust || brake || firing) ? .025 : 0, audio.currentTime, .08);
      engine.frequency.setTargetAtTime(brake ? 36 : firing ? 105 + Math.sin(state.time * 40) * 25 : 48 + Math.min(90, Math.hypot(state.player.vx, state.player.vy) / 6), audio.currentTime, .05);
    }
    const recent = performance.now() < until;
    if (!recent && !thrust && !brake && !firing) return;
    ctx.save();
    // Reserve the top strip in menus; flight acknowledgements sit above the footer.
    const bottom = state.screen === 'playing' ? h : 108;
    metalPanel(ctx, w / 2 - 150, bottom - 102, 300, 28);
    if (recent) {
      ctx.fillStyle = `rgba(240,212,134,${Math.max(0, (until - performance.now()) / 650) * .22})`;
      ctx.fillRect(w / 2 - 146, bottom - 98, 292, 20);
    }
    ctx.fillStyle = brake ? '#a9cfdf' : '#dfc58b'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
    bitmapText(ctx, recent ? label : brake ? 'RETRO THRUST / BRAKE ENGAGED' : firing ? 'WEAPON CONTROL / ACTIVE' : 'MAIN DRIVE / THRUST ENGAGED', w / 2, bottom - 84, 11, '#dfc58b', 'center');
    if (brake) { ctx.strokeStyle = '#87becb'; ctx.setLineDash([4, 7]); ctx.beginPath(); ctx.arc(w / 2, h / 2, 31, state.time, state.time + Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  };
  return { draw, ack };
}
