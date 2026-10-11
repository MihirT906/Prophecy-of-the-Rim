# Gameplay design gate

Run `npm run test:gameplay` for deterministic simulations, or
`PLAYWRIGHT_CHANNEL=chrome npm run lint:gameplay` for simulations, a production
build, and a real keyboard-driven Chrome scenario. Without the environment variable,
Playwright uses its installed Chromium. The simulation suite also runs in `npm test`;
the browser scenario also runs in `npm run test:e2e`.

These checks translate common design principles into **project-specific budgets**.
There is no universal numerical definition of fun. Passing protects these measured
behaviors; it does not establish enjoyment, balance for every skill level, or an
end-to-end winnable race.

| Principle | Measured behavior | Budget |
| --- | --- | --- |
| Immediate response | Held movement and fire create movement, bullets and muzzle feedback | ≤33.3 ms |
| Player agency | Sublight thrust reaches 200 world units/s | 50–500 ms |
| Recoverable movement | Brake from the measured acceleration scenario to ≤1 unit/s | ≤500 ms |
| Recoverable FTL movement | Brake after one second of FTL thrust, remain contained and stay stopped | ≤1.5 s |
| Achievable progression | Steer and fire through a live first inward FTL lane | 5–60 s |
| Combat pacing | Starter weapon kills an initially 300-unit-distant, moving rusher | 50 ms–2 s |
| Fair onboarding | Idle pilot survives the untouched generated opening | ≥3 s, sampled up to 10 s |
| Damage recovery | Continuous damage attempts produce a second hit | 250 ms–1.5 s |
| Consistent controls | Travel distance spread at 30/60/120 Hz over two seconds | ≤8% of 60 Hz distance |
| Safe planning | Map time freezes position, hull and voyage time, then controls resume | No change while open |

`design-lint.ts` owns the numerical budgets, units, principles and actionable
failure diagnostics. Non-finite measurements and empty measurement batches fail.
The linter's own tests inject out-of-range and invalid measurements into every rule.
Change a budget only alongside a documented design decision and playtesting evidence;
do not loosen it simply because a regression fails.

`scenarios.test.ts` advances production gameplay systems in the same guarded order
as `main.ts` at 60 Hz. It uses five explicit seeds. Opening tests retain generated
threats and hazards; control and combat tests use an explicitly isolated clear range.
They never assign kills or teleport a target to complete a scenario. Continuous
collision/damage and alternate timestep tests cover recovery and control consistency.
If the main loop order changes, update the harness too.

`e2e/gameplay-design.spec.ts` checks the actual main loop through browser keyboard
input and a controlled clock. Only initial range placement is staged. It attaches
measured state and budgets as JSON to Playwright results. Motion and muzzle state
are feedback proxies; this suite does not validate audible output or rendered pixels.
Existing ship-feedback and raster tests cover those separate presentation concerns.

Coverage limits: these are starter combat and sublight budgets, not a full-race bot,
exhaustive FTL balance test, weapon dominance analysis, player study, or subjective fun score.
Keep the existing FTL, contract, recovery, and accessibility tests in the full test
run, and playtest navigation clarity, threat readability, difficulty and repetition.

Trigger-release coverage checks that firing stops on release and responds immediately on a fresh press after cooldown. FTL braking retains the generated corridor and obstacles but isolates incoming traffic.

The FTL crossing test pilots five first inward lanes through held controls, with original traffic, rocks, hull and weapons. Its simple controller follows the centerline using velocity-aware lookahead; it never assigns position, health, kills, or completion. The initial straight-line pilot died before completing a lane; the test uses steering without changing gameplay rules. This establishes that the sampled routes are achievable, not that beginners will reliably win.

Live FTL resume coverage serializes through JSON five seconds into flight, validates and restores the save, checks that momentum, hull, threats, shots, elapsed time and fares survive, then pilots to the exit without resetting danger.

## Visual coherence

`PLAYWRIGHT_CHANNEL=chrome npm run lint:visual` runs the rendered screen sweep,
portrait animation checks, and stressed flight HUD scenarios. Browser reports attach
layout geometry and screenshots. `npm test` also checks invalid/non-finite rectangles,
unusable panel insets, clipped panel borders, and mission wrapping with long tokens
and Unicode. The visual edge scenarios include a maximum-length callsign, critical
hull, guide card, 100-hour timer, full reputation, and balances up to 999,999,999.

Like TeX box diagnostics, these fail on concrete geometry errors; they do not assign
an aesthetic score. Screen-space text and panels are covered. World-space labels,
perceptual contrast and small-window CSS scaling still need separate review.
