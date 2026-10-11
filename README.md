# Prophecy of the Rim

A gray-box rewrite of ARENA: race from the galactic rim to the center, smuggling and consuming melange along the way. TypeScript, Vite, one canvas, no runtime dependencies. The original combat and weapon systems remain available for partner development; the player now uses momentum-based space flight.

## Play

```sh
npm ci
npm run dev
```

Open the printed local URL. Press Enter twice, enter a callsign, and press Enter. Existing pilot records without a compatible race save begin a new radial run.

| Input | Action |
| --- | --- |
| WASD | Responsive steering/thrust; release for light drag |
| Space | Apply counter-thrust to brake |
| Arrow keys / IJKL | Aim and fire |
| Z | Fire along the ship’s heading in systems |
| E | Hail a nearby planet, station, or ship; use transit points and the center beacon |
| F | Beside a station: open its armory. Guns page first; Tab turns to the air-support page |
| 1 2 3 4 | Fire the arsenal slot in flight or on an FTL course; each use spends one point of durability |
| H | Show or hide the "how a run works" guide card on the HUD |
| Comms Enter / Escape | Confirm exchange / disconnect without exchanging |
| Comms Space / V | Reveal dialogue / toggle alien voice |
| Comms X, then X again | Steal an active shipment; lose 25 reputation |
| C | Consume **one** personal spice unit; gain one permanent prescience point for this run |
| M | Open/close the radial map; simulation pauses |
| Map mouse | Hover a star to see what choosing it does; click it to choose it (same as Enter) |
| Map Left/Right | Cycle sectors on the selected ring |
| Map Up/Down | Select a connected inner/outer sector |
| Map Enter | Planning: set the course. Departing: jump to a gold-ringed neighbour (pays spice, starts its FTL course), plot a course to a distant star for free, or choose your own star to stay |
| R | Restore the cargo objective (or center route once fully attuned) |
| Escape | Pause / back |
| Enter after victory or death | Start a fresh attempt in the same seeded universe |

## Reading the screen

The **mission panel** at the top left always names the next step of the current leg (accept a delivery, dose your cut, gate, FTL course, hand in), how to do it with its key, what comes after, and the distance. An accent arrow beside the ship and an accent chevron at the screen edge point at that target; dimmer chevrons mark the station and the nearest contract source. The local chart at the top right carries a legend. Contacts are labelled by role (spice ship, smuggler port, station) with the key that applies when you are close, and gates say where they lead, what they cost and what still blocks them. The guide card at the bottom left lists the whole loop; H hides it.

## The loop

Every run launches with **8 personal spice**: enough for the first inward jump (4 doses + a 3-spice fare), a few same-ring hops, or an armory weapon. Spice aboard is contraband, so even this stipend draws Guild scans and wakes Harkonnen packs from farther away.

1. Hail a ship or planet port with **E**. The offer names a receiver and destination and splits a **12-unit lot** into sealed cargo, fuel allowance, and your personal cut. **Enter** accepts; **Escape** declines.
2. Your cut is paid in advance (initially **4 spice**). Consume it with C for prescience or spend it in an armory. Sealed cargo and fuel cannot be consumed or spent on weapons.
3. Leave the system and choose a connected sector. Passage uses the contract's fuel first, then personal spice. Fly the FTL course; leaving its bounds is fatal.
4. Hail the named station in the destination sector to hand in the sealed cargo. You keep your personal cut, receive the stated completion payment in spice and credits, and gain **8 reputation**. Starting couriers earn 4 spice upfront plus 8 on delivery; trusted couriers can earn 5 upfront plus 24 on delivery. Other receivers reject that delivery. Any unused fuel is returned with the shipment.
5. Steal an active shipment through comms with **X, then X again**. The remaining cargo becomes personal spice and reputation drops **25**. Lower reputation means smaller cuts (2, then 1 spice), fewer willing senders, and dangerous lateral routes. Theft also suspends all new contracts for 90 seconds of active flight. After that, the freighter offers recovery work; deliveries restore trust. Trusted couriers earn a 5-spice cut.
6. Every accepted mission has a **3:00 deadline in active flight time**, including FTL. Expiry ends the mission and counts as theft: no completion payment, -25 reputation, remaining cargo becomes yours, and a 90-second contract suspension. Paused menus, comms and the map stop the clock; reload preserves it.
7. Repeat inward. Reach sector 0 with **16 consumed doses**, then press E at the center beacon to transcend.

