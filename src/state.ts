import type { ArmsId, EnemyKind, Rarity, WeaponId } from './data';
import type { Input } from './input';
import { newPlayer } from './player';
import { makeRng } from './rng';
import type { CommsSession } from './comms';
import type { Voyage } from './voyage';

export type Screen = 'title' | 'menu' | 'characters' | 'settings' | 'naming' | 'playing' | 'dead' | 'paused' | 'map' | 'transcended' | 'comms' | 'shop' | 'market';

export interface Vec { x: number; y: number }

/** Shared by everything that moves. Positions in pixels, radius in pixels. */
export interface Body { x: number; y: number; vx: number; vy: number; r: number; hp: number }

export interface Player extends Body {
  maxHp: number;
  speed: number; accel: number; friction: number;
  weapon: WeaponId; ammo: number;      // ammo is ignored for 'pistol'
  cooldown: number; iframes: number; stun: number; muzzle: number;  // seconds remaining
  aim: Vec;                            // last non-zero aim direction, unit length
  kills: number;
}

export interface Enemy extends Body { id: number; kind: EnemyKind; maxHp: number; timer: number; flash: number;
  facing: number;                      // radians, the way the sprite points
  patrol?: PatrolBrain;                // only on kind 'patrol'
  fear?: number;                       // seconds left fleeing from the player (Hawk Strike); absent on older saves
  worm?: WormBody;                     // only on kind 'worm'
  seeker?: SeekerBrain;                // only on kind 'seeker'
  raider?: RaiderBrain;                // only on kind 'raider'
  witness?: WitnessBrain;              // only on kind 'witness'
}

/** seen: the ship is looking at it this tick. known: it has already announced itself to the pilot. */
export interface WitnessBrain { seen: boolean; known: boolean }

/** dark: engines off, waiting. run: committed to heading dir. wheel: coming about. t is seconds left in run or wheel. */
export interface RaiderBrain { mode: 'dark' | 'run' | 'wheel'; dir: Vec; t: number; pack: string }

/** home: where it hovers asleep. fuse: seconds of flight left once awake. */
export interface SeekerBrain { awake: boolean; fuse: number; home: Vec; nest: string }

/** trail: where the head has been, newest first, a point every few px; the body is drawn and collides along it.
 * heading in radians; goal is the wander waypoint; hunting while it is homing on engine noise. */
export interface WormBody { trail: Vec[]; heading: number; goal: Vec; hunting: boolean }

/** route: waypoints flown in a loop, leg the one being flown to. scan 0..1 fills while the player is in the cone.
 * cleared and lost are seconds; hostile means it was shot at, so an empty hold no longer calls it off. */
export interface PatrolBrain { mode: 'route' | 'pursue'; route: Vec[]; leg: number; scan: number; cleared: number; lost: number;
  hostile: boolean; squad: string }

export interface Bullet extends Body {
  dmg: number; pierce: number; owner: 'player' | 'enemy'; ttl: number; color: string;
  hit: Set<number>;                    // enemy ids already damaged (pierce)
  homing?: number;                     // rad/s it can turn toward the nearest enemy (player bullets only)
  safeForPlayer?: boolean;
  debris?: boolean;
  chainDepth?: number;
  targetId?: number;
  fuse?: boolean;
  blast?: number;                      // px: explodes on its first hit, damaging every enemy in this radius
}

/** An armory item the player owns: durability counts uses left; at 0 it is removed. */
export interface ArsenalItem { id: ArmsId; rarity: Rarity; durability: number }
export interface MarketItem { slot: number; id: ArmsId; rarity: Rarity; price: number; sold: boolean }
export interface MarketSession { key: string; station: string; stock: MarketItem[]; notice: string }

/** Friendly air support in flight. dir is unit length; power is the rarity multiplier; cargo counts lifted enemies. */
export type AircraftKind = 'thopter' | 'bomber' | 'gunship' | 'drone' | 'carryall';
export interface Aircraft extends Body { id: number; kind: AircraftKind; dir: Vec; timer: number; ammo: number; ttl: number; power: number; rarity: Rarity; cargo: number; phase: number;
  target?: Vec; stage?: number }  // drone waypoint / carryall destination, and the carryall's approach-hover-leave stage
/** Ground ordnance: bomb and warhead detonate when timer hits 0; pool and mine live for ttl; marker is visual. selfDmg hits the player. */
export type HazardKind = 'bomb' | 'warhead' | 'pool' | 'mine' | 'marker';
export interface Hazard { id: number; kind: HazardKind; x: number; y: number; r: number; timer: number; ttl: number; dmg: number; selfDmg: number; color: string; power: number }

export interface Pickup extends Body { kind: 'weapon' | 'ammo'; weapon: WeaponId; amount: number }

export interface Particle { x: number; y: number; vx: number; vy: number; ttl: number; maxTtl: number; size: number; color: string; decal: boolean;
  splat?: number; rot?: number;       // blood-splats.png variant 0..3 and its rotation in radians
}

/** tiles: 0 floor, 1 wall, 2 exit closed (solid), 3 exit open (walkable). Index = ty * w + tx. */
export interface Arena { w: number; h: number; tiles: Uint8Array; start: Vec; spawns: Vec[]; exit: Vec }

/** A drifting Coriolis storm. grit: seconds the ship has spent inside since its last abrasion. */
export interface Storm { x: number; y: number; vx: number; vy: number; r: number; grit: number }

export interface State {
  storms: Storm[];
  comms: CommsSession | null;
  voyage: Voyage | null;
  screen: Screen;
  name: string; nameInput: string;
  cursor: number;                      // highlighted row on menu, characters and paused
  seed: string; arenaN: number; arena: Arena;
  wave: number; waveTotal: number; spawnQueue: EnemyKind[]; spawnTimer: number; exitOpen: boolean;
  player: Player; enemies: Enemy[]; bullets: Bullet[]; pickups: Pickup[]; particles: Particle[];
  aircraft: Aircraft[]; hazards: Hazard[]; market: MarketSession | null;
  guide: boolean;                      // the how-a-run-works card on the flight HUD; H toggles it
  shake: number; time: number; nextId: number;
  rng: () => number;
  input: Input;
}

/** Empty 1x1 arena, screen 'title'. */
export function newState(input: Input, seed: string): State {
  return {
    comms: null, voyage: null,
    screen: 'title',
    name: '', nameInput: '',
    cursor: 0,
    seed, arenaN: 0,
    arena: { w: 1, h: 1, tiles: new Uint8Array(1), start: { x: 0, y: 0 }, spawns: [], exit: { x: 0, y: 0 } },
    wave: 0, waveTotal: 0, spawnQueue: [], spawnTimer: 0, exitOpen: false,
    player: newPlayer(),
    enemies: [], bullets: [], pickups: [], particles: [], storms: [],
    aircraft: [], hazards: [], market: null,
    guide: true,
    shake: 0, time: 0, nextId: 1,
    rng: makeRng(seed),
    input,
  };
}

export function nextId(s: State): number {
  return s.nextId++;
}
