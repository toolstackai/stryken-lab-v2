// Mapa de entorno procedural (cielo + suelo) para reflejos e iluminación ambiental suave.
import * as THREE from 'three';

const cache = new Map();
export function makeEnv(renderer, top, horizon, ground, key) {
  const k = key || top + horizon + ground;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, top); gr.addColorStop(0.47, horizon); gr.addColorStop(0.53, ground); gr.addColorStop(1, ground);
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 16, 12), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide })));
  // un "sol" brillante para reflejos especulares
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  sun.position.set(-4, 7, -3); scene.add(sun);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.03);
  pm.dispose();
  cache.set(k, rt.texture);
  return rt.texture;
}
