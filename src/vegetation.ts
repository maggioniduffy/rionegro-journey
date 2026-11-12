/** Deterministic vegetation and rock placement for one terrain chunk. Pure (no Three.js).
 *
 * Candidates sit on a global jittered grid (CELL_M cells in route space), so neighbouring chunks never double-place
 * and the same seed always gives the same forest. Each candidate becomes at most one instance, chosen by biome density
 * and filtered by slope and height above the water. Output is in route space (s, d, terrain height); the Three.js side
 * converts to world transforms.
 */
import { BIOMES, type BiomeBlend } from './biomes';
import { srgbToLinear } from './palette';

export const KIND = { araucaria: 0, conifer: 1, shrub: 2, rock: 3, poplar: 4 } as const;
export type VegKind = (typeof KIND)[keyof typeof KIND];
export const KIND_COUNT = 5;

export const CELL_M = 7;
export const MAX_INSTANCES_PER_CHUNK = 420;
/** Nothing is placed at or below the water level plus this many metres. */
export const WATER_MARGIN_M = 1.2;
const TREE_MIN_ABOVE_M = 2.5;
const TREE_MAX_SLOPE = 0.55;
/** Trees keep at least this far (lateral m) from any water, so they never crowd the chase camera. */
const TREE_WATER_CLEARANCE_M = 8;
const SHRUB_MAX_SLOPE = 0.85;

export interface HeightField {
  /** Terrain height (game m) at route distance `s` and lateral offset `d`, or null when not loaded. */
  heightAt(s: number, d: number): number | null;
  waterLevelAt(s: number): number;
}

export interface PlacementInput {
  field: HeightField;
  halfWidthM: number;
  resolutionM: number;
  station0: number;
  count: number;
  biome: (s: number) => BiomeBlend;
  seed: number;
}

export interface VegetationInstances {
  count: number;
  /** (s, d, terrain height) per instance. */
  pos: Float32Array;
  rotY: Float32Array;
  /** (sx, sy, sz) per instance. */
  scale: Float32Array;
  /** Linear tint multiplier per instance. */
  color: Float32Array;
  kind: Uint8Array;
}

