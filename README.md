# Rio Descent

A relaxed 3D browser game in which an inflatable raft drifts the real route of Rio Alumine, Collon Cura, Limay and Negro down to the Atlantic, in a stylized cartoon look. Built with Vite, TypeScript and Three.js; the route data is derived offline by a Python pipeline in `tools/`.

## Prerequisites

- Node.js 20+ and pnpm
- Python 3.10+ (only for the data pipeline in `tools/`)

## Web app

```sh
pnpm install
pnpm dev      # dev server with hot reload
pnpm test     # vitest unit tests
pnpm build    # type-check and static build into dist/
```

The build uses a relative base, so `dist/` runs from any plain file server and can be zipped for itch.io HTML5.

### Playing the Aluminé slice

`pnpm dev` (or any static server on `dist/`) opens the raft drifting down the Aluminé stretch at 18 game m/s. Steer with A/D or the arrow keys (left/right half of the screen on touch); R restarts after the end-of-slice message. Debug: `?s=1800` starts at route distance 1800 m, and `window.__rio` exposes `{ s, d, ended, chunkCount }`.

Module layout: pure logic in `world.ts` (route space to world; x east, -z north, y height), `drift.ts`, `steering.ts`, `limits.ts` (per-station left/right water limits from the terrain strip, used to clamp steering), `chunks.ts` (mesh chunk window) and `terrainMesh.ts` (vertex arrays); Three.js code in `terrainScene.ts`, `raft.ts`, `game.ts`, `input.ts`, `ui.ts`.

## Data pipeline

```sh
python3 -m venv .venv
.venv/bin/pip install -r tools/requirements.txt
.venv/bin/pytest tools/
```

Downloaded rasters go in `data/raw/` (git-ignored); derived game data is committed under `public/data/`.

### Building route data

`public/data/route.json` is generated from the sibling `basin-explorer` project (read-only): HydroRIVERS geometry, per-reach attributes, reservoirs, dam walls and OSM localities. Regenerate it with:

```sh
.venv/bin/python tools/build_route.py                              # default source root, writes public/data/route.json
BASIN_EXPLORER_ROOT=/path/to/basin-explorer .venv/bin/python tools/build_route.py
.venv/bin/python tools/build_route.py --smoothing-km 2 --corridor-m 300 --spacing-m 20
.venv/bin/python tools/build_route.py --report                     # print the smoothing / no-fold trade-off table
.venv/bin/pytest tools/                                            # checks the build against the real data
```

The default source root is `/home/faustino/Desktop/Documents/code/basin-explorer`; override it with `--source-root` or `$BASIN_EXPLORER_ROOT`. The route axis is compressed exactly 1:40 (about 1,294 km becomes about 32.3 km); the centerline is smoothed and curvature-limited so its bend radius stays above the terrain corridor half-width. `src/route.ts` holds the matching TypeScript types and helpers.

### Building terrain

`public/data/terrain/` holds the height strip in route space (rows = stations every 2 game m along the route, columns = lateral offsets -300..+300 game m, 16-bit heights in chunks, plus `manifest.json` with scales, chunk list and the per-station water level). It is sampled from the Copernicus GLO-30 DEM, which is downloaded once into `data/raw/copernicus/` (git-ignored) over anonymous HTTPS from the public AWS bucket `copernicus-dem-30m`:

```sh
.venv/bin/python tools/fetch_dem.py --dry-run --sizes   # list the 1x1 degree tiles the route corridor touches, with sizes
.venv/bin/python tools/fetch_dem.py                     # download missing tiles, one at a time, resumable (18 tiles, ~670 MB)
.venv/bin/python tools/build_terrain.py                 # write public/data/terrain/ and odd/reports/terrain-strip.png
.venv/bin/python tools/build_terrain.py --lateral-scale 8 --vertical-scale 8 --resolution 2 --half-width 300
.venv/bin/pytest tools/test_terrain.py
```

Terrain at (station s, offset d) is the DEM read at the true river point moved across the valley by `d * lateral-scale` real metres (along the cross direction of the smoothed real line; d > 0 is left of the flow), height in game metres = `(elevation - reference) / vertical-scale`. The water surface never rises downstream, is flat on each reservoir with a step down at its dam, and is 0 at the mouth; the channel is carved to the game channel width in `route.json`. The scales, resolution and half-width are recorded in the manifest; `src/terrain.ts` has the matching types, chunk decoding, `heightAt(s, d)` and `waterLevelAt(s)`. Memory stays low: tiles are read with windowed reads, the strip is built in blocks (peak about 400 MB).