You begin on ring 4 with 6 trade credits. Ring 0 is the center.

| Entering ring | Prescience required | Inward fare (spice units) |
| --- | --- | --- |
| 3 | 4 | 3 |
| 2 | 8 | 3 |
| 1 | 12 | 4 |
| 0 | 12 | 4 |

Outward travel costs 2 spice. Same-ring travel costs `max(1, 5 - floor((sourceDanger + destinationDanger) / 2))`: 4 spice between two safe sectors, 1 between two danger-5 sectors. This discount is symmetric. Danger also increases drifting debris density and motion. Take a new contract when you need another cut and fuel allowance. If you lack prescience for inward work, offers use a lateral route first.

The center's final interaction needs 16 doses even though its transit route opens at 12. Empty caches resupply 15 seconds after collection, measured in active flight time. You can only carry one shipment at once. Consuming stops at 16, preserving your surplus personal spice. Only one delivery may be active at a time; your personal balance carries over between contracts.

The clock measures active simulation time. Map, comms, pause, shop and result screens stop it. Death ends the attempt. Retrying clears cargo, credits, consumed spice, and bought weapons but keeps the universe seed. Race progress, reputation, theft count, personal spice, contract terms, position, velocity, departure state, cargo, spice spent, depletion timers, hull, plotted destination, and elapsed time are saved locally every two seconds and on important actions.

## Station armory: Dune air support for spice

There are no experience levels or ship upgrades. Kills earn nothing but salvage drops; the only way to get stronger is to spend spice on weapons. Every station sells arms for cargo spice. Press F within 100 units of its hull. The first page is the gun shop; Tab turns to **air support**, nine Dune-derived strikes and escorts: hunter-seeker, AA mine, ornithopter pass, scout drone, Hawk Strike, carryall, bombing run, gunship, Death Hand. Each item in stock is an instance with a **rarity** and a **durability**:

| Rarity | Price | Uses | Effect |
| --- | --- | --- | --- |
| Common | ×1 | 2 | ×1 |
| Uncommon | ×1.5 | 3 | ×1.25 |
| Rare | ×2 | 4 | ×1.5 |
| Legendary | ×3 | 6 | ×2 |

Prices are the base price times the rarity multiplier, rounded, never above one lot of 12. The shelf is semi-random: slots 1 and 2 always hold a common hunter-seeker and a common AA mine; slots 3 to 5 are three distinct items rolled from the universe seed, the sector and your jump count, with rarity odds that improve toward the center (the rim never stocks legendary). A slot bought stays sold for that visit; a later visit to the same sector restocks. The arsenal holds four items, used with 1-4; an item breaks when its uses run out. Spice paid here is tracked as `armed` in the run ledger and never pays a fare.

Bombs, warheads and the radiation pool hurt the ship too: stay clear of the markers. Hawk Strike makes every hostile, Guild patrols included, flee and hold fire. The carryall removes hostiles without salvage. Aircraft and ordnance are not saved mid-flight; a reload clears them.

## Flight and procedural systems

Systems are now compact: 5,120 × 3,840 world units, with a following camera, navigation bearings, and a local chart. At 300 units/second, a full-width crossing takes about 17 seconds; docking, gravity and routing add time. This supersedes the earlier five-minute traversal target.

WASD applies 1,800 units/second² of thrust with exponential drag of 1.25/second. Cruise speed is reached in about 0.2 seconds; Space brakes at 2,200 units/second². The cap is 300, including diagonals. Short trails, thruster flames, muzzle flashes, shot streaks, impact particles, shake and synthesized effects provide immediate feedback. Stars and planets exert softened, finite-range gravity; thrust remains stronger than gravity. Planets and debris deflect the ship on contact.

Edit [`src/sector.json`](src/sector.json) to tune dimensions, speed, thrust, brakes, debris count, planets, orbital periods, and trail lifetime. [`src/sector.schema.json`](src/sector.schema.json) defines the JSON contract. The generator imports these settings and validates every required key, type, range, and unknown property at startup. Seeds determine the graph, sector danger, placements, and orbits. Dynamic positions are derived from active run time, so pausing and saving preserve the environment.

