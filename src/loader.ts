/** Fetches the route and the terrain strip chunks the slice needs (static files next to the page, relative paths). */
import { sliceEndS } from './drift';
import type { RouteData } from './route';
import { TerrainStrip, chunksForRange, type TerrainManifest } from './terrain';

export interface LoadedWorld {
  route: RouteData;
  manifest: TerrainManifest;
  strip: TerrainStrip;
  /** Highest station whose row (and a neighbour row) is loaded. */
  maxStation: number;
}

const url = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(url(path));
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return (await r.json()) as T;
}

/** Load route.json, the manifest and only the strip files covering the slice plus `aheadM` of look-ahead. */
export async function loadWorld(aheadM: number): Promise<LoadedWorld> {
  const [route, manifest] = await Promise.all([
    getJson<RouteData>('route.json'),
    getJson<TerrainManifest>('terrain/manifest.json'),
  ]);
  const strip = new TerrainStrip(manifest);
  const needed = chunksForRange(manifest, 0, sliceEndS(route) + aheadM);
  await Promise.all(
    needed.map(async (k) => {
      const r = await fetch(url(`terrain/${manifest.chunks[k].file}`));
      if (!r.ok) throw new Error(`${manifest.chunks[k].file}: HTTP ${r.status}`);
      strip.setChunk(k, await r.arrayBuffer());
    }),
  );
  const last = manifest.chunks[needed[needed.length - 1]];
  return { route, manifest, strip, maxStation: last.start + last.count - 1 };
}
