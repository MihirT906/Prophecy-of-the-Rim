# Prophecy of the Rim: current architecture

This branch replaces ARENA's endless wave progression with a radial spice race. Read `README.md` for rules and controls. The original `waves.ts` and its tests remain as legacy starter code; **the active game loop never calls `updateWaves` or `startArena`.** Do not infer current progression from those files.

## Ownership and integration

- Universe work owns `universe.ts`, `voyage.ts`, `flight.ts`, `comms.ts`, `comms-render.ts`, `alien-voice.ts`, `sector*.json`, `sector-config.ts`, `space-render.ts`, and the race data under `State.voyage`.
- Partners own enemy behavior (`enemies.ts`), weapons/pickups (`weapons.ts`), and their tuning in `data.ts`.
- Shared integration files are `main.ts`, `state.ts`, `render.ts`, and `save.ts`. Keep edits there small when merging parallel branches.
- Enemy and weapon definitions and behavior were not changed for the race. Rendering uses placeholder shapes. No combat encounters are spawned by the universe module.

The comms screen freezes the world. `updateComms` handles reveal, voice, confirmation and cancellation; `confirmComms` revalidates the interaction and calls the same atomic transaction code used by the voyage. The session is runtime-only; reload resumes flight with saved cargo, so opening a channel cannot duplicate a transfer.

The playing tick runs `updatePlayer`, `updateEnemies`, `updateBullets`, `updateVoyage`, then `updateFx`, each guarded by `screen === 'playing'`. A partner encounter system can run after `updateVoyage`, consume its events, and populate `s.enemies`. Travel clears outgoing enemies, bullets, pickups, and effects before emitting the new sector event.

```ts
import { consumeUniverseEvents } from './voyage';

for (const event of consumeUniverseEvents(s)) {
  if (event.type === 'sector-entered') {
    // event.to, event.from, event.ring, event.carryingSpice
    // s.arena.spawns are safe inbound positions beside boundary gates.
    // Spawn partner-owned encounters here. Ring 4 is the rim; ring 0 is center.
  }
}
```

Other event types: `cargo-collected`, `spice-consumed`, `cargo-sold` (including its delivery-bonus flag), and `transcended`. Events are a bounded 32-entry runtime queue, drained once, never persisted. Check `s.voyage.status === 'active'` before activating encounters for a resumed run. Current contraband quantity is `(s.voyage.cargo?.remaining ?? 0) + s.voyage.personalSpice`. Do not modify cargo through the weapon pickup system.

## Modules

| File | Responsibility |
| --- | --- |
| `universe.ts` | Race tuning, deterministic radial graph, routes, map selection, reciprocal boundary gates, per-sector seeded geometry and dynamic body trajectories |
| `voyage.ts` | Runtime race, cargo transactions, consumption, access/fare checks, travel, restocking, timer, win state, snapshot validation, partner events |
| `space-render.ts` | Gray-box world, engine trails, HUD/local chart, radial map |
| `flight.ts` | Player impulses, speed governor, powered braking, dynamic circle collisions, trail buffer |
| `sector.json`, `sector.schema.json`, `sector-config.ts` | Generator settings, numeric JSON schema contract, startup validation |
| `render.ts` | Placeholder combat shapes, screens, menus, result screens |
| `main.ts` | Fixed timestep, input/screen transitions, resume/retry, save on page exit/blur |
| `state.ts` | Shared state types; `voyage` is null for legacy pure-module tests |
| `save.ts` | Pilot list and optional versioned race snapshot; original pilot progression APIs retained |
| `arena.ts` | Existing grid/body collision utilities, also retains legacy arena generator |

## Universe invariants

