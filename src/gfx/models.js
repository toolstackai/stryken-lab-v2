// Modelos low-poly originales: armas, soldados y brazos de primera persona. Todo hecho con primitivas.
import * as THREE from 'three';
import { camoTexture, shade } from './textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CHAR_SKINS, WEAPON_SKINS } from '../data/cosmetics.js';
import { buildOptic, opticAxis, buildIrons } from './optics.js';
import { bakeTree, bakeGroup, disposeTree } from './bake.js';
import { gunModel, mountGunModel } from './gunmodels.js';

const matCache = new Map();
export function stdMat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, flatShading: true, ...opts }));
  return matCache.get(key);
}

// ---------------- ARMAS ----------------
// Partes: t: 'b' caja | 'c' cilindro a lo largo de Z | 'blade' hoja de cuchillo. p posición, s tamaño, r rotación, m material.
// Origen = agarre de la mano derecha aprox. El cañón apunta a -Z.
const B = (p, s, m, r, name) => ({ t: 'b', p, s, m, r, name });
const C = (p, rad, len, m, name, seg = 8) => ({ t: 'c', p, s: [rad, len], m, name, seg });
const CX = (p, rad, len, m, name) => ({ t: 'cx', p, s: [rad, len], m, name });

export const GUN_PARTS = {
  akr: {
    parts: [
      B([0, 0.02, -0.06], [0.06, 0.085, 0.42], 'body'), B([0, 0.072, -0.04], [0.054, 0.028, 0.34], 'metal'),
      B([0, 0.0, -0.37], [0.068, 0.072, 0.2], 'wood'), B([0, 0.058, -0.37], [0.042, 0.036, 0.22], 'wood'),
      C([0, 0.035, -0.6], 0.012, 0.28, 'metal'), C([0, 0.035, -0.75], 0.019, 0.06, 'metal'),
      B([0, -0.075, 0.06], [0.042, 0.115, 0.055], 'grip', [0.38, 0, 0]), B([0, -0.035, -0.02], [0.012, 0.03, 0.09], 'metal'),
      B([0, -0.115, -0.14], [0.046, 0.18, 0.078], 'metal', [-0.38, 0, 0], 'mag'),
      B([0, -0.02, 0.31], [0.046, 0.085, 0.3], 'wood', [0.12, 0, 0]), B([0, -0.045, 0.46], [0.052, 0.13, 0.03], 'grip', [0.12, 0, 0]),
    ],
    hands: { r: [0, -0.07, 0.06], l: [0, -0.005, -0.38] }, muzzle: [0, 0.035, -0.79], sightY: 0.1, len: 0.95,
    irons: { y: 0.106, rear: { type: 'notch', z: -0.21, base: 0.086 }, front: { type: 'post', z: -0.64, base: 0.047 }, dots: 'tritium', relief: 0.4 },
  },
  brute: {
    parts: [
      B([0, 0.02, -0.02], [0.062, 0.085, 0.3], 'body'), C([0, 0.052, -0.47], 0.017, 0.62, 'metal'),
      C([0, 0.006, -0.42], 0.016, 0.5, 'metal'), B([0, 0.004, -0.4], [0.074, 0.064, 0.2], 'wood', null, 'pump'),
      B([0, -0.02, 0.3], [0.052, 0.095, 0.32], 'wood', [0.1, 0, 0]), B([0, -0.065, 0.09], [0.042, 0.1, 0.05], 'wood', [0.45, 0, 0]),
      B([0, -0.03, -0.02], [0.012, 0.03, 0.09], 'metal'),
      B([0, -0.045, 0.46], [0.058, 0.13, 0.03], 'grip', [0.1, 0, 0]), B([0.033, 0.03, -0.03], [0.005, 0.03, 0.12], 'metal'),
    ],
    hands: { r: [0, -0.065, 0.09], l: [0, -0.005, -0.4] }, muzzle: [0, 0.052, -0.79], sightY: 0.085, len: 1.0,
    irons: { y: 0.078, rear: { type: 'none' }, front: { type: 'bead', z: -0.765, base: 0.069 }, ribFrom: -0.17, relief: 0.33 },
  },
  longbow: {
    parts: [
      B([0, 0.02, 0], [0.062, 0.085, 0.36], 'body'), C([0, 0.035, -0.55], 0.014, 0.66, 'metal'), C([0, 0.035, -0.9], 0.023, 0.08, 'metal'),
      B([0, 0.0, 0.33], [0.06, 0.11, 0.36], 'body', [0.05, 0, 0]), B([0, 0.065, 0.3], [0.05, 0.03, 0.2], 'body'),
      B([0, -0.075, 0.09], [0.042, 0.115, 0.055], 'grip', [0.38, 0, 0]), B([0, 0.012, -0.31], [0.072, 0.075, 0.26], 'body'),
      B([0.055, 0.045, 0.1], [0.06, 0.016, 0.016], 'metal', null, 'bolt'), B([0, -0.06, -0.08], [0.052, 0.06, 0.1], 'metal', null, 'mag'),
      B([0, -0.035, 0.01], [0.012, 0.03, 0.08], 'metal'), B([0, -0.03, 0.5], [0.064, 0.15, 0.03], 'grip'),
    ],
    hands: { r: [0, -0.075, 0.09], l: [0, -0.005, -0.32] }, muzzle: [0, 0.035, -0.95], sightY: 0.125, len: 1.2,
    optic: { type: 'scope', at: [0, 0.07, -0.05], r: 0.021, len: 0.3, objR: 0.036, ocR: 0.03, mag: 4.5, reticle: 'duplex', color: 0xff2a2a },
  },
  talon: {
    parts: [
      B([0, 0.02, 0.06], [0.072, 0.125, 0.56], 'body'), B([0, 0.092, -0.06], [0.03, 0.02, 0.32], 'metal'),
      C([0, 0.035, -0.32], 0.014, 0.2, 'metal'), C([0, 0.035, -0.43], 0.02, 0.05, 'metal'), B([0, 0.025, -0.26], [0.078, 0.095, 0.14], 'body'),
      B([0, -0.075, -0.1], [0.042, 0.11, 0.05], 'grip', [0.3, 0, 0]), B([0, -0.08, 0.14], [0.046, 0.14, 0.07], 'metal', [-0.2, 0, 0], 'mag'),
      B([0.038, 0.02, 0.02], [0.004, 0.05, 0.3], 'accent'), B([-0.038, 0.02, 0.02], [0.004, 0.05, 0.3], 'accent'),
      B([0, -0.03, 0.33], [0.06, 0.12, 0.03], 'grip'),
    ],
    hands: { r: [0, -0.075, -0.1], l: [0, 0.0, -0.27] }, muzzle: [0, 0.035, -0.46], sightY: 0.128, len: 0.85,
    optic: { type: 'holo', at: [0, 0.102, -0.07], color: 0xff3b30 },
  },
  viper: {
    parts: [
      B([0, 0.025, -0.06], [0.052, 0.07, 0.36], 'body'), B([0, 0.022, -0.3], [0.058, 0.062, 0.14], 'body'),
      C([0, 0.028, -0.4], 0.011, 0.08, 'metal'), B([0, -0.1, -0.14], [0.034, 0.16, 0.052], 'metal', [-0.28, 0, 0], 'mag'),
      B([0, -0.062, 0.07], [0.04, 0.105, 0.05], 'grip', [0.32, 0, 0]), B([0, 0.01, 0.24], [0.03, 0.03, 0.22], 'metal'),
      B([0, -0.015, 0.36], [0.05, 0.085, 0.022], 'metal'), 
      B([0, -0.03, -0.01], [0.01, 0.025, 0.07], 'metal'),
      B([0.03, 0.04, -0.12], [0.006, 0.02, 0.1], 'accent'),
    ],
    hands: { r: [0, -0.062, 0.07], l: [0, 0.0, -0.3] }, muzzle: [0, 0.028, -0.45], sightY: 0.088, len: 0.75,
    irons: { y: 0.08, rear: { type: 'peep', z: 0.04, base: 0.06 }, front: { type: 'post', z: -0.31, base: 0.053 }, dots: 'tritium', relief: 0.11 },
  },
  scout: {
    parts: [
      B([0, 0.05, -0.06], [0.062, 0.062, 0.52], 'body'), B([0, -0.005, 0.0], [0.056, 0.062, 0.26], 'body'),
      B([0, 0.09, -0.06], [0.026, 0.016, 0.46], 'metal'), C([0, 0.05, -0.39], 0.013, 0.2, 'metal'), C([0, 0.05, -0.51], 0.02, 0.05, 'metal'),
      B([0, -0.095, -0.06], [0.04, 0.15, 0.072], 'metal', [-0.12, 0, 0], 'mag'), B([0, -0.07, 0.08], [0.042, 0.115, 0.055], 'grip', [0.36, 0, 0]),
      B([0, 0.025, 0.31], [0.052, 0.1, 0.26], 'body'), B([0, 0.0, 0.45], [0.058, 0.14, 0.03], 'grip'),
      B([0.033, 0.05, -0.2], [0.004, 0.03, 0.18], 'accent'),
    ],
    hands: { r: [0, -0.07, 0.08], l: [0, 0.03, -0.3] }, muzzle: [0, 0.05, -0.54], sightY: 0.128, len: 1.0,
    irons: { y: 0.118, rear: { type: 'peep', z: 0.12, base: 0.098 }, front: { type: 'post', z: -0.28, base: 0.098 }, dots: 'tritium', relief: 0.11 },
  },
  vecta: {
    parts: [
      B([0, 0.0, 0.0], [0.062, 0.145, 0.32], 'body'), B([0, 0.08, -0.02], [0.03, 0.015, 0.3], 'metal'),
      C([0, 0.04, -0.23], 0.013, 0.14, 'metal'), B([0, -0.135, -0.1], [0.036, 0.14, 0.05], 'metal', null, 'mag'),
      B([0, -0.085, 0.07], [0.04, 0.11, 0.05], 'grip', [0.3, 0, 0]), B([0, 0.03, 0.25], [0.03, 0.06, 0.2], 'metal'),
      B([0, -0.08, -0.17], [0.03, 0.09, 0.03], 'grip'), 
      B([0.033, 0.0, 0.0], [0.004, 0.06, 0.22], 'accent'),
    ],
    hands: { r: [0, -0.085, 0.07], l: [0, -0.08, -0.17] }, muzzle: [0, 0.04, -0.31], sightY: 0.115, len: 0.7,
    optic: { type: 'reflex', at: [0, 0.0875, -0.01], color: 0x3dff6a },
  },
  aurum: {
    parts: [
      B([0, 0.03, -0.06], [0.062, 0.082, 0.46], 'body'), B([0, 0.03, -0.4], [0.07, 0.072, 0.24], 'body'),
      C([0, 0.04, -0.62], 0.013, 0.24, 'metal'), C([0, 0.04, -0.76], 0.022, 0.06, 'accent'),
      B([0, -0.07, -0.1], [0.046, 0.1, 0.07], 'metal', null, 'mag'), B([0, -0.06, 0.08], [0.042, 0.11, 0.055], 'grip', [0.36, 0, 0]),
      B([0, 0.015, 0.33], [0.056, 0.11, 0.3], 'body'), B([0, -0.005, 0.49], [0.06, 0.15, 0.03], 'grip'),
      B([0, 0.085, -0.08], [0.02, 0.03, 0.12], 'metal'),
      B([0.034, 0.03, -0.4], [0.004, 0.03, 0.2], 'accent'), B([-0.034, 0.03, -0.4], [0.004, 0.03, 0.2], 'accent'),
    ],
    hands: { r: [0, -0.06, 0.08], l: [0, 0.0, -0.4] }, muzzle: [0, 0.04, -0.79], sightY: 0.118, len: 1.15,
    optic: { type: 'scope', at: [0, 0.1, -0.07], r: 0.017, len: 0.17, objR: 0.027, ocR: 0.025, mag: 2.5, reticle: 'chevron', color: 0xff3a2a },
  },
  boomer: {
    parts: [
      CX([0, -0.005, -0.12], 0.072, 0.17, 'accent', 'drum'), C([0, -0.005, -0.12], 0.06, 0.176, 'metal', null, 10), C([0, -0.005, -0.12], 0.075, 0.03, 'metal', null, 10), C([0, 0.035, -0.4], 0.036, 0.34, 'metal'), C([0, 0.035, -0.57], 0.042, 0.03, 'metal'),
      B([0, 0.08, -0.17], [0.05, 0.03, 0.46], 'metal'), B([0, -0.08, 0.06], [0.044, 0.11, 0.05], 'grip', [0.3, 0, 0]),
      B([0, -0.07, -0.32], [0.036, 0.09, 0.04], 'grip'), B([0, 0.02, 0.25], [0.042, 0.085, 0.26], 'body'), B([0, 0.0, 0.38], [0.05, 0.13, 0.03], 'grip'),
      B([0, -0.02, 0.02], [0.05, 0.05, 0.1], 'body'),
    ],
    hands: { r: [0, -0.08, 0.075], l: [0, -0.07, -0.32] }, muzzle: [0, 0.035, -0.6], sightY: 0.118, len: 0.9, // mano derecha atrás: los dedos se metían en el tambor
    optic: { type: 'reflex', tall: true, at: [0, 0.095, -0.13], color: 0xffa020, ret: 'ladder', weapon: 'boomer' },
  },
  hammer: {
    parts: [
      B([0, 0.03, -0.02], [0.08, 0.1, 0.4], 'body'), B([0, 0.093, -0.02], [0.072, 0.028, 0.3], 'metal'),
      C([0, 0.04, -0.5], 0.016, 0.52, 'metal'), C([0, 0.04, -0.78], 0.022, 0.06, 'metal'), B([0, 0.066, -0.42], [0.05, 0.03, 0.3], 'metal'),
      B([0, 0.025, -0.3], [0.078, 0.085, 0.2], 'body'), B([0.0, -0.085, -0.06], [0.095, 0.12, 0.13], 'accent', null, 'mag'),
      B([0, -0.06, 0.13], [0.044, 0.11, 0.055], 'grip', [0.36, 0, 0]), B([0, 0.0, 0.36], [0.06, 0.11, 0.3], 'body'),
      B([0, -0.02, 0.52], [0.064, 0.15, 0.03], 'grip'),
      B([0.02, 0.0, -0.62], [0.01, 0.01, 0.22], 'metal'), B([-0.02, 0.0, -0.62], [0.01, 0.01, 0.22], 'metal'),
    ],
    hands: { r: [0, -0.06, 0.13], l: [0, 0.0, -0.3] }, muzzle: [0, 0.04, -0.81], sightY: 0.13, len: 1.2,
    irons: { y: 0.122, rear: { type: 'notch', z: 0.04, base: 0.107 }, front: { type: 'post', z: -0.56, base: 0.081 }, dots: 'tritium', relief: 0.3 },
  },
  p9: {
    parts: [
      B([0, 0.048, -0.055], [0.032, 0.036, 0.19], 'body', null, 'slide'), B([0, 0.02, -0.05], [0.03, 0.026, 0.17], 'metal'),
      B([0, -0.04, 0.02], [0.03, 0.1, 0.048], 'grip', [0.22, 0, 0]), C([0, 0.048, -0.152], 0.007, 0.012, 'metal'),
      B([0, -0.004, -0.06], [0.008, 0.022, 0.05], 'metal'), B([0, -0.093, 0.032], [0.034, 0.012, 0.05], 'metal', [0.22, 0, 0], 'mag'),
    ],
    hands: { r: [0, -0.04, 0.02], l: [-0.01, -0.05, 0.0] }, muzzle: [0, 0.048, -0.16], sightY: 0.075, len: 0.25, pistol: true,
    irons: { y: 0.074, rear: { type: 'notch', z: 0.03, base: 0.066 }, front: { type: 'post', z: -0.14, base: 0.066 }, dots: '3dot', scale: 0.75, noEars: true, relief: 0.33 },
  },
  rhino: {
    parts: [
      B([0, 0.04, -0.03], [0.036, 0.06, 0.12], 'body'), B([0, 0.065, -0.18], [0.03, 0.034, 0.2], 'metal'),
      B([0, 0.083, -0.18], [0.014, 0.008, 0.2], 'accent'), CX([0, 0.038, -0.04], 0.032, 0.075, 'metal', 'drum'),
      B([0, -0.04, 0.05], [0.036, 0.11, 0.05], 'wood', [0.35, 0, 0]), B([0, 0.075, 0.035], [0.012, 0.025, 0.02], 'metal'),
      B([0, -0.005, -0.04], [0.008, 0.025, 0.05], 'metal'),
    ],
    hands: { r: [0, -0.04, 0.05], l: [-0.01, -0.05, 0.03] }, muzzle: [0, 0.065, -0.29], sightY: 0.1, len: 0.32, pistol: true,
    irons: { y: 0.098, rear: { type: 'notch', z: 0.035, base: 0.07 }, front: { type: 'post', z: -0.27, base: 0.087 }, dots: '3dot', scale: 0.8, noEars: true, relief: 0.33 },
  },
  knife: {
    parts: [
      { t: 'blade', p: [0, 0.0, -0.06], m: 'blade' }, B([0, 0.0, -0.02], [0.022, 0.06, 0.014], 'metal'),
      B([0, 0.0, 0.05], [0.026, 0.034, 0.12], 'grip'), B([0, 0.0, 0.115], [0.03, 0.04, 0.014], 'metal'),
      B([0.0141, 0, 0.05], [0.002, 0.02, 0.1], 'accent'), B([-0.0141, 0, 0.05], [0.002, 0.02, 0.1], 'accent'),
    ],
    hands: { r: [0, 0, 0.05], l: [0, 0, 0.05] }, muzzle: [0, 0, -0.2], sightY: 0, len: 0.3, knife: true,
  },
};

