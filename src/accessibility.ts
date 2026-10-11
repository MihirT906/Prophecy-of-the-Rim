const KEY = 'arena.accessibility.v1';
export const GAME_SPEEDS = [1, 0.75, 0.5] as const;
export type GameSpeed = typeof GAME_SPEEDS[number];
interface Settings { reduceMotion: boolean; gameSpeed: GameSpeed; damageAssist: boolean; music: boolean }

/** Reduce motion defaults to the OS preference; explicit choices in Controls are remembered. */
function initial(): Settings {
  let osReduce = false;
  try { osReduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* no media queries */ }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && typeof saved === 'object') return {
      reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : osReduce,
      gameSpeed: GAME_SPEEDS.includes(saved.gameSpeed) ? saved.gameSpeed : 1,
      damageAssist: saved.damageAssist === true,
      music: saved.music !== false,
    };
  } catch { /* storage blocked or malformed: fall through */ }
  return { reduceMotion: osReduce, gameSpeed: 1, damageAssist: false, music: true };
}

const settings = initial();
function persist(): void {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* setting still applies this session */ }
}

/** When on, the camera never shakes and damage does not flash the screen border. */
export function reducedMotion(): boolean { return settings.reduceMotion; }

export function setReducedMotion(on: boolean): void {
  settings.reduceMotion = on;
  persist();
}

/** Assist: the whole simulation (flight, enemies, shots, race clock) runs at this fraction of real time. */
export function gameSpeed(): GameSpeed { return settings.gameSpeed; }

export function cycleGameSpeed(): GameSpeed {
  settings.gameSpeed = GAME_SPEEDS[(GAME_SPEEDS.indexOf(settings.gameSpeed) + 1) % GAME_SPEEDS.length];
  persist();
  return settings.gameSpeed;
}

/** Assist: the ship takes half damage from every source. */
export function damageAssist(): boolean { return settings.damageAssist; }

export function setDamageAssist(on: boolean): void {
  settings.damageAssist = on;
  persist();
}

/** Explicit mute for the score; dialogue voice and input acknowledgements are separate. */
export function musicEnabled(): boolean { return settings.music; }

export function setMusicEnabled(on: boolean): void {
  settings.music = on;
  persist();
}