- Ring populations are `[1, 5, 8, 11, 14]`, center to rim: 39 nodes total. Coordinates are radial chart positions, not canonical Dune star coordinates.
- Each noncentral node has an inward neighbor; each ring is connected laterally. Every edge is bidirectional. Topology and labels are authored in `galaxy/galaxy.json`; the seed only varies chart jitter and local generation.
- `nextInwardSector` and `routeBetween` are pure. `moveMapSelection` follows the radial structure rather than a rectangular grid.
- A sector is generated independently from `seed + version + sectorId`; visits and gameplay RNG cannot change it.
- Gates use the graph edge's bearing; the reciprocal endpoint has the opposite boundary side. Gates sharing a side are spaced apart. Arrival uses the destination's reciprocal gate, not a guessed coordinate.
- Systems default to 160×120 tiles (5,120×3,840 world units). The collision grid is empty to retain partner APIs. Player flight uses dynamic circle collisions against orbiting planets and drifting debris; the star is visual. Existing bullets and enemies still use the empty grid, so dynamic obstruction is currently player-only.
- Camera translation applies to all world entities; HUD remains in screen coordinates. Trails retain 1.2 seconds and cap at 110 samples. Body trajectories use active voyage time, not wall-clock time. Danger 1–5 controls debris count/drift and same-ring fares.
- Generation keeps debris centers away from stations; orbital collisions may still require maneuvering. There are no static walls dividing reachable space.

## Race invariants

- `collected + earnedSpice === consumed + sold + spent + armed + personalSpice + (cargo?.remaining ?? 0)`. Every collection is a 12-unit lot. A new run opens with `STARTING_SPICE` (8) in both `personalSpice` and `earnedSpice`.
- A dose consumes exactly one personal spice unit; sealed contract cargo and fuel are protected. The cap is 16; there is no consumption after victory or death.
- Leaving the boundary or using a gate opens a departure map. Planning via M cannot teleport. `enterSector` requires the departure map, an adjacent destination, adequate prescience, and cargo spice; it charges once, atomically. Cancelling returns the player safely inside with zero velocity.
- Inward fares are 3/3/4/4 spice; outward is 2. Same-ring fare is `max(1, 5-floor((a.danger+b.danger)/2))`, symmetric and cheaper for dangerous endpoints. Credits are trade score, not passage money.
- Transit preserves hull, weapon, ammo, and race cargo. It clears outgoing room entities. No wave-clear condition gates travel.
- A contract fixes a recipient station, delivery amount, fuel allowance, advance cut and credit reward. Only the designated receiver accepts it. Hand-in removes all remaining bonded cargo (including unused fuel), pays the agreed reward and adds 8 reputation exactly once.
- Each cache's replenishment deadline is in active race time. You cannot carry two lots. An empty ship can return to the local replenishing cache without paying travel costs.
- Center arrival alone is not victory. E at the center beacon requires 16 consumed doses. The won state freezes the clock and is saved.
- Death is a lost attempt. Resume returns to its result screen. Enter starts a clean attempt with the same seed and a base ship.

## Persistence

The existing `arena.characters.v1` key stores pilots. A pilot optionally has `voyage`, currently schema version 7. It contains seed, sector, position, velocity, departing flag, spice spent, hull, visited sectors, plotted destination, credits, counters, partial cargo, cache deadlines, elapsed time, and active/won/lost status.

`readVoyageSave` validates finite numbers, ranges, cargo adjacency, accounting invariants, and terminal state conditions. Version-2 and version-3 snapshots migrate to compact coordinates; version-2 adds zero velocity/spice expenditure. Version-5 saves include full world-space course snapshots; version-4 timed lanes restart at a newly generated entrance with the paid toll retained. Other incompatible or malformed voyage data is discarded while retaining the pilot. On resume, geometry is regenerated and an invalid/blocked position falls back to the safe spawn. Graphs, tile arrays, enemies, and event queues are not serialized. The HUD reports unavailable browser storage.

## Verification

`npm run build` and `npm test` must pass before pushing. `npm run test:e2e` builds and exercises the real browser game. The browser test drives real thrust/coasting/braking and a physical boundary crossing. Its subsequent four-leg race uses explicit position fixtures to reach interactions quickly, with real input for collection, consumption, departure, confirmation, delivery, victory, and restart. Headless physics verifies responsive steering, drag, bounded gravity and compact crossing time. Browser checks exercise combat startup/resume and use explicit completion fixtures for lane exits; combat difficulty is not certified by these checks. Browser clock control makes fixed-step movement repeatable. An installed Chrome can be selected with `PLAYWRIGHT_CHANNEL=chrome`.

