# Phase 3 — look and HUD (T5, T6)

Objective: make the slice look like the reference and tell the player where they are. Index and standing rules: `../scenic-journey-v1.md`. Before starting, read the `## Log` of `phase-2-slice.md` only for the final terrain parameters and the runtime module layout, then add them under "Facts" here.

## Specs

- **S4 (carried over).** "Inflatable raft" … gentle left/right steering inside the channel; it cannot leave the river, sink or get stuck.
- **S3 Look.** "Graphics 3d-like, cartoon but realistic, not satellite. Something like this: https://matajuegos.itch.io/atuel". No satellite/aerial imagery as texture. Toon/gradient shading, stylized water (flow-scrolling normals, foam at banks, depth tint), fog, sky gradient, instanced vegetation and rocks, biomes by stretch: Andean forest with araucarias (Aluminé) → steppe canyons (Collón Curá, Limay) → reservoirs → irrigated Río Negro valley with poplars/orchards → estuary and sea. Biome comes from the route segment and distance, blended over a transition length.
- **S7 Text and language.** "Spanish + English", switchable. HUD shows current river name, progress along the route, and landmark notes (towns, dams, confluences) as the raft passes them; landmark data is already in `public/data/route.json` (`landmarks`, `segments`, `reservoirs`). Strings live in one file per language.
- **S8 Platform.** 60 fps on a mid laptop; usable on a phone. Vegetation and shaders must respect this (instancing, no per-frame allocation).

## Facts from earlier phases

- Runtime layout (phase 2, commit `20bb918`). Pure, no Three.js: `src/world.ts` (`toWorld`, `writeWorld`, `worldYawAt`; game x→world x, game y→world −z, height→world y), `src/drift.ts`, `src/steering.ts` (`channelLimit`, `stepSteer`), `src/chunks.ts` (`ChunkManager`; 64-station mesh chunks, window 150 m behind / 650 m ahead, ≤ 8 alive), `src/terrainMesh.ts` (`buildTerrainMesh`, `buildWaterMesh`, `terrainColor`). Three.js glue: `src/terrainScene.ts`, `src/raft.ts`, `src/input.ts`, `src/ui.ts`, `src/loader.ts` (fetches only strip chunks 0–1), `src/game.ts` (loop, chase camera, resize), `src/main.ts` (`?s=` start distance, `window.__rio` debug state). Tests: `pnpm test` (30 passing), helper `src/testData.ts`.
- Terrain scale is settled: the phase 1 strip (lateralScale 8, verticalScale 8) reads as hills and canyon walls from the raft (`odd/reports/t4-start.png`, `t4-mid.png`); the fins feared from the top-down strip image do not show at raft height. Do not rebuild the strip for scale.
- Route distance `s` is arclength along the smoothed game line, not real km / 40: segment ends are alumine 3,400.0, collon-cura 5,909.2, limay 15,313.4, negro 32,340.7 game m. Always take `s` from `route.json` (`segments[].endS`, `landmarks[].s`, `centerline.km`), never from km / 40.
- Known gaps handed over: (corrected) the carved river channel is about ±16–20 m; the "±45 m" seen earlier was the flat water sheet hidden under the banks; steep sand faces near some banks look faceted; colours are untuned; measured ~40 fps in the browser pane on a loaded machine (60 fps unverified); touch tested only with a synthetic event.

## Tasks

- [x] **T4b** (S4) Steering uses the real water: the limit at each station is the distance from the centerline to where the terrain strip rises above the water level on each side (left and right separately), minus a margin, instead of `widthM`/2; the raft can reach all visible water and never touches a bank. Test at every station of the slice. Route: delegated (builder). Commit: `c8b69ff`
- [x] **T5** (S3, S8) Look: toon terrain shading, water shader, sky/fog, instanced vegetation and rocks per biome. Route: delegated (builder, 2 feedback rounds). Commit: `e4e7d4b` — built and verified; the user has not yet judged the look.
- [ ] **T6** (S7) HUD: river name, progress strip, landmark notes, es/en switch. Route: delegated (builder). Commit: —

T5 and T6 touch different files and may run in either order, but one at a time (memory rule).

## Log

- **P3-L1** (2026-11-11, planner review of T4): reran `pnpm test` (30 passed); screenshots reviewed; agreed with the orchestrator's no-fins call; slice end 3,400 is correct per `route.json` (the phase 2 spec's ~3,520 was a km/40 estimate); decided the steering limit should follow the carved water, added as T4b. Not started: user's standing instruction was to stop after T4.
- **P3-L2** (2026-11-11, T4b evidence, orchestrator) Commit `c8b69ff`. New pure `src/limits.ts` (`buildChannelLimits`, `ChannelLimits.at(s, out)`), `stepSteerBetween` in `src/steering.ts` (`stepSteer` delegates to it, regression-tested); limits computed once in `loader.ts`. RED observed (missing module). Browser: raft reaches d = ±12.5 at s≈180–270, stays on water. Median steerable width 33 m (30.2 m before). Risk: item 3 (shared `stepSteer`, covered by a regression test).
- **P3-L3** (2026-11-11, T5 evidence) Commit `e4e7d4b`. New in `src/`: `biomes.ts` (five biomes, per-biome `rockSlope`: forest 1.2, others 0.85), `palette.ts`, `vegetation.ts` (seeded, trees need ≥ 8 m of land either side), `look.ts`, `waterMaterial.ts`, `vegetationMesh.ts`, plus tests; changed `terrainMesh.ts`, `terrainScene.ts`, `raft.ts`, `game.ts`. Two feedback rounds (water colour/foam, green forest banks, rock only on steep faces, saturation). Orchestrator browser check after round 1: 40 fps median with the pane visible, no console errors. Screenshots `odd/reports/t5-{start,mid,end,phone}.png`. Planner reran `pnpm test` after the commit: 8 files, 57 passed; tree clean. Not verified: fps after round 2, 60 fps target, real touch device. Known taste points left for the user: pale strips on the lowest bank, an occasional trunk at the frame edge. Risk: none recorded by the orchestrator (its run was stopped before the final report).
- **P3-L4** (2026-11-11, session end, user: "Session is about to finish wrap it all") The orchestrator was stopped right after committing T5; **T6 (HUD) was not started** and no partial T6 files exist. Resume point: get the user's feedback on the T5 look (screenshots above or `pnpm dev`), then run T6 per this file; then mark phase 3 done in the index. Harness note: an Opus orchestrator's run ends whenever it waits on a background builder — run builders in the foreground or resume the orchestrator after each builder hand-back.
