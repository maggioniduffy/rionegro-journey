import { describe, expect, it } from 'vitest';
import type { BiomeBlend } from './biomes';
import { FOG_COLOR, SKY_HORIZON, SKY_ZENITH, terrainRgb } from './palette';

const forest: BiomeBlend = { a: 'andean-forest', b: 'andean-forest', t: 0 };
const colour = (h: number, slope: number, blend = forest) => {
  const out = [0, 0, 0];
  terrainRgb(h, slope, blend, 0, out, 0);
  return out;
};

describe('terrainRgb', () => {
  it('is a narrow grey-tan gravel band just above the water in the forest biome', () => {
    const [r, g, b] = colour(0.3, 0.2);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r - b).toBeLessThan(0.2); // greyer than sand
    const [gr, gg, gb] = colour(2, 0.2); // 2 m up the bank: already grass
    expect(gg).toBeGreaterThan(gr);
    expect(gg).toBeGreaterThan(gb);
  });

  it('has no tan dry band in the forest: moderate slopes and high ground stay green', () => {
    for (const [h, slope] of [[3, 0.3], [25, 0.5], [45, 0.4], [60, 0.7]]) {
      const [r, g, b] = colour(h, slope);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('only genuinely steep faces are rock in the forest, with a blend', () => {
    const [r, g, b] = colour(15, 0.8);
    expect(g).toBeGreaterThan(r); // still grass at 0.8
    const steep = colour(15, 1.5);
    expect(Math.abs(steep[0] - steep[1])).toBeLessThan(0.08);
    const mid = colour(15, 1.1);
    expect(mid[0]).toBeGreaterThan(r); // partway to grey
    expect(mid[0]).toBeLessThan(steep[0]);
    expect(b).toBeLessThan(g);
  });

  it('varies grass between fresh and mossy green with the noise input', () => {
    const a = [0, 0, 0];
    const c = [0, 0, 0];
    terrainRgb(15, 0.2, forest, -1, a, 0);
    terrainRgb(15, 0.2, forest, 1, c, 0);
    expect(Math.abs(a[1] - c[1])).toBeGreaterThan(0.01);
    expect(a[1]).toBeGreaterThan(a[0]);
    expect(c[1]).toBeGreaterThan(c[0]);
  });

  it('keeps the wide sandy bank in the steppe biome', () => {
    const steppe: BiomeBlend = { a: 'steppe-canyon', b: 'steppe-canyon', t: 0 };
    const [r, g, b] = colour(2, 0.2, steppe);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(r - b).toBeGreaterThan(0.2);
  });

  it('varies rock brightness with height (strata)', () => {
    const lums = [0, 1, 2, 3, 4, 5].map((h) => colour(10 + h, 1.6)[0]);
    expect(Math.max(...lums) - Math.min(...lums)).toBeGreaterThan(0.02);
  });

  it('is grey rock on a steep face, even beside the water', () => {
    for (const h of [0.5, 20]) {
      const [r, g, b] = colour(h, 1.6);
      expect(Math.abs(r - g)).toBeLessThan(0.08);
      expect(Math.abs(g - b)).toBeLessThan(0.08);
    }
  });

  it('is green grass on gentle higher ground in the forest biome', () => {
    const [r, g, b] = colour(20, 0.2);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('writes at the requested offset and blends two biomes', () => {
    const out = new Float32Array(6);
    terrainRgb(20, 0.2, { a: 'andean-forest', b: 'steppe-canyon', t: 0.5 }, 0, out, 1);
    expect(out[0]).toBe(0);
    expect(out[1]).toBeGreaterThan(0);
    const pure = colour(20, 0.2);
    const steppe = colour(20, 0.2, { a: 'steppe-canyon', b: 'steppe-canyon', t: 0 });
    expect(out[1]).toBeGreaterThan(Math.min(pure[0], steppe[0]));
    expect(out[1]).toBeLessThan(Math.max(pure[0], steppe[0]));
  });
});

describe('sky and fog', () => {
  it('fog matches the horizon colour and the zenith differs', () => {
    expect(FOG_COLOR).toEqual(SKY_HORIZON);
    expect(SKY_ZENITH).not.toEqual(SKY_HORIZON);
  });
});
