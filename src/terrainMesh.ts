/** Vertex generation for terrain and water meshes bent along the centerline. Pure: returns typed arrays. */
import { sampleAt, type RouteData } from './route';
import type { TerrainManifest, TerrainStrip } from './terrain';
import { writeWorld } from './world';

export interface MeshArrays {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
}

/** Flat vertex colour (linear-ish RGB 0..1) from height above the local water level and slope (rise over run). */
export function terrainColor(heightAboveWater: number, slope: number): [number, number, number] {
  if (heightAboveWater < 2.5) return [0.76, 0.7, 0.5]; // gravel and sand bars
  if (slope > 1.1) return [0.47, 0.44, 0.42]; // steep rock
  if (heightAboveWater > 70) return slope > 0.6 ? [0.6, 0.57, 0.55] : [0.82, 0.84, 0.86]; // high rock and snow-ish
  if (heightAboveWater > 35) return [0.5, 0.55, 0.34]; // dry steppe
  return [0.34, 0.58, 0.32]; // grass
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
): MeshArrays {
  const cols = manifest.columns;
  const rows = Math.min(count, manifest.stations - 1 - station0) + 1;
  const positions = new Float32Array(rows * cols * 3);
  const colors = new Float32Array(rows * cols * 3);
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
    for (let j = 0; j < cols; j++) {
      const d = -manifest.halfWidthM + j * res;
      const h = heightOf(st, j);
      const i = r * cols + j;
      writeWorld(positions, i, p.x, p.y, p.heading, d, h);
      const hs = (heightOf(Math.min(st + 1, manifest.stations - 1), j) - heightOf(Math.max(st - 1, 0), j)) / (2 * res);
      const hd = (heightOf(st, Math.min(j + 1, cols - 1)) - heightOf(st, Math.max(j - 1, 0))) / (2 * res);
      const [cr, cg, cb] = terrainColor(h - water, Math.hypot(hs, hd));
      colors[i * 3] = cr;
      colors[i * 3 + 1] = cg;
      colors[i * 3 + 2] = cb;
    }
  }
  return { positions, colors, indices: gridIndices(rows, cols) };
}

/** Water ribbon for stations [station0, station0 + count]: `across` columns spanning d = +/- `halfSpanM`, flat at water.levels. */
export function buildWaterMesh(
  route: RouteData,
  manifest: TerrainManifest,
  station0: number,
  count: number,
  halfSpanM: number,
  across = 5,
): MeshArrays {
  const rows = Math.min(count, manifest.stations - 1 - station0) + 1;
  const positions = new Float32Array(rows * across * 3);
  const colors = new Float32Array(rows * across * 3);
  for (let r = 0; r < rows; r++) {
    const st = station0 + r;
    const p = sampleAt(route, st * manifest.resolutionM);
    for (let j = 0; j < across; j++) {
      const d = -halfSpanM + (2 * halfSpanM * j) / (across - 1);
      const i = r * across + j;
      writeWorld(positions, i, p.x, p.y, p.heading, d, manifest.water.levels[st]);
      colors[i * 3] = 0.22;
      colors[i * 3 + 1] = 0.55;
      colors[i * 3 + 2] = 0.78;
    }
  }
  return { positions, colors, indices: gridIndices(rows, across) };
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
