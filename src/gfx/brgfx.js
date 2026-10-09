// Gráficos del Battle Royale: avión de transporte, paracaídas, muro de la zona y modelos de botín con su brillo de rareza.
import * as THREE from 'three';
import { propModel, hasProp } from './propmodels.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { stdMat, makeGun } from './models.js';
import { bakeTree } from './bake.js';
import { RARITY } from '../data/cosmetics.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
function merged(parts) { // [geo, matrix][] → una geometría
  const gs = parts.map(([g, m]) => { const c = (g.index ? g.toNonIndexed() : g.clone()); c.applyMatrix4(m); for (const k of Object.keys(c.attributes)) if (k !== 'position' && k !== 'normal') c.deleteAttribute(k); return c; });
  const r = mergeGeometries(gs, false); r.userData.shared = true; return r;
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), V(sx, sy, sz));

// ---------- avión de carga (morro hacia -Z) ----------
export function makePlane() {
  const g = new THREE.Group();
  const body = stdMat(0x5d6670, { roughness: 0.6, metalness: 0.25 }), dark = stdMat(0x2b3036, { roughness: 0.5, metalness: 0.4 });
  const cyl = (r1, r2, h, s = 14) => new THREE.CylinderGeometry(r1, r2, h, s);
  const hull = merged([
    [cyl(2.6, 2.6, 26), M4(0, 0, 0, Math.PI / 2)],
    [cyl(0.4, 2.6, 7), M4(0, 0, -16.5, -Math.PI / 2)],          // morro
    [cyl(2.6, 1.0, 9), M4(0, 1.0, 17.5, -Math.PI / 2)],         // cola
    [new THREE.BoxGeometry(46, 0.6, 6), M4(0, 2.0, -2)],        // alas
    [new THREE.BoxGeometry(14, 0.4, 3.5), M4(0, 3.2, 20)],      // estabilizador
    [new THREE.BoxGeometry(0.5, 7, 4.5), M4(0, 6, 20, 0.2)],    // deriva
  ]);
  g.add(new THREE.Mesh(hull, body));
  const eng = merged([-15, -8, 8, 15].map(x => [cyl(1.0, 1.1, 4.2, 12), M4(x, 0.9, -4, Math.PI / 2)]));
  g.add(new THREE.Mesh(eng, dark));
  const win = new THREE.Mesh(merged([[new THREE.BoxGeometry(3.4, 1.1, 1.2), M4(0, 1.2, -19.3, -0.5)]]), stdMat(0x1c2a38, { roughness: 0.1, metalness: 0.7 }));
  g.add(win);
  // hélices (giran)
  g.userData.props = [-15, -8, 8, 15].map(x => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.25, 0.12), dark); p.position.set(x, 0.9, -6.2); g.add(p); return p;
  });
  // luces de posición
  const red = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); red.position.set(-23, 2, -2); g.add(red);
  const grn = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0x20ff60 })); grn.position.set(23, 2, -2); g.add(grn);
  g.traverse(o => { if (o.isMesh) o.castShadow = false; });
  return g;
}

// ---------- paracaídas (se abre escalando; geometrías y materiales compartidos) ----------
let _canopy = null, _lines = null, _lineMat = null, _white = null;
const _chuteMats = {};
export function makeChute(color = 0xe85a2a) {
  if (!_canopy) {
    _canopy = new THREE.SphereGeometry(3.4, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.32); _canopy.scale(1.25, 0.55, 0.9); _canopy.userData.shared = true;
    const pts = []; for (const [x, z] of [[-3.6, -2.2], [3.6, -2.2], [-3.6, 2.2], [3.6, 2.2], [0, -2.9], [0, 2.9]]) pts.push(0, -0.6, 0, x, 3.2, z);
    _lines = new THREE.BufferGeometry(); _lines.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); _lines.userData.shared = true;
    _lineMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.6 });
    _white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.85, side: THREE.DoubleSide, flatShading: true });
  }
  const cm = _chuteMats[color] || (_chuteMats[color] = new THREE.MeshStandardMaterial({ color, roughness: 0.85, side: THREE.DoubleSide, flatShading: true }));
  const g = new THREE.Group();
  const canopy = new THREE.Mesh(_canopy, cm); canopy.position.y = 2.6; canopy.castShadow = true; g.add(canopy);
  const stripes = new THREE.Mesh(_canopy, _white); stripes.position.y = 2.62; stripes.scale.set(0.5, 1.01, 1.01); g.add(stripes);
  g.add(new THREE.LineSegments(_lines, _lineMat));
  return g;
}

