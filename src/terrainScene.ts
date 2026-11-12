/** Three.js side of the terrain: sub-chunk meshes for the terrain and water near the raft, disposed when they leave the window. */
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshToonMaterial } from 'three';
import { ChunkManager, type ChunkWindowConfig } from './chunks';
import type { RouteData } from './route';
import type { TerrainManifest, TerrainStrip } from './terrain';
import { placeVegetation } from './vegetation';
import { VegetationKit } from './vegetationMesh';
import { createWaterMaterial } from './waterMaterial';
import { biomeAt, type BiomeBlend } from './biomes';
import { toonGradient } from './look';
import { buildTerrainMesh, buildWaterMesh, type MeshArrays } from './terrainMesh';

export const MESH_STATIONS = 64;
const WATER_HALF_SPAN_M = 45;
const WATER_COLUMNS = 61;
const VEGETATION_SEED = 20261111;

interface Chunk {
  group: Group;
  geometries: BufferGeometry[];
  vegetation: Group | null;
}

function terrainGeometry(m: MeshArrays): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('normal', new BufferAttribute(m.normals!, 3));
  g.setAttribute('color', new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

function waterGeometry(m: MeshArrays): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('aFlow', new BufferAttribute(m.flow!, 2));
  g.setAttribute('aDepth', new BufferAttribute(m.depth!, 1));
  g.setIndex(new BufferAttribute(m.indices, 1));
  g.computeBoundingSphere();
  return g;
}

export class TerrainScene {
  readonly group = new Group();
  private readonly terrainMat = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  private readonly waterMat = createWaterMaterial();
  private readonly vegetation = new VegetationKit();
  private readonly chunks: ChunkManager<Chunk>;

  constructor(
    route: RouteData,
    manifest: TerrainManifest,
    strip: TerrainStrip,
    maxStation: number,
    window: { aheadM: number; behindM: number } = { aheadM: 650, behindM: 150 },
  ) {
    const config: ChunkWindowConfig = {
      meshStations: MESH_STATIONS,
      resolutionM: manifest.resolutionM,
      aheadM: window.aheadM,
      behindM: window.behindM,
      maxStation,
    };
    const blend: BiomeBlend = { a: 'andean-forest', b: 'andean-forest', t: 0 };
    this.chunks = new ChunkManager<Chunk>(
      config,
      (k) => {
        const group = new Group();
        const st0 = k * MESH_STATIONS;
        const terrain = terrainGeometry(buildTerrainMesh(route, manifest, strip, st0, MESH_STATIONS, (s) => biomeAt(route, s, blend)));
        const water = waterGeometry(buildWaterMesh(route, manifest, st0, MESH_STATIONS, WATER_HALF_SPAN_M, WATER_COLUMNS, strip));
        group.add(new Mesh(terrain, this.terrainMat));
        group.add(new Mesh(water, this.waterMat));
        const inst = placeVegetation({
          field: strip,
          halfWidthM: manifest.halfWidthM,
          resolutionM: manifest.resolutionM,
          station0: st0,
          count: Math.min(MESH_STATIONS, manifest.stations - 1 - st0),
          biome: (s) => biomeAt(route, s, blend),
          seed: VEGETATION_SEED,
        });
        const vegetation = this.vegetation.build(route, inst);
        if (vegetation) group.add(vegetation);
        this.group.add(group);
        return { group, geometries: [terrain, water], vegetation };
      },
      (_k, c) => {
        this.group.remove(c.group);
        for (const g of c.geometries) g.dispose();
        if (c.vegetation) this.vegetation.release(c.vegetation);
      },
    );
  }

  get chunkCount(): number {
    return this.chunks.count;
  }

  /** `s` is the raft's route distance, `timeS` the clock in seconds (drives the water pattern). */
  update(s: number, timeS: number): void {
    this.waterMat.uniforms.uTime.value = timeS;
    this.chunks.update(s);
  }

  dispose(): void {
    this.chunks.clear();
    this.terrainMat.dispose();
    this.waterMat.dispose();
    this.vegetation.dispose();
  }
}
