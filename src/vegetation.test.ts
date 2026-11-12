import { describe, expect, it } from 'vitest';
import type { BiomeBlend } from './biomes';
import { KIND, MAX_INSTANCES_PER_CHUNK, WATER_MARGIN_M, placeVegetation, type HeightField } from './vegetation';

const WATER = 100;
const forest: BiomeBlend = { a: 'andean-forest', b: 'andean-forest', t: 0 };
const steppe: BiomeBlend = { a: 'steppe-canyon', b: 'steppe-canyon', t: 0 };

/** Synthetic strip: flat plain `rise` m above the water, with a river channel |d| < 10 below it. */
function plain(rise: number, slopeD = 0): HeightField {
  return {
    heightAt: (_s, d) => (Math.abs(d) < 10 ? WATER - 2 : WATER + rise + slopeD * Math.abs(d)),
    waterLevelAt: () => WATER,
  };
}

const run = (field: HeightField, biome: BiomeBlend, seed = 1, station0 = 0) =>
  placeVegetation({ field, halfWidthM: 300, resolutionM: 2, station0, count: 64, biome: () => biome, seed });

describe('placeVegetation', () => {
  it('is deterministic for the same seed and inputs and differs for another seed', () => {
    const a = run(plain(10), forest, 7);
    const b = run(plain(10), forest, 7);
    const c = run(plain(10), forest, 8);
    expect(a.count).toBeGreaterThan(50);
    expect(b.count).toBe(a.count);
    expect(Array.from(b.pos)).toEqual(Array.from(a.pos));
    expect(Array.from(b.kind)).toEqual(Array.from(a.kind));
    expect(Array.from(c.pos)).not.toEqual(Array.from(a.pos));
  });

  it('never places anything at or below water level plus the margin', () => {
    const field: HeightField = {
      heightAt: (_s, d) => WATER + 0.02 * Math.abs(d) - 2, // rises through the water level at |d| = 100
      waterLevelAt: () => WATER,
    };
    const v = run(field, forest);
    expect(v.count).toBeGreaterThan(0);
    for (let i = 0; i < v.count; i++) expect(v.pos[i * 3 + 2]).toBeGreaterThan(WATER + WATER_MARGIN_M);
  });

  it('keeps the instance count within the declared maximum', () => {
    for (let k = 0; k < 6; k++) expect(run(plain(10), forest, 3, k * 64).count).toBeLessThanOrEqual(MAX_INSTANCES_PER_CHUNK);
  });

  it('puts no trees on steep ground but still allows rocks', () => {
    const v = run(plain(5, 1.5), forest);
    const kinds = new Set(Array.from(v.kind.subarray(0, v.count)));
    expect(v.count).toBeGreaterThan(0);
    for (const tree of [KIND.araucaria, KIND.conifer, KIND.poplar]) expect(kinds.has(tree)).toBe(false);
    expect(kinds.has(KIND.rock)).toBe(true);
  });

  it('is denser in the forest than in the steppe on the same terrain', () => {
    let f = 0;
    let s = 0;
    for (let k = 0; k < 4; k++) {
      f += run(plain(10), forest, 5, k * 64).count;
      s += run(plain(10), steppe, 5, k * 64).count;
    }
    expect(f).toBeGreaterThan(s * 1.3);
  });

  it('is dense on forest slopes and puts more shrubs on bank tops than high ground', () => {
    let low = 0;
    let high = 0;
    let trees = 0;
    for (let k = 0; k < 4; k++) {
      const a = run(plain(2), forest, 9, k * 64);
      const b = run(plain(25), forest, 9, k * 64);
      low += Array.from(a.kind.subarray(0, a.count)).filter((x) => x === KIND.shrub).length;
      high += Array.from(b.kind.subarray(0, b.count)).filter((x) => x === KIND.shrub).length;
      trees += Array.from(b.kind.subarray(0, b.count)).filter((x) => x === KIND.araucaria || x === KIND.conifer).length;
      expect(b.count).toBeLessThanOrEqual(MAX_INSTANCES_PER_CHUNK);
    }
    expect(low).toBeGreaterThan(high * 1.3);
    expect(trees / 4).toBeGreaterThan(130);
  });

  it('keeps trees well back from the water edge (not shrubs or rocks)', () => {
    let trees = 0;
    for (let k = 0; k < 3; k++) {
      const v = run(plain(10), forest, 4, k * 64);
      for (let i = 0; i < v.count; i++) {
        const isTree = [KIND.araucaria, KIND.conifer, KIND.poplar].includes(v.kind[i] as 0);
        if (isTree) {
          trees++;
          expect(Math.abs(v.pos[i * 3 + 1])).toBeGreaterThanOrEqual(10 + 7);
        }
      }
    }
    expect(trees).toBeGreaterThan(50);
  });

  it('keeps positions inside the requested station range', () => {
    const v = run(plain(10), forest, 2, 64);
    for (let i = 0; i < v.count; i++) {
      expect(v.pos[i * 3]).toBeGreaterThanOrEqual(128);
      expect(v.pos[i * 3]).toBeLessThan(256);
    }
  });
});