The seed-based rule tests also complete funded races across multiple generated universes, but that does not replace browser verification. Screenshots from the browser test are in `test-results/` (ignored).

## Procedural content integration

`sector-content.json` and `sector-content.schema.json` define names, weighted encounter archetypes, hazards, and speech fragments. `json-contract.ts` implements the schema vocabulary these files use (objects/required/unknown-key rejection, arrays, enums, strings and bounded numbers). `sector-content.ts` also checks integer encounter counts and ordered ranges.

`generateSystem(...).encounters` is a deterministic array of `{ archetype, role, count, seed, x, y, triggerRadius }`. Roles are patrol, ambush and stalker. Filtered pools respect `minDanger`; weighted rolls select a site archetype. On `sector-entered`, encounter owners can instantiate these through their own enemy constructors. They are not spawned by universe code. Keep encounter spawn/defeat persistence inside the combat integration.

`system.stations` contains names and `services: ['trade', 'spice']`. `spiceContacts(system, elapsed)` resolves current interaction positions for planets, stations and waiting ships. Ships/ports draw visible 100-unit interaction zones; all use the same sector shipment stock. Stations receive cargo only; ships and planet ports offer delivery contracts. `system.cache` and `system.dock` are retained as compatibility coordinates for the first freighter and exchange station.

`alien-voice.ts` owns browser-local Web Audio synthesis and its analyser. It unlocks on user input, stops on blur/hidden page/disconnect, and supports muting. No microphone permissions or voice service dependencies. Comms portraits use analyser amplitude with a subtle text-timed fallback when muted or audio is unavailable.

## Shared flight and FTL courses

`engines.ts` selects the sublight or FTL `EngineProfile`. `flight.ts` integrates the same thrust, braking, damping and collisions in both environments. `player.ts` uses the same manual fire/cooldowns in both modes and adds ship velocity to fired projectiles. `main.ts` runs the same player/enemy/bullet pipeline; there is no special lane actor loop.

`hyperspace.ts` turns the lane JSON profile into world-space `LaneCourse` geometry: length, width, bends, obstacle circles, exit and sparse encounters. Existing enemy constructors handle encounters once at installation. Camera translation and engine trails work exactly as in local systems. Progress is positional, not time-based. `finishLane` requires a living ship to cross the finish line while inside the corridor. Waiting cannot advance transit.

`laneContains` checks hull clearance from every boundary. `flight.ts` checks before and after obstacle resolution; a breach invokes `destroyPlayer`, bypassing combat invulnerability and writing the lost save immediately. Walls do not bounce the player back. `hyperspace-render.ts` marks them red and shows lethal-edge clearance. Internal debris retains ordinary deflection physics.

`voyage.lane.course` stores its engine profile and geometry, so a JSON edit cannot relocate a resumed course. Saved actors and projectiles do not respawn. The universe's active sector changes only on arrival; partner systems should consult `voyage.lane` before spawning local-system content.


## Initial handoff: galaxy / content / runtime separation

- `src/galaxy/graph.ts`: standalone graph of labelled nodes and edges with opaque payloads. Validates IDs/connections and provides adjacency/path queries. No file loading, rendering, or gameplay imports.
- `src/galaxy/galaxy.json`: explicit star-system and hyperlane topology. Node/edge payloads reference content profiles.
- `src/galaxy/content.json`: system distributions (planet/station counts, debris density, encounter weights, hazards) and lane distributions (length/width, obstacles, encounters, engine envelope and enemy weights).
- `src/galaxy/catalog.ts`: gameplay-specific decoder/validator. `loadGalaxy(document, content)` accepts decoded objects from any source, independently of file/network loading.
- `src/universe.ts` and `src/hyperspace.ts`: runtime interpreters. These instantiate environments and combat from the catalogue; their behavior can change without changing the generic graph.

The current radial race adapter retains numeric sector indices for existing saves/UI, mapped to stable string graph IDs. Changing graph node order or topology can invalidate old prototype run data; the pilot record is retained. A future save format should persist stable graph IDs.

