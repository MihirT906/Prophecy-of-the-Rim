export const TILE = 32, ARENA_W = 40, ARENA_H = 24;
export const IFRAMES = 0.6, STUN = 0.25, MAX_DT = 0.1, STEP = 1 / 60;
// px/s the player is knocked off a hit; px/s an enemy recoils after contact; enemy bullet life (s); pickup radius (px)
export const KNOCKBACK = 320, BOUNCE = 200, ENEMY_BULLET_TTL = 3, PICKUP_R = 10;
export const MAX_PARTICLES = 2000, MAX_SHAKE = 3;

export const PLAYER = { hp: 10, r: 12, speed: 260, accel: 2200, friction: 0.86 };

export type EnemyKind = 'rusher' | 'gunner' | 'brute' | 'patrol' | 'worm' | 'seeker' | 'raider' | 'witness';
export interface EnemyDef { hp: number; r: number; speed: number; accel: number; dmg: number; color: string;
  range?: number; fireInterval?: number; bulletSpeed?: number; stun?: boolean }
export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  rusher: { hp: 2,  r: 11, speed: 200, accel: 1400, dmg: 1, color: '#ff2e5b' },
  gunner: { hp: 4,  r: 12, speed: 110, accel: 900,  dmg: 1, color: '#ff5ce0', range: 260, fireInterval: 2.0, bulletSpeed: 240 },
  brute:  { hp: 15, r: 15, speed: 70,  accel: 500,  dmg: 3, color: '#f5a623', stun: true },
  patrol: { hp: 6,  r: 14, speed: 250, accel: 520,  dmg: 1, color: '#8fb4c9', range: 520, fireInterval: 1.1, bulletSpeed: 420 },
  worm:   { hp: 60, r: 30, speed: 230, accel: 0,    dmg: 3, color: '#c9a35c' },
  seeker: { hp: 1,  r: 7,  speed: 170, accel: 300,  dmg: 2, color: '#d9d2b4' },
  raider: { hp: 3,  r: 12, speed: 380, accel: 1500, dmg: 1, color: '#c4553f', range: 460, fireInterval: 0.35, bulletSpeed: 560 },
  witness: { hp: 8, r: 16, speed: 215, accel: 1200, dmg: 2, color: '#9a8fb5' },
};
// Coriolis storms drift at up to drift px/s and bounce off the sector edge. A ship inside loses dmg hull every abrade
// seconds, and is hidden from Guild scans and pursuit for as long as it stays in.
export const STORM = { radius: 190, drift: 26, abrade: 1.4, dmg: 1 };
// The Silent Witness only moves, and cannot be hurt, while unwatched. Watched means inside gaze radians of the ship's aim
// and within sight px. After it strikes it reappears blink px behind the ship. hush px is where it first announces itself.
export const WITNESS = { gaze: 0.9, sight: 900, blink: 700, hush: 520 };
// Harkonnen raiders lie dark until a ship is within quiet px, or ambush px if it carries spice. An attack run holds one
// heading for up to runSeconds, firing fixed guns when the target is inside fireArc radians of the nose, and ends
// overshoot px past it; they then come about for wheelSeconds. Beyond giveUp px the pack goes dark again.
export const RAIDER = { quiet: 260, ambush: 620, runSeconds: 2.2, overshoot: 320, wheelSeconds: 0.9, lead: 0.35, fireArc: 0.3, giveUp: 1800 };
// Hunter-seekers: a nest sleeps until a ship comes within wake px, then every drone inside chain px of a waking one
// wakes too. Awake they home for fuse seconds and fizzle. Any death is a blast: blastDmg to enemies and
// splashDmg to the player inside blast px.
// Global enemy population multiplier: encounter sites, lane encounters, worms, nests and launch-point packs.
export const ENEMY_DENSITY = 3;
export const SEEKER = { wake: 190, chain: 150, fuse: 9, blast: 80, blastDmg: 3, splashDmg: 1, nest: 7 };
// Shai-Hulud: segments trail the head spacing px apart and hit for bodyDmg; it turns at most turn rad/s, hears thrust
// inside hearRange, and otherwise wanders at cruise (a fraction of speed).
export const WORM = { segments: 16, spacing: 30, turn: 0.9, hearRange: 760, cruise: 0.6, bodyDmg: 1 };
// Guild patrols: cruise is a fraction of speed; the scan cone is range px long and arc radians either side of the heading;
// a full scan takes scanSeconds; a clean ship is ignored for clearedSeconds; pursuit ends after loseSeconds beyond loseRange.
export const PATROL = { cruise: 0.5, scanRange: 460, scanArc: 0.5, scanSeconds: 0.9, clearedSeconds: 8,
  loseRange: 700, loseSeconds: 3, squadRange: 900, standoff: 150 };

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'rocket' | 'swarm' | 'lance';
export interface WeaponDef { blast?: number; homing?: number; description?: string; name: string; interval: number; speed: number; dmg: number; count: number; spread: number; pierce: number; ammo: number; ttl: number; color: string }
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol:  { name: 'SHREDDER',  interval: 0.25, speed: 520, dmg: 1, count: 1, spread: 0.04, pierce: 0, ammo: Infinity, ttl: 1.2, color: '#eaf7ff' },
  smg:     { name: 'SMG',     interval: 0.07, speed: 560, dmg: 1, count: 1, spread: 0.18, pierce: 0, ammo: 90,       ttl: 0.9, color: '#7fe9ff' },
  shotgun: { name: 'SHOTGUN', interval: 0.55, speed: 560, dmg: 1, count: 6, spread: 0.5,  pierce: 0, ammo: 18,       ttl: 0.3,  color: '#f5a623' },
  rifle:   { name: 'RIFLE',   interval: 0.5,  speed: 900, dmg: 4, count: 1, spread: 0.01, pierce: 3, ammo: 24,       ttl: 1.5, color: '#3dffa5' },
  rocket: {name:'ROCKET',interval:.7,speed:700,dmg:7,count:1,spread:0,pierce:0,ammo:20,ttl:1.3,color:'#ffba77',blast:150,description:'Large blast / clear clustered enemies'},
  swarm: {name:'SWARM',interval:.55,speed:580,dmg:2,count:3,spread:.3,pierce:0,ammo:30,ttl:1.8,color:'#b7a3ff',homing:4,description:'Three homing darts / split across forward targets'},
  lance: {name:'LANCE',interval:.65,speed:1600,dmg:8,count:1,spread:0,pierce:8,ammo:20,ttl:.8,color:'#83ffe0',description:'Fast piercing shot / line up enemies'},
};

