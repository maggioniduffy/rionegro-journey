/** Vertex generation for terrain and water meshes bent along the centerline. Pure: returns typed arrays. */
import type { BiomeBlend } from './biomes';
import { terrainRgb } from './palette';
import { sampleAt, type RouteData } from './route';
import type { TerrainManifest, TerrainStrip } from './terrain';
import { writeWorld } from './world';

export interface MeshArrays {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  /** Smooth per-vertex normals computed from the strip heights (seamless across chunks). Terrain only. */
  normals?: Float32Array;
  /** (s, d) route-space coordinates per vertex, used to scroll the water pattern along the current. Water only. */
  flow?: Float32Array;
  /** Water depth (m) per vertex: water level minus terrain height. Negative under land. Water only. */
  depth?: Float32Array;
}

const FOREST: BiomeBlend = { a: 'andean-forest', b: 'andean-forest', t: 0 };

/** Linear vertex colour (0..1) in the Andean forest biome from height above the local water level and slope. */
export function terrainColor(heightAboveWater: number, slope: number): [number, number, number] {
  const out: [number, number, number] = [0, 0, 0];
  terrainRgb(heightAboveWater, slope, FOREST, 0, out, 0);
  return out;
}

/** Deterministic value in [-1, 1] for station/column (a cheap integer hash), for small colour variation. */
function cellNoise(st: number, j: number): number {
  let h = Math.imul(st, 0x27d4eb2f) ^ Math.imul(j + 1, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  return ((h >>> 0) / 4294967296) * 2 - 1;
}

/**
 * Terrain mesh for stations [station0, station0 + count] (count + 1 rows, sharing the boundary row with its neighbour).
 * Vertex (row i, column j) sits at centerline(s) + d * leftNormal with y equal to the decoded strip height.
 * The strip must hold every needed row; stations past the end of the strip are clipped.
 */
export function buildTerrainMesh(
  route: RouteData,
  manifest: TerrainManifest,
  strip: TerrainStrip,
  station0: number,
  count: number,
  biome: BiomeBlend | ((s: number) => BiomeBlend) = FOREST,
): MeshArrays {
  const cols = manifest.columns;
  const rows = Math.min(count, manifest.stations - 1 - station0) + 1;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
  const normals = new Float32Array(rows * cols * 3);
  const res = manifest.resolutionM;
  const heightOf = (st: number, j: number) => {
    const h = strip.cell(st, j);
    if (h === undefined) throw new Error(`terrain cell (${st}, ${j}) is not loaded`);
    return h;
  };
  for (let r = 0; r < rows; r++) {
    const st = station0 + r;
    const p = sampleAt(route, st * res);
    const water = manifest.water.levels[st];
    const blend = typeof biome === 'function' ? biome(st * res) : biome;
    const sx = Math.cos(p.heading); // flow direction in world (x, z) = (cos h, -sin h)
    const sz = -Math.sin(p.heading);
    for (let j = 0; j < cols; j++) {
      const d = -manifest.halfWidthM + j * res;
      const h = heightOf(st, j);
      const i = r * cols + j;
      writeWorld(positions, i, p.x, p.y, p.heading, d, h);
      const hs = (heightOf(Math.min(st + 1, manifest.stations - 1), j) - heightOf(Math.max(st - 1, 0), j)) / (2 * res);
      const hd = (heightOf(st, Math.min(j + 1, cols - 1)) - heightOf(st, Math.max(j - 1, 0))) / (2 * res);
      terrainRgb(h - water, Math.hypot(hs, hd), blend, cellNoise(st, j), colors, i * 3);
      // Surface normal (-hs * flowDir, 1, -hd * leftDir), left direction in world (x, z) = (-sin h, -cos h).
      const lx = -Math.sin(p.heading);
      const lz = -Math.cos(p.heading);
      const nx = -hs * sx - hd * lx;
      const nz = -hs * sz - hd * lz;
      const inv = 1 / Math.hypot(nx, 1, nz);
      normals[i * 3] = nx * inv;
      normals[i * 3 + 1] = inv;
      normals[i * 3 + 2] = nz * inv;
    }
  }
  return { positions, colors, indices: gridIndices(rows, cols), normals };
}

/** Water ribbon for stations [station0, station0 + count]: `across` columns spanning d = +/- `halfSpanM`, flat at water.levels. */
export function buildWaterMesh(
  route: RouteData,
  manifest: TerrainManifest,
  station0: number,
  count: number,
  halfSpanM: number,
  across = 5,
  strip?: TerrainStrip,
): MeshArrays {
  const rows = Math.min(count, manifest.stations - 1 - station0) + 1;
  const positions = new Float32Array(rows * across * 3);
  const colors = new Float32Array(rows * across * 3);
  const flow = new Float32Array(rows * across * 2);
  const depth = new Float32Array(rows * across);
  for (let r = 0; r < rows; r++) {
    const st = station0 + r;
    const s = st * manifest.resolutionM;
    const p = sampleAt(route, s);
    for (let j = 0; j < across; j++) {
      const d = -halfSpanM + (2 * halfSpanM * j) / (across - 1);
      const i = r * across + j;
      writeWorld(positions, i, p.x, p.y, p.heading, d, manifest.water.levels[st]);
      flow[i * 2] = s;
      flow[i * 2 + 1] = d;
      const ground = strip?.heightAt(s, d);
      depth[i] = ground == null ? 1 : manifest.water.levels[st] - ground;
      colors[i * 3] = 0.22;
      colors[i * 3 + 1] = 0.55;
      colors[i * 3 + 2] = 0.78;
    }
  }
  return { positions, colors, indices: gridIndices(rows, across), flow, depth };
}

/** Triangle indices for a rows x cols grid (row = along the flow, column = to the left), wound so faces point up. */
export function gridIndices(rows: number, cols: number): Uint32Array {
  const out = new Uint32Array(Math.max(0, rows - 1) * Math.max(0, cols - 1) * 6);
  let k = 0;
  for (let r = 0; r < rows - 1; r++) {
    for (let j = 0; j < cols - 1; j++) {
      const a = r * cols + j;
      const b = a + 1;
      const c = a + cols;
      const e = c + 1;
      out[k++] = a;
      out[k++] = c;
      out[k++] = b;
      out[k++] = b;
      out[k++] = c;
      out[k++] = e;
    }
  }
  return out;
}
