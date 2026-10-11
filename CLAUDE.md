# Game development principles

Read FOR_COMPANIONS.md for architecture, shared ownership, and gameplay invariants.

## Immediate feedback is mandatory

Every player keystroke must receive immediate visual AND auditory acknowledgement on the next rendered frame / audio opportunity. This applies to flight, menus, dialogue, typing, map navigation, weapon selection, interactions, and unsuccessful or unavailable actions. Never leave an input silently ignored. Distinguish an input acknowledgement from a successful action: blocked actions must retain clear reasons and must not imply that a transaction or shot succeeded.

Held actions need continuous feedback: animated directional thrusters and engine sound for movement, retro jets for braking, muzzle animation and shot sound for firing. Preserve the same feedback contract in sublight and FTL. Releases must stop sustained effects promptly. Menu keys and controls must not accidentally toggle sound (B places a player-safe bomb; F opens the armory).

Use raster sprites and cached animation frames for the player ship. Use bitmap text and raster panels for feedback; no floating plain canvas text. Ship animation must reflect the applied impulse, weapon aim, braking, damage and engine mode. Keep presentation independent of simulation/save data and avoid changing gameplay RNG for animation.

Honor reduced-motion preferences, browser audio activation restrictions and any explicit mute setting. Audio unavailability must never break controls; visual acknowledgement remains mandatory. Avoid full-screen flashing or camera shake as the sole feedback. Verify new actions with keyboard/browser checks, including blocked actions and both engine modes. Build and run relevant tests before sharing changes.

## UI legibility gate

Run `npm run lint:ui` before sharing UI changes (`PLAYWRIGHT_CHANNEL=chrome npm run lint:ui` uses installed Chrome). This builds the game and checks rendered menus, flight, delivery navigation, FTL, arrival, comms and shops. The browser report attaches screen geometry and screenshots.

Treat `overfull-panel`, `overfull-viewport`, `text-collision`, and `panel-occludes-text` like TeX overfull-box errors: fix the layout, never silence a diagnostic just to pass. Raster borders reserve an explicit content inset. Text must fit inside that inset, with space between rows. Do not shrink text to unreadable sizes to hide overflow. Wrap or allocate more space instead. Input-feedback panels need dedicated space too.

The current geometry linter checks screen-space typography, not moving world labels, pixel-level contrast, or every possible procedural string. Review screenshots and test long content when changing generators. A green lint run is a regression check, not proof that every possible frame is legible.

## Movement-shooter combat direction

Favor forward pressure, readable threats, immediate weapon response and player-controlled movement. Make target selection and actual area damage visible before adding more spectacle. The default Shredder assigns three rounds to distinct targets in the forward cone, with no lock-on wait or ammunition tax. Directional fire allows strafing independently of aim. Preserve that control scheme in FTL.

Death debris is neutral: it threatens the pilot as well as enemies. Chain reactions must remain bounded and combos belong at the kill locations in world space, with raster-backed text. Use warm gold for player fire/locks and orange-red for dangerous shrapnel. Respect reduced motion, never freeze simulation for cosmetic hit-stop, and keep effects out of persistent progression and gameplay RNG.

## Attention budget

Prioritize immediate danger, the next useful action, then mission progress. Keep delivery guidance stable during combat; routine enemy announcements must not displace it. Show nearby threats instead of a permanent sector-wide faction ledger, at most three offscreen enemy directions, and only occupied weapon slots. Keep diagnostic physics values out of the default flight HUD.

Enemy deaths and chain explosions use local impact feedback, not camera shake. Other shake uses a small non-additive peak, a three-unit ceiling, and fast time-based decay; reduced motion suppresses it. Group nearby combo labels and bound transient visual effects so feedback does not obscure the action.

## Publishing cadence

Make each small, coherent change its own commit and push it as soon as its relevant checks pass. Do not accumulate unrelated changes into a batch. Preserve other agents' work and merge remote updates without force-pushing.
