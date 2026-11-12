import { describe, expect, it } from 'vitest';
import { DEFAULT_DRIFT_SPEED, sliceEndS } from './drift';
import { buildChannelLimits, type LateralLimits } from './limits';
import { channelLimit, DEFAULT_STEER, stepSteerBetween, stepSteer } from './steering';
import { TerrainStrip, type TerrainManifest } from './terrain';
import { loadTestData } from './testData';

const { route, manifest, strip } = await loadTestData();

function syntheticStrip(): TerrainStrip {
  const m = {
    version: 1,
    stations: 4,
    columns: 11,
    resolutionM: 2,
    halfWidthM: 10,
    chunkStations: 4,
    chunks: [{ file: 'x', start: 0, count: 4 }],
    encoding: { type: 'uint16-le', heightMin: 0, heightStep: 1 },
    water: { levels: [5, 5, 5, 5] },
  } as unknown as TerrainManifest;
  const s = new TerrainStrip(m);
  const h = new Float32Array(4 * 11).fill(1); // water everywhere (1 < 5)
  for (let st = 0; st < 4; st++) {
    h[st * 11 + 9] = 9; // d = +8 is land on the left bank
    h[st * 11 + 10] = 9;
    h[st * 11 + 2] = 9; // d = -6 is land on the right bank
    h[st * 11 + 1] = 9;
    h[st * 11 + 0] = 9;
  }
  s.setChunk(0, h);
  return s;
}

describe('channel limits from the terrain strip', () => {
  it('matches asymmetric banks of a synthetic strip (first land column minus margin)', () => {
    const lim = buildChannelLimits(syntheticStrip(), 3, 3.5);
    const out: LateralLimits = { left: 0, right: 0 };
    for (const s of [0, 1, 3, 6]) {
      lim.at(s, out);
      expect(out.left).toBeCloseTo(8 - 3.5, 6);
      expect(out.right).toBeCloseTo(6 - 3.5, 6);
    }
  });

  it('never exceeds the narrowest of neighbouring stations (no land between stations)', () => {
    const strip2 = syntheticStrip();
    // station 2 has a much closer left bank (land from d = +2)
    for (let j = 6; j <= 10; j++) strip2.cell(2, j); // sanity: cell exists
    const raw = new Float32Array(4 * 11).fill(1);
    for (let st = 0; st < 4; st++) for (let j = 9; j <= 10; j++) raw[st * 11 + j] = 9;
    for (let j = 6; j <= 10; j++) raw[2 * 11 + j] = 9;
    strip2.setChunk(0, raw);
    const lim = buildChannelLimits(strip2, 3, 3.5);
    const out: LateralLimits = { left: 0, right: 0 };
    lim.at(2 * 2, out);
    const atBad = out.left;
    lim.at(1 * 2, out);
    expect(out.left).toBeLessThanOrEqual(atBad + 1e-9);
    lim.at(3 * 2, out);
    expect(out.left).toBeLessThanOrEqual(atBad + 1e-9);
  });

  it('keeps the raft over water at every station of the Aluminé slice and reaches more than the old clamp', () => {
    const endS = sliceEndS(route);
    const lim = buildChannelLimits(strip, Math.floor(endS / manifest.resolutionM), DEFAULT_STEER.marginM);
    const out: LateralLimits = { left: 0, right: 0 };
    let wider = 0;
    let total = 0;
    const widths: number[] = [];
    const oldWidths: number[] = [];
    for (let s = 0; s <= endS; s += manifest.resolutionM / 2) {
      lim.at(s, out);
      expect(out.left).toBeGreaterThanOrEqual(0);
      expect(out.right).toBeGreaterThanOrEqual(0);
      const level = strip.waterLevelAt(s);
      for (const d of [out.left, -out.right, 0]) {
        const h = strip.heightAt(s, d);
        expect(h).not.toBeNull();
        expect(h!).toBeLessThanOrEqual(level + 1e-6);
      }
      const oldWidth = 2 * channelLimit(route, s);
      total++;
      widths.push(out.left + out.right);
      oldWidths.push(oldWidth);
      if (out.left + out.right > oldWidth + 2) wider++;
    }
    // The real water follows the carved channel: wider than the route width on a good share of stations (narrower
    // elsewhere, where the route width over-states it), and wider at the median.
    expect(wider / total).toBeGreaterThan(0.4);
    const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
    expect(median(widths)).toBeGreaterThan(median(oldWidths));
  });

  it('steering regression: clamps, zeroes outward velocity, and a long one-sided run stays in water and can steer back', () => {
    const r = stepSteer({ d: 9.8, v: 5 }, 1, 0.1, 10);
    expect(r.d).toBe(10);
    expect(r.v).toBe(0);
    const b = stepSteerBetween({ d: -2.4, v: -8 }, -1, 0.1, -2.5, 4.5);
    expect(b.d).toBe(-2.5);
    expect(b.v).toBe(0);

    const endS = sliceEndS(route);
    const lim = buildChannelLimits(strip, Math.floor(endS / manifest.resolutionM), DEFAULT_STEER.marginM);
    const out: LateralLimits = { left: 0, right: 0 };
    const dt = manifest.resolutionM / DEFAULT_DRIFT_SPEED;
    for (const input of [1, -1]) {
      let state = { d: 0, v: 0 };
      let maxAbs = 0;
      for (let s = 0; s <= endS; s += manifest.resolutionM) {
        lim.at(s, out);
        state = stepSteerBetween(state, input, dt, -out.right, out.left);
        expect(state.d).toBeLessThanOrEqual(out.left + 1e-9);
        expect(state.d).toBeGreaterThanOrEqual(-out.right - 1e-9);
        expect(strip.heightAt(s, state.d)!).toBeLessThanOrEqual(strip.waterLevelAt(s) + 1e-6);
        maxAbs = Math.max(maxAbs, Math.abs(state.d));
      }
      expect(maxAbs).toBeGreaterThan(14);
      // steer back: full opposite input leaves the bank within a couple of seconds
      const away = state.d;
      for (let i = 0; i < 10; i++) {
        lim.at(endS, out);
        state = stepSteerBetween(state, -input, dt, -out.right, out.left);
      }
      expect(input > 0 ? state.d : -state.d).toBeLessThan(input > 0 ? away : -away);
    }
  });
});