// ---------- muro de la zona ----------
const ZONE_VS = `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ZONE_FS = `uniform float uTime; varying vec2 vUv; varying vec3 vW;
  float hash(float n){ return fract(sin(n) * 43758.5453); }
  void main(){
    float h = vW.y;
    float a = vUv.x * 6.2831853;
    // franjas diagonales que suben + vetas verticales que parpadean
    float diag = 0.5 + 0.5 * sin(vUv.x * 1400.0 + h * 0.35 - uTime * 3.0);
    float cell = floor(vUv.x * 260.0);
    float vein = step(0.86, hash(cell)) * (0.5 + 0.5 * sin(uTime * (2.0 + hash(cell + 7.0) * 4.0) + h * 0.08));
    float fade = smoothstep(170.0, 30.0, h) * smoothstep(-2.0, 0.5, h);
    float base = exp(-max(h, 0.0) * 0.35);                 // línea brillante donde toca el suelo
    float pulse = 0.85 + 0.15 * sin(uTime * 2.2);
    vec3 c = mix(vec3(0.45, 0.10, 0.95), vec3(1.0, 0.35, 0.85), diag * 0.6 + vein * 0.4);
    c += vec3(1.0, 0.75, 1.0) * base * 0.8;
    float al = (0.2 + diag * 0.12 + vein * 0.22) * fade * pulse + base * 0.75;
    gl_FragColor = vec4(c, al);
  }`;
export function makeZoneWall() {
  const geo = new THREE.CylinderGeometry(1, 1, 200, 128, 1, true); geo.translate(0, 100, 0);
  const mat = new THREE.ShaderMaterial({ vertexShader: ZONE_VS, fragmentShader: ZONE_FS, uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = 5;
  return m;
}

// ---------- botín ----------
const gearGeo = {};
function gearMesh(id) {
  // V2: modelos de Blender (el chaleco se tiñe con el color de su nivel)
  const pid = id.startsWith('armor') ? 'vest' : id === 'bandage' || id === 'medkit' ? id : 'ammo';
  if (hasProp(pid)) {
    const tint = id.startsWith('armor') ? { cloth: id === 'armor1' ? 0x7d8a5e : id === 'armor2' ? 0x4a6fa8 : 0x7a52b8 } : null;
    const g = new THREE.Group(), m = propModel(pid, tint);
    if (pid === 'vest') { m.scale.setScalar(0.85); m.rotation.x = -0.25; }
    else m.scale.setScalar(pid === 'bandage' ? 1.6 : 1.15);
    g.add(m); return g;
  }
  if (!gearGeo[id]) {
    let parts, color;
    if (id.startsWith('armor')) {
      color = id === 'armor1' ? 0x6f7a5a : id === 'armor2' ? 0x3d5a8a : 0x5a3d8a;
      parts = [[new THREE.BoxGeometry(0.46, 0.5, 0.14), M4(0, 0.3, 0)], [new THREE.BoxGeometry(0.12, 0.16, 0.16), M4(-0.14, 0.62, 0)], [new THREE.BoxGeometry(0.12, 0.16, 0.16), M4(0.14, 0.62, 0)], [new THREE.BoxGeometry(0.36, 0.1, 0.16), M4(0, 0.16, 0.02)]];
    } else if (id === 'bandage') { color = 0xeeeae0; parts = [[new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), M4(-0.08, 0.1, 0, 0, 0, Math.PI / 2)], [new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), M4(0.12, 0.1, 0.06, 0, 0.6, Math.PI / 2)]]; }
    else if (id === 'medkit') { color = 0xd8302a; parts = [[new THREE.BoxGeometry(0.46, 0.26, 0.32), M4(0, 0.13, 0)], [new THREE.BoxGeometry(0.16, 0.06, 0.08), M4(0, 0.3, 0)]]; }
    else { color = 0x55663a; parts = [[new THREE.BoxGeometry(0.44, 0.24, 0.26), M4(0, 0.12, 0)], [new THREE.BoxGeometry(0.2, 0.04, 0.06), M4(0, 0.26, 0)]]; }
    gearGeo[id] = { geo: merged(parts), color };
  }
  const { geo, color } = gearGeo[id];
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, stdMat(color, { roughness: 0.6 })));
  if (id === 'medkit') { const c = new THREE.Mesh(crossGeo(), stdMat(0xffffff, { roughness: 0.5 })); c.position.set(0, 0.13, 0.162); g.add(c); }
  return g;
}
let _cross = null;
function crossGeo() { if (!_cross) { _cross = merged([[new THREE.BoxGeometry(0.16, 0.05, 0.01), M4(0, 0, 0)], [new THREE.BoxGeometry(0.05, 0.16, 0.01), M4(0, 0, 0)]]); } return _cross; }

const ringGeo = (() => { const g = new THREE.RingGeometry(0.45, 0.75, 32).rotateX(-Math.PI / 2); g.userData.shared = true; return g; })();
const beamGeo = (() => { const g = new THREE.CylinderGeometry(0.18, 0.32, 9, 10, 1, true); g.translate(0, 4.5, 0); g.userData.shared = true; return g; })();
const glowMats = {};
function glowMat(rarity, kind) {
  const k = rarity + kind;
  if (!glowMats[k]) {
    const c = new THREE.Color(RARITY[rarity].color);
    glowMats[k] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: kind === 'ring' ? 0.55 : 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  }
  return glowMats[k];
}

// Modelo de un objeto de botín en el suelo: arma o equipo + anillo (y haz si es épico/legendario).
// Se construye UNA vez por tipo y luego se clona (los clones comparten geometría y materiales: crearlos es casi gratis).
const protos = {};
function buildLoot(entry) {
  const g = new THREE.Group();
  let model;
  if (entry.type === 'weapon') {
    const gun = makeGun(entry.id, 'factory', { shadows: false });
    bakeTree(gun, { shadow: false, skip: (m) => !!m.userData.keep });
    gun.rotation.set(0, 0, Math.PI / 2); gun.position.y = 0.25;
    model = new THREE.Group(); model.add(gun);
  } else model = gearMesh(entry.id);
  g.add(model);
  const ring = new THREE.Mesh(ringGeo, glowMat(entry.rarity, 'ring')); ring.position.y = 0.03; g.add(ring);
  if (entry.rarity === 'epic' || entry.rarity === 'legendary') g.add(new THREE.Mesh(beamGeo, glowMat(entry.rarity, 'beam')));
  // clone() copia userData con JSON: sin referencias a objetos; geometrías horneadas = compartidas (nunca se liberan)
  g.traverse(o => { o.userData = {}; o.castShadow = false; if (o.geometry) o.geometry.userData.shared = true; });
  return g;
}
export function lootModel(entry) {
  const k = entry.type === 'weapon' ? 'w:' + entry.id : 'i:' + entry.id + ':' + entry.rarity;
  if (!protos[k]) protos[k] = buildLoot(entry);
  return protos[k].clone();
}
