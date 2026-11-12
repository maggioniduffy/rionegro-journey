/** Wires the pure game state (drift, steering, chunks) to the Three.js scene. */
import {
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import { driftConfig, startDrift, stepDrift, type DriftState } from './drift';
import { SteerInput } from './input';
import { setupLook } from './look';
import { loadWorld } from './loader';
import { createRaft } from './raft';
import type { LateralLimits } from './limits';
import { stepSteerBetween, type SteerState } from './steering';
import { TerrainScene } from './terrainScene';
import { createUi } from './ui';
import { clampPixelRatio, computeAspect } from './viewport';
import { toWorld, worldYawAt } from './world';
import { waterLevelAt } from './terrain';

const AHEAD_M = 650;
const BEHIND_M = 150;

export interface DebugState {
  readonly s: number;
  readonly d: number;
  readonly ended: boolean;
  readonly chunkCount: number;
}

export async function startGame(startS: number): Promise<DebugState> {
  const world = await loadWorld(AHEAD_M);
  const { route, manifest, strip, maxStation, limits } = world;
  const bounds: LateralLimits = { left: 0, right: 0 };

  const cfg = driftConfig(route, { startS });
  let drift: DriftState = startDrift(cfg);
  let steer: SteerState = { d: 0, v: 0 };

  const scene = new Scene();
  const sky = setupLook(scene);

  const terrain = new TerrainScene(route, manifest, strip, maxStation, { aheadM: AHEAD_M, behindM: BEHIND_M });
  scene.add(terrain.group);
  const raft = createRaft();
  scene.add(raft);

  const camera = new PerspectiveCamera(62, computeAspect(innerWidth, innerHeight), 0.3, 1400);
  const renderer = new WebGLRenderer({ antialias: true });
  document.body.appendChild(renderer.domElement);
  const resize = () => {
    renderer.setPixelRatio(clampPixelRatio(devicePixelRatio));
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = computeAspect(innerWidth, innerHeight);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const restart = () => {
    drift = startDrift(cfg);
    steer = { d: 0, v: 0 };
    ui.showEnd(false);
    snapCamera = true;
  };
  const ui = createUi(restart);
  const input = new SteerInput(renderer.domElement, restart);

  const camPos = new Vector3();
  const camLook = new Vector3();
  const camGoal = new Vector3();
  const lookGoal = new Vector3();
  let snapCamera = true;
  let last = performance.now();

  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!drift.ended) {
      drift = stepDrift(drift, cfg, dt);
      limits.at(drift.s, bounds);
      steer = stepSteerBetween(steer, input.axis, dt, -bounds.right, bounds.left);
      if (drift.ended) ui.showEnd(true);
    }
    const s = drift.s;
    terrain.update(s, now / 1000);

    const level = waterLevelAt(manifest, s);
    const p = toWorld(route, s, steer.d, level + 0.15 + Math.sin(now / 700) * 0.06);
    raft.position.set(p.x, p.y, p.z);
    raft.rotation.y = worldYawAt(route, s) + (steer.v / 8) * 0.25;
    raft.rotation.x = (steer.v / 8) * 0.08;

    const cam = toWorld(route, s - 20, steer.d * 0.6, waterLevelAt(manifest, s - 20) + 9);
    const look = toWorld(route, s + 30, steer.d * 0.6, waterLevelAt(manifest, s + 30) + 1);
    const k = snapCamera ? 1 : 1 - Math.exp(-5 * dt);
    snapCamera = false;
    camPos.lerp(camGoal.set(cam.x, cam.y, cam.z), k);
    camLook.lerp(lookGoal.set(look.x, look.y, look.z), k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sky.update(camera);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(frame);

  return {
    get s() {
      return drift.s;
    },
    get d() {
      return steer.d;
    },
    get ended() {
      return drift.ended;
    },
    get chunkCount() {
      return terrain.chunkCount;
    },
  };
}
