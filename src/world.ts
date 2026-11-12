/** Route space -> world space. Pure (no Three.js).
 *
 * Axis convention (documented once, used everywhere): game x (east) -> world x, game y (north) -> world -z,
 * height -> world y. Looking down at the map from above this keeps east on the right and north up, and Three.js's
 * right-handed, y-up system is respected. The flow direction at heading h (CCW from +x in the game plane) is
 * (cos h, -sin h) in world (x, z); "left of the flow" (d > 0) is (-sin h, -cos h) in world (x, z).
 */
import { sampleAt, type RouteData } from './route';

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

/** World position of route-space point (s, d) at height `h`: centerline(s) + d * leftNormal. d > 0 is left of flow. */
export function toWorld(route: RouteData, s: number, d: number, h = 0): WorldPoint {
  const p = sampleAt(route, s);
  return { x: p.x - d * Math.sin(p.heading), y: h, z: -(p.y + d * Math.cos(p.heading)) };
}

/** Same as `toWorld` but writes into a position buffer at vertex `i` (no allocation per vertex of a chunk). */
export function writeWorld(
  out: Float32Array | number[],
  i: number,
  px: number,
  py: number,
  heading: number,
  d: number,
  h: number,
): void {
  out[i * 3] = px - d * Math.sin(heading);
  out[i * 3 + 1] = h;
  out[i * 3 + 2] = -(py + d * Math.cos(heading));
}

/** Yaw (Three.js rotation.y, local +x = flow) of the flow at `s`, smoothed over +/- `spanM` to hide polyline kinks. */
export function worldYawAt(route: RouteData, s: number, spanM = 12): number {
  const a = toWorld(route, s - spanM, 0);
  const b = toWorld(route, s + spanM, 0);
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.atan2(-dz, dx);
}
