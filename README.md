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