const ACCENT = { akr: 0x8a8f99, brute: 0xd94a3a, longbow: 0x3a3f47, talon: 0x3fc8e0, viper: 0xe0a03a, scout: 0xc9a46a, vecta: 0x51e08a,
  aurum: 0xffc93c, boomer: 0xc8302a, hammer: 0x4b5a3a, p9: 0x888888, rhino: 0xd8d8d8, knife: 0x3fc8e0 };
const BODY_COL = { akr: 0x7a7f8e, brute: 0x4a4e57, longbow: 0x56664a, talon: 0xd8dde3, viper: 0x474c55, scout: 0xc4a274, vecta: 0x50555f,
  aurum: 0x3c3f47, boomer: 0x5a5e66, hammer: 0x56624a, p9: 0x4a4e57, rhino: 0x9a9ea8, knife: 0x3a3d44 };

let bladeGeo;
function getBlade() {
  if (bladeGeo) return bladeGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.018); s.lineTo(-0.15, -0.012); s.quadraticCurveTo(-0.2, -0.005, -0.215, 0.02); s.lineTo(-0.14, 0.022); s.lineTo(0, 0.02); s.lineTo(0, -0.018);
  bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  bladeGeo.userData.shared = true;
  bladeGeo.translate(0, 0, -0.003); bladeGeo.rotateY(-Math.PI / 2);
  return bladeGeo;
}

