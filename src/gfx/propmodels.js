// Objetos de equipo modelados en Blender (V2): assets/props/*.glb, listados en assets/props/manifest.json.
// A diferencia de las armas, llevan sus propios colores (materiales del .glb). Si falta uno, el juego usa la
// versión por código (nunca se rompe). Cómo se hacen: .claude/skills/stryken-asset/scripts/prop_lib.py
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loaded = {};
const forceCode = typeof location !== 'undefined' && new URLSearchParams(location.search).get('models') === 'code';

export async function preloadProps() {
  if (forceCode) return;
  let ids = [];
  try { ids = (await (await fetch('assets/props/manifest.json', { cache: 'no-store' })).json()).props || []; } catch (e) { return; }
  const loader = new GLTFLoader();
  await Promise.all(ids.map(async (id) => {
    try {
      const scene = (await loader.loadAsync(`assets/props/${id}.glb`)).scene;
      scene.traverse(o => {
        if (!o.isMesh) return;
        o.geometry.userData.shared = true;
        o.material.userData.prop = true;
        o.material.flatShading = false;
      });
      loaded[id] = scene;
    } catch (e) { console.warn('prop no cargado:', id, e); }
  }));
}

export const hasProp = (id) => !!loaded[id];

// Copia (comparte geometría). tint = { materialName: color } cambia el color de ese material (p. ej. la tela del chaleco)
const tinted = {};
export function propModel(id, tint = null) {
  const src = loaded[id]; if (!src) return null;
  const g = src.clone(true);
  if (tint) g.traverse(o => {
    if (!o.isMesh) return;
    const name = (o.material.name || '').split('.')[0];
    if (tint[name] == null) return;
    const k = id + name + tint[name];
    if (!tinted[k]) { tinted[k] = o.material.clone(); tinted[k].color.set(tint[name]); }
    o.material = tinted[k];
  });
  return g;
}
