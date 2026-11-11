import { describe, expect, it } from 'vitest';
import raw from '../public/data/route.json?raw';
import {
  RIVER_IDS,
  landmarksBetween,
  progressAt,
  sampleAt,
  segmentAt,
  type RouteData,
} from './route';

/** A tiny straight route: 5 samples 10 m apart along +x, with a lake on the last two. */
function toyRoute(): RouteData {
  return {
    version: 1,
    gameLengthM: 40,
    reservoirs: [{ id: 'lake', name: 'Lake' }],
    segments: [
      { river: 'alumine', name: 'Aluminé', startS: 0, endS: 20 },
      { river: 'collon-cura', name: 'Collón Curá', startS: 20, endS: 40 },
    ],
    landmarks: [
      { name: 'A', kind: 'town', s: 5 },
      { name: 'B', kind: 'dam', s: 25 },
    ],
    centerline: {
      n: 5,
      spacingM: 10,
      x: [0, 10, 20, 30, 40],
      y: [0, 0, 10, 10, 10],
      lon: [-71, -70.9, -70.8, -70.7, -70.6],
      lat: [-39, -39, -39, -39, -39],
      km: [0, 1, 2, 3, 4],
      elevM: [100, 90, 80, 70, 60],
      dischargeM3s: [10, 20, 30, 40, 50],
      widthM: [25, 30, 35, 40, 45],
      river: [0, 0, 1, 1, 1],
      lake: [0, 0, 0, 1, 1],
    },
  } as unknown as RouteData;
}

describe('sampleAt', () => {
  const route = toyRoute();
  it('interpolates position, width and discharge between samples', () => {
    const p = sampleAt(route, 5);
    expect(p.x).toBeCloseTo(5);
    expect(p.widthM).toBeCloseTo(27.5);
    expect(p.dischargeM3s).toBeCloseTo(15);
    expect(p.elevM).toBeCloseTo(95);
    expect(p.km).toBeCloseTo(0.5);
  });
  it('reports the heading of the local segment', () => {
    expect(sampleAt(route, 5).heading).toBeCloseTo(0);
    expect(sampleAt(route, 15).heading).toBeCloseTo(Math.atan2(10, 10));
  });
  it('picks the river from the segments and the lake from the nearest sample', () => {
    expect(sampleAt(route, 12).river).toBe('alumine');
    expect(sampleAt(route, 20).river).toBe('collon-cura');
    expect(sampleAt(route, 10).reservoir).toBeNull();
    expect(sampleAt(route, 35).reservoir?.id).toBe('lake');
  });
  it('clamps outside the route', () => {
    expect(sampleAt(route, -5).x).toBe(0);
    expect(sampleAt(route, 999).x).toBe(40);
    expect(sampleAt(route, 999).s).toBe(40);
  });
});

describe('segmentAt, landmarksBetween, progressAt', () => {
  const route = toyRoute();
  it('finds the segment owning a distance', () => {
    expect(segmentAt(route, 0).river).toBe('alumine');
    expect(segmentAt(route, 19.9).river).toBe('alumine');
    expect(segmentAt(route, 20).river).toBe('collon-cura');
    expect(segmentAt(route, 40).river).toBe('collon-cura');
  });
  it('lists landmarks in a range', () => {
    expect(landmarksBetween(route, 0, 10).map((l) => l.name)).toEqual(['A']);
    expect(landmarksBetween(route, 0, 40).map((l) => l.name)).toEqual(['A', 'B']);
  });
  it('maps distance to a 0..1 progress fraction', () => {
    expect(progressAt(route, 10)).toBeCloseTo(0.25);
    expect(progressAt(route, 100)).toBe(1);
  });
});

describe('public/data/route.json', () => {
  const route = JSON.parse(raw) as RouteData;
  it('parses with the expected shape', () => {
    expect(route.version).toBe(1);
    expect(route.reaches).toHaveLength(371);
    expect(route.segments.map((s) => s.river)).toEqual([...RIVER_IDS]);
    expect(route.reservoirs.map((r) => r.name)).toEqual([
      'Piedra del Águila',
      'Pichi Picún Leufú',
      'El Chocón',
      'Arroyito',
    ]);
  });
  it('has an ordered, evenly sampled centerline that ends at the game length', () => {
    const c = route.centerline;
    for (const key of ['x', 'y', 'lon', 'lat', 'km', 'widthM', 'river', 'lake'] as const) {
      expect(c[key]).toHaveLength(c.n);
    }
    for (let i = 1; i < c.n; i++) {
      expect(c.km[i]).toBeGreaterThanOrEqual(c.km[i - 1]);
      expect(c.river[i]).toBeGreaterThanOrEqual(c.river[i - 1]);
    }
    expect((c.n - 1) * c.spacingM).toBeCloseTo(route.gameLengthM, 0);
    expect(sampleAt(route, route.gameLengthM).km).toBeCloseTo(route.realLengthKm, 0);
  });
  it('orders landmarks by distance and sampleAt agrees with the segments', () => {
    const s = route.landmarks.map((l) => l.s);
    expect([...s].sort((a, b) => a - b)).toEqual(s);
    const seg = route.segments[2];
    expect(segmentAt(route, seg.startS + 1).river).toBe('limay');
    expect(sampleAt(route, seg.startS + 1).river).toBe('limay');
    const pda = route.reservoirs[0];
    expect(sampleAt(route, (pda.startS + pda.endS) / 2).reservoir?.id).toBe('piedra-del-aguila');
  });
});
