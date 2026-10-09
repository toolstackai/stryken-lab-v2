// Utilidades de geometría: cajas con UV en metros, y un "batcher" que une todo lo estático por material
// (pocas llamadas de dibujo = muchos FPS).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Caja centrada en (cx,cy,cz) con UV alineadas al mundo: las texturas continúan entre cajas vecinas.
export function worldBox(cx, cy, cz, w, h, d, texSize = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, cy, cz);
  const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    let u, v;
    if (nx > 0.5) { u = z * Math.sign(nor.getX(i)); v = y; }
    else if (ny > 0.5) { u = x; v = z; }
    else { u = x * -Math.sign(nor.getZ(i)); v = y; }
    uv.setXY(i, -u / texSize, v / texSize);
  }
  return g;
}

// Caja con UV 0..1 en cada cara (para texturas "de cara completa": cajas de madera, contenedores...).
export function faceBox(w, h, d) { return new THREE.BoxGeometry(w, h, d); }

// Cuña (rampa) maciza: sube hacia `dir` ('+x','-x','+z','-z'). Base en y=0, centrada en x/z.
export function wedge(w, h, d, dir, texSize = 2) {
  // perfil en el plano (s, y) con s a lo largo de la subida
  const L = dir[1] === 'x' ? w : d, Wd = dir[1] === 'x' ? d : w;
  const sh = new THREE.Shape();
  sh.moveTo(-L / 2, 0); sh.lineTo(L / 2, 0); sh.lineTo(L / 2, h); sh.lineTo(-L / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Wd, bevelEnabled: false });
  g.translate(0, 0, -Wd / 2);
  const sign = dir[0] === '+' ? 1 : -1;
  if (dir[1] === 'x') { if (sign < 0) g.rotateY(Math.PI); }
  else { g.rotateY(sign > 0 ? -Math.PI / 2 : Math.PI / 2); }
  g.computeVertexNormals();
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + pos.getZ(i)) / texSize, pos.getY(i) / texSize + pos.getZ(i) / texSize * 0.3);
  return g.index ? g.toNonIndexed() : g;
}

// Junta geometrías por material. add(geo, material, matrix?) y luego build(parent).
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(geo, mat, matrix, opts = {}) {
    if (matrix) geo.applyMatrix4(matrix);
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    const key = mat.uuid + (opts.noShadow ? '_ns' : '');
    let e = this.groups.get(key);
    if (!e) this.groups.set(key, e = { mat, geos: [], opts });
    e.geos.push(g);
  }
  // Atajo: caja alineada al mundo.
  box(cx, cy, cz, w, h, d, mat, texSize, opts) { this.add(worldBox(cx, cy, cz, w, h, d, texSize ?? mat.userData.texSize ?? 2), mat, null, opts); }
  build(parent) {
    const meshes = [];
    for (const e of this.groups.values()) {
      for (let i = 0; i < e.geos.length; i += 400) {
        const merged = mergeGeometries(e.geos.slice(i, i + 400), false);
        const m = new THREE.Mesh(merged, e.mat);
        m.castShadow = !e.opts.noShadow; m.receiveShadow = true;
        m.matrixAutoUpdate = false; m.updateMatrix();
        parent.add(m); meshes.push(m);
      }
      e.geos.forEach(g => g.dispose());
    }
    this.groups.clear();
    return meshes;
  }
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export function trs(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
}