Version-7 saves add deadlines, earned spice and contract suspensions. Version-6 contracts receive a fresh three-minute grace period on migration and keep their original payout terms. Version-6 saves added ownership and reputation; older cargo becomes personal property with neutral starting reputation. Version-2 and version-3 saves migrate positions into the smaller systems. Version-5 snapshots preserve FTL course geometry, world position, velocity, actors and the already-paid toll. Old version-4 timed lanes restart at the entrance of the new course without charging again. Changes to generation tuning affect regenerated worlds; this prototype does not pin a config snapshot into saves.

## Setting and scope

Melange shipments originate from Arrakis; the caches represent diverted cargo, not new sources of spice. It is stolen/unauthorized trade that makes this cargo contraband, not a universal ban on melange. Boundary markers abstract rendezvous with Guild transport. The player has latent prescient potential. Insectoid comms entities and their horror dialogue are an original, non-canonical extension of this prototype.

The radial chart is generated gameplay geography. **Transcending at the galactic center is this game's original scenario premise, not an event asserted to be Dune canon.** There is no claim that ordinary spice use automatically turns everyone into a Navigator.

This is a systems prototype: gray boxes, labels, placeholder ship/enemy shapes. Security AI, new enemy behavior, and new weapons belong to the parallel combat work. Sectors now expose seeded, weighted patrol/ambush/stalker encounter sites for those systems. No enemies are spawned by the new universe loop yet; the existing enemy/weapon updates and partner event hooks are ready for integration.

## Development

Read `FOR_COMPANIONS.md` for architecture, invariants, and partner integration. `QUICKSTART.md` retains the hackathon submission rules.

```sh
npm run build        # strict typecheck + Vite bundle
npm test             # existing combat tests + radial generation and race rules
npx playwright install chromium
npm run test:e2e      # browser boot, momentum controls, and staged race interactions
npm run bundle       # standalone arena.html
```