// Station armory prices, in units of spice out of the hold. The pistol is never for sale.
export const SHOP: Record<Exclude<WeaponId, 'pistol'>, number> = { smg: 3, shotgun: 4, rifle: 5, rocket: 5, swarm: 6, lance: 7 };

// [col, row] of the 16x16 side-on icon in assets/sprites/items16x16.png
export const PICKUP_ICON: Record<WeaponId | 'ammo', [number, number]> = {
  pistol: [0, 2], smg: [1, 3], shotgun: [2, 1], rifle: [2, 2], rocket: [2, 1], swarm: [1, 3], lance: [2, 2], ammo: [3, 0],
};

export const DROPS = { ammo: 0.22, weapon: 0.06 };  // per kill; weapon roll first

export const WAVES = { base: 3, sizeBase: 4, sizePerWave: 2, releaseSeconds: 3,
  gunnerFrom: 2, bruteFrom: 3, gunnerPerArena: 0.15, brutePerArena: 0.1 };

export const PALETTE = { floor: '#2a0f3d', wall: '#12081c', wallEdge: '#2ee6c8', exitOpen: '#ff5ce0',
  exitClosed: '#4a1f66', player: '#7fe9ff', text: '#eaf7ff', textDim: '#5c7385', hp: '#ff2e5b', blood: '#b3122f' };

export const SAVE_KEY = 'arena.characters.v1', OLD_SAVE_KEY = 'arena.character.v1';

