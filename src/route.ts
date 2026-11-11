/** Types and pure helpers for public/data/route.json (built by tools/build_route.py). */

export type RiverId = 'alumine' | 'collon-cura' | 'limay' | 'negro';

export interface Reach {
  id: number;
  river: RiverId;
  startKm: number;
  endKm: number;
  /** Game distance (m) at the start of the reach. */
  startS: number;
  distanceToSeaKm: number;
  dischargeM3s: number;
  /** Elevation estimate (m) at the downstream end of the reach. */
  elevEndM: number;
}

export interface Segment {
  river: RiverId;
  name: string;
  reachFrom: number;
  reachTo: number;
  reaches: number;
  startKm: number;
  endKm: number;
  startS: number;
  endS: number;
}

export interface Reservoir {
  id: string;
  name: string;
  fullName: string;
  lakeId: number;
  startKm: number;
  endKm: number;
  startS: number;
  endS: number;
  damKm: number;
  damS: number;
  damOffRouteKm: number;
}

export type LandmarkKind = 'source' | 'town' | 'confluence' | 'dam' | 'sea';

export interface Landmark {
  name: string;
  kind: LandmarkKind;
  /** OSM place class, towns only. */
  place?: 'city' | 'town' | 'village';
  /** Reservoir id, dams only. */
  reservoir?: string;
  /** Real distance along the route (km) and game distance (m). */
  km: number;
  s: number;
  lon: number;
  lat: number;
  offRouteKm: number;
}

/** Column-oriented game centerline, `n` samples evenly spaced by `spacingM` along the route. */
export interface Centerline {
  n: number;
  spacingM: number;
  /** Game-plane metres, x east and y north, origin at the route start. */
  x: number[];
  y: number[];
  /** Real position of the river at the same route point (not the smoothed line). */
  lon: number[];
  lat: number[];
  /** Real distance along the route (km). */
  km: number[];
  elevM: number[];
  dischargeM3s: number[];
  /** Game channel width (m). */
  widthM: number[];
  /** Index into RIVER_IDS. */
  river: number[];
  /** 0 on free-flowing river, otherwise the 1-based index into `reservoirs`. */
  lake: number[];
}

export interface RouteData {
  version: 1;
  params: {
    compressionAlong: number;
    smoothingSigmaKm: number;
    corridorHalfWidthM: number;
    minRadiusTargetM: number;
    spacingM: number;
    crs: string;
  };
  realLengthKm: number;
  gameLengthM: number;
  diagnostics: {
    minBendRadiusM: number;
    planimetricScale: number;
    maxLateralDeviationM: number;
    limiterPasses: number;
    sinuosityKept: Record<RiverId, number>;
  };
  reaches: Reach[];
  segments: Segment[];
  reservoirs: Reservoir[];
  landmarks: Landmark[];
  real: { lon: number[]; lat: number[]; km: number[] };
  centerline: Centerline;
}

export const RIVER_IDS: readonly RiverId[] = ['alumine', 'collon-cura', 'limay', 'negro'];

export interface RoutePoint {
  s: number;
  x: number;
  y: number;
  /** Heading of the flow in radians, counter-clockwise from +x (east). */
  heading: number;
  widthM: number;
  river: RiverId;
  riverIndex: number;
  dischargeM3s: number;
  elevM: number;
  km: number;
  lon: number;
  lat: number;
  /** Reservoir the point lies in, or null on free-flowing river. */
  reservoir: Reservoir | null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Interpolate the centerline at game distance `s` (clamped to the route). The river comes from the segments. */
export function sampleAt(route: RouteData, s: number): RoutePoint {
  const c = route.centerline;
  const f = clamp(s, 0, route.gameLengthM) / c.spacingM;
  const i = Math.min(Math.floor(f), c.n - 2);
  const t = clamp(f - i, 0, 1);
  const lerp = (a: number[]) => a[i] + (a[i + 1] - a[i]) * t;
  const dx = c.x[i + 1] - c.x[i];
  const dy = c.y[i + 1] - c.y[i];
  const riverIndex = RIVER_IDS.indexOf(segmentAt(route, s).river);
  const lake = c.lake[t < 0.5 ? i : i + 1];
  return {
    s: clamp(s, 0, route.gameLengthM),
    x: lerp(c.x),
    y: lerp(c.y),
    heading: Math.atan2(dy, dx),
    widthM: lerp(c.widthM),
    river: RIVER_IDS[riverIndex],
    riverIndex,
    dischargeM3s: lerp(c.dischargeM3s),
    elevM: lerp(c.elevM),
    km: lerp(c.km),
    lon: lerp(c.lon),
    lat: lerp(c.lat),
    reservoir: lake > 0 ? route.reservoirs[lake - 1] : null,
  };
}

/** Segment (river) containing game distance `s`; the last segment owns the end of the route. */
export function segmentAt(route: RouteData, s: number): Segment {
  const segs = route.segments;
  for (let i = segs.length - 1; i > 0; i--) {
    if (s >= segs[i].startS) return segs[i];
  }
  return segs[0];
}

/** Landmarks with `s0 <= s <= s1`, in route order. */
export function landmarksBetween(route: RouteData, s0: number, s1: number): Landmark[] {
  return route.landmarks.filter((l) => l.s >= s0 && l.s <= s1);
}

/** Fraction (0..1) of the journey completed at game distance `s`. */
export function progressAt(route: RouteData, s: number): number {
  return clamp(s / route.gameLengthM, 0, 1);
}