This is an initial integration baseline. Combat balance remains rough. System encounter sites are available for partner spawning; the lane adapter already uses the existing enemy/weapon APIs. Shared integration files are `main.ts`, `player.ts`, `state.ts`, `save.ts`, and `render.ts`. No edits were made to `enemies.ts`, `weapons.ts`, or `data.ts`.


## Mission tracker

`mission.ts` is pure: `mission(s)` reduces the voyage to the one step the pilot should do next (accept a contract, dose from personal spice, gate, FTL course, hand in at the receiver, or the final beacon), with the key, what follows, and the target point. It reads `deliveryQuest`, `deliveryOffer`, `ownedSpice` and `passage`, so it agrees with the delivery tracker and the gate labels. `mission-render.ts` draws it as the top-left panel, the edge chevrons (mission target in accent, station and nearest spice source dimmed, kept clear of the chart), the world-space compass arrow beside the ship, the lane HUD's step line, and the guide card that `State.guide` controls (H toggles it; letters typed into the callsign are dropped before the first playing tick so they cannot fire hotkeys). Contact and gate labels in `space-render.ts` are role-aware and state what blocks a gate. Tests: `mission.test.ts`.

## Armory: arms with rarity and durability

There is no XP, level-up screen or ship upgrade: `Player` has only base stats, and weapons (gun shop) and air support (market) bought with owned spice are the only power progression. Older pilot records with `level`, `xp` and `upgrades` still load; `save.ts` drops those fields on read.

`data.ts` holds `ARMS` (nine Dune air-support items: base price, market weight, staple flag, colour, text), `RARITIES` (price multiplier, uses, power multiplier), `RARITY_ORDER` and `MARKET` (5 stock slots, 4 arsenal slots, price cap 12, rarity weights per ring). An owned item is an `ArsenalItem { id, rarity, durability }` on `voyage.arsenal`; `voyage.armed` is spice spent on arms and joins the ledger invariant `collected === sold + consumed + spent + armed + remaining`; `voyage.purchased[sector:jumps]` lists slots already bought. All three are validated by `readVoyageSave` and default to empty on older saves.

