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
