/** Biome table and lookup by route distance. Pure (no Three.js).
 *
 * The route is cut into zones: one per river segment (Alumine -> Andean forest, Collon Cura and Limay -> steppe
 * canyon, Negro -> irrigated valley), reservoirs override whatever they cover, and the last ESTUARY_LENGTH_M of the
 * route is the estuary. Across every zone boundary the biome blends over BLEND_M (half on each side).
 */
import type { RouteData } from './route';

export type BiomeId = 'andean-forest' | 'steppe-canyon' | 'reservoir' | 'irrigated-valley' | 'estuary';
export type Rgb = [number, number, number];

/** Colours are sRGB 0..1. */
export interface BiomePalette {
  sand: Rgb;
  grass: Rgb;
  /** Drier or higher ground. */
  dry: Rgb;
  rock: Rgb;
  /** High ground above the tree line. */
  high: Rgb;
  /** Darker green the grass varies towards (forest floor); equals `grass` where no variation is wanted. */
  moss: Rgb;
  /** Slope (rise over run) around which ground turns to bare rock. */
  rockSlope: number;
  /** Height above the water (m) up to which the bank is sand or gravel. */
  bankM: number;
  /** Multiplier tint for foliage instances. */
  foliage: Rgb;
}

/** Chance per candidate cell (see vegetation.ts) of each kind, before slope and bank adjustments. */
export interface VegetationDensity {
  araucaria: number;
  conifer: number;
  shrub: number;
  rock: number;
  poplar: number;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  palette: BiomePalette;
  density: VegetationDensity;
}

export const BIOMES: Record<BiomeId, BiomeDef> = {
  'andean-forest': {
    id: 'andean-forest',
    name: 'Andean forest',
    palette: {
      sand: [0.6, 0.55, 0.47], // grey-tan pebbles
      grass: [0.22, 0.6, 0.17],
      moss: [0.12, 0.38, 0.14],
      dry: [0.26, 0.5, 0.18], // olive forest floor, not tan
      rock: [0.6, 0.55, 0.5],
      rockSlope: 1.2,
      high: [0.88, 0.9, 0.94],
      bankM: 0.9,
      foliage: [1, 1, 1],
    },
    density: { araucaria: 0.06, conifer: 0.09, shrub: 0.07, rock: 0.04, poplar: 0 },
  },
  'steppe-canyon': {
    id: 'steppe-canyon',
    name: 'Steppe canyon',
    palette: {
      sand: [0.83, 0.72, 0.5],
      grass: [0.62, 0.6, 0.34],
      dry: [0.74, 0.58, 0.36],
      rock: [0.64, 0.5, 0.4],
      high: [0.78, 0.66, 0.5],
      moss: [0.62, 0.6, 0.34],
      rockSlope: 0.85,
      bankM: 2.5,
      foliage: [1.05, 0.95, 0.7],
    },
    density: { araucaria: 0, conifer: 0, shrub: 0.08, rock: 0.06, poplar: 0 },
  },
  reservoir: {
    id: 'reservoir',
    name: 'Reservoir',
    palette: {
      sand: [0.82, 0.74, 0.56],
      grass: [0.46, 0.58, 0.3],
      dry: [0.6, 0.56, 0.36],
      rock: [0.58, 0.5, 0.42],
      high: [0.74, 0.7, 0.62],
      moss: [0.46, 0.58, 0.3],
      rockSlope: 0.85,
      bankM: 2.5,
      foliage: [0.95, 1, 0.85],
    },
    density: { araucaria: 0, conifer: 0.02, shrub: 0.06, rock: 0.05, poplar: 0 },
  },
  'irrigated-valley': {
    id: 'irrigated-valley',
    name: 'Irrigated valley',
    palette: {
      sand: [0.84, 0.76, 0.56],
      grass: [0.4, 0.68, 0.26],
      dry: [0.7, 0.66, 0.34],
      rock: [0.6, 0.54, 0.46],
      high: [0.72, 0.64, 0.5],
      moss: [0.4, 0.68, 0.26],
      rockSlope: 0.85,
      bankM: 2.5,
      foliage: [1.05, 1.1, 0.8],
    },
    density: { araucaria: 0, conifer: 0, shrub: 0.05, rock: 0.02, poplar: 0.09 },
  },
  estuary: {
    id: 'estuary',
    name: 'Estuary',
    palette: {
      sand: [0.88, 0.82, 0.64],
      grass: [0.52, 0.64, 0.4],
      dry: [0.7, 0.68, 0.5],
      rock: [0.6, 0.58, 0.54],
      high: [0.78, 0.76, 0.66],
      moss: [0.52, 0.64, 0.4],
      rockSlope: 0.85,
      bankM: 2.5,
      foliage: [0.9, 1, 0.9],
    },
    density: { araucaria: 0, conifer: 0, shrub: 0.05, rock: 0.015, poplar: 0.01 },
  },
};