// ---------------------------------------------------------------------------
// Armory: Dune air-support ordnance bought with cargo spice at station markets.
// Every item is an instance with a rarity (price, uses, effect multiplier) and a durability (uses left).
export type Rarity = 'common' | 'uncommon' | 'rare' | 'legendary';
export interface RarityDef { name: string; color: string; price: number; durability: number; power: number }
export const RARITIES: Record<Rarity, RarityDef> = {
  common:    { name: 'COMMON',    color: '#b8b8b8', price: 1,   durability: 2, power: 1 },
  uncommon:  { name: 'UNCOMMON',  color: '#7fd98a', price: 1.5, durability: 3, power: 1.25 },
  rare:      { name: 'RARE',      color: '#7fb6ff', price: 2,   durability: 4, power: 1.5 },
  legendary: { name: 'LEGENDARY', color: '#dfc58b', price: 3,   durability: 6, power: 2 },
};
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'legendary'];

export type ArmsId = 'seeker' | 'aamine' | 'thopter' | 'drone' | 'hawk' | 'carryall' | 'bombing' | 'gunship' | 'deathhand';
export interface ArmsDef { name: string; price: number; weight: number; staple?: boolean; color: string; desc: string; lore: string }
/** price is the common base in spice units (see RARITIES.price); weight is the market roll weight for the random slots; staples always stock. */
export const ARMS: Record<ArmsId, ArmsDef> = {
  seeker:    { name: 'HUNTER-SEEKER', price: 1, weight: 0, staple: true, color: '#eaf7ff', desc: 'Homing dart. Heavy damage to the nearest hostile.', lore: 'A needle that follows motion.' },
  aamine:    { name: 'AA MINE',       price: 1, weight: 0, staple: true, color: '#9fd3ff', desc: 'Drifting mine. Bursts into homing missiles when a hostile nears.', lore: 'Ordos pattern. Patient, then not.' },
  thopter:   { name: 'ORNITHOPTER',   price: 2, weight: 4, color: '#7fe9ff', desc: 'One strafing pass along your aim, rocket pairs at the nearest hostiles.', lore: 'Atreides wing-beat craft. Fires its load and leaves to rearm.' },
  drone:     { name: 'SCOUT DRONE',   price: 2, weight: 3, color: '#b9ffd0', desc: 'Roams beside you for a while and attacks anything in reach.', lore: 'Uncontrollable. It picks its own fights.' },
  hawk:      { name: 'HAWK STRIKE',   price: 2, weight: 3, color: '#ffd27f', desc: 'Every hostile flees from you and holds fire for a few seconds.', lore: 'An incorporeal bird of prey. Fear, not fire.' },
  carryall:  { name: 'CARRYALL',      price: 2, weight: 3, color: '#d0c7ff', desc: 'Lifts a few hostiles off the field ahead of you. No salvage.', lore: 'Heavy-lift. It does not ask what the cargo is.' },
  bombing:   { name: 'BOMBING RUN',   price: 3, weight: 3, color: '#ff9f5c', desc: 'Three bombers carpet the line ahead. Stay clear of the markers.', lore: 'Bombs fall straight down. On anything.' },
  gunship:   { name: 'GUNSHIP',       price: 3, weight: 2, color: '#ff6b6b', desc: 'Orbits you for a while, firing rocket salvos.', lore: 'Harkonnen pattern. Slow, armored, loud.' },
  deathhand: { name: 'DEATH HAND',    price: 4, weight: 1, color: '#9cff5c', desc: 'Siren, then a cluster of warheads ahead. Leaves a radiation pool.', lore: 'Inaccurate. Powerful. Nobody stands near the marker twice.' },
};
/** Market: 5 stock slots (2 staples + 3 seeded rolls), 4 arsenal slots, price cap of one cargo lot.
 * rarityByRing[ring] = weights for common, uncommon, rare, legendary; ring 0 is the center. */
export const MARKET = { slots: 5, arsenal: 4, maxPrice: 12,
  rarityByRing: [[15, 30, 35, 20], [25, 35, 30, 10], [40, 35, 20, 5], [55, 30, 13, 2], [70, 25, 5, 0]] };
