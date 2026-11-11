import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Fog,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  WebGLRenderer,
} from 'three';
import { clampPixelRatio, computeAspect } from './viewport';

const SKY = new Color(0x9fd3ee);

const scene = new Scene();
scene.background = SKY;
scene.fog = new Fog(SKY, 30, 120);

const camera = new PerspectiveCamera(60, computeAspect(innerWidth, innerHeight), 0.1, 500);
camera.position.set(6, 5, 10);
camera.lookAt(0, 0.5, 0);

const ground = new Mesh(
  new PlaneGeometry(200, 200),
  new MeshStandardMaterial({ color: 0x4f9d69 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const box = new Mesh(new BoxGeometry(2, 1, 3), new MeshStandardMaterial({ color: 0xe8743b }));
box.position.y = 0.5;
scene.add(box);

scene.add(new AmbientLight(0xffffff, 0.6));
const sun = new DirectionalLight(0xffffff, 1.8);
sun.position.set(10, 20, 8);
scene.add(sun);

const renderer = new WebGLRenderer({ antialias: true });
document.body.appendChild(renderer.domElement);

function resize(): void {
  renderer.setPixelRatio(clampPixelRatio(devicePixelRatio));
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = computeAspect(innerWidth, innerHeight);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((t) => {
  box.rotation.y = t / 2000;
  renderer.render(scene, camera);
});
