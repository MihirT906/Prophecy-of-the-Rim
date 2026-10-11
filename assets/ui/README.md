# Raster interface and animated transmissions

`prompt-tree.json` is the authoring source. Every node contributes a prompt paragraph; a leaf contributes its output filename, guide dimensions, named crop rectangles, and optional sprite animation metadata. The complete prompt is the ordered concatenation along that root-to-leaf path. The root contains shared art direction; `interface` and `communications` provide different production constraints.

Run `node scripts/ui-assets.mjs --guides` to compile the whole tree and render its greybox PNG guides with installed Chrome. Without `--guides`, compilation does not need a browser. It writes:

- `generation-plan.json`: the full batch of resolved prompts, paths, prompt hashes and guide references.
- `catalog.json`: runtime asset metadata.
- `guides/*.svg` and, with the flag, `guides/*.png`: guide layers, produced before generation.

Generation uses the built-in image generator, one call per leaf, dispatched together as a single seven-job batch. Pass each resolved prompt and its own guide PNG as the reference image. No API key or generation costs are hidden inside the compiler. Put reviewed outputs in `generated/` with their declared filenames. Keep original generated files unchanged. Run `node scripts/ui-assets.mjs --pack` to encode compact WebP runtime copies without resizing or altering the source sheets. `generation-receipt.json` records the accepted source filenames and the exact prompt hashes used for this batch. `atlas-overrides.json` records reviewed crop boundaries and source nine-slice insets where generated edges differ slightly from the greybox. Those overrides affect extraction, not prompt inheritance.

`src/raster-ui.ts` preloads the batch and scales the generated UI with fixed-size corners. Text, charts, readouts and gauges remain live game data. Vite embeds the compact `runtime/*.webp` images in the offline bundle (3.5 MB of runtime art versus 16 MB of PNG sources). Missing or loading assets retain the procedural fallback.

The four communications leaves each produce a full 4×4 sprite sheet. Row one is closed-mouth idle/breath/blink; the other three rows are phonemes. `src/alien-sprites.ts` reads the frame grid from the generated catalog and scales crop coordinates to the actual returned sheet dimensions and preserves portrait aspect ratio. `src/portrait-animation.ts` selects phonemes at 10 fps from the dialogue pulse/audio envelope, returning to idle during silence or after text reveal. This is amplitude-driven animation, not recorded phoneme alignment. Procedural portraits remain a loading/error fallback.

Validation: `node --test scripts/ui-assets.test.mjs`, `npm test`, `npm run build`, and `PLAYWRIGHT_CHANNEL=chrome npx playwright test e2e/raster.spec.ts`.
