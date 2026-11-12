/** Stylised water: depth tint, flow streaks scrolling along the current and a foam band where the water meets the bank.
 * One ShaderMaterial shared by every chunk; the only per-frame work is writing `uTime`. */
import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';

const VERT = `
attribute vec2 aFlow;
attribute float aDepth;
varying vec2 vFlow;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vFlow = aFlow;
  vDepth = aDepth;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = `
uniform float uTime;
uniform vec3 uShallow;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uGlint;
varying vec2 vFlow;
varying float vDepth;
#include <fog_pars_fragment>
void main() {
  float deep = smoothstep(0.1, 1.4, vDepth);
  vec3 col = mix(uShallow, uDeep, deep);
  // Streaks travel with the current (increasing route distance); the lateral term bends them.
  float w1 = sin(vFlow.x * 0.45 - uTime * 1.7 + sin(vFlow.y * 0.3) * 2.4);
  float w2 = sin(vFlow.x * 0.95 - uTime * 2.6 + vFlow.y * 0.55 + 1.7);
  float streak = smoothstep(0.93, 0.99, 0.6 * w1 + 0.4 * w2);
  col = mix(col, uGlint, streak * 0.16);
  // Foam where the water gets shallow, with a slowly drifting wobble on its edge.
  float wobble = 0.22 * sin(vFlow.x * 1.3 - uTime * 1.4 + vFlow.y * 0.8);
  float foam = 1.0 - smoothstep(0.0, 0.45 + wobble * 0.5, vDepth);
  col = mix(col, uFoam, foam * 0.9);
  gl_FragColor = vec4(col, mix(0.8, 0.97, max(foam, deep)));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function createWaterMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uShallow: { value: new Color(0x3fae98) },
        uDeep: { value: new Color(0x0b5568) },
        uFoam: { value: new Color(0xeef2e6) },
        uGlint: { value: new Color(0x8fd2c6) },
      },
    ]),
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
  });
}