function gunMaterials(id, skinId = 'factory') {
  const skin = WEAPON_SKINS[skinId] || WEAPON_SKINS.factory;
  const key = id + '|' + skinId;
  if (matCache.has(key)) return matCache.get(key);
  const solid = skin.pattern === 'solid';
  const body = solid ? stdMat(BODY_COL[id], { roughness: 0.5, metalness: 0.08 })
    : new THREE.MeshStandardMaterial({ map: camoTexture(skinId), roughness: skin.pattern === 'gold' ? 0.3 : 0.55, metalness: skin.pattern === 'gold' ? 0.35 : 0.05, flatShading: true,
      emissive: skin.glow ? 0x331133 : 0x000000 });
  const m = {
    body,
    metal: stdMat(0x4a4f5a, { roughness: 0.45, metalness: 0.15 }),
    wood: solid ? stdMat(id === 'akr' ? 0xa0562a : 0x7a4a26, { roughness: 0.65 }) : body,
    grip: stdMat(0x2b2c31, { roughness: 0.8 }),
    accent: skin.glow ? stdMat(skin.colors[1], { emissive: skin.colors[1], emissiveIntensity: 0.8 }) : stdMat(ACCENT[id], { roughness: 0.45, metalness: 0.1 }),
    glass: stdMat(0x48d8ff, { emissive: 0x1a6a88, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.5 }),
    blade: solid ? stdMat(0xd7dce2, { roughness: 0.25, metalness: 0.3 }) : body,
  };
  matCache.set(key, m);
  return m;
}

