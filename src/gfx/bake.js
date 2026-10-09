// "Horneado" de modelos: fusiona las piezas que se mueven juntas en una sola malla para bajar draw calls.
// Cada grupo (hueso) del soldado tenía 4–10 piezas con materiales de color liso; aquí se convierten en UNA malla
// con color por vértice (mismo aspecto, mismo esqueleto/animación, muchas menos llamadas de dibujo y de sombra).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// material compartido por todas las piezas horneadas con color liso (un solo programa de shader)
export const BAKED_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, flatShading: true });

// ¿Se puede pasar a color por vértice sin cambiar el aspecto? (sin textura, opaco, sin brillo propio, mate)
function colorOnly(m) {
  return !!m && m.isMeshStandardMaterial && !m.map && !m.transparent && m.metalness < 0.35 && m.roughness >= 0.4
    && (m.emissiveIntensity === 0 || m.emissive.getHex() === 0) && m.side === THREE.FrontSide;
}

function prepGeo(mesh, withColor) {
  mesh.updateMatrix();
  const src = mesh.geometry;
  const g = src.index ? src.toNonIndexed() : src.clone();
  g.applyMatrix4(mesh.matrix);
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (withColor) {
    const c = mesh.material.color, arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  }
  g.morphAttributes = {};
  return g;
}

// Fusiona las mallas hijas DIRECTAS de un grupo. opts.skip(mesh) → no tocar (piezas animadas, etc.)
export function bakeGroup(group, { shadow = null, skip = null } = {}) {
  const kids = group.children.filter(c => c.isMesh && !c.isSkinnedMesh && c.visible && !(skip && skip(c)));
  if (kids.length < 2) return 0;
  const buckets = new Map();
  for (const m of kids) {
    const key = colorOnly(m.material) ? '#vc' : m.material.uuid;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(m);
  }
  let saved = 0;
  for (const [key, list] of buckets) {
    if (list.length < 2) continue;
    const vc = key === '#vc';
    const geo = mergeGeometries(list.map(m => prepGeo(m, vc)), false);
    if (!geo) continue;
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, vc ? BAKED_MAT : list[0].material);
    mesh.castShadow = shadow ?? list.some(m => m.castShadow);
    mesh.receiveShadow = list.some(m => m.receiveShadow);
    mesh.renderOrder = list[0].renderOrder;
    mesh.userData.baked = true;
    for (const m of list) group.remove(m);
    group.add(mesh);
    saved += list.length - 1;
  }
  return saved;
}

// Hornea todos los grupos de un árbol (cada grupo por separado, para no romper la animación por huesos)
export function bakeTree(root, opts = {}) {
  const groups = [];
  root.traverse(o => { if (!o.isMesh && o.children.length) groups.push(o); });
  let saved = 0;
  for (const g of groups) saved += bakeGroup(g, opts);
  return saved;
}

// Al descartar un modelo: libera su geometría propia (horneada o creada para él) y los materiales marcados como suyos.
// Las geometrías de las cachés (userData.shared) y los materiales compartidos no se tocan.
export function disposeTree(root) {
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) if (m && m.userData.own) m.dispose();
  });
}
