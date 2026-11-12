import { describe, expect, it } from 'vitest';
import { ChunkManager, wantedChunks, type ChunkWindowConfig } from './chunks';
import { DEFAULT_DRIFT_SPEED, driftConfig, sliceEndS, startDrift, stepDrift } from './drift';
import { sampleAt } from './route';
import { channelLimit, stepSteer } from './steering';
import { buildTerrainMesh, buildWaterMesh } from './terrainMesh';
import { loadTestData } from './testData';
import { toWorld } from './world';

const data = await loadTestData();
const { route, manifest, strip } = data;

describe('toWorld', () => {
  it('lands at centerline(s) + d * leftNormal, with d > 0 left of the flow', () => {
    for (const s of [0, 500, 1717, 3400]) {
      const p = sampleAt(route, s);
      const c = toWorld(route, s, 0, 7);
      // axis convention: game x -> world x, game y -> world -z, height -> world y
      expect(c.x).toBeCloseTo(p.x, 6);
      expect(c.z).toBeCloseTo(-p.y, 6);
      expect(c.y).toBe(7);
      const left = toWorld(route, s, 10);
      const nx = -Math.sin(p.heading);
      const ny = Math.cos(p.heading);
      expect(left.x).toBeCloseTo(p.x + 10 * nx, 6);
      expect(left.z).toBeCloseTo(-(p.y + 10 * ny), 6);
      // left of flow: the cross product flow x offset is positive in the game plane (counter-clockwise turn)
      const dx = left.x - c.x;
      const dyGame = -(left.z - c.z);
      expect(Math.cos(p.heading) * dyGame - Math.sin(p.heading) * dx).toBeGreaterThan(9.99);
    }
  });
});

describe('terrain mesh', () => {
  it('vertex heights equal the decoded strip values and are placed along the bent strip', () => {
    const station0 = 640;
    const mesh = buildTerrainMesh(route, manifest, strip, station0, 64);
    const cols = manifest.columns;
    expect(mesh.positions.length).toBe(65 * cols * 3);
    for (const [r, j] of [[0, 0], [0, 150], [10, 77], [64, 300], [33, 150]]) {
      const i = r * cols + j;
      expect(mesh.positions[i * 3 + 1]).toBeCloseTo(strip.cell(station0 + r, j)!, 4);
      const w = toWorld(route, (station0 + r) * manifest.resolutionM, -manifest.halfWidthM + j * manifest.resolutionM);
      expect(mesh.positions[i * 3]).toBeCloseTo(w.x, 3);
      expect(mesh.positions[i * 3 + 2]).toBeCloseTo(w.z, 3);
    }
  });

  it('water ribbon vertex heights equal water.levels', () => {
    const station0 = 1000;
    const mesh = buildWaterMesh(route, manifest, station0, 64, 60, 5);
    for (let r = 0; r <= 64; r++) {
      for (let j = 0; j < 5; j++) {
        expect(mesh.positions[(r * 5 + j) * 3 + 1]).toBeCloseTo(manifest.water.levels[station0 + r], 4);
      }
    }
  });
});

describe('steering', () => {
  it('keeps the raft inside the channel width at every station of the slice, full input both ways', () => {
    const endS = sliceEndS(route);
    for (const input of [1, -1]) {
      let state = { d: 0, v: 0 };
      for (let st = 0; st * manifest.resolutionM <= endS; st++) {
        const s = st * manifest.resolutionM;
        const limit = channelLimit(route, s);
        // 2 m per station at 18 m/s: ~0.11 s per station
        state = stepSteer(state, input, 2 / DEFAULT_DRIFT_SPEED, limit);
        expect(Math.abs(state.d)).toBeLessThanOrEqual(sampleAt(route, s).widthM / 2 + 1e-9);
        expect(Math.abs(state.d)).toBeLessThanOrEqual(limit + 1e-9);
      }
      expect(Math.abs(state.d)).toBeGreaterThan(1); // it did reach the bank side, not stuck at zero
    }
  });

  it('pushes left (d > 0) for positive input', () => {
    expect(stepSteer({ d: 0, v: 0 }, 1, 0.1, 10).d).toBeGreaterThan(0);
    expect(stepSteer({ d: 0, v: 0 }, -1, 0.1, 10).d).toBeLessThan(0);
  });
});

describe('drift', () => {
  it('advances s at the configured speed and stops at the end of the alumine segment', () => {
    const cfg = driftConfig(route, { speed: 18 });
    expect(cfg.endS).toBe(route.segments.find((s) => s.river === 'alumine')!.endS);
    let st = startDrift(cfg);
    st = stepDrift(st, cfg, 2);
    expect(st.s).toBeCloseTo(36, 9);
    expect(st.ended).toBe(false);
    for (let i = 0; i < 100000 && !st.ended; i++) st = stepDrift(st, cfg, 0.5);
    expect(st).toEqual({ s: cfg.endS, ended: true });
    expect(stepDrift(st, cfg, 5)).toEqual({ s: cfg.endS, ended: true });
    expect(startDrift(cfg)).toEqual({ s: 0, ended: false });
  });
});

describe('chunk manager', () => {
  const cfg: ChunkWindowConfig = {
    meshStations: 64,
    resolutionM: manifest.resolutionM,
    aheadM: 600,
    behindM: 150,
    maxStation: 2 * manifest.chunkStations - 1,
  };

  it('keeps a bounded number of chunks while s sweeps the whole slice and disposes the rest', () => {
    let built = 0;
    let disposed = 0;
    const mgr = new ChunkManager(cfg, () => ++built, () => void disposed++);
    let peak = 0;
    for (let s = 0; s <= sliceEndS(route); s += 5) {
      mgr.update(s);
      peak = Math.max(peak, mgr.count);
      for (const k of mgr.indices) {
        expect(k * 64 + 64 + 1).toBeLessThanOrEqual(cfg.maxStation); // never needs an unloaded row
      }
    }
    expect(peak).toBeLessThanOrEqual(8);
    expect(built - disposed).toBe(mgr.count);
    expect(disposed).toBeGreaterThan(10);
    expect(wantedChunks(0, cfg)[0]).toBe(0);
  });
});