To use an installed Google Chrome for browser checks: `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.

Pure generation tests cover connectivity, reciprocal gates, seed stability, and ship-sized access to every interaction point. Race tests cover resource accounting, locked transit, restocking, death, victory, and save validation. The browser test checks real thrust/coast/brake input and boundary crossing, then uses position fixtures to exercise cargo, map confirmation, four inward jumps, reload, victory, and retry. Headless physics checks quick acceleration, light drag, braking, compact crossing time and bounded gravity. Browser checks exercise lane combat startup and resume, then explicitly stage lane completion to verify the overall transaction flow; they do not establish combat balance.

Spice contacts share each sector’s shipment stock and restock timer. A freighter is visible from the starting position, with couriers near arrival lanes and ports on every planet. Dashed circles show docking range; offscreen chevrons are labelled as navigation aids, with remaining distance.

## Comms and sector content

[`src/sector-content.json`](src/sector-content.json) defines planet/station names, weighted encounter archetypes, hazard templates, and dialogue fragments. Its companion JSON schema validates the data at startup. Generated systems contain `planets`, `stations` (with services), `encounters` (archetype, role, count, trigger radius, position, seed), and `hazards` (kind, position, radius, strength). Moving debris collides with the player; ion clouds perturb velocity. Encounter sites are data for the partner combat integration, not a new enemy AI implementation.

Comms pauses flight and keeps cargo unchanged until confirmation. Each contact has a reproducible Dune-inspired portrait, pitch, timbre, and pacing; the dialogue explains its current delivery offer or hand-in. Text appears with synthesized syllabic chatter; the portrait's mouth and signal bars follow the live audio envelope. No microphone, network voice API, or prerecorded speech is used. V mutes voice; Space reveals text; Escape stops audio and disconnects. If browser audio is unavailable, text and portrait still work.

## Shared controls: sublight and FTL

Both modes use **WASD thrust, Space brake, Z forward fire, and arrows/IJKL aim/fire**, with the same following camera, projectile inheritance, collision response and enemy logic. There is no lane-only automatic fire or automatic scrolling.

Sublight systems cap speed at 300 units/second. FTL courses cap it at 900, with lower acceleration (1,100), weaker braking (1,000) and lighter drag (0.35). Expect broader turns and longer stopping distances. The HUD names the mode and shows speed, braking distance, remaining route distance and clearance to the lethal edge.

Hyperlanes are seeded 20,000-unit courses with gentle bends, a 1,200-unit corridor, obstacle clusters and sparse encounters. You must physically cross the exit line; waiting never completes a lane. You can slow, stop or reverse inside the course. **Crossing any outer boundary—including turning back through the entrance—destroys the ship immediately, bypasses combat invulnerability and persists a lost run.** Obstacles within the course deflect the ship like debris in systems.

The toll is charged once at launch. The destination and jump count change only at the exit. Pause freezes flight; reload restores the same course and momentum without another charge.


## Initial handoff: galaxy / content / runtime separation

- `src/galaxy/graph.ts`: standalone graph of labelled nodes and edges with opaque payloads. Validates IDs/connections and provides adjacency/path queries. No file loading, rendering, or gameplay imports.
- `src/galaxy/galaxy.json`: explicit star-system and hyperlane topology. Node/edge payloads reference content profiles.
- `src/galaxy/content.json`: system distributions (planet/station counts, debris density, encounter weights, hazards) and lane distributions (course length/width, obstacles, encounters, engine envelope and enemy weights).
- `src/galaxy/catalog.ts`: gameplay-specific decoder/validator. `loadGalaxy(document, content)` accepts decoded objects from any source, independently of file/network loading.
- `src/universe.ts` and `src/hyperspace.ts`: runtime interpreters. These instantiate environments and combat from the catalogue; their behavior can change without changing the generic graph.

The current radial race adapter retains numeric sector indices for existing saves/UI, mapped to stable string graph IDs. Changing graph node order or topology can invalidate old prototype run data; the pilot record is retained. A future save format should persist stable graph IDs.

This is an initial integration baseline. Combat balance remains rough. System encounter sites are available for partner spawning; the lane adapter already uses the existing enemy/weapon APIs. Shared integration files are `main.ts`, `player.ts`, `state.ts`, `save.ts`, and `render.ts`. No edits were made to `enemies.ts`, `weapons.ts`, or `data.ts`.

### Planetary hazards and living worlds

Seeded systems always retain one safe planet port. Other worlds can be stable, radioactive (slow hull damage inside the marked atmosphere), or stormbound (sideways shear and periodic electrical damage). The colored boundary follows the planet through its orbit.

Rare anomalous worlds are enormous dormant creatures: sentient oceans and world eaters. Approaching within 330 units of the surface or shooting them wakes them. They have 180 hull, telegraphed radial volleys, and faster attacks below half health; oceans also strike ships within their marked tidal ring. Escape or destroy them for 30 credits. Living worlds have no trading port. Health, awakening, attack timing, and defeat persist across sector travel and saves; defeated worlds remain inert and cannot pay twice.


### Reputation and spice payments

| Reputation | Advance cut | On-time completion spice | Total personal spice per mission |
| --- | ---: | ---: | ---: |
| 0–19 | 1 | 0 | 1 |
| 20–39 | 2 | 1 | 3 |
| 40–59 | 4 | 4 | 8 |
| 60–74 | 4 | 8 | 12 |
| 75–89 | 5 | 16 | 21 |
| 90–100 | 5 | 24 | 29 |

Completion spice is additional payment from the receiver, not taken from sealed cargo. Terms lock when accepted. Theft or expiry forfeits this payment, loses 25 reputation and suspends new jobs for 90 active-flight seconds; completion gains 8 reputation. Six consecutive honest jobs from starting reputation pay 124 spice before expenses, compared with at most 72 units from stealing six lots, plus the thief's suspensions and restricted access. This is baseline economy tuning, not a claim that every route or combat risk is balanced.

### Gameplay design checks

Run `npm run test:gameplay` for measured gameplay simulations across five seeds.
Run `PLAYWRIGHT_CHANNEL=chrome npm run lint:gameplay` to also build and exercise real
keyboard input in Chrome. Failures identify the design principle, observed value,
allowed budget and suggested investigation. See [gameplay design budgets and coverage](src/gameplay/README.md).
These are tunable regression guardrails for responsiveness, agency, pacing and fairness;
playtesting remains necessary to assess fun.

B places a player-safe area bomb: 0.8s fuse, 340-unit expanding damage wave, 4s recharge. No spice cost. Bomb-kill debris stays player-safe (cyan). F opens station weapons; Rocket, Swarm and Lance add blast, homing-salvo and piercing options. Use UP/DOWN to move through both shop pages.
