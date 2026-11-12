/** Lateral steering of the raft inside the channel. Pure.
 *
 * The game uses per-station left/right water limits from the terrain strip (limits.ts) with `stepSteerBetween`.
 * `channelLimit` is the older symmetric clamp from `RoutePoint.widthM` (the full game channel width in metres,
 * about 27-43 m on the Aluminé stretch, so half-width widthM / 2); it is narrower than the visible water and is kept
 * only as a fallback. The raft centre stays `marginM` inside each bank. d > 0 is left of the flow (see world.ts).
 */
import { sampleAt, type RouteData } from './route';

export interface SteerState {
  /** Lateral offset (m) from the centerline, d > 0 left of the flow. */
  d: number;
  /** Lateral velocity (m/s). */
  v: number;
}

export interface SteerConfig {
  /** Lateral acceleration (m/s^2) at full input. */
  accel: number;
  /** Top lateral speed (m/s). */
  maxSpeed: number;
  /** Velocity damping rate (1/s), applied when there is no input too, so the raft settles gently. */
  damping: number;
  /** Distance (m) kept between the raft centre and either bank. */
  marginM: number;
}

export const DEFAULT_STEER: SteerConfig = { accel: 14, maxSpeed: 8, damping: 2.2, marginM: 3.5 };

/** Largest |d| allowed at route distance `s` by the route channel width (fallback; see limits.ts for the real water). */
export function channelLimit(route: RouteData, s: number, marginM = DEFAULT_STEER.marginM): number {
  return Math.max(0, sampleAt(route, s).widthM / 2 - marginM);
}

/** Advance steering by `dt`. `input` in [-1, 1] (+1 = left of flow). The result is clamped to [-limit, +limit]. */
export function stepSteer(
  state: SteerState,
  input: number,
  dt: number,
  limit: number,
  config: SteerConfig = DEFAULT_STEER,
): SteerState {
  return stepSteerBetween(state, input, dt, -limit, limit, config);
}

/** Like `stepSteer` with separate bounds: d is clamped to [minD, maxD] (minD <= 0 <= maxD, d > 0 left of flow) and the
 * velocity pointing out of the water is zeroed at a bound. If the bounds are inverted they collapse to minD. */
export function stepSteerBetween(
  state: SteerState,
  input: number,
  dt: number,
  minD: number,
  maxD: number,
  config: SteerConfig = DEFAULT_STEER,
): SteerState {
  const u = Math.max(-1, Math.min(1, input));
  let v = state.v + (u * config.accel - config.damping * state.v) * dt;
  v = Math.max(-config.maxSpeed, Math.min(config.maxSpeed, v));
  let d = state.d + v * dt;
  if (d > maxD) {
    d = maxD;
    v = Math.min(v, 0);
  }
  if (d < minD) {
    d = minD;
    v = Math.max(v, 0);
  }
  return { d, v };
}
