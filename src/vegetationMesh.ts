/** Three.js side of vegetation: low-poly geometries built once from primitives and one InstancedMesh per kind per chunk.
 * Geometries and the material are shared by every chunk; a chunk's meshes only own their instance buffers. */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  MeshToonMaterial,
  ConeGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonGradient } from './look';
import { srgbToLinear } from './palette';
import { sampleAt, type RouteData } from './route';
import { writeWorld } from './world';
import { KIND, KIND_COUNT, type VegetationInstances } from './vegetation';

type Rgb = [number, number, number];

/** A primitive coloured flat (colour attribute in linear RGB), made faceted for the low-poly look. */
function part(geo: BufferGeometry, srgb: Rgb, y: number, sy = 1): BufferGeometry {
  const g = geo.toNonIndexed();
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  if (sy !== 1) g.scale(1, sy, 1);
  g.translate(0, y, 0);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  const lin = srgb.map(srgbToLinear);
  for (let i = 0; i < n; i++) col.set(lin, i * 3);
  g.setAttribute('color', new BufferAttribute(col, 3));
  return g;
}

function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  g.computeVertexNormals(); // non-indexed: flat face normals
  g.computeBoundingSphere();
  return g;
}

const BARK: Rgb = [0.42, 0.3, 0.2];
const cone = (r: number, h: number, seg: number, base: number, c: Rgb) => part(new ConeGeometry(r, h, seg), c, base + h / 2);

function buildGeometries(): BufferGeometry[] {
  const out: BufferGeometry[] = new Array(KIND_COUNT);
  // Araucaria: tall bare trunk and a flat umbrella crown of stacked, flattened cones.
  out[KIND.araucaria] = merge([
    part(new CylinderGeometry(0.35, 0.6, 12.5, 6), BARK, 6.25),
    cone(5.6, 1.7, 8, 11.6, [0.17, 0.4, 0.2]),
    cone(4.2, 1.5, 8, 12.8, [0.2, 0.45, 0.22]),
    cone(2.5, 1.5, 7, 13.9, [0.24, 0.5, 0.25]),
  ]);
  // Other conifers: three stacked cones on a short trunk.
  out[KIND.conifer] = merge([
    part(new CylinderGeometry(0.3, 0.45, 2, 6), BARK, 1),
    cone(2.8, 4.6, 7, 1.6, [0.12, 0.34, 0.2]),
    cone(2.2, 4.2, 7, 4.4, [0.15, 0.38, 0.22]),
    cone(1.5, 3.8, 7, 7.2, [0.19, 0.44, 0.25]),
  ]);
  out[KIND.shrub] = merge([part(new IcosahedronGeometry(1.4, 0), [0.4, 0.5, 0.22], 0.6, 0.7)]);
  out[KIND.rock] = merge([part(new DodecahedronGeometry(1.5, 0), [1, 1, 1], 0.35, 0.8)]);
  // Poplar: tall narrow columnar crown.
  out[KIND.poplar] = merge([
    part(new CylinderGeometry(0.22, 0.32, 2.4, 5), BARK, 1.2),
    cone(1.7, 15, 6, 2, [0.3, 0.5, 0.18]),
  ]);
  return out;
}

export class VegetationKit {
  private readonly geometries = buildGeometries();
  private readonly material = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  private readonly scratch = new Float32Array(3);

  /** One InstancedMesh per kind that has instances, positioned on the terrain. Returns null when empty. */
  build(route: RouteData, inst: VegetationInstances): Group | null {
    if (inst.count === 0) return null;
    const group = new Group();
    const perKind = new Array<number[]>(KIND_COUNT);
    for (let k = 0; k < KIND_COUNT; k++) perKind[k] = [];
    for (let i = 0; i < inst.count; i++) perKind[inst.kind[i]].push(i);
    for (let k = 0; k < KIND_COUNT; k++) {
      const ids = perKind[k];
      if (ids.length === 0) continue;
      const mesh = new InstancedMesh(this.geometries[k], this.material, ids.length);
      const m = mesh.instanceMatrix.array as Float32Array;
      const colors = new Float32Array(ids.length * 3);
      ids.forEach((id, n) => {
        const p = sampleAt(route, inst.pos[id * 3]);
        writeWorld(this.scratch, 0, p.x, p.y, p.heading, inst.pos[id * 3 + 1], inst.pos[id * 3 + 2]);
        const c = Math.cos(inst.rotY[id]);
        const s = Math.sin(inst.rotY[id]);
        const sx = inst.scale[id * 3];
        const sy = inst.scale[id * 3 + 1];
        const sz = inst.scale[id * 3 + 2];
        const o = n * 16;
        m[o] = c * sx;
        m[o + 1] = 0;
        m[o + 2] = -s * sx;
        m[o + 3] = 0;
        m[o + 4] = 0;
        m[o + 5] = sy;
        m[o + 6] = 0;
        m[o + 7] = 0;
        m[o + 8] = s * sz;
        m[o + 9] = 0;
        m[o + 10] = c * sz;
        m[o + 11] = 0;
        m[o + 12] = this.scratch[0];
        m[o + 13] = this.scratch[1];
        m[o + 14] = this.scratch[2];
        m[o + 15] = 1;
        colors.set(inst.color.subarray(id * 3, id * 3 + 3), n * 3);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor = new InstancedBufferAttribute(colors, 3);
      mesh.computeBoundingSphere();
      group.add(mesh);
    }
    return group;
  }

  /** Release a chunk's instance buffers (the shared geometries stay). */
  release(group: Group): void {
    for (const child of group.children) (child as InstancedMesh).dispose();
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    this.material.dispose();
  }
}

