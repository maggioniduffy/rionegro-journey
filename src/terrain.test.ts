import { describe, expect, it } from 'vitest';
import raw from '../public/data/terrain/manifest.json?raw';
import {
  TerrainStrip,
  chunkIndexOfStation,
  chunksForRange,
  decodeChunk,
  waterLevelAt,
  type TerrainManifest,
} from './terrain';

/** 5 stations x 3 columns, 2 m apart, chunks of 2 rows: heights = 10 * station + column. */
function toy(): { manifest: TerrainManifest; raw: Uint16Array } {
  const values = new Uint16Array(15);
  for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) values[i * 3 + j] = 10 * i + j;
  const manifest = {
    version: 1,
    stations: 5,
    columns: 3,
    resolutionM: 2,
    halfWidthM: 2,
    chunkStations: 2,
    chunks: [
      { file: 'a', start: 0, count: 2 },
      { file: 'b', start: 2, count: 2 },
      { file: 'c', start: 4, count: 1 },
    ],
    encoding: { type: 'uint16-le', heightMin: -1, heightStep: 0.5 },
    water: { levels: [9, 8, 7, 7, 0] },
  } as unknown as TerrainManifest;
  return { manifest, raw: values };
}

const heightOf = (i: number, j: number) => -1 + 0.5 * (10 * i + j);

describe('decodeChunk', () => {
  it('applies heightMin + value * heightStep to a Uint16Array', () => {
    const { manifest, raw: values } = toy();
    const out = decodeChunk(manifest, values.subarray(0, 6));
    expect(Array.from(out)).toEqual([-1, -0.5, 0, 4, 4.5, 5]);
  });

  it('reads little-endian bytes from an ArrayBuffer', () => {
    const { manifest } = toy();
    const bytes = new Uint8Array([0x02, 0x01, 0x00, 0x00]); // 0x0102 = 258, then 0
    const out = decodeChunk(manifest, bytes.buffer);
    expect(Array.from(out)).toEqual([-1 + 0.5 * 258, -1]);
  });
});

describe('TerrainStrip.heightAt', () => {
  function loaded(chunks: number[]): TerrainStrip {
    const { manifest, raw: values } = toy();
    const strip = new TerrainStrip(manifest);
    for (const k of chunks) {
      const c = manifest.chunks[k];
      strip.setChunk(k, values.subarray(c.start * 3, (c.start + c.count) * 3));
    }
    return strip;
  }

  it('returns exact heights on grid points and bilinear values between', () => {
    const strip = loaded([0, 1, 2]);
    expect(strip.heightAt(0, -2)).toBeCloseTo(heightOf(0, 0));
    expect(strip.heightAt(4, 0)).toBeCloseTo(heightOf(2, 1));
    // halfway between stations 1 and 2 (across the chunk boundary) and between columns 0 and 1
    const expected = (heightOf(1, 0) + heightOf(1, 1) + heightOf(2, 0) + heightOf(2, 1)) / 4;
    expect(strip.heightAt(3, -1)).toBeCloseTo(expected);
  });

  it('clamps outside the strip and returns null when a needed chunk is missing', () => {
    const strip = loaded([0, 1, 2]);
    expect(strip.heightAt(-50, -50)).toBeCloseTo(heightOf(0, 0));
    expect(strip.heightAt(999, 999)).toBeCloseTo(heightOf(4, 2));
    expect(loaded([0]).heightAt(3, 0)).toBeNull();
    expect(loaded([0, 1]).heightAt(8, 0)).toBeNull();
  });
});

describe('waterLevelAt and chunk helpers', () => {
  it('interpolates the per-station water level and clamps', () => {
    const { manifest } = toy();
    expect(waterLevelAt(manifest, 0)).toBe(9);
    expect(waterLevelAt(manifest, 1)).toBeCloseTo(8.5);
    expect(waterLevelAt(manifest, 7)).toBeCloseTo(3.5);
    expect(waterLevelAt(manifest, -5)).toBe(9);
    expect(waterLevelAt(manifest, 1e6)).toBe(0);
  });

  it('maps stations and distance ranges to chunk indices', () => {
    const { manifest } = toy();
    expect(chunkIndexOfStation(manifest, 3)).toBe(1);
    expect(chunksForRange(manifest, 0, 1)).toEqual([0]);
    expect(chunksForRange(manifest, 1, 5)).toEqual([0, 1]);
    expect(chunksForRange(manifest, 20, 0)).toEqual([0, 1, 2]);
  });
});

describe('real manifest', () => {
  const manifest = JSON.parse(raw) as TerrainManifest;

  it('is self-consistent', () => {
    expect(manifest.chunks.reduce((n, c) => n + c.count, 0)).toBe(manifest.stations);
    expect(manifest.columns).toBe(Math.round((2 * manifest.halfWidthM) / manifest.resolutionM) + 1);
    expect(manifest.water.levels).toHaveLength(manifest.stations);
    expect(manifest.params.lateralScale).toBeGreaterThan(0);
    expect(manifest.params.verticalScale).toBeGreaterThan(0);
    expect(manifest.maxHeight).toBeGreaterThan(manifest.minHeight);
  });

  it('has a water surface that falls to the sea', () => {
    const levels = manifest.water.levels;
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThanOrEqual(levels[i - 1]);
    expect(waterLevelAt(manifest, 0)).toBeGreaterThan(100);
    expect(waterLevelAt(manifest, 1e9)).toBeCloseTo(0, 1);
  });

  it('samples a decoded chunk through the strip', () => {
    const strip = new TerrainStrip(manifest);
    const zeros = new Uint16Array(manifest.chunks[0].count * manifest.columns);
    strip.setChunk(0, zeros);
    expect(strip.heightAt(10, 0)).toBeCloseTo(manifest.encoding.heightMin);
    expect(strip.heightAt(manifest.chunkStations * manifest.resolutionM * 3, 0)).toBeNull();
  });
});
