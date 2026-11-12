/** Raft drift along the route: pure state machine, advances route distance `s` at a constant speed. */
import type { RouteData } from './route';

export const DEFAULT_DRIFT_SPEED = 18; // game m/s: the whole 32 km route in about 30 minutes

export interface DriftState {
  s: number;
  ended: boolean;
}

export interface DriftConfig {
  /** Game m/s. */
  speed: number;
  startS: number;
  /** Route distance where the slice ends. */
  endS: number;
}

/** End of the 'alumine' segment from route.json: the Aluminé/Collón Curá confluence. */
export function sliceEndS(route: RouteData): number {
  const seg = route.segments.find((s) => s.river === 'alumine');
  return seg ? seg.endS : route.gameLengthM;
}

export function driftConfig(route: RouteData, overrides: Partial<DriftConfig> = {}): DriftConfig {
  return { speed: DEFAULT_DRIFT_SPEED, startS: 0, endS: sliceEndS(route), ...overrides };
}

export function startDrift(config: DriftConfig): DriftState {
  return { s: config.startS, ended: config.startS >= config.endS };
}

/** Advance by `dt` seconds. Stops at `endS` and flags `ended`; further steps are no-ops. */
export function stepDrift(state: DriftState, config: DriftConfig, dt: number): DriftState {
  if (state.ended) return state;
  const s = state.s + config.speed * dt;
  return s >= config.endS ? { s: config.endS, ended: true } : { s, ended: false };
}
