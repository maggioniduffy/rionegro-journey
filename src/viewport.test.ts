import { describe, expect, it } from 'vitest';
import { clampPixelRatio, computeAspect } from './viewport';

describe('computeAspect', () => {
  it('returns width over height', () => {
    expect(computeAspect(1600, 800)).toBe(2);
  });
  it('guards against a zero-height window', () => {
    expect(computeAspect(800, 0)).toBe(1);
  });
});

describe('clampPixelRatio', () => {
  it('caps high-density screens', () => {
    expect(clampPixelRatio(3)).toBe(2);
  });
  it('keeps low ratios and never goes below 1', () => {
    expect(clampPixelRatio(1.5)).toBe(1.5);
    expect(clampPixelRatio(0)).toBe(1);
  });
});