const geoCache = new Map();
function partGeo(pt) {
  const key = pt.t + pt.s?.join(',') + (pt.seg || '');
  if (geoCache.has(key)) return geoCache.get(key);
  let g;
  if (pt.t === 'b') { const [w, h, d] = pt.s; const r = Math.min(w, h, d) * 0.22; g = r > 0.004 ? new RoundedBoxGeometry(w, h, d, 1, r) : new THREE.BoxGeometry(w, h, d); }
  else if (pt.t === 'c') { g = new THREE.CylinderGeometry(pt.s[0], pt.s[0], pt.s[1], pt.seg || 8); g.rotateX(Math.PI / 2); }
  else if (pt.t === 'cx') { g = new THREE.CylinderGeometry(pt.s[0], pt.s[0], pt.s[1], 10); g.rotateX(Math.PI / 2); }
  else if (pt.t === 'blade') g = getBlade();
  g.userData.shared = true; // compartida: no se libera al descartar un arma
  geoCache.set(key, g);
  return g;
}

// Devuelve un Group con userData { muzzle(Object3D), named: {mag, pump, bolt, slide, drum}, def }.
// Con óptica, la línea de mira es el eje óptico
for (const d of Object.values(GUN_PARTS)) { if (d.optic) d.sightY = d.optic.at[1] + opticAxis(d.optic); else if (d.irons) d.sightY = d.irons.y; }

