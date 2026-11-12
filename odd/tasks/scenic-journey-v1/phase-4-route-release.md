# Phase 4 — whole route and release (T7, T8)

Objective: extend the slice to the full 32 km, to the sea, and package it. Index and standing rules: `../scenic-journey-v1.md`. Before starting, read the `## Log` of `phase-3-look-hud.md` for the module layout and add what matters under "Facts" here.

## Specs

- **S1 Route.** "an embarcation going from river alumine, passing rio collon cura, limay, rio negro until it reachs the sea". The whole committed route (`public/data/route.json`, 371 reaches, 32,340.7 game m) is playable start to mouth without getting stuck.
- **S5 Gameplay v1.** No damage, timer or fail state. It ends when the raft reaches the sea, with an ending screen.
- **S6 Reservoirs and dams.** On-route reservoirs, in order: Piedra del Águila, Pichi Picún Leufú, El Chocón (Embalse Ezequiel Ramos Mexía), Arroyito (water levels 589 / 476 / 374 / 311 real m; dam steps 80 / 13 / 33 / 7 m). Water widens into a lake that reads as a lake (phase 1 left them ~100 game m wide in a 600 m corridor: widen the water to the corridor edge or beyond, with distant shore). At each dam wall the game does a short fade "portage" to the river below. (Assumption: portage by fade is the planner's choice, not a user request.)
- **S8 Platform.** Chunks stream along the route with bounded memory; 60 fps on a mid laptop; usable on a phone. `vite build` output runs from a plain file server and zips for itch.io HTML5 (relative asset paths).
- **S3 (polish part).** Day/night cycle, ambient audio (river, wind, birds; no downloaded assets without the user's consent), estuary and open sea at the mouth (phase 1 did not model the sea floor).

## Facts from earlier phases

- To fill in from phase 3's log when this phase starts.

## Tasks

- [ ] **T7** (S1, S5, S6, S8) Whole route: chunk streaming along 32 km, reservoirs, dam portages, estuary, ending at the sea. Route: delegated (builder). Commit: —
- [ ] **T8** (S3, S8) Polish and package: day/night, ambient audio, performance pass, phone check, `vite build` zip for itch.io. Route: delegated (builder). Commit: —

## Log
