/** Per-station left/right water limits derived from the terrain strip. Pure (no Three.js).
 *
 * For every station the strip row is walked outward from the centerline (d = 0) on each side separately; the first
 * column whose terrain is above the water level ends the water on that side. The limit is that lateral distance minus
 * `marginM`, so the raft centre never sits over land. d > 0 is left of the flow (see world.ts).
 *
 * Limits are precomputed once when the strip chunks are loaded (`buildChannelLimits`), so `at` is allocation free.
 */
import type { TerrainStrip } from './terrain';

export interface LateralLimits {
  /** Largest allowed d (m, > 0 left of the flow). */
  left: number;
  /** Largest allowed -d (m): the raft stays at d >= -right. */
  right: number;
}

export class ChannelLimits {
  constructor(
    readonly resolutionM: number,
    private readonly lefts: Float32Array,
    private readonly rights: Float32Array,
  ) {}

  get stations(): number {
    return this.lefts.length;
  }

  /** Limits at route distance `s`, linear between stations, clamped to the computed range. Writes into `out`. */
  at(s: number, out: LateralLimits): LateralLimits {
    const last = this.lefts.length - 1;
    const f = Math.min(last, Math.max(0, s / this.resolutionM));
    const i = Math.min(Math.floor(f), Math.max(0, last - 1));
    const t = last === 0 ? 0 : f - i;
    const j = Math.min(i + 1, last);
    out.left = this.lefts[i] + (this.lefts[j] - this.lefts[i]) * t;
    out.right = this.rights[i] + (this.rights[j] - this.rights[i]) * t;
    return out;
  }
}

/** Water extent of one strip row: lateral distance (m) to the first land column on each side, minus `marginM`.
 * Degenerate rows (centre already on land, or no data) give 0, so the raft stays on the centerline and keeps drifting. */
function rowLimit(strip: TerrainStrip, station: number, sign: 1 | -1, level: number, marginM: number): number {
  const m = strip.manifest;
  const centre = Math.round(m.halfWidthM / m.resolutionM);
  for (let k = 0; ; k++) {
    const h = strip.cell(station, centre + sign * k);
    // end of the strip or an unloaded chunk counts as the edge of the water
    if (h === undefined || h > level) return Math.max(0, k * m.resolutionM - marginM);
  }
}

/** Limits for stations 0..lastStation (their chunks must be loaded). Each station is also clamped to its neighbours'
 * limits so the interpolated raft position between two rows never reaches the land of either row. */
export function buildChannelLimits(strip: TerrainStrip, lastStation: number, marginM: number): ChannelLimits {
  const m = strip.manifest;
  const n = Math.min(lastStation, m.stations - 1) + 1;
  const rawL = new Float32Array(n);
  const rawR = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const level = m.water.levels[i];
    rawL[i] = rowLimit(strip, i, 1, level, marginM);
    rawR[i] = rowLimit(strip, i, -1, level, marginM);
  }
  const lefts = new Float32Array(n);
  const rights = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(n - 1, i + 1);
    lefts[i] = Math.min(rawL[a], rawL[i], rawL[b]);
    rights[i] = Math.min(rawR[a], rawR[i], rawR[b]);
  }
  return new ChannelLimits(m.resolutionM, lefts, rights);
}
