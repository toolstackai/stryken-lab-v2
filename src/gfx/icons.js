// Íconos generados renderizando los modelos 3D propios: armas (color y silueta blanca) y miniaturas de mapas.
import * as THREE from 'three';
import { makeGun, makeSoldier, poseSoldier } from './models.js';
import { buildWorld } from './world.js';
import { buildMapData } from '../data/maps.js';
import { propModel } from './propmodels.js';

let r = null;
function renderer(w, h) {
  if (!r) {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
  }
  r.setPixelRatio(1); r.setSize(w, h, false);
  return r;
}

const cache = new Map();
// Devuelve { color, white } (dataURLs)
export function gunIcon(id, skin = 'factory') {
  const key = id + '|' + skin;
  if (cache.has(key)) return cache.get(key);
  const W = 320, H = 128;
  const rend = renderer(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.2));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(3, 4, 2); scene.add(d);
  const gun = makeGun(id, skin);
  scene.add(gun);
  const box = new THREE.Box3().setFromObject(gun), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const aspect = W / H, pad = 1.08;
  let hw = size.z / 2 * pad, hh = size.y / 2 * pad;
  if (hw / hh < aspect) hw = hh * aspect; else hh = hw / aspect;
  const cam = new THREE.OrthographicCamera(-hw, hw, hh, -hh, 0.01, 10);
  cam.position.set(c.x + 3, c.y, c.z); cam.lookAt(c);
  rend.setClearColor(0, 0);
  rend.render(scene, cam);
  const color = rend.domElement.toDataURL('image/png');
  // silueta blanca
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.drawImage(rend.domElement, 0, 0);
  g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
  const res = { color, white: cv.toDataURL('image/png') };
  cache.set(key, res);
  return res;
}

// V2: icono de un objeto modelado en Blender (vista 3/4 en perspectiva). null si el modelo no está.
const props = new Map();
export function propIcon(id, tint = null) {
  const key = id + JSON.stringify(tint);
  if (props.has(key)) return props.get(key);
  const m = propModel(id, tint); if (!m) return null;
  const W = 200, H = 140, rend = renderer(W, H), scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2.0));
  const d = new THREE.DirectionalLight(0xffffff, 2.6); d.position.set(2, 4, 3); scene.add(d);
  m.rotation.y = -0.6; scene.add(m);
  const box = new THREE.Box3().setFromObject(m), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const R = size.length() * 0.5;
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.01, 20);
  cam.position.set(c.x, c.y + R * 0.9, c.z + R * 3.2); cam.lookAt(c);
  rend.setClearColor(0, 0); rend.render(scene, cam);
  const url = rend.domElement.toDataURL('image/png');
  props.set(key, url); return url;
}

// Retrato del soldado con una skin (tarjetas de inventario/tienda)
const souls = new Map();
export function soldierIcon(skin) {
  if (souls.has(skin)) return souls.get(skin);
  const W = 180, H = 220;
  const rend = renderer(W, H);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdde8ff, 0x403830, 2.0));
  const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 3, 4); scene.add(d);
  const s = makeSoldier(skin, 'akr', 'factory', { relaxed: true });
  s.root.rotation.y = Math.PI - 0.45;
  poseSoldier(s, { moveSpeed: 0, phase: 0, crouch: 0, pitch: 0, dead: 0 });
  scene.add(s.root);
  const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 20);
  cam.position.set(0, 1.0, 3.7); cam.lookAt(0, 0.94, 0);
  rend.setClearColor(0, 0);
  rend.render(scene, cam);
  const url = rend.domElement.toDataURL('image/png');
  souls.set(skin, url);
  return url;
}

const thumbs = new Map();
export function mapThumb(id) {
  if (thumbs.has(id)) return thumbs.get(id);
  const W = 480, H = 270;
  const rend = renderer(W, H);
  rend.shadowMap.enabled = true;
  const map = buildMapData(id);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(map.fog.color, map.fog.near, map.fog.far);
  const { group } = buildWorld(map, scene, 'low');
  scene.add(group);
  scene.add(new THREE.HemisphereLight(map.hemi.sky, map.hemi.ground, map.hemi.i));
  const sun = new THREE.DirectionalLight(map.sun.color, map.sun.intensity); sun.position.set(...map.sun.dir).multiplyScalar(100); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  const views = { harbor: [[-30, 7, 36], [0, 1, 0]], foundry: [[-30, 6.5, -2], [5, 2, 0]], shrine: [[0, 3, -24], [0, 4, 0]] };
  const [p, l] = views[id] || [[0, 20, 30], [0, 0, 0]];
  cam.position.set(...p); cam.lookAt(...l);
  rend.render(scene, cam);
  const url = rend.domElement.toDataURL('image/jpeg', 0.85);
  group.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  rend.shadowMap.enabled = false;
  thumbs.set(id, url);
  return url;
}
