/** Three.js side of the terrain: sub-chunk meshes for the terrain and water near the raft, disposed when they leave the window. */
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, DoubleSide } from 'three';
import { ChunkManager, type ChunkWindowConfig } from './chunks';
import type { RouteData } from './route';
import type { TerrainManifest, TerrainStrip } from './terrain';
import { buildTerrainMesh, buildWaterMesh, type MeshArrays } from './terrainMesh';

export const MESH_STATIONS = 64;
const WATER_HALF_SPAN_M = 45;

function toGeometry(m: MeshArrays, normals: boolean): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.positions, 3));
  g.setAttribute('color', new BufferAttribute(m.colors, 3));
  g.setIndex(new BufferAttribute(m.indices, 1));
  if (normals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export class TerrainScene {
  readonly group = new Group();
  private readonly terrainMat = new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
  private readonly waterMat = new MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    roughness: 0.25,
    metalness: 0.1,
    side: DoubleSide,
  });
  private readonly chunks: ChunkManager<Group>;

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
    this.chunks = new ChunkManager(
      config,
      (k) => {
        const g = new Group();
        const st0 = k * MESH_STATIONS;
        g.add(new Mesh(toGeometry(buildTerrainMesh(route, manifest, strip, st0, MESH_STATIONS), false), this.terrainMat));
        g.add(new Mesh(toGeometry(buildWaterMesh(route, manifest, st0, MESH_STATIONS, WATER_HALF_SPAN_M), true), this.waterMat));
        this.group.add(g);
        return g;
      },
      (_k, g) => {
        this.group.remove(g);
        for (const child of g.children) (child as Mesh).geometry.dispose();
      },
    );
  }

  get chunkCount(): number {
    return this.chunks.count;
  }

  update(s: number): void {
    this.chunks.update(s);
  }

  dispose(): void {
    this.chunks.clear();
    this.terrainMat.dispose();
    this.waterMat.dispose();
  }
}
