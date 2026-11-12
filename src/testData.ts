/** Test-only loader for the committed route and the first terrain chunks (reads public/data from disk). */
import routeRaw from '../public/data/route.json?raw';
import manifestRaw from '../public/data/terrain/manifest.json?raw';
import type { RouteData } from './route';
import { TerrainStrip, type TerrainManifest } from './terrain';

export async function loadTestData(chunkFiles = 2): Promise<{
  route: RouteData;
  manifest: TerrainManifest;
  strip: TerrainStrip;
}> {
  const route = JSON.parse(routeRaw) as RouteData;
  const manifest = JSON.parse(manifestRaw) as TerrainManifest;
  const strip = new TerrainStrip(manifest);
  const nodeFs = 'node:fs'; // variable specifier: this project has no Node typings
  const fs = (await import(/* @vite-ignore */ nodeFs)) as {
    readFileSync(path: URL): { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
  };
  for (let k = 0; k < chunkFiles; k++) {
    const b = fs.readFileSync(new URL(`../public/data/terrain/${manifest.chunks[k].file}`, import.meta.url));
    strip.setChunk(k, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  }
  return { route, manifest, strip };
}
