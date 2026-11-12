/** Colour ramps for terrain, sky and fog. Pure (no Three.js). Inputs are authored in sRGB; outputs for vertex colours
 * are linear RGB (what Three.js expects in a colour attribute). */
import { BIOMES, type BiomeBlend, type BiomePalette, type Rgb } from './biomes';

export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** Warm pale horizon and blue zenith (sRGB). Fog uses the horizon colour so distant terrain melts into the sky. */
export const SKY_HORIZON: Rgb = [0.93, 0.87, 0.74];
export const SKY_ZENITH: Rgb = [0.28, 0.55, 0.86];
export const FOG_COLOR: Rgb = SKY_HORIZON;

const TREELINE = 70;

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** sRGB colour of one biome's terrain (written into `out`, 3 values). `noise` in [-1, 1] adds a small brightness variation. */
function biomeRgb(p: BiomePalette, heightAboveWater: number, slope: number, noise: number, out: number[]): void {
  const rock = smooth(p.rockSlope - 0.2, p.rockSlope + 0.15, slope);
  const sand = 1 - smooth(p.bankM - 0.4, p.bankM + 0.4, heightAboveWater);
  const dry = smooth(20, 60, heightAboveWater);
  const high = smooth(TREELINE - 10, TREELINE + 15, heightAboveWater);
  // Fresh green to mossy green by noise and a slow height wave.
  const mossy = Math.min(1, Math.max(0, 0.5 + 0.4 * noise + 0.2 * Math.sin(heightAboveWater * 0.35)));
  const shade = 1 + noise * 0.06;
  // Faint horizontal bands (rock strata) so canyon walls read as layered rock.
  const strata = 1 + 0.11 * Math.sin(heightAboveWater * 0.9);
  for (let c = 0; c < 3; c++) {
    const green = mix(p.grass[c], p.moss[c], mossy);
    let v = mix(green, p.dry[c], dry);
    v = mix(v, p.high[c], high);
    v = mix(v, p.sand[c], sand);
    v = mix(v, p.rock[c] * strata, rock);
    out[c] = v * shade;
  }
}

const tmpA = [0, 0, 0];
const tmpB = [0, 0, 0];

/**
 * Linear terrain colour from height above the local water level (m), slope (rise over run), the biome blend at the
 * vertex and a noise value in [-1, 1]. Writes 3 numbers into `out` at `offset`; allocation free.
 */
export function terrainRgb(
  heightAboveWater: number,
  slope: number,
  blend: BiomeBlend,
  noise: number,
  out: ArrayLike<number> & { [i: number]: number },
  offset: number,
): void {
  biomeRgb(BIOMES[blend.a].palette, heightAboveWater, slope, noise, tmpA);
  const t = blend.b === blend.a ? 0 : blend.t;
  if (t > 0) biomeRgb(BIOMES[blend.b].palette, heightAboveWater, slope, noise, tmpB);
  for (let c = 0; c < 3; c++) {
    const v = t > 0 ? mix(tmpA[c], tmpB[c], t) : tmpA[c];
    out[offset + c] = srgbToLinear(Math.min(1, Math.max(0, v)));
  }
}