/** Uniform [0, 1) from integer inputs (xorshift-multiply hash). */
function rand(seed: number, i: number, j: number, k: number): number {
  let h = Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(i, 0xc2b2ae35) ^ Math.imul(j, 0x27d4eb2f) ^ Math.imul(k + 1, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const SLOPE_STEP_M = 2;

export function placeVegetation(input: PlacementInput): VegetationInstances {
  const { field, halfWidthM, resolutionM, station0, count, biome, seed } = input;
  const max = MAX_INSTANCES_PER_CHUNK;
  const pos = new Float32Array(max * 3);
  const rotY = new Float32Array(max);
  const scale = new Float32Array(max * 3);
  const color = new Float32Array(max * 3);
  const kind = new Uint8Array(max);
  let n = 0;

  const s0 = station0 * resolutionM;
  const s1 = (station0 + count) * resolutionM;
  const i0 = Math.ceil(s0 / CELL_M);
  const i1 = Math.ceil(s1 / CELL_M);
  const j0 = Math.floor(-halfWidthM / CELL_M) + 1;
  const j1 = Math.floor(halfWidthM / CELL_M);
  const w = [0, 0, 0, 0, 0];

  outer: for (let i = i0; i < i1; i++) {
    for (let j = j0; j < j1; j++) {
      const s = (i + rand(seed, i, j, 0)) * CELL_M;
      const d = (j + rand(seed, i, j, 1)) * CELL_M;
      if (s < s0 || s >= s1 || Math.abs(d) > halfWidthM - SLOPE_STEP_M) continue;
      const h = field.heightAt(s, d);
      if (h === null) continue;
      const above = h - field.waterLevelAt(s);
      if (above <= WATER_MARGIN_M) continue;
      const hs0 = field.heightAt(s - SLOPE_STEP_M, d);
      const hs1 = field.heightAt(s + SLOPE_STEP_M, d);
      const hd0 = field.heightAt(s, d - SLOPE_STEP_M);
      const hd1 = field.heightAt(s, d + SLOPE_STEP_M);
      if (hs0 === null || hs1 === null || hd0 === null || hd1 === null) continue;
      const slope = Math.hypot(hs1 - hs0, hd1 - hd0) / (2 * SLOPE_STEP_M);

      const b = biome(s);
      const da = BIOMES[b.a].density;
      const db = BIOMES[b.b].density;
      const t = b.t;
      let treeOk = slope < TREE_MAX_SLOPE && above > TREE_MIN_ABOVE_M ? 1 : 0;
      if (treeOk) {
        const wl = field.waterLevelAt(s) + WATER_MARGIN_M;
        const hl = field.heightAt(s, d - TREE_WATER_CLEARANCE_M);
        const hr = field.heightAt(s, d + TREE_WATER_CLEARANCE_M);
        if (hl === null || hr === null || hl <= wl || hr <= wl) treeOk = 0;
      }
      const steepness = clamp01(slope / 1.0);
      const bank = above < 6 ? 1.5 : 0;
      w[KIND.araucaria] = (da.araucaria * (1 - t) + db.araucaria * t) * treeOk;
      w[KIND.conifer] = (da.conifer * (1 - t) + db.conifer * t) * treeOk;
      w[KIND.poplar] = (da.poplar * (1 - t) + db.poplar * t) * treeOk;
      const bankTop = above < 9 ? 1.8 : 1; // shrubs line the bank tops
      w[KIND.shrub] = (da.shrub * (1 - t) + db.shrub * t) * (slope < SHRUB_MAX_SLOPE ? bankTop : 0);
      w[KIND.rock] = (da.rock * (1 - t) + db.rock * t) * (1 + 3 * steepness + bank);

      let u = rand(seed, i, j, 2);
      let chosen = -1;
      for (let k = 0; k < KIND_COUNT; k++) {
        if (u < w[k]) {
          chosen = k;
          break;
        }
        u -= w[k];
      }
      if (chosen < 0) continue;

      const v = rand(seed, i, j, 3);
      const sizeK = 0.8 + 0.5 * v;
      const o = n * 3;
      pos[o] = s;
      pos[o + 1] = d;
      pos[o + 2] = h;
      rotY[n] = rand(seed, i, j, 4) * Math.PI * 2;
      kind[n] = chosen;
      if (chosen === KIND.rock) {
        const squash = 0.55 + 0.5 * rand(seed, i, j, 5);
        scale[o] = sizeK * (0.8 + 0.8 * rand(seed, i, j, 6));
        scale[o + 1] = sizeK * squash * (1 + steepness);
        scale[o + 2] = sizeK * (0.8 + 0.8 * rand(seed, i, j, 7));
      } else {
        scale[o] = sizeK;
        scale[o + 1] = sizeK * (0.9 + 0.3 * rand(seed, i, j, 5));
        scale[o + 2] = sizeK;
      }
      const palette = BIOMES[t < 0.5 ? b.a : b.b].palette;
      const shade = 0.85 + 0.3 * rand(seed, i, j, 8);
      for (let c = 0; c < 3; c++) {
        // Rocks take the biome's rock colour (their geometry is white); vegetation tints its baked vertex colours.
        color[o + c] = (chosen === KIND.rock ? srgbToLinear(palette.rock[c]) * 1.5 : palette.foliage[c]) * shade;
      }
      n++;
      if (n >= max) break outer;
    }
  }
  return {
    count: n,
    pos: pos.slice(0, n * 3),
    rotY: rotY.slice(0, n),
    scale: scale.slice(0, n * 3),
    color: color.slice(0, n * 3),
    kind: kind.slice(0, n),
  };
}
