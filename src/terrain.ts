/** Types and pure helpers for the terrain strip in public/data/terrain (built by tools/build_terrain.py).
 *
 * The strip is a height grid in route space: row i is station s = i * resolutionM along the route, column j is the
 * lateral offset d = -halfWidthM + j * resolutionM (d > 0 is LEFT of the flow). Heights and water levels are in game
 * metres. Chunks are raw little-endian uint16, `count` rows x `columns` each; height = heightMin + value * heightStep.
 */

export interface TerrainChunk {
  file: string;
  /** First station (row) of the chunk. */
  start: number;
  count: number;
}

export interface TerrainManifest {
  version: 1;
  stations: number;
  columns: number;
  resolutionM: number;
  halfWidthM: number;
  chunkStations: number;
  chunks: TerrainChunk[];
  encoding: { type: 'uint16-le'; heightMin: number; heightStep: number };
  minHeight: number;
  maxHeight: number;
  params: {
    lateralScale: number;
    verticalScale: number;
    referenceM: number;
    crossSmoothKm: number;
    chunkStations: number;
    [key: string]: number;
  };
  water: { levels: number[] };
  tiles: string[];
}

/** Decode a chunk's raw uint16 values (an ArrayBuffer or Uint16Array, little-endian host or not) to game-metre heights. */
export function decodeChunk(manifest: TerrainManifest, data: ArrayBuffer | Uint16Array): Float32Array {
  const { heightMin, heightStep } = manifest.encoding;
  const raw = data instanceof Uint16Array ? data : decodeLittleEndian(data);
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = heightMin + raw[i] * heightStep;
  return out;
}

function decodeLittleEndian(buffer: ArrayBuffer): Uint16Array {
  const view = new DataView(buffer);
  const out = new Uint16Array(buffer.byteLength >> 1);
  for (let i = 0; i < out.length; i++) out[i] = view.getUint16(i * 2, true);
  return out;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Water surface (game m) at game distance `s`, linear between stations; clamped to the route. */
export function waterLevelAt(manifest: TerrainManifest, s: number): number {
  const levels = manifest.water.levels;
  const f = clamp(s / manifest.resolutionM, 0, levels.length - 1);
  const i = Math.min(Math.floor(f), levels.length - 2);
  const t = f - i;
  return levels[i] + (levels[i + 1] - levels[i]) * t;
}

/** Index of the chunk holding station row `station`. */
export function chunkIndexOfStation(manifest: TerrainManifest, station: number): number {
  return Math.floor(station / manifest.chunkStations);
}

/** Chunk indices needed to sample the strip between game distances `s0` and `s1` (inclusive of the bilinear neighbour). */
export function chunksForRange(manifest: TerrainManifest, s0: number, s1: number): number[] {
  const last = manifest.stations - 1;
  const a = clamp(Math.floor(Math.min(s0, s1) / manifest.resolutionM), 0, last);
  const b = clamp(Math.ceil(Math.max(s0, s1) / manifest.resolutionM), 0, last);
  const out: number[] = [];
  for (let k = chunkIndexOfStation(manifest, a); k <= chunkIndexOfStation(manifest, b); k++) out.push(k);
  return out;
}

/** The decoded chunks currently in memory, with bilinear height lookups across chunk boundaries. */
export class TerrainStrip {
  private readonly chunks = new Map<number, Float32Array>();

  constructor(readonly manifest: TerrainManifest) {}

  /** Register chunk `index` from raw file bytes (or already decoded heights). */
  setChunk(index: number, data: ArrayBuffer | Uint16Array | Float32Array): void {
    this.chunks.set(index, data instanceof Float32Array ? data : decodeChunk(this.manifest, data));
  }

  dropChunk(index: number): void {
    this.chunks.delete(index);
  }

  hasChunk(index: number): boolean {
    return this.chunks.has(index);
  }

  /** Height at integer cell (station, column), or undefined when out of range or its chunk is not loaded. */
  cell(station: number, column: number): number | undefined {
    const m = this.manifest;
    if (station < 0 || station >= m.stations || column < 0 || column >= m.columns) return undefined;
    const k = chunkIndexOfStation(m, station);
    const data = this.chunks.get(k);
    if (!data) return undefined;
    return data[(station - m.chunks[k].start) * m.columns + column];
  }

  /** Bilinear height (game m) at route distance `s` and lateral offset `d`; both clamp to the strip.
   * Returns null when a needed chunk is not loaded. */
  heightAt(s: number, d: number): number | null {
    const m = this.manifest;
    const fs = clamp(s / m.resolutionM, 0, m.stations - 1);
    const fd = clamp((d + m.halfWidthM) / m.resolutionM, 0, m.columns - 1);
    const i = Math.min(Math.floor(fs), m.stations - 2);
    const j = Math.min(Math.floor(fd), m.columns - 2);
    const ts = fs - i;
    const td = fd - j;
    const a = this.cell(i, j);
    const b = this.cell(i, j + 1);
    const c = this.cell(i + 1, j);
    const e = this.cell(i + 1, j + 1);
    if (a === undefined || b === undefined || c === undefined || e === undefined) return null;
    return (a * (1 - td) + b * td) * (1 - ts) + (c * (1 - td) + e * td) * ts;
  }

  waterLevelAt(s: number): number {
    return waterLevelAt(this.manifest, s);
  }
}
