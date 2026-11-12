import { describe, expect, it } from 'vitest';
import { BIOMES, BLEND_M, biomeAt, type BiomeId } from './biomes';
import type { RouteData } from './route';
import { loadTestData } from './testData';

const IDS: BiomeId[] = ['andean-forest', 'steppe-canyon', 'reservoir', 'irrigated-valley', 'estuary'];

async function route(): Promise<RouteData> {
  return (await loadTestData(0)).route;
}

describe('biome table', () => {
  it('defines all five biomes with palettes and vegetation densities', () => {
    for (const id of IDS) {
      const b = BIOMES[id];
      expect(b.id).toBe(id);
      expect(b.palette.grass).toHaveLength(3);
      expect(b.palette.sand).toHaveLength(3);
      expect(b.palette.rock).toHaveLength(3);
      expect(Object.keys(b.density).sort()).toEqual(['araucaria', 'conifer', 'poplar', 'rock', 'shrub']);
    }
    expect(BIOMES['andean-forest'].density.araucaria).toBeGreaterThan(0);
    expect(BIOMES['irrigated-valley'].density.poplar).toBeGreaterThan(0);
    expect(BIOMES['steppe-canyon'].density.araucaria).toBe(0);
  });
});

describe('biomeAt', () => {
  it('is pure Andean forest at the start and mid-Alumine', async () => {
    const r = await route();
    for (const s of [0, 1700]) {
      const b = biomeAt(r, s);
      expect(b.a).toBe('andean-forest');
      expect(b.t).toBe(0);
    }
  });

  it('blends Andean forest into the next biome across the Alumine boundary', async () => {
    const r = await route();
    const end = r.segments[0].endS;
    expect(end).toBeCloseTo(3400, 1);
    const at = biomeAt(r, end);
    expect(at.a).toBe('andean-forest');
    expect(at.b).toBe('steppe-canyon');
    expect(at.t).toBeCloseTo(0.5, 6);
    const before = biomeAt(r, end - BLEND_M / 2);
    expect(before.a).toBe('andean-forest');
    expect(before.t).toBeCloseTo(0, 6);
    const after = biomeAt(r, end + BLEND_M / 2);
    expect(after.a).toBe('steppe-canyon'); // pure next biome from here on
    expect(after.t).toBe(0);
    const justBefore = biomeAt(r, end + BLEND_M / 2 - 1);
    expect(justBefore.a).toBe('andean-forest');
    expect(justBefore.b).toBe('steppe-canyon');
    expect(justBefore.t).toBeGreaterThan(0.99);
    const mid = biomeAt(r, end - BLEND_M / 4);
    expect(mid.t).toBeGreaterThan(0);
    expect(mid.t).toBeLessThan(0.5);
    expect(biomeAt(r, end + BLEND_M / 4).t).toBeGreaterThan(0.5);
  });

  it('is steppe canyon well inside Collon Cura', async () => {
    const b = biomeAt(await route(), 4600);
    expect(b.a).toBe('steppe-canyon');
    expect(b.t).toBe(0);
  });

  it('is reservoir inside a reservoir and estuary at the end of the Negro', async () => {
    const r = await route();
    const res = r.reservoirs[0];
    expect(biomeAt(r, (res.startS + res.endS) / 2).a).toBe('reservoir');
    const sea = r.segments[r.segments.length - 1].endS;
    const e = biomeAt(r, sea);
    expect(e.a).toBe('estuary');
    expect(e.t).toBe(0);
    expect(biomeAt(r, sea + 500).a).toBe('estuary');
    expect(biomeAt(r, 25000).a).toBe('irrigated-valley');
  });
});