export function makeGun(id, skinId = 'factory', { shadows = false, code = false } = {}) {
  const def = GUN_PARTS[id];
  const mats = gunMaterials(id, skinId);
  const g = new THREE.Group();
  const named = {};
  const glb = code ? null : gunModel(id);
  // modelo de Blender si existe; si no, las piezas por código
  if (glb) Object.assign(named, mountGunModel(g, glb, mats, shadows));
  else for (const pt of def.parts) {
    const mesh = new THREE.Mesh(partGeo(pt), mats[pt.m]);
    mesh.position.set(...pt.p);
    if (pt.r) mesh.rotation.set(...pt.r);
    mesh.castShadow = shadows;
    if (pt.name) { named[pt.name] = mesh; mesh.userData.home = mesh.position.clone(); mesh.userData.homeRot = mesh.rotation.clone(); }
    g.add(mesh);
  }
  const muzzle = new THREE.Object3D(); muzzle.position.set(...def.muzzle); g.add(muzzle);
  const optic = def.optic ? buildOptic(def.optic, mats) : null;
  if (optic) { optic.group.traverse(o => { if (o.isMesh) o.castShadow = shadows; }); g.add(optic.group); }
  const irons = !optic && def.irons ? buildIrons(def.irons, mats) : null;
  if (irons) { irons.group.traverse(o => { if (o.isMesh) o.castShadow = shadows; }); g.add(irons.group); }
  g.userData = { muzzle, named, def, id, optic, irons };
  return g;
}

// ---------------- SOLDADOS ----------------
// Cajas con bordes biselados (low-poly suave, no "cubos").
const rcache = new Map();
function rbox(w, h, d, k = 0.2) {
  const key = [w, h, d, k].join(',');
  if (!rcache.has(key)) { const g = new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * k); g.userData.shared = true; rcache.set(key, g); }
  return rcache.get(key);
}
function limb(a, b, w, d, mat) {
  // pieza que va del punto a al punto b (en el espacio del padre)
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(rbox(w, len + w * 0.3, d, 0.3), mat);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  m.castShadow = true;
  return m;
}
// IK de dos huesos: codo dado hombro S, mano T, longitudes a/b y vector "polo".
function elbowPos(S, T, a, b, pole) {
  const d = Math.min(S.distanceTo(T), a + b - 0.001);
  const dir = T.clone().sub(S).normalize();
  const x = (a * a - b * b + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return S.clone().add(dir.multiplyScalar(x)).add(p.multiplyScalar(h));
}

export function makeSoldier(skinId = 'recruit', weaponId = 'akr', weaponSkin = 'factory', { team = null, relaxed = false, pose = null } = {}) {
  const sk = CHAR_SKINS[skinId] || CHAR_SKINS.recruit;
  const M = {
    shirt: stdMat(sk.shirt), pants: stdMat(sk.pants), vest: stdMat(sk.vest), mask: stdMat(sk.mask),
    goggles: stdMat(sk.goggles, { roughness: 0.2, metalness: 0.3, emissive: sk.glow ? sk.goggles : 0x000000, emissiveIntensity: sk.glow ? 1.2 : 0 }),
    lens: stdMat(0x1a2028, { roughness: 0.15, metalness: 0.6 }),
    skin: stdMat(sk.skin), boots: stdMat(sk.boots), accent: stdMat(sk.accent, sk.glow ? { emissive: sk.accent, emissiveIntensity: 1 } : {}),
    helmet: sk.helmet != null ? stdMat(sk.helmet) : null, strap: stdMat(shade(sk.vest, -0.35)), glove: stdMat(shade(sk.boots, 0.1)),
  };
  if (team) M.band = stdMat(team === 'blue' ? 0x2e8bff : 0xff3b3b, { emissive: team === 'blue' ? 0x0b3a88 : 0x7a1010, emissiveIntensity: 0.6 });

  const root = new THREE.Group();
  const add = (parent, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; parent.add(m); return m; };

  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  add(hips, rbox(0.36, 0.22, 0.22), M.pants, 0, 0.02, 0);
  add(hips, rbox(0.39, 0.06, 0.25, 0.3), M.strap, 0, 0.1, 0);
  add(hips, rbox(0.09, 0.12, 0.07), M.vest, 0.18, 0.0, -0.05);
  add(hips, rbox(0.08, 0.16, 0.05), M.vest, -0.2, -0.05, 0.02); // funda

  const legs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.1 * side, 0, 0); hips.add(leg);
    add(leg, rbox(0.17, 0.48, 0.19), M.pants, 0, -0.22, 0);
    add(leg, rbox(0.1, 0.12, 0.05), M.strap, 0.07 * side, -0.2, -0.02); // bolsillo lateral
    const knee = new THREE.Group(); knee.position.y = -0.45; leg.add(knee);
    add(knee, rbox(0.18, 0.13, 0.08, 0.3), M.accent, 0, 0.0, -0.09); // rodillera
    add(knee, rbox(0.15, 0.38, 0.17), M.pants, 0, -0.18, 0);
    add(knee, rbox(0.165, 0.14, 0.28, 0.25), M.boots, 0, -0.41, -0.04);
    legs.push({ leg, knee });
  }

  const spine = new THREE.Group(); spine.position.y = 1.0; root.add(spine);
  add(spine, rbox(0.4, 0.54, 0.24), M.shirt, 0, 0.27, 0);
  add(spine, rbox(0.45, 0.4, 0.31, 0.15), M.vest, 0, 0.3, 0);
  for (const x of [-0.13, 0, 0.13]) add(spine, rbox(0.11, 0.13, 0.07), M.strap, x, 0.2, -0.17);
  add(spine, rbox(0.14, 0.08, 0.05), M.accent, -0.12, 0.38, -0.16); // parche
  add(spine, rbox(0.32, 0.3, 0.1), M.strap, 0, 0.32, 0.19);           // placa trasera
  // mochila táctica: grupo propio con tapa abisagrada (se abre en la cinemática del inventario)
  const pack = new THREE.Group(); pack.position.set(0, 0.27, 0.29); spine.add(pack);
  add(pack, rbox(0.34, 0.4, 0.2, 0.22), M.vest, 0, 0, 0);
  add(pack, rbox(0.26, 0.2, 0.06, 0.3), M.strap, 0, -0.06, 0.12);               // bolsillo trasero
  add(pack, rbox(0.06, 0.24, 0.14, 0.3), M.strap, 0.2, -0.04, 0.0);             // bolsillos laterales
  add(pack, rbox(0.06, 0.24, 0.14, 0.3), M.strap, -0.2, -0.04, 0.0);
  add(pack, rbox(0.3, 0.09, 0.11, 0.4), M.accent, 0, -0.24, 0.02);             // saco de dormir enrollado (abajo)
  add(pack, rbox(0.08, 0.15, 0.06), M.strap, 0.13, 0.04, 0.13);                // radio
  add(pack, rbox(0.06, 0.05, 0.01), M.goggles, 0.13, 0.08, 0.162);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.42, 4), M.strap); ant.position.set(0.15, 0.3, 0.1); ant.rotation.z = -0.12; pack.add(ant);
  add(pack, rbox(0.07, 0.12, 0.05), M.strap, -0.22, 0.05, 0.06);               // cantimplora
  // interior (sólo se ve con la tapa abierta)
  const inner = stdMat(0x14161a, { roughness: 1 });
  add(pack, new THREE.BoxGeometry(0.28, 0.01, 0.15), inner, 0, 0.2005, 0);
  add(pack, rbox(0.05, 0.1, 0.04), M.accent, -0.07, 0.17, 0.02);               // cargadores asomando
  add(pack, rbox(0.05, 0.1, 0.04), M.accent, -0.01, 0.17, -0.01);
  add(pack, new THREE.SphereGeometry(0.035, 8, 6), stdMat(0x3d4a32), 0.07, 0.2, 0.02);
  // tapa: bisagra en el borde pegado a la espalda
  const lid = new THREE.Group(); lid.position.set(0, 0.2, -0.1); pack.add(lid);
  add(lid, rbox(0.36, 0.05, 0.23, 0.3), M.vest, 0, 0.025, 0.115);
  add(lid, rbox(0.36, 0.15, 0.04, 0.3), M.vest, 0, -0.045, 0.225);              // solapa que cuelga por detrás
  add(lid, rbox(0.05, 0.05, 0.02, 0.3), M.accent, -0.1, -0.09, 0.25);           // hebillas
  add(lid, rbox(0.05, 0.05, 0.02, 0.3), M.accent, 0.1, -0.09, 0.25);
  add(lid, rbox(0.1, 0.035, 0.01), M.goggles, 0, 0.0, 0.248);                   // parche
  if (M.band) { add(spine, rbox(0.11, 0.08, 0.2), M.band, 0.26, 0.42, 0); add(spine, rbox(0.11, 0.08, 0.2), M.band, -0.26, 0.42, 0); }
  add(spine, rbox(0.14, 0.1, 0.14), M.mask, 0, 0.56, 0);

  const head = new THREE.Group(); head.position.y = 0.58; spine.add(head);
  add(head, rbox(0.25, 0.28, 0.26, 0.28), M.mask, 0, 0.15, 0);
  add(head, rbox(0.2, 0.065, 0.03, 0.3), M.skin, 0, 0.18, -0.125); // franja de ojos
  add(head, rbox(0.23, 0.085, 0.05, 0.3), M.goggles, 0, 0.19, -0.135);
  add(head, rbox(0.085, 0.055, 0.02, 0.3), M.lens, -0.055, 0.19, -0.16); add(head, rbox(0.085, 0.055, 0.02, 0.3), M.lens, 0.055, 0.19, -0.16);
  add(head, rbox(0.27, 0.03, 0.27, 0.3), M.strap, 0, 0.19, 0.01);
  if (M.helmet) {
    add(head, rbox(0.3, 0.14, 0.31, 0.35), M.helmet, 0, 0.3, 0.005);
    add(head, rbox(0.31, 0.05, 0.08, 0.3), M.helmet, 0, 0.25, -0.15);
    add(head, rbox(0.06, 0.07, 0.05), M.accent, 0, 0.36, -0.13);
  } else {
    add(head, rbox(0.21, 0.06, 0.21, 0.35), M.mask, 0, 0.3, 0.01);
  }

  const gunMount = new THREE.Group(); gunMount.position.set(0.12, 0.33, -0.2); spine.add(gunMount);
  const arms = new THREE.Group(); spine.add(arms);
  // rendimiento: las piezas de cada hueso se funden en una malla (de ~57 piezas a ~15)
  bakeTree(root);
  const soldier = { root, hips, spine, head, legs, gunMount, arms, M, gun: null, weaponId: null, relaxed, pose, pack, packLid: lid };
  setSoldierWeapon(soldier, weaponId, weaponSkin);
  return soldier;
}