- `market.ts`: `marketStock(v)` is pure on `seed:market:sector:jumps` (two staples, three weighted distinct rolls, rarity by ring); `openMarket` (from flight or the gun shop's page, docked within 100 px of a station), `buyArms` (atomic: refusals only set `s.market.notice`), `updateMarket` (cursor, Enter buys, Tab back to the gun shop, Esc undocks). `shop.ts` opens it on Tab. The screen is `'market'`, drawn by `market-render.ts`.
- `arms.ts`: `useArms(s, slot)` on keys 1-4 dispatches to an activation, spends one durability and saves; `updateArms` runs after bullets and counts down `Enemy.fear`, then `updateAircraft` and `updateHazards`. Helpers: `power`, `tier`, `nearestEnemy`, `bounds` (the FTL corridor width at a point, or the system boundary), `clampToBounds`, `inBounds`, `aimPoint`, `spawnHazard`, `explode`.
- `strikes.ts`: friendly `Aircraft` on `s.aircraft`: ornithopter pass, bombing run (spawns `bomb` hazards), gunship orbit, scout drone, carryall lift (removes enemies without salvage).
- `ordnance.ts`: `Hazard`s on `s.hazards`: Death Hand siren marker, warheads and radiation pool; Hawk Strike fear; AA mine bursting into homing missiles; hunter-seeker dart. `updateHazards` detonates fuses, ticks pools every 0.25 s, triggers mines, expires markers and stops once the screen leaves `playing`.
- `bullets.ts`: `spawnBullet(..., { homing, blast, r })`; a homing player bullet turns toward the nearest enemy, a blast bullet explodes on its first hit. `enemies.ts`: an afraid enemy flees and holds fire, patrols included.
- `arms-render.ts`: hazards below enemies, aircraft above the player, the arsenal strip (`drawArsenal`) over both HUDs and a red frame while a Death Hand siren runs.
- Tests: `market.test.ts`, `strikes.test.ts`, `ordnance.test.ts`; browser: `e2e/armory.spec.ts`. Aircraft and hazards are runtime only and are not serialized.

## Procedural comms contacts

`comms.ts` deterministically generates contact identity, morphology, vocal timbre and pacing from the existing contact seed. Four human-derived Dune-inspired forms (Guild Navigator, Face Dancer, ghola retainer, masked smuggler) have separate silhouettes in `comms-portrait.ts`. These are fictional encounters, not canonical named characters. `advanceDialogue` reveals one glyph at a time, pauses for punctuation and limits catch-up after frame stalls; its pulse drives silent portrait animation. Space reveals immediately, Enter retains the existing transaction behavior, and Escape disconnects.

`alien-voice.ts` lazily creates eight reusable local PCM syllable samples on the unlocked AudioContext. Per-glyph sample selection, pitch bends and envelopes vary by contact. Voice gain is increased independently of weapon effects; no downloaded recordings or speech service are required. Existing mute and cancellation stop active buffer sources as well as oscillators.


## Delivery ownership and reputation

`contracts.ts` owns offer generation, trust thresholds, cuts, route choice and spending helpers. Each new 12-unit lot splits into `personalSpice` (advance cut) and `cargo.remaining = contract.due + contract.fuel`. Consumption and the armory use `ownedSpice` / `spendOwned`; passage uses `transitSpice` / `spendTransit`, drawing fuel before personal spice. `sold` includes returned unused fuel to preserve the ledger. Patrols detect both personal and bonded spice.

Starting reputation is 60/100. Completed contracts restore 8; explicit theft takes 25 and increments `thefts`. Cuts are 5 at 75+, 4 at 40+, 2 at 20+, otherwise 1. Low trust directs work toward the most dangerous adjacent same-ring sector and halves per-unit credit rewards. Seeded sender thresholds (20–59) cannot be rerolled by reconnecting. The freighter offers recovery work once the 90-second default embargo ends. Stock cooldown uses active time and a pilot cannot accept a second active contract.

Save version 7 validates reputation, personal balance, contract terms and total spice accounting. Versions 2–5 migrate with reputation 60 and unbonded personal cargo; old players are never penalized retroactively. Comms captures the contact ID and revalidates before any exchange; Escape cancels and two X presses confirm theft. Contract terms and receipt are displayed alongside the procedural portrait and voiced typewriter dialogue.


`DeliveryContract.bonus` is a reputation-tier completion payment, locked on acceptance and added to both `personalSpice` and `earnedSpice` only at the receiver. The launch stipend (`STARTING_SPICE`) enters the same way, so `earnedSpice` counts all spice that did not come from a shipment. Advance cuts still come from the 12-unit shipment; completion bonuses do not change shipment serials or `collected`. The ledger is `collected + earnedSpice === consumed + sold + spent + armed + personalSpice + cargo.remaining` (zero cargo when empty).

`deadline` is absolute active-voyage time, set to acceptance time + 180 seconds. `updateVoyage` checks it before lane completion or interactions; `confirmComms` rechecks before hand-in; resumed overdue saves settle immediately. `defaultContract` handles theft and expiry identically, atomically clearing the job, transferring remaining cargo to personal ownership, adding one theft, subtracting 25 reputation and setting `embargoUntil = elapsed + 90`. All sender offers honor this global embargo; navigation still resolves a safe freighter target while nobody offers work. Menus pause the simulation timer. Version-6 contracts migrate with a new 180-second grace period and zero new completion bonus, retaining previously agreed terms. Versions 2–5 retain the previous ownership migration.


## Raster text and instrument labels

`bitmap-text.ts` caches fixed-resolution glyph sprites in bounded color atlases and draws them with nearest-neighbor `drawImage`. The shared `text` helper in `space-render.ts` uses this path everywhere, including live counters and comms. Keep direct `fillText` confined to glyph-atlas construction; use `bitmapWidth` for matching layouts. `label` adds a nine-slice raster backing for world transponders and alerts. Text already inside an instrument panel uses `text` to avoid nested plates. Flight telemetry, the threat board, arsenal slots and the air-support market all use the generated raster panel atlas. Browser coverage verifies no live text calls reach the game canvas and screenshots the principal interface screens.
