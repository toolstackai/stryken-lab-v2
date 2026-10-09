// Armas modeladas en Blender (assets/models/*.glb), en el mismo marco que las piezas por código:
//   x derecha, y arriba, cañón hacia -z, metros. Cada malla lleva el nombre de su material del juego
//   (body / metal / wood / grip / accent) para que los aspectos (camuflajes) sigan funcionando, y las piezas
//   animadas (mag, bolt, slide, pump…) son nodos propios con el origen en su posición de reposo.
// Si un modelo no existe o falla al cargar, makeGun usa las piezas por código: el juego nunca se rompe.
// Cómo se hacen: skill .claude/skills/stryken-asset
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// la lista sale de assets/models/manifest.json (la escribe export() de la skill); ésta es la de reserva
export const GUN_MODELS = { akr: 'assets/models/akr.glb', brute: 'assets/models/brute.glb' };
export const ANIM_PARTS = ['mag', 'bolt', 'slide', 'pump', 'drum'];
const loaded = {};

// ?models=code fuerza las armas por código (para comparar)
const forceCode = typeof location !== 'undefined' && new URLSearchParams(location.search).get('models') === 'code';

// three.js quita el punto de los nombres: el 'mag.001' de Blender llega como 'mag001'
const animName = (n) => ANIM_PARTS.find(p => n.startsWith(p) && /^([._\d]|$)/.test(n.slice(p.length))) || null;
const matName = (m) => ((m && m.name) || 'body').split('.')[0];

// Cada nodo de primer nivel → { name|null, pos/quat/scale del nodo, meshes: [{ geo, mat, matrix local al nodo }] }.
// Un nodo con varios materiales llega como grupo con varias mallas: hay que moverlas juntas (p. ej. la corredera).
function parse(scene) {
  const out = [];
  scene.updateMatrixWorld(true);
  for (const node of scene.children) {
    const inv = node.matrixWorld.clone().invert(), meshes = [];
    node.traverse(o => {
      if (!o.isMesh) return;
      o.geometry.userData.shared = true; // la comparten todas las copias del arma
      meshes.push({ geo: o.geometry, mat: matName(o.material), matrix: inv.clone().multiply(o.matrixWorld) });
    });
    if (meshes.length) out.push({ name: animName(node.name), pos: node.position.clone(), quat: node.quaternion.clone(), scale: node.scale.clone(), meshes });
  }
  return out;
}

export async function preloadGunModels() {
  if (forceCode) return;
  const loader = new GLTFLoader();
  let list = GUN_MODELS;
  try {
    const mf = await (await fetch('assets/models/manifest.json', { cache: 'no-store' })).json();
    list = Object.fromEntries(mf.models.map(id => [id, `assets/models/${id}.glb`]));
  } catch (e) { /* sin manifiesto: lista de reserva */ }
  await Promise.all(Object.entries(list).map(async ([id, url]) => {
    try { loaded[id] = parse((await loader.loadAsync(url)).scene); }
    catch (e) { console.warn('modelo de arma no cargado:', id, e); }
  }));
}

export const gunModel = (id) => loaded[id] || null;

// Monta las piezas del modelo en el grupo del arma. Devuelve las piezas animadas por nombre.
const _m = new THREE.Matrix4();
export function mountGunModel(g, parts, mats, shadows) {
  const named = {};
  for (const p of parts) {
    const node = new THREE.Matrix4().compose(p.pos, p.quat, p.scale);
    if (p.name) {
      // pieza animada: un grupo con origen en su posición de reposo
      const grp = new THREE.Group(); grp.name = p.name;
      grp.position.copy(p.pos); grp.quaternion.copy(p.quat); grp.scale.copy(p.scale);
      for (const m of p.meshes) {
        const mesh = new THREE.Mesh(m.geo, mats[m.mat] || mats.body);
        m.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); mesh.castShadow = shadows; grp.add(mesh);
      }
      grp.userData.home = grp.position.clone(); grp.userData.homeRot = grp.rotation.clone();
      named[p.name] = grp; g.add(grp);
    } else for (const m of p.meshes) {
      const mesh = new THREE.Mesh(m.geo, mats[m.mat] || mats.body);
      _m.multiplyMatrices(node, m.matrix).decompose(mesh.position, mesh.quaternion, mesh.scale);
      mesh.castShadow = shadows; g.add(mesh);
    }
  }
  return named;
}