export function setSoldierWeapon(s, weaponId, weaponSkin = 'factory') {
  if (s.weaponId === weaponId && s.weaponSkin === weaponSkin) return;
  s.weaponId = weaponId; s.weaponSkin = weaponSkin;
  // cada arma ya montada (arma + brazos con IK, horneados) se guarda por soldado: cambiar de arma es sólo
  // cambiar de piezas. Antes se reconstruía todo en cada cambio (12–25 ms, y en battle royale se cambia sin parar).
  const key = weaponId + '|' + weaponSkin + '|' + (s.pose || '') + (s.relaxed ? 'r' : '');
  s.wcache = s.wcache || new Map();
  if (s.gun) s.gunMount.remove(s.gun);
  while (s.arms.children.length) s.arms.remove(s.arms.children[0]);
  let e = s.wcache.get(key);
  if (!e) e = buildSoldierWeapon(s, weaponId, weaponSkin, key);
  s.gun = e.gun; s.gunMount.add(e.gun);
  s.gunMount.position.copy(e.mp); s.gunMount.rotation.copy(e.mr); s.gunMount.updateMatrix();
  for (const c of e.arms) s.arms.add(c);
  s.casters = null; s.castNear = undefined; // la lista de mallas con sombra cambia con el arma
}
// Arma en tercera persona: se hornea UNA vez por arma+aspecto y cada soldado recibe un clon
// (comparte geometría y materiales: clonar cuesta ~0, construir costaba 10–25 ms)
const tpGuns = new Map();
function tpGun(id, skin) {
  const k = id + '|' + skin;
  let proto = tpGuns.get(k);
  if (!proto) {
    const build = (code) => {
      const g = makeGun(id, skin, { shadows: false, code });
      bakeTree(g, { shadow: false, skip: (m) => !!m.userData.home || !!m.userData.keep });
      g.userData.muzzle.name = '__muzzle';
      g.traverse(o => {
        o.userData = {}; // clone() copia userData con JSON: nada de referencias
        if (o.geometry) o.geometry.userData.shared = true;
        if (o.material) for (const m of [].concat(o.material)) m.userData.own = false;
      });
      return g;
    };
    // Nivel de detalle: el modelo de Blender (5–6k triángulos) sólo de cerca; a más de 8 m, las piezas por código
    // (~300 triángulos), que a esa distancia se ven igual. Con 24 soldados eran ~140k triángulos sólo en armas.
    if (gunModel(id)) { proto = new THREE.LOD(); proto.addLevel(build(false), 0); proto.addLevel(build(true), 8); }
    else proto = build(true);
    tpGuns.set(k, proto);
  }
  const g = proto.clone();
  g.userData = { muzzle: g.getObjectByName('__muzzle'), id };
  return g;
}
// Brazos (IK hacia las manos del arma) horneados: iguales para todos los soldados con los mismos colores
const tpArms = new Map();
function buildSoldierWeapon(s, weaponId, weaponSkin, key) {
  const def = GUN_PARTS[weaponId];
  const gun = tpGun(weaponId, weaponSkin);
  const mp = new THREE.Vector3(), mr = new THREE.Euler();
  if (s.pose === 'hero' && !def.knife && !def.pistol) {
    // pose de victoria: rifle levantado hacia el cielo
    mp.set(0.2, 0.62, -0.18); mr.set(1.15, 0.2, 0.25);
  } else if (s.relaxed && !def.knife && !def.pistol) {
    // en reposo: arma cruzada y apuntando al suelo (pose de lobby)
    mp.set(0.02, 0.2, -0.2); mr.set(-0.75, 0.65, 0.35);
  } else if (def.knife) { mp.set(0.2, 0.2, -0.3); mr.set(-0.5, 0, 0); }
  else if (def.pistol) { mp.set(0.04, 0.38, -0.38); mr.set(s.relaxed ? -0.9 : 0, 0, 0); }
  else { mp.set(0.12, 0.33, -0.2); mr.set(0, 0, 0); }
  // brazos con IK hacia las manos del arma
  const akey = weaponId + '|' + key.split('|').slice(2).join('|') + '|' + [s.M.shirt, s.M.glove, s.M.accent].map(m => m.color.getHexString()).join(',');
  let armProto = tpArms.get(akey);
  if (armProto) { const e = { gun, mp, mr, arms: armProto.map(m => m.clone()) }; s.wcache.set(key, e); return e; }
  const tmp = new THREE.Group();
  const toSpine = (h) => new THREE.Vector3(...h).applyEuler(mr).add(mp);
  const R = toSpine(def.hands.r), L = def.knife ? new THREE.Vector3(-0.22, 0.12, -0.12) : toSpine(def.hands.l);
  const SR = new THREE.Vector3(0.25, 0.46, 0), SL = new THREE.Vector3(-0.25, 0.46, 0);
  const eR = elbowPos(SR, R, 0.3, 0.3, new THREE.Vector3(0.7, -1, 0.4));
  const eL = elbowPos(SL, L, 0.3, 0.32, new THREE.Vector3(-0.8, -1, 0.2));
  for (const [S, E, H] of [[SR, eR, R], [SL, eL, L]]) {
    tmp.add(limb(S, E, 0.13, 0.13, s.M.shirt));
    tmp.add(limb(E, H, 0.11, 0.11, s.M.shirt));
    const hand = new THREE.Mesh(rbox(0.09, 0.1, 0.1, 0.3), s.M.glove); hand.position.copy(H); hand.castShadow = true; tmp.add(hand);
    const pad = new THREE.Mesh(rbox(0.16, 0.1, 0.16, 0.35), s.M.accent); pad.position.copy(S).add(new THREE.Vector3(0, 0.02, 0)); pad.castShadow = true; tmp.add(pad);
  }
  bakeGroup(tmp);
  armProto = [...tmp.children];
  for (const m of armProto) if (m.geometry) m.geometry.userData.shared = true;
  tpArms.set(akey, armProto);
  const e = { gun, mp, mr, arms: armProto.map(m => m.clone()) };
  s.wcache.set(key, e);
  return e;
}
// Libera las armas montadas que no están puestas (las puestas las libera disposeTree del soldado)
export function disposeSoldierCache(s) {
  if (!s.wcache) return;
  for (const e of s.wcache.values()) {
    if (e.gun !== s.gun) disposeTree(e.gun);
    for (const c of e.arms) if (c.parent !== s.arms) disposeTree(c);
  }
  s.wcache.clear();
}

