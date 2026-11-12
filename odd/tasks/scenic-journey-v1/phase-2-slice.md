# Phase 2 — playable Aluminé slice (T4)

Objective: the first thing you can play — the raft drifting down the Aluminé stretch (game distance 0 to ~3,520 m, real km 0–140.9) over the real terrain strip, in a browser. Also settles the terrain-scale problem found in phase 1. Index and standing rules: `../scenic-journey-v1.md`.

## Specs

- **S4 Boat.** "Inflatable raft". The raft follows the current along the route, with gentle left/right steering inside the channel; it cannot leave the river, sink or get stuck. Keyboard (A/D, arrows) and touch. Placeholder raft geometry is fine (a recognisable inflatable-raft shape from primitives), no external model.
- **S5 Gameplay v1.** "first Relaxed scenic journey, then Raft/kayak physics + rapids + obstacles". No damage, timer or fail state. Drift speed about 18 game m/s (whole route ≈ 30 minutes), a parameter. In this phase the slice ends at the Aluminé/Collón Curá confluence with a simple "end of slice" state (restart allowed).
- **S8 Platform.** "Three.js (web)". Static build that runs from a plain file server. Target 60 fps on a mid laptop; usable on a phone (touch steering, resize).
- **S2b Terrain scale (from phase 1, L11).** The committed strip uses lateral 1:8 against along-route 1:40, so relief is stretched ~5× across the river and reads as thin fins; reservoirs are only ~100 game m wide. Acceptance for this phase: seen in 3D from the raft, valley sides read as hills/canyon walls, not fins. Levers, all existing or cheap: `build_terrain.py` parameters (`lateralScale` toward 20–30, `verticalScale`), a low-pass of the DEM along the route before sampling, runtime detail noise. Regenerate the strip if parameters change (committed terrain stays under ~15 MB). Reservoir width is phase 4's problem; do not solve it here.

## Facts from phase 1 (do not re-derive)

- `public/data/route.json` (212 KB): `gameLengthM` 32,340.7; `segments` (4, in order alumine, collon-cura, limay, negro, with route distances); `reservoirs` (4); `landmarks` (39); `centerline` (game-space polyline, min bend radius 338.8 m); `reaches` (371). Loader and types: `src/route.ts`.
- `public/data/terrain/manifest.json` + 16 chunk files: 16,171 stations × 301 columns, 2 m resolution, half-width 300 m, raw little-endian uint16, `height = heightMin + value * heightStep`; row i is s = (start+i)·2 m, column j is d = −300 + j·2 m, d > 0 is LEFT of the flow; `water.levels` gives the water surface per station (game m). Loader: `src/terrain.ts`. The Aluminé slice is the first ~1,760 stations (chunks 0–1).
- Route space → world: a point (s, d) is the centerline position at distance s plus d along the left normal. The centerline's bend radius exceeds the half-width, so the strip never folds.
- Pipeline: `tools/build_route.py`, `tools/build_terrain.py` (parameters are CLI flags, recorded in the manifest), `tools/fetch_dem.py`; DEM tiles in `data/raw/copernicus/` (18 tiles, already downloaded, git-ignored). Terrain build peaked at 400 MB.
- App so far: `src/main.ts` shows a placeholder Three.js scene; `src/viewport.ts` handles sizing. Nobody has yet looked at the page in a real browser.

## Tasks

- [ ] **T4** (S4, S5, S8, S2b) Runtime slice: bend the terrain strip along the centerline into chunk meshes (only chunks near the raft are built/kept), water ribbon at `water.levels`, raft with drift + steering clamped to the channel, chase camera, keyboard + touch, end-of-slice state; simple flat-shaded colours by height/slope are enough (the look is phase 3). Then judge S2b in the browser and tune. Route: delegated (builder). Commit: —

## Log

- **P2-L1** (2026-11-11, user, verbatim): "None, strip the plan into phases so when a session starts doesn't load the whole plan into context / Then start T4".
