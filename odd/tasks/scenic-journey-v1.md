# Scenic journey v1 — index

Browser game: an inflatable raft drifts the real route Río Aluminé → Collón Curá → Limay → Negro → Atlantic, stylized 3D, relaxed (no hazards). Rapids/physics are a later feature (v2).

**Load only this index and the ONE active phase file.** Each phase file is self-contained (its specs, tasks, log and the facts it needs from earlier phases). Never load a finished phase unless a question sends you there.

| Phase | File | Tasks | Status |
|---|---|---|---|
| 1 Data and scaffold | `scenic-journey-v1/phase-1-data.md` | T1–T3 | done (archive) |
| 2 Playable Aluminé slice | `scenic-journey-v1/phase-2-slice.md` | T4 | **active** |
| 3 Look and HUD | `scenic-journey-v1/phase-3-look-hud.md` | T5, T6 | pending |
| 4 Whole route and release | `scenic-journey-v1/phase-4-route-release.md` | T7, T8 | pending |

## Standing rules (all phases)

- Branch `feat/scenic-journey-v1`, remote `origin` = `git@github.com:maggioniduffy/rionegro-journey.git`. Work-unit commits per task; never push or open a PR unless the user says so. PR chain strategy: user answered "None" (2026-11-11) — no chained PRs.
- Runners: `pnpm test` (vitest, single worker), `pnpm build`, `.venv/bin/pytest tools/`.
- Roles (user, verbatim): "You fable work as a planner and advisor (until Nov 17), Opus orchestates, review and ask you for advice when problems arise, Sonnet build and test, Opencode review codebases, apis, make the search and bring reports".
- Memory (user: "this my ram, don't burn it", 7.7 GB machine): one heavy process at a time, no dev server left running, windowed raster reads, stop and report if a step needs more than ~1.5 GB.
- `~/Desktop/Documents/code/basin-explorer` is read-only source data. Downloads need the user's consent; the only one granted is Copernicus GLO-30 tiles into `data/raw/copernicus/` (git-ignored).
- Generated code, comments, docs in English. In-game text in Spanish and English.
- When a phase finishes: tick its tasks with commit hashes in its file, set its row here to done and the next to **active**.

## Original request (user, 2026-11-10, verbatim)

"I wanna create a simulator/game an embarcation going from river alumine, passing rio collon cura, limay, rio negro until it reachs the sea. Graphics 3d-like, cartoon but realistic, not satellite. Something like this: https://matajuegos.itch.io/atuel It can be done? How?"