// Caída libre (battle royale): brazos abiertos de paracaidista en lugar de los brazos que sujetan el arma.
// Se construyen una vez por soldador y se alternan con los normales.
export function setSoldierSkydive(s, on) {
  if (!!s.skydive === on) return;
  s.skydive = on;
  if (on && !s.diveArms) {
    const g = new THREE.Group();
    for (const sg of [1, -1]) {
      const S = new THREE.Vector3(0.25 * sg, 0.46, 0), E = new THREE.Vector3(0.5 * sg, 0.62, -0.12), H = new THREE.Vector3(0.62 * sg, 0.86, -0.26);
      g.add(limb(S, E, 0.13, 0.13, s.M.shirt)); g.add(limb(E, H, 0.11, 0.11, s.M.shirt));
      const hand = new THREE.Mesh(rbox(0.09, 0.1, 0.1, 0.3), s.M.glove); hand.position.copy(H); g.add(hand);
      const pad = new THREE.Mesh(rbox(0.16, 0.1, 0.16, 0.35), s.M.accent); pad.position.copy(S).add(new THREE.Vector3(0, 0.02, 0)); g.add(pad);
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    bakeGroup(g);
    s.diveArms = g; s.spine.add(g);
  }
  if (s.diveArms) s.diveArms.visible = on;
  s.arms.visible = !on; s.gunMount.visible = !on;
}

// Pose por frame. st: { moveSpeed, phase, crouch(0..1), air, pitch, dead(0..1), deadDir }
export function poseSoldier(s, st) {
  const c = st.crouch || 0;
  const sw = Math.sin(st.phase) * Math.min(1, st.moveSpeed / 5) * (st.air ? 0.2 : 1);
  for (let i = 0; i < 2; i++) {
    const L = s.legs[i], sgn = i ? -1 : 1;
    const walk = sw * sgn;
    L.leg.rotation.x = walk * 0.75 * (1 - c) + c * -1.25 + (st.air ? -0.35 : 0);
    L.knee.rotation.x = Math.max(0, -walk) * 1.0 * (1 - c) + c * 1.9 + (st.air ? 0.6 : 0);
  }
  s.hips.position.y = 0.92 - c * 0.36 + Math.abs(Math.cos(st.phase)) * 0.03 * Math.min(1, st.moveSpeed / 5);
  s.spine.position.y = s.hips.position.y + 0.08;
  s.spine.rotation.x = (st.pitch || 0) * 0.7 + c * 0.15;
  s.head.rotation.x = (st.pitch || 0) * 0.3;
  s.spine.rotation.y = sw * 0.06;
  if (st.dead > 0) {
    // 1) las rodillas ceden  2) el cuerpo cae de espaldas o de frente
    const k1 = Math.min(1, st.dead / 0.5), b = 1 - Math.pow(1 - k1, 2);
    const k2 = Math.max(0, Math.min(1, (st.dead - 0.35) / 1.1)), f = k2 * k2 * (3 - 2 * k2);
    const dir = st.deadDir || 1;
    for (const L of s.legs) { L.leg.rotation.x = -0.9 * b * (1 - f) + 0.15 * f; L.knee.rotation.x = 1.5 * b * (1 - f) + 0.1 * f; }
    s.hips.position.y = 0.92 - 0.38 * b * (1 - f * 0.6);
    s.spine.position.y = s.hips.position.y + 0.08;
    s.spine.rotation.x = 0.25 * b * (1 - f) - 0.15 * f * dir;
    s.head.rotation.x = -0.3 * f * dir;
    s.root.rotation.x = dir * f * Math.PI / 2 * 0.96;
    s.root.position.y += f * 0.14;
  } else s.root.rotation.x = 0;
}

// ---------------- BRAZOS EN PRIMERA PERSONA ----------------
export function makeViewArms(skinId = 'recruit') {
  const sk = CHAR_SKINS[skinId] || CHAR_SKINS.recruit;
  const sleeve = stdMat(shade(sk.shirt, -0.08), { roughness: 0.95 }), cuff = stdMat(shade(sk.shirt, -0.35), { roughness: 0.9 });
  const glove = stdMat(shade(sk.boots, 0.12), { roughness: 0.75 }), knuckle = stdMat(shade(sk.boots, -0.2), { roughness: 0.7 });
  const skin = stdMat(sk.skin, { roughness: 0.8 }), watch = stdMat(0x1c1e22, { roughness: 0.4, metalness: 0.3 });
  const mk = (left) => {
    const arm = new THREE.Group();
    // antebrazo ligeramente cónico (más ancho hacia el codo)
    const fg = new THREE.CylinderGeometry(0.036, 0.046, 0.36, 7); fg.rotateX(Math.PI / 2);
    const fore = new THREE.Mesh(fg, sleeve); fore.position.z = 0.24; arm.add(fore);
    const c = new THREE.Mesh(rbox(0.088, 0.084, 0.05, 0.3), cuff); c.position.z = 0.075; arm.add(c);
    const wrist = new THREE.Mesh(rbox(0.066, 0.06, 0.05, 0.3), skin); wrist.position.z = 0.04; arm.add(wrist);
    if (left) { const w = new THREE.Mesh(rbox(0.074, 0.03, 0.034, 0.3), watch); w.position.set(0, 0.03, 0.06); arm.add(w); }
    const palm = new THREE.Mesh(rbox(0.062, 0.086, 0.092, 0.25), glove); palm.position.set(0, -0.004, -0.02); arm.add(palm);
    const fing = new THREE.Mesh(rbox(0.06, 0.042, 0.06, 0.3), glove); fing.position.set(0, -0.032, -0.074); arm.add(fing);
    const kn = new THREE.Mesh(rbox(0.064, 0.02, 0.05, 0.3), knuckle); kn.position.set(0, 0.04, -0.03); arm.add(kn);
    const thumb = new THREE.Mesh(rbox(0.026, 0.026, 0.06, 0.3), glove); thumb.position.set(left ? 0.035 : -0.035, 0.024, -0.05); arm.add(thumb);
    return arm;
  };
  return { right: mk(false), left: mk(true) };
}

// Cuerpo de partículas de gibs/sangre: no se usa geometría del soldado. Sólo exportamos materiales útiles:
export const MAT = {
  tracer: new THREE.MeshBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }),
};
