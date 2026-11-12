/** Scene look: toon gradient, lights, fog and the sky dome. Three.js glue; colours come from palette.ts. */
import {
  BackSide,
  Color,
  DataTexture,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  NearestFilter,
  RedFormat,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Camera,
} from 'three';
import { FOG_COLOR, SKY_HORIZON, SKY_ZENITH } from './palette';
import type { Rgb } from './biomes';

const toColor = ([r, g, b]: Rgb) => new Color().setRGB(r, g, b, SRGBColorSpace);

let gradient: DataTexture | null = null;

/** Shared 4-step lighting ramp for MeshToonMaterial (4x1, nearest filtering, generated in code). */
export function toonGradient(): DataTexture {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([62, 135, 205, 255]), 4, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}

const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 uHorizon;
uniform vec3 uZenith;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(h, 0.55));
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export interface Look {
  /** Keep the sky dome centred on the camera. Allocation free. */
  update(camera: Camera): void;
  dispose(): void;
}

/** Adds lights, fog and the sky dome to `scene`. Fog uses the horizon colour so far terrain melts into the sky. */
export function setupLook(scene: Scene): Look {
  const horizon = toColor(SKY_HORIZON);
  scene.fog = new Fog(toColor(FOG_COLOR), 430, 1050);
  // Cool sky light fills the shadow side; the warm sun gives the lit bands their colour.
  scene.add(new HemisphereLight(0x8fb4f0, 0x9a8466, 0.85));
  const sun = new DirectionalLight(0xffd08c, 3.2);
  sun.position.set(-200, 330, 150);
  scene.add(sun);

  const skyGeo = new SphereGeometry(1000, 24, 12);
  const skyMat = new ShaderMaterial({
    uniforms: { uHorizon: { value: horizon }, uZenith: { value: toColor(SKY_ZENITH) } },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const sky = new Mesh(skyGeo, skyMat);
  sky.renderOrder = -1000;
  sky.frustumCulled = false;
  scene.add(sky);

  return {
    update(camera) {
      sky.position.copy(camera.position);
    },
    dispose() {
      skyGeo.dispose();
      skyMat.dispose();
    },
  };
}
