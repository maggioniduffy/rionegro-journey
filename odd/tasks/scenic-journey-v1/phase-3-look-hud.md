# Phase 3 — look and HUD (T5, T6)

Objective: make the slice look like the reference and tell the player where they are. Index and standing rules: `../scenic-journey-v1.md`. Before starting, read the `## Log` of `phase-2-slice.md` only for the final terrain parameters and the runtime module layout, then add them under "Facts" here.

## Specs

- **S3 Look.** "Graphics 3d-like, cartoon but realistic, not satellite. Something like this: https://matajuegos.itch.io/atuel". No satellite/aerial imagery as texture. Toon/gradient shading, stylized water (flow-scrolling normals, foam at banks, depth tint), fog, sky gradient, instanced vegetation and rocks, biomes by stretch: Andean forest with araucarias (Aluminé) → steppe canyons (Collón Curá, Limay) → reservoirs → irrigated Río Negro valley with poplars/orchards → estuary and sea. Biome comes from the route segment and distance, blended over a transition length.
- **S7 Text and language.** "Spanish + English", switchable. HUD shows current river name, progress along the route, and landmark notes (towns, dams, confluences) as the raft passes them; landmark data is already in `public/data/route.json` (`landmarks`, `segments`, `reservoirs`). Strings live in one file per language.
- **S8 Platform.** 60 fps on a mid laptop; usable on a phone. Vegetation and shaders must respect this (instancing, no per-frame allocation).

## Facts from earlier phases

- To fill in from phase 2's log when this phase starts.

## Tasks

- [ ] **T5** (S3, S8) Look: toon terrain shading, water shader, sky/fog, instanced vegetation and rocks per biome. Route: delegated (builder). Commit: —
- [ ] **T6** (S7) HUD: river name, progress strip, landmark notes, es/en switch. Route: delegated (builder). Commit: —

T5 and T6 touch different files and may run in either order, but one at a time (memory rule).

## Log