/** Length (m) over which two neighbouring biomes blend, centred on their boundary. */
export const BLEND_M = 200;
/** The last stretch of the route (m) that is estuary. */
export const ESTUARY_LENGTH_M = 1500;

const RIVER_BIOME: Record<string, BiomeId> = {
  alumine: 'andean-forest',
  'collon-cura': 'steppe-canyon',
  limay: 'steppe-canyon',
  negro: 'irrigated-valley',
};

/** Biome `a` (before) blended with `b` (after); `t` is the weight of `b`, so the weights are 1 - t and t. */
export interface BiomeBlend {
  a: BiomeId;
  b: BiomeId;
  t: number;
}

interface Zone {
  startS: number;
  endS: number;
  biome: BiomeId;
}

const zoneCache = new WeakMap<RouteData, Zone[]>();

function baseBiome(route: RouteData, s: number, estuaryStart: number): BiomeId {
  if (s >= estuaryStart) return 'estuary';
  for (const r of route.reservoirs ?? []) if (s >= r.startS && s < r.endS) return 'reservoir';
  for (const seg of route.segments) if (s < seg.endS) return RIVER_BIOME[seg.river] ?? 'steppe-canyon';
  return RIVER_BIOME[route.segments[route.segments.length - 1].river] ?? 'steppe-canyon';
}

function zonesOf(route: RouteData): Zone[] {
  const cached = zoneCache.get(route);
  if (cached) return cached;
  const total = route.segments[route.segments.length - 1].endS;
  const estuaryStart = total - ESTUARY_LENGTH_M;
  const cuts = new Set<number>([0, estuaryStart, total]);
  for (const seg of route.segments) cuts.add(seg.endS);
  for (const r of route.reservoirs ?? []) {
    cuts.add(r.startS);
    cuts.add(r.endS);
  }
  const sorted = [...cuts].filter((c) => c >= 0 && c <= total).sort((x, y) => x - y);
  const zones: Zone[] = [];
  for (let i = 0; i + 1 < sorted.length; i++) {
    const startS = sorted[i];
    const endS = sorted[i + 1];
    if (endS - startS < 1e-6) continue;
    const biome = baseBiome(route, (startS + endS) / 2, estuaryStart);
    const last = zones[zones.length - 1];
    if (last && last.biome === biome) last.endS = endS;
    else zones.push({ startS, endS, biome });
  }
  zoneCache.set(route, zones);
  return zones;
}

/** Biome blend at route distance `s`. Writes into `out` when given (no allocation). Distances outside the route clamp. */
export function biomeAt(route: RouteData, s: number, out: BiomeBlend = { a: 'andean-forest', b: 'andean-forest', t: 0 }): BiomeBlend {
  const zones = zonesOf(route);
  let i = 0;
  while (i < zones.length - 1 && s >= zones[i].endS) i++;
  const z = zones[i];
  const half = BLEND_M / 2;
  out.a = z.biome;
  out.b = z.biome;
  out.t = 0;
  if (i + 1 < zones.length && s > z.endS - half) {
    out.b = zones[i + 1].biome;
    out.t = Math.min(1, (s - (z.endS - half)) / BLEND_M);
  } else if (i > 0 && s < z.startS + half) {
    out.a = zones[i - 1].biome;
    out.t = Math.max(0, (s - (z.startS - half)) / BLEND_M);
  }
  return out;
}
