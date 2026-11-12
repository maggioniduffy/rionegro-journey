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
- Known gaps handed over: visible water is about ±45 m wide but steering clamps at about ±14 m (`centerline.widthM`/2 − 3.5 m); steep sand faces near some banks look faceted; colours are untuned; measured ~40 fps in the browser pane on a loaded machine (60 fps unverified); touch tested only with a synthetic event.

## Tasks

- [ ] **T4b** (S4) Steering uses the real water: the limit at each station is the distance from the centerline to where the terrain strip rises above the water level on each side (left and right separately), minus a margin, instead of `widthM`/2; the raft can reach all visible water and never touches a bank. Test at every station of the slice. Route: delegated (builder). Commit: —
- [ ] **T5** (S3, S8) Look: toon terrain shading, water shader, sky/fog, instanced vegetation and rocks per biome. Route: delegated (builder). Commit: —
- [ ] **T6** (S7) HUD: river name, progress strip, landmark notes, es/en switch. Route: delegated (builder). Commit: —

T5 and T6 touch different files and may run in either order, but one at a time (memory rule).

## Log

- **P3-L1** (2026-11-11, planner review of T4): reran `pnpm test` (30 passed); screenshots reviewed; agreed with the orchestrator's no-fins call; slice end 3,400 is correct per `route.json` (the phase 2 spec's ~3,520 was a km/40 estimate); decided the steering limit should follow the carved water, added as T4b. Not started: user's standing instruction was to stop after T4.
