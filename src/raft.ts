/** Placeholder inflatable raft from primitives: a rounded-rectangle tube ring, a floor and two thwarts.
 * Local +x is the direction of travel, +y up, +z to the raft's right. Size is in game metres. */
import { BoxGeometry, CapsuleGeometry, Group, Mesh, MeshStandardMaterial } from 'three';

export const RAFT_LENGTH = 6.4;
export const RAFT_WIDTH = 4.2;

export function createRaft(): Group {
  const raft = new Group();
  const tube = new MeshStandardMaterial({ color: 0xf2a33a, roughness: 0.7 });
  const floorMat = new MeshStandardMaterial({ color: 0x2f6f9a, roughness: 0.9 });
  const r = 0.6;
  const sideLen = RAFT_LENGTH - 2 * r;
  const endLen = RAFT_WIDTH - 2 * r;

  for (const z of [-1, 1]) {
    const side = new Mesh(new CapsuleGeometry(r, sideLen, 6, 12), tube);
    side.rotation.z = Math.PI / 2; // capsule axis y -> x
    side.position.set(0, r, (z * (RAFT_WIDTH - 2 * r)) / 2);
    raft.add(side);
  }
  for (const x of [-1, 1]) {
    const end = new Mesh(new CapsuleGeometry(r, endLen, 6, 12), tube);
    end.rotation.x = Math.PI / 2; // capsule axis y -> z
    end.position.set((x * (RAFT_LENGTH - 2 * r)) / 2, r, 0);
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
