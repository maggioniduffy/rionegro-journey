/** Placeholder inflatable raft from primitives: a rounded-rectangle tube ring, a floor and two thwarts.
 * Local +x is the direction of travel, +y up, +z to the raft's right. Size is in game metres. */
import { BackSide, BoxGeometry, CapsuleGeometry, Group, Mesh, MeshBasicMaterial, MeshToonMaterial } from 'three';
import { toonGradient } from './look';

export const RAFT_LENGTH = 6.4;
export const RAFT_WIDTH = 4.2;

export function createRaft(): Group {
  const raft = new Group();
  // Saturated orange with a dark outline shell so the raft stays readable against blue water and white foam.
  const tube = new MeshToonMaterial({ color: 0xf26a1b, gradientMap: toonGradient() });
  const floorMat = new MeshToonMaterial({ color: 0x2d4f6c, gradientMap: toonGradient() });
  const outline = new MeshBasicMaterial({ color: 0x2b1408, side: BackSide });
  const shell = (m: Mesh) => {
    const o = new Mesh(m.geometry, outline);
    o.scale.setScalar(1.12);
    m.add(o);
  };
  const r = 0.6;
  const sideLen = RAFT_LENGTH - 2 * r;
  const endLen = RAFT_WIDTH - 2 * r;

  for (const z of [-1, 1]) {
    const side = new Mesh(new CapsuleGeometry(r, sideLen, 6, 12), tube);
    side.rotation.z = Math.PI / 2; // capsule axis y -> x
    side.position.set(0, r, (z * (RAFT_WIDTH - 2 * r)) / 2);
    shell(side);
    raft.add(side);
  }
  for (const x of [-1, 1]) {
    const end = new Mesh(new CapsuleGeometry(r, endLen, 6, 12), tube);
    end.rotation.x = Math.PI / 2; // capsule axis y -> z
    end.position.set((x * (RAFT_LENGTH - 2 * r)) / 2, r, 0);
    shell(end);
    raft.add(end);
  }
  const floor = new Mesh(new BoxGeometry(RAFT_LENGTH - 1.6, 0.18, RAFT_WIDTH - 1.6), floorMat);
  floor.position.y = 0.3;
  raft.add(floor);
  for (const x of [-0.8, 0.9]) {
    const thwart = new Mesh(new BoxGeometry(0.35, 0.22, RAFT_WIDTH - 1.2), tube);
    thwart.position.set(x, 0.85, 0);
    raft.add(thwart);
  }
  return raft;
}
