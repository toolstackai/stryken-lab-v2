// Convierte las entidades de un mapa en mallas 3D (todo lo estático se une por material).
import * as THREE from 'three';
import * as T from './textures.js';
import { Batcher, worldBox, wedge, trs } from './geo.js';
import { CONT } from '../data/maps.js';
import { makeCollider, raycastWorld } from '../core/physics.js';
import { stdMat } from './models.js';

const MATS = {};
function surf(key, tex, texSize, opts = {}) {
  if (!MATS[key]) {
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0, ...opts });
    m.userData.texSize = texSize;
    MATS[key] = m;
  }
  return MATS[key];
}
export function mat(key) {
  switch (key) {
    case 'asphalt': return surf(key, T.asphalt(), T.TEX_SIZE.asphalt);
    case 'grass': return surf(key, T.grass(), T.TEX_SIZE.grass, { roughness: 0.95 });
    case 'sand': return surf(key, T.sand(), T.TEX_SIZE.sand, { roughness: 0.95 });
    case 'rock': return surf(key, T.rock(), T.TEX_SIZE.rock, { roughness: 0.9 });
    case 'concreteWall': return surf(key, T.concrete(0xa9a59b), 4);
    case 'concreteDock': return surf(key, T.concrete(0x8f8c86, 'dock'), 3);
    case 'metal': return surf(key, T.treadPlate(), T.TEX_SIZE.tread, { metalness: 0.3, roughness: 0.6 });
    case 'hazard': return surf(key, T.hazard(), 1);
    case 'steelYellow': return surf(key, T.metalPanel(0xd6a72a), 2, { metalness: 0.2, roughness: 0.6 });
    case 'brickWall': return surf(key, T.brick(0x9a5544), T.TEX_SIZE.brick);
    case 'metalroof': return surf(key, T.metalPanel(0x59616b), 3, { metalness: 0.3 });
    case 'factoryFloor': return surf(key, T.factoryFloor(), T.TEX_SIZE.ffloor);
    case 'factoryWall': return surf(key, T.metalPanel(0x56647a), 3, { roughness: 0.75 });
    case 'metalWall': return surf(key, T.metalPanel(0x56657a), 2);
    case 'metalFloor': return surf(key, T.treadPlate(), 1.6, { metalness: 0.35, roughness: 0.55 });
    case 'railing': return stdMat(0xd6a72a, { roughness: 0.5, metalness: 0.3 });
    case 'stone': return surf(key, T.stoneTiles(0xbdb3a2), T.TEX_SIZE.stone);
    case 'stoneBlock': return surf(key, T.concrete(0xb5aa98, 'sblock'), 2.5);
    case 'plasterRed': return surf(key, T.plaster(0xa8322a), 3);
    case 'plasterWhite': return surf(key, T.plaster(0xeadfca), 3);
    case 'roofGreen': return surf(key, T.roofTiles(0x2f7d6b), 1.5);
    case 'wood': return surf(key, T.wood(0x8a5a32), 2);
    case 'darkMetal': return stdMat(0x2a2e35, { roughness: 0.5, metalness: 0.5 });
    case 'rubber': return stdMat(0x1b1c1f, { roughness: 0.95 });
    case 'glass': return stdMat(0x6fa8c8, { roughness: 0.1, metalness: 0.6, transparent: true, opacity: 0.55 });
    case 'red': return stdMat(0xb3261e, { roughness: 0.55 });
    case 'gold': return stdMat(0xe0b040, { roughness: 0.35, metalness: 0.7 });
    case 'black': return stdMat(0x1c1a1a, { roughness: 0.7 });
    default: return stdMat(0xff00ff);
  }
}
export function disposeMats() {
  for (const k of Object.keys(MATS)) delete MATS[k];
}

// Material de cara de contenedor (memo por color/variante)
function contMats(color, v) {
  const key = 'cont' + color + '_' + (v % 3);
  if (!MATS[key]) {
    MATS[key] = {
      side: new THREE.MeshStandardMaterial({ map: T.containerSide(color, v % 3), roughness: 0.7, metalness: 0.15 }),
      door: new THREE.MeshStandardMaterial({ map: T.containerDoor(color, v % 6), roughness: 0.7, metalness: 0.15 }),
      roof: new THREE.MeshStandardMaterial({ map: T.containerSide(T.shade(color, 0.08), 2), roughness: 0.75, metalness: 0.15 }),
      frame: stdMat(T.shade(color, -0.4), { roughness: 0.6, metalness: 0.3 }),
    };
  }
  return MATS[key];
}

// Plano orientado: centro c, normal n (eje), tamaño (u, v).
function facePlane(cx, cy, cz, axis, sign, w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  if (axis === 'x') g.rotateY(sign > 0 ? Math.PI / 2 : -Math.PI / 2);
  else if (axis === 'y') g.rotateX(sign > 0 ? -Math.PI / 2 : Math.PI / 2);
  else if (sign < 0) g.rotateY(Math.PI);
  g.translate(cx, cy, cz);
  return g;
}

function buildContainer(B, e) {
  const { L, H, W } = CONT;
  const [x, y, z] = e.p, ax = e.o === 'x';
  const lx = ax ? L : W, lz = ax ? W : L;
  const M = contMats(e.c, e.v);
  const cy = y + H / 2;
  const inset = 0.04;
  // caras largas (laterales)
  if (ax) { B.add(facePlane(x, cy, z + lz / 2, 'z', 1, L, H), M.side); B.add(facePlane(x, cy, z - lz / 2, 'z', -1, L, H), M.side); }
  else { B.add(facePlane(x + lx / 2, cy, z, 'x', 1, L, H), M.side); B.add(facePlane(x - lx / 2, cy, z, 'x', -1, L, H), M.side); }
  B.add(facePlane(x, y + H, z, 'y', 1, ax ? L : W, ax ? W : L).rotateY(0), M.roof);
  if (!e.open) {
    if (ax) { B.add(facePlane(x + L / 2, cy, z, 'x', 1, W, H), M.door); B.add(facePlane(x - L / 2, cy, z, 'x', -1, W, H), M.frame); }
    else { B.add(facePlane(x, cy, z + L / 2, 'z', 1, W, H), M.door); B.add(facePlane(x, cy, z - L / 2, 'z', -1, W, H), M.frame); }
  } else {
    // interior
    const inside = MATS.cin || (MATS.cin = new THREE.MeshStandardMaterial({ map: T.containerInside(), roughness: 0.8, metalness: 0.2, side: THREE.DoubleSide }));
    inside.userData.texSize = 2;
    const ply = MATS.ply || (MATS.ply = Object.assign(new THREE.MeshStandardMaterial({ map: T.plywood(), roughness: 0.9 }), { userData: { texSize: 2 } }));
    const t = 0.12;
    if (ax) {
      B.box(x, y + H - t / 2 - 0.001, z, L - 0.02, t, W - 0.02, inside);
      B.box(x, y + 1.3, z - W / 2 + t / 2 + 0.01, L - 0.02, H - 0.02, t - 0.02, inside);
      B.box(x, y + 1.3, z + W / 2 - t / 2 - 0.01, L - 0.02, H - 0.02, t - 0.02, inside);
    } else {
      B.box(x, y + H - t / 2 - 0.001, z, W - 0.02, t, L - 0.02, inside);
      B.box(x - W / 2 + t / 2 + 0.01, y + 1.3, z, t - 0.02, H - 0.02, L - 0.02, inside);
      B.box(x + W / 2 - t / 2 - 0.01, y + 1.3, z, t - 0.02, H - 0.02, L - 0.02, inside);
    }
    B.box(x, y + 0.05, z, lx - 0.1, 0.1, lz - 0.1, ply);
    // puertas abiertas pegadas al lateral exterior (un extremo)
    const dm = M.door;
    for (const s of [-1, 1]) {
      const g = new THREE.BoxGeometry(0.05, H - 0.1, W / 2);
      if (ax) B.add(g, dm, trs(x + L / 2 + W / 4, cy, z + s * (W / 2 + 0.03), 0, Math.PI / 2, 0));
      else B.add(g, dm, trs(x + s * (W / 2 + 0.03), cy, z + L / 2 + W / 4, 0, 0, 0));
    }
  }
  // marco: postes en las esquinas y rieles superior/inferior
  const fr = M.frame, p = 0.14;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(x + sx * (lx / 2 - p / 2 + inset), cy, z + sz * (lz / 2 - p / 2 + inset), p, H + 0.02, p, fr, 2);
  for (const yy of [y + 0.08, y + H - 0.08]) {
    if (ax) for (const sz of [-1, 1]) B.box(x, yy, z + sz * (lz / 2 + 0.01), L, 0.16, 0.06, fr, 2);
    else for (const sx of [-1, 1]) B.box(x + sx * (lx / 2 + 0.01), yy, z, 0.06, 0.16, L, fr, 2);
  }
}

function buildStairs(B, e, m) {
  const [x, y, z] = e.p, [w, h, d] = e.s, dir = e.dir;
  const along = dir[1] === 'x' ? w : d, sign = dir[0] === '+' ? 1 : -1;
  const n = Math.max(2, Math.round(h / 0.22)), sh = h / n, sl = along / n;
  for (let i = 0; i < n; i++) {
    const top = sh * (i + 1);
    const o = (-along / 2 + sl * (i + 0.5)) * sign;
    if (dir[1] === 'x') B.box(x + o, y + top / 2, z, sl, top, d, m);
    else B.box(x, y + top / 2, z + o, w, top, sl, m);
  }
  // borde amarillo en cada escalón
  const edge = mat('steelYellow');
  for (let i = 0; i < n; i++) {
    const top = sh * (i + 1), o = (-along / 2 + sl * i + 0.04) * sign;
    if (dir[1] === 'x') B.box(x + o, y + top - 0.02, z, 0.08, 0.045, d + 0.01, edge, 2, { noShadow: true });
    else B.box(x, y + top - 0.02, z + o, w + 0.01, 0.045, 0.08, edge, 2, { noShadow: true });
  }
}

function cyl(rt, rb, h, seg = 10) { return new THREE.CylinderGeometry(rt, rb, h, seg); }

export function buildWorld(map, scene, quality) {
  const group = new THREE.Group(); group.name = 'world';
  const B = new Batcher();
  const extras = new THREE.Group(); group.add(extras);
  const lights = [];
  const anim = []; // objetos animados (luces parpadeantes, pétalos, etc.)

  for (const e of map.entities) {
    const [x, y, z] = e.p || [0, 0, 0];
    switch (e.k) {
      case 'box': {
        if (e.m === 'none') break; // límite invisible
        if (e.m === 'railing') { railing(B, e); break; }
        const m = mat(e.m);
        B.box(x, y + e.s[1] / 2, z, e.s[0], e.s[1], e.s[2], m, m.userData.texSize);
        if (e.m === 'concreteWall' && e.s[1] >= 6) {
          // remate superior y franja de pintura
          B.box(x, y + e.s[1] + 0.1, z, e.s[0] + 0.3, 0.2, e.s[2] + 0.3, mat('concreteDock'));
          B.box(x, y + 0.6, z, e.s[0] + 0.02, 0.5, e.s[2] + 0.02, mat('hazard'), 1, { noShadow: true });
        }
        break;
      }
      case 'ramp': {
        const m = mat(e.m);
        if (e.stairs) buildStairs(B, e, m);
        else B.add(wedge(e.s[0], e.s[1], e.s[2], e.dir, m.userData.texSize || 2), m, trs(x, y, z));
        break;
      }
      case 'cont': buildContainer(B, e); break;
      case 'crate': {
        const key = 'crate' + ((x * 3 + z) & 1);
        const cm = MATS[key] || (MATS[key] = new THREE.MeshStandardMaterial({ map: T.crate(key.endsWith('1') ? 0xb3803f : 0x9c6b3a), roughness: 0.85 }));
        B.add(new THREE.BoxGeometry(e.size, e.size, e.size), cm, trs(x, y + e.size / 2, z, 0, e.rot || 0, 0));
        break;
      }
      case 'barrel': {
        const bm = stdMat(e.c, { roughness: 0.55, metalness: 0.3 });
        B.add(cyl(0.3, 0.3, 0.95, 12), bm, trs(x, y + 0.475, z));
        for (const yy of [0.2, 0.75]) B.add(cyl(0.315, 0.315, 0.05, 12), mat('darkMetal'), trs(x, y + yy, z));
        B.add(cyl(0.27, 0.27, 0.02, 12), mat('darkMetal'), trs(x, y + 0.955, z));
        break;
      }
      case 'barrier': {
        const sh = new THREE.Shape(); sh.moveTo(-0.35, 0); sh.lineTo(0.35, 0); sh.lineTo(0.2, 0.25); sh.lineTo(0.12, 0.95); sh.lineTo(-0.12, 0.95); sh.lineTo(-0.2, 0.25); sh.lineTo(-0.35, 0);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 3, bevelEnabled: false }); g.translate(0, 0, -1.5);
        const cm = MATS.barrier || (MATS.barrier = Object.assign(new THREE.MeshStandardMaterial({ map: T.concrete(0xc9c4b8, 'barrier'), roughness: 0.9 }), { userData: {} }));
        g.attributes.uv.array.forEach((v, i, a) => { a[i] = v * 0.3; });
        B.add(g, cm, trs(x, y, z, 0, e.o === 'x' ? Math.PI / 2 : 0, 0));
        B.add(new THREE.BoxGeometry(e.o === 'x' ? 3.01 : 0.36, 0.12, e.o === 'x' ? 0.36 : 3.01), mat('red'), trs(x, y + 0.6, z));
        break;
      }
      case 'truck': truck(B, e); break;
      case 'forklift': forklift(B, e); break;
      case 'desk': {
        B.box(x, y + 0.75, z, 1.6, 0.05, 0.8, mat('wood'));
        for (const sx of [-0.75, 0.75]) B.box(x + sx, y + 0.37, z, 0.06, 0.74, 0.74, mat('darkMetal'));
        B.box(x, y + 0.98, z + 0.2, 0.6, 0.38, 0.04, mat('black'));
        B.box(x, y + 0.86, z + 0.25, 0.08, 0.2, 0.08, mat('darkMetal'));
        break;
      }
      case 'machine': machine(B, e, extras); break;
      case 'furnace': furnace(B, e, extras, lights, anim); break;
      case 'conveyor': conveyor(B, e); break;
      case 'tank': {
        const tm = stdMat(0x7d8a99, { roughness: 0.45, metalness: 0.5 });
        B.add(cyl(e.r, e.r, e.h - 0.6, 14), tm, trs(x, y + 0.3 + (e.h - 0.6) / 2, z));
        B.add(new THREE.SphereGeometry(e.r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), tm, trs(x, y + e.h - 0.3, z, 0, 0, 0, 1, 0.4, 1));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(x + sx * e.r * 0.7, y + 0.15, z + sz * e.r * 0.7, 0.15, 0.3, 0.15, mat('darkMetal'));
        for (const yy of [1.2, 3.2]) B.add(cyl(e.r + 0.03, e.r + 0.03, 0.12, 14), mat('steelYellow'), trs(x, y + yy, z));
        break;
      }
      case 'pillar': {
        const r = e.small ? 0.17 : 0.24;
        B.add(cyl(r, r, e.h, 8), mat('red'), trs(x, y + e.h / 2, z));
        B.box(x, y + 0.12, z, r * 2.6, 0.24, r * 2.6, mat('stoneBlock'));
        B.box(x, y + e.h - 0.12, z, r * 2.4, 0.24, r * 2.4, mat('gold'));
        break;
      }
      case 'gate': gate(B, e); break;
      case 'pagodaRoof': pagodaRoof(B, e); break;
      case 'altar': {
        B.box(x, y + 0.5, z, 2, 1.0, 1.2, mat('wood'));
        B.box(x, y + 1.0, z, 2.2, 0.08, 1.4, mat('red'));
        B.add(new THREE.IcosahedronGeometry(0.35, 0), mat('gold'), trs(x, y + 1.45, z));
        B.add(cyl(0.2, 0.3, 0.3, 8), mat('gold'), trs(x, y + 1.15, z));
        for (const sx of [-0.7, 0.7]) { B.add(cyl(0.12, 0.15, 0.25, 6), mat('black'), trs(x + sx, y + 1.17, z)); }
        break;
      }
      case 'lantern': {
        const lm = stdMat(0xe63b2e, { emissive: 0xff5a30, emissiveIntensity: 1.2 });
        B.add(new THREE.SphereGeometry(0.28, 10, 8), lm, trs(x, y, z, 0, 0, 0, 1, 1.25, 1), { noShadow: true });
        B.add(cyl(0.15, 0.15, 0.06, 8), mat('black'), trs(x, y + 0.37, z)); B.add(cyl(0.15, 0.15, 0.06, 8), mat('black'), trs(x, y - 0.37, z));
        B.box(x, y + 0.6, z, 0.02, 0.4, 0.02, mat('black'));
        break;
      }
      case 'stoneLantern': {
        const sm = mat('stoneBlock');
        B.box(x, y + 0.1, z, 0.7, 0.2, 0.7, sm); B.add(cyl(0.12, 0.15, 0.8, 6), sm, trs(x, y + 0.6, z));
        B.box(x, y + 1.1, z, 0.55, 0.35, 0.55, sm);
        B.add(new THREE.BoxGeometry(0.35, 0.2, 0.6), stdMat(0xffd58a, { emissive: 0xffb050, emissiveIntensity: 1.4 }), trs(x, y + 1.1, z), { noShadow: true });
        B.add(new THREE.ConeGeometry(0.55, 0.35, 4), sm, trs(x, y + 1.45, z, 0, Math.PI / 4, 0));
        break;
      }
      case 'tree': tree(B, e); break;
      case 'roofShelter': {
        const w = e.x1 - e.x0, d = e.z1 - e.z0;
        B.box((e.x0 + e.x1) / 2, e.y, (e.z0 + e.z1) / 2, w, 0.15, d, mat('metalroof'));
        B.box((e.x0 + e.x1) / 2, e.y - 0.25, (e.z0 + e.z1) / 2, w, 0.3, 0.3, mat('steelYellow'));
        break;
      }
      case 'light': {
        if (e.lamp) {
          B.add(new THREE.ConeGeometry(0.6, 0.4, 8, 1, true), mat('darkMetal'), trs(x, y + 0.2, z));
          B.add(cyl(0.35, 0.35, 0.05, 8), stdMat(0xfff0c8, { emissive: 0xffe0a0, emissiveIntensity: 2.5 }), trs(x, y + 0.02, z), { noShadow: true });
          B.box(x, y + 1.5, z, 0.04, 2.6, 0.04, mat('black'));
        }
        lights.push(e);
        break;
      }
      case 'teamStripe': {
        const col = e.team === 'blue' ? 0x2e8bff : 0xff3b3b;
        B.box(x, y, z, 0.05, 0.12, e.len, stdMat(col, { emissive: col, emissiveIntensity: 0.45 }), 2, { noShadow: true });
        break;
      }
      case 'paint': {
        const pm = MATS['paint' + e.c] || (MATS['paint' + e.c] = new THREE.MeshStandardMaterial({ color: e.c, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, map: T.concrete(0xd8d8d8, 'paintgrit') }));
        B.add(new THREE.PlaneGeometry(e.w, e.d).rotateX(-Math.PI / 2), pm, trs(x, y + 0.004, z), { noShadow: true });
        break;
      }
      case 'puddle': {
        const pm = MATS.puddle || (MATS.puddle = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.75, polygonOffset: true, polygonOffsetFactor: -3 }));
        const g = new THREE.CircleGeometry(e.r, 12).rotateX(-Math.PI / 2);
        B.add(g, pm, trs(x, y + 0.006, z, 0, x, 0, 1, 1, 0.6), { noShadow: true });
        break;
      }
      case 'factoryRoof': factoryRoof(B, e, extras); foundryParticles(e, extras, anim); break;
      case 'backdrop': if (e.kind === 'harbor') harborBackdrop(B, e, extras, anim); else if (e.kind === 'island') islandBackdrop(B, e, extras, anim); else shrineBackdrop(B, e, extras, anim); break;
    }
  }
  contactShadows(B, map);
  group.add(...B.build(group));

  // Luces puntuales (limitadas según calidad para no hundir los FPS)
  const maxL = quality === 'low' ? 2 : quality === 'medium' ? 5 : 9;
  lights.slice(0, maxL).forEach(l => {
    const pl = new THREE.PointLight(l.c, l.i, l.d, 1.6); pl.position.set(...l.p); group.add(pl);
  });

  sky(map, group, anim);
  return { group, anim };
}

function railing(B, e) {
  const [x, y, z] = e.p, [w, h, d] = e.s;
  const m = mat('railing'), alongX = w > d, len = Math.max(w, d);
  B.box(x, y + h - 0.03, z, alongX ? len : 0.06, 0.06, alongX ? 0.06 : len, m, 2);
  B.box(x, y + h * 0.5, z, alongX ? len : 0.04, 0.04, alongX ? 0.04 : len, m, 2);
  const n = Math.max(1, Math.round(len / 1.6));
  for (let i = 0; i <= n; i++) {
    const o = -len / 2 + len * i / n;
    B.box(x + (alongX ? o : 0), y + h / 2, z + (alongX ? 0 : o), 0.05, h, 0.05, m, 2);
  }
}

function truck(B, e) {
  const [x, y, z] = e.p, along = e.o === 'z';
  const P = (a, b) => along ? [x + b, z + a] : [x + a, z + b]; // a = a lo largo, b = lateral
  const body = stdMat(e.c, { roughness: 0.45, metalness: 0.3 });
  const at = (a, yy, b, la, h, lb, m) => { const [px, pz] = P(a, b); B.box(px, y + yy, pz, along ? lb : la, h, along ? la : lb, m); };
  // cabina
  at(-4.2, 1.55, 0, 2.2, 1.9, 2.4, body); at(-4.5, 2.7, 0, 1.4, 0.5, 2.3, body);
  at(-5.32, 1.9, 0, 0.04, 0.8, 2.0, mat('glass'));
  at(-5.33, 0.85, 0, 0.06, 0.5, 2.2, mat('darkMetal'));
  for (const s of [-1, 1]) at(-4.0, 1.9, s * 1.21, 1.0, 0.7, 0.03, mat('glass'));
  at(-3.0, 1.6, 0, 0.3, 2.2, 0.3, mat('darkMetal'));
  // chasis + plataforma
  at(1.2, 0.75, 0, 8.2, 0.25, 2.5, mat('darkMetal'));
  at(-1.0, 0.55, 0, 10.8, 0.25, 1.2, mat('darkMetal'));
  // contenedor sobre la plataforma
  const ce = { p: [...(along ? [x, y + 0.88, z + 1.2] : [x + 1.2, y + 0.88, z])], o: along ? 'z' : 'x', c: 0x2c5f94, open: false, v: 3 };
  buildContainer(B, ce);
  // ruedas
  for (const a of [-4.4, -1.5, 3.0, 4.4]) for (const s of [-1, 1]) {
    const [px, pz] = P(a, s * 1.1);
    B.add(cyl(0.5, 0.5, 0.35, 10), mat('rubber'), along ? trs(px, y + 0.5, pz, 0, 0, Math.PI / 2) : trs(px, y + 0.5, pz, Math.PI / 2, 0, 0));
  }
}

function forklift(B, e) {
  const [x, y, z] = e.p, r = e.rot || 0;
  const g = new THREE.Group();
  const y1 = stdMat(0xe0a92a, { roughness: 0.5, metalness: 0.2 });
  const parts = [
    [0, 0.55, 0.2, 1.3, 0.8, 1.8, y1], [0, 1.0, 0.75, 1.2, 0.5, 0.6, mat('darkMetal')], [0, 1.4, 0.2, 0.6, 0.2, 0.5, mat('black')],
    [0, 2.15, 0.25, 1.3, 0.08, 1.4, mat('darkMetal')], [-0.6, 1.6, -0.35, 0.08, 1.2, 0.08, mat('darkMetal')], [0.6, 1.6, -0.35, 0.08, 1.2, 0.08, mat('darkMetal')],
    [-0.6, 1.6, 0.85, 0.08, 1.2, 0.08, mat('darkMetal')], [0.6, 1.6, 0.85, 0.08, 1.2, 0.08, mat('darkMetal')],
    [-0.45, 1.3, -0.85, 0.12, 2.5, 0.12, mat('darkMetal')], [0.45, 1.3, -0.85, 0.12, 2.5, 0.12, mat('darkMetal')],
    [-0.3, 0.12, -1.35, 0.14, 0.06, 1.0, mat('darkMetal')], [0.3, 0.12, -1.35, 0.14, 0.06, 1.0, mat('darkMetal')],
  ];
  const c = Math.cos(r), s = Math.sin(r);
  for (const [px, py, pz, w, h, d, m] of parts) {
    B.add(new THREE.BoxGeometry(w, h, d), m, trs(x + px * c + pz * s, y + py, z - px * s + pz * c, 0, r, 0));
  }
  for (const [px, pz] of [[-0.6, -0.4], [0.6, -0.4], [-0.6, 0.8], [0.6, 0.8]]) {
    B.add(cyl(0.28, 0.28, 0.25, 10), mat('rubber'), trs(x + px * c + pz * s, y + 0.28, z - px * s + pz * c, 0, r, Math.PI / 2));
  }
}

function machine(B, e, extras) {
  const [x, y, z] = e.p;
  const body = mat('metalWall');
  B.box(x, y + e.h / 2, z, e.w, e.h, e.d, body, 1.5);
  B.box(x, y + e.h + 0.15, z, e.w * 0.6, 0.3, e.d * 0.6, mat('darkMetal'));
  B.box(x, y + 0.1, z, e.w + 0.2, 0.2, e.d + 0.2, mat('hazard'), 1);
  // panel de control
  B.box(x + e.w / 2 + 0.05, y + 1.4, z, 0.1, 0.8, 1.2, mat('darkMetal'));
  for (let i = 0; i < 3; i++) B.box(x + e.w / 2 + 0.11, y + 1.55 - i * 0.18, z - 0.3 + i * 0.3, 0.02, 0.08, 0.08,
    stdMat([0x41ff7a, 0xffc43a, 0xff4040][i], { emissive: [0x41ff7a, 0xffc43a, 0xff4040][i], emissiveIntensity: 1.5 }), 1, { noShadow: true });
  // tubería hacia el techo
  B.add(cyl(0.18, 0.18, 9, 8), mat('steelYellow'), trs(x - e.w / 4, y + e.h + 4.5, z));
}

function furnace(B, e, extras, lights, anim) {
  const [x, y, z] = e.p;
  B.box(x, y + e.h / 2, z, e.w, e.h, e.d, surfBrick());
  B.box(x, y + e.h - 0.15, z, e.w + 0.3, 0.3, e.d + 0.3, mat('darkMetal'));
  const glow = stdMat(0xff7a1a, { emissive: 0xff5a10, emissiveIntensity: 2.4 });
  for (const s of [-1, 1]) {
    B.box(x, y + 1.0, z + s * (e.d / 2 + 0.01), 2.2, 1.2, 0.04, glow, 1, { noShadow: true });
    B.box(x + s * (e.w / 2 + 0.01), y + 1.0, z, 0.04, 1.2, 2.2, glow, 1, { noShadow: true });
  }
  B.add(cyl(0.9, 1.2, 7.5, 10), surfBrick(), trs(x, y + e.h + 3.75, z));
  lights.unshift({ p: [x, y + 1.5, z + e.d / 2 + 1.5], c: 0xff7a2a, i: 18, d: 14 });
  lights.unshift({ p: [x, y + 1.5, z - e.d / 2 - 1.5], c: 0xff7a2a, i: 18, d: 14 });
}
function surfBrick() { return MATS.fbrick || (MATS.fbrick = Object.assign(new THREE.MeshStandardMaterial({ map: T.brick(0x6e3a2e), roughness: 0.9 }), { userData: { texSize: 2.5 } })); }

function conveyor(B, e) {
  const [x, y, z] = e.p, az = e.o === 'z';
  const L = e.len;
  B.box(x, y + 0.82, z, az ? 1.2 : L, 0.08, az ? L : 1.2, mat('rubber'));
  for (const s of [-1, 1]) B.box(x + (az ? s * 0.65 : 0), y + 0.75, z + (az ? 0 : s * 0.65), az ? 0.1 : L, 0.3, az ? L : 0.1, mat('steelYellow'));
  for (let i = -L / 2 + 0.5; i < L / 2; i += 1.5) for (const s of [-1, 1]) B.box(x + (az ? s * 0.6 : i), y + 0.3, z + (az ? i : s * 0.6), 0.1, 0.6, 0.1, mat('darkMetal'));
  for (let i = -L / 2 + 1; i < L / 2 - 0.5; i += 2.5) B.add(new THREE.BoxGeometry(0.6, 0.45, 0.6), MATS.crate0 || mat('wood'), trs(x + (az ? 0 : i), y + 1.08, z + (az ? i : 0), 0, 0.3, 0));
}

function gate(B, e) {
  const [x, y, z] = e.p, rot = e.rot ? Math.PI / 2 : 0;
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (a) => [x + a * c, z - a * s];
  for (const a of [-2.6, 2.6]) { const [px, pz] = P(a); B.add(cyl(0.22, 0.26, 4.6, 8), mat('red'), trs(px, y + 2.3, pz)); B.box(px, y + 0.15, pz, 0.7, 0.3, 0.7, mat('black')); }
  const [cx, cz] = P(0);
  B.add(new THREE.BoxGeometry(6.6, 0.3, 0.4), mat('red'), trs(cx, y + 3.8, cz, 0, rot, 0));
  B.add(new THREE.BoxGeometry(7.6, 0.28, 0.55), mat('black'), trs(cx, y + 4.55, cz, 0, rot, 0));
  B.add(new THREE.BoxGeometry(7.2, 0.18, 0.5), mat('red'), trs(cx, y + 4.35, cz, 0, rot, 0));
  B.add(new THREE.BoxGeometry(0.5, 0.6, 0.12), mat('gold'), trs(cx, y + 4.1, cz, 0, rot, 0));
}

function pagodaRoof(B, e) {
  const [x, y, z] = e.p;
  let w = e.w, d = e.d, yy = y;
  for (let t = 0; t < e.tiers; t++) {
    const h = 2.0 - t * 0.4;
    const g = new THREE.CylinderGeometry(0.01, 0.7071, 1, 4, 1); g.rotateY(Math.PI / 4);
    B.add(g, mat('roofGreen'), trs(x, yy + h / 2, z, 0, 0, 0, w, h, d));
    B.add(new THREE.BoxGeometry(w * 0.9, 0.3, d * 0.9), mat('red'), trs(x, yy - 0.1, z));
    B.add(new THREE.BoxGeometry(w + 0.2, 0.12, d + 0.2), mat('gold'), trs(x, yy - 0.02, z));
    // esquinas levantadas
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.add(new THREE.ConeGeometry(0.18, 0.9, 4), mat('gold'), trs(x + sx * w * 0.5, yy + 0.25, z + sz * d * 0.5, sz * 0.6, 0, -sx * 0.6));
    if (t < e.tiers - 1) B.box(x, yy + h * 0.5 + 0.8, z, w * 0.45, 1.6, d * 0.45, mat('plasterRed'));
    yy += h * 0.5 + 1.6; w *= 0.55; d *= 0.55;
  }
  B.add(cyl(0.05, 0.25, 1.6, 6), mat('gold'), trs(x, yy + 0.3, z));
  for (let i = 0; i < 4; i++) B.add(new THREE.SphereGeometry(0.16, 6, 4), mat('gold'), trs(x, yy + 0.1 + i * 0.35, z));
}

function tree(B, e) {
  const [x, y, z] = e.p, s = e.s || 1;
  if (e.v === 'pine' || e.v === 'oak') return greenTree(B, e);
  const trunk = stdMat(0x5a3a28, { roughness: 0.9 });
  B.add(cyl(0.16 * s, 0.26 * s, 3 * s, 6), trunk, trs(x, y + 1.5 * s, z, 0.05, 0, -0.08));
  B.add(cyl(0.08 * s, 0.12 * s, 1.6 * s, 5), trunk, trs(x + 0.6 * s, y + 2.9 * s, z, 0, 0, -0.9));
  const pink = [0xf4a6c6, 0xf7bfd6, 0xe98fb6];
  const blobs = [[0, 3.6, 0, 1.6], [1.3, 3.3, 0.3, 1.2], [-1.1, 3.4, -0.4, 1.2], [0.2, 4.4, 0.6, 1.1], [0.4, 3.5, -1.2, 1.1], [-0.5, 3.2, 1.1, 1.0]];
  blobs.forEach(([bx, by, bz, r], i) => B.add(new THREE.IcosahedronGeometry(r * s, 0), stdMat(pink[i % 3], { roughness: 0.9 }), trs(x + bx * s, y + by * s, z + bz * s, i, i * 2, 0)));
}

// Árboles de la isla: pino (conos) y roble (copa de bloques), con variación por posición
function greenTree(B, e) {
  const [x, y, z] = e.p, s = e.s || 1, h = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
  const trunk = stdMat(0x5b4030, { roughness: 0.95 });
  const greens = [0x2f5a2a, 0x3b6b30, 0x4a7a35, 0x2a4f2c];
  if (e.v === 'pine') {
    const H = (5 + h * 3) * s;
    B.add(cyl(0.18 * s, 0.3 * s, H * 0.45, 6), trunk, trs(x, y + H * 0.22, z));
    for (let i = 0; i < 3; i++) {
      const r = (2.2 - i * 0.55) * s, ch = (2.6 - i * 0.3) * s, cy = y + H * 0.38 + i * H * 0.2;
      B.add(new THREE.ConeGeometry(r, ch, 7), stdMat(greens[(i + Math.floor(h * 4)) % 4], { roughness: 0.92, flatShading: true }), trs(x, cy + ch / 2, z, 0, h * 6 + i, 0));
    }
  } else {
    const H = (3 + h * 1.5) * s;
    B.add(cyl(0.22 * s, 0.34 * s, H, 6), trunk, trs(x, y + H / 2, z, 0.04, 0, -0.05));
    const blobs = [[0, 0.9, 0, 1.9], [1.4, 0.5, 0.4, 1.4], [-1.3, 0.6, -0.3, 1.4], [0.3, 1.8, 0.5, 1.3], [-0.2, 0.5, 1.3, 1.2], [0.4, 0.4, -1.3, 1.2]];
    blobs.forEach(([bx, by, bz, r], i) => B.add(new THREE.IcosahedronGeometry(r * s, 0), stdMat(greens[(i + Math.floor(h * 4)) % 4], { roughness: 0.92, flatShading: true }), trs(x + bx * s, y + H + by * s, z + bz * s, i, i * 2 + h, 0)));
  }
}

// Isla: playa alrededor, mar hasta el horizonte e islotes lejanos
function islandBackdrop(B, e, extras, anim) {
  const S = e.S + 2;
  const sandM = mat('sand');
  for (const [x, z, w, d] of [[0, -S - 14, S * 2 + 56, 28], [0, S + 14, S * 2 + 56, 28], [-S - 14, 0, 28, S * 2], [S + 14, 0, 28, S * 2]]) B.box(x, -0.18, z, w, 0.36, d, sandM, 5, { noShadow: true });
  // talud de arena hacia el agua
  for (const [x, z, w, d] of [[0, -S - 30, S * 2 + 90, 8], [0, S + 30, S * 2 + 90, 8], [-S - 30, 0, 8, S * 2 + 56], [S + 30, 0, 8, S * 2 + 56]]) B.box(x, -0.5, z, w, 0.4, d, sandM, 5, { noShadow: true });
  const tex = waterTexture();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, color: 0x8ecfe6, roughness: 0.1, metalness: 0.35 }));
  water.position.y = -0.55; water.receiveShadow = true; extras.add(water);
  anim.push((dt) => { tex.offset.x += dt * 0.004; tex.offset.y += dt * 0.0025; });
  // islotes lejanos
  const rockM = mat('rock'), green = stdMat(0x3b6b30, { roughness: 0.95, flatShading: true });
  for (const [a, r, sz] of [[0.3, 300, 26], [1.4, 320, 34], [2.5, 290, 22], [3.6, 330, 40], [4.6, 300, 28], [5.6, 315, 30]]) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    B.add(new THREE.ConeGeometry(sz, sz * 0.7, 7), rockM, trs(x, sz * 0.25, z, 0, a * 3, 0), { noShadow: true });
    B.add(new THREE.ConeGeometry(sz * 0.7, sz * 0.4, 7), green, trs(x, sz * 0.48, z, 0, a * 5, 0), { noShadow: true });
  }
}

function factoryRoof(B, e, extras) {
  const { X, Z, H } = e;
  const roof = mat('factoryWall');
  B.box(0, H + 0.2, 0, X * 2 + 2, 0.4, Z * 2 + 2, roof, 3, { noShadow: true });
  const truss = mat('darkMetal');
  for (let x = -X + 6; x < X; x += 8) {
    B.box(x, H - 0.4, 0, 0.35, 0.6, Z * 2, truss, 2, { noShadow: true });
    B.box(x, H - 1.6, 0, 0.2, 0.2, Z * 2, truss, 2, { noShadow: true });
    for (let zz = -Z + 2; zz < Z; zz += 4) B.add(new THREE.BoxGeometry(0.12, 1.5, 0.12), truss, trs(x, H - 1.0, zz, (zz / 4 & 1) ? 0.5 : -0.5, 0, 0), { noShadow: true });
  }
  const sky = stdMat(0x9fc4ff, { emissive: 0x6f9cdf, emissiveIntensity: 1.1 });
  for (let x = -X + 10; x < X; x += 16) B.box(x, H - 0.02, 0, 4, 0.05, Z * 1.3, sky, 1, { noShadow: true });
  // ventanas altas en paredes
  const win = stdMat(0x7fa8d8, { emissive: 0x4a72a8, emissiveIntensity: 0.9 });
  for (let x = -X + 4; x < X; x += 6) for (const s of [-1, 1]) B.box(x, H - 2.6, s * (Z - 0.02), 3.6, 1.4, 0.06, win, 1, { noShadow: true });
}

function harborBackdrop(B, e, extras, anim) {
  const S = e.S;
  const corr = MATS.whouse || (MATS.whouse = Object.assign(new THREE.MeshStandardMaterial({ map: T.containerSide(0x8a96a3, 2), roughness: 0.8 }), { userData: {} }));
  const corr2 = MATS.whouse2 || (MATS.whouse2 = Object.assign(new THREE.MeshStandardMaterial({ map: T.containerSide(0x6f7d6a, 2), roughness: 0.8 }), { userData: {} }));
  // naves industriales detrás de los muros
  const houses = [[-30, -S - 12, 30, 16, 14, corr], [12, -S - 14, 36, 18, 18, corr2], [-S - 12, 10, 16, 40, 13, corr2], [-20, S + 12, 40, 16, 16, corr]];
  for (const [x, z, w, d, h, m] of houses) {
    B.add(new THREE.BoxGeometry(w, h, d), m, trs(x, h / 2, z));
    B.add(new THREE.BoxGeometry(w + 1, 0.6, d + 1), mat('metalroof'), trs(x, h + 0.3, z));
  }
  // grúas pórtico
  const red = stdMat(0xc8402e, { roughness: 0.6, metalness: 0.3 }), white = stdMat(0xe8e8e8, { roughness: 0.6 });
  for (const [x, z, r] of [[26, S + 16, 0], [-8, S + 22, 0], [S + 10, 4, -Math.PI / 2], [S + 10, -22, -Math.PI / 2]]) {
    const c = Math.cos(r), s = Math.sin(r), P = (a, b) => [x + a * c + b * s, z - a * s + b * c];
    for (const a of [-6, 6]) for (const b of [-5, 5]) { const [px, pz] = P(a, b); B.box(px, 12, pz, 1, 24, 1, (b > 0 ? red : white)); }
    for (const b of [-5, 5]) { const [px, pz] = P(0, b); B.add(new THREE.BoxGeometry(14, 1.2, 1.2), red, trs(px, 24, pz, 0, r, 0)); }
    const [bx, bz] = P(0, -10); B.add(new THREE.BoxGeometry(2, 1.6, 40), white, trs(bx, 26, bz, 0, r, 0));
    const [hx, hz] = P(0, -8); B.box(hx, 23.5, hz, 3, 2, 3, red);
    B.box(hx, 18, hz, 0.08, 10, 0.08, mat('black'));
  }
  harborSea(B, S, extras, anim);
  // postes de luz
  for (const [x, z] of [[-S + 2, -S + 2], [S - 2, -S + 2], [-S + 2, S - 2], [S - 2, S - 2], [0, -S + 1.5], [0, S - 1.5]]) {
    B.add(cyl(0.12, 0.18, 12, 6), mat('darkMetal'), trs(x, 6, z));
    B.box(x, 12.1, z, 1.6, 0.3, 0.8, mat('darkMetal'));
    B.box(x, 11.9, z, 1.4, 0.06, 0.6, stdMat(0xfff4d8, { emissive: 0xfff0d0, emissiveIntensity: 1.5 }), 1, { noShadow: true });
  }
}

function shrineBackdrop(B, e, extras, anim) {
  const S = e.S;
  petals(extras, anim, S);
  const mtn = [stdMat(0x7a6f9a, { roughness: 1 }), stdMat(0x8f7ea8, { roughness: 1 }), stdMat(0x6b5f8a, { roughness: 1 })];
  for (let i = 0; i < 18; i++) {
    const a = i / 18 * Math.PI * 2, r = 120 + (i % 3) * 25, h = 30 + ((i * 37) % 30);
    B.add(new THREE.ConeGeometry(28 + (i % 4) * 8, h, 5), mtn[i % 3], trs(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r, 0, i, 0), { noShadow: true });
  }
  // bambú detrás del muro
  const bam = stdMat(0x6b9a3a, { roughness: 0.8 }), leaf = stdMat(0x4f8a3a, { roughness: 0.9 });
  for (let i = 0; i < 60; i++) {
    const side = i % 4, t = ((i * 0.618) % 1) * 2 - 1;
    const d = S + 2.5 + ((i * 7) % 5);
    const x = side < 2 ? t * S : (side === 2 ? -d : d), z = side < 2 ? (side === 0 ? -d : d) : t * S;
    const h = 7 + (i % 5);
    B.add(cyl(0.09, 0.11, h, 5), bam, trs(x, h / 2, z), { noShadow: true });
    B.add(new THREE.IcosahedronGeometry(1.2, 0), leaf, trs(x, h, z, i, i, 0, 1, 1.4, 1), { noShadow: true });
  }
}

// Cielo degradado + nubes low-poly
function sky(map, group, anim) {
  const geo = new THREE.SphereGeometry(400, 24, 16);
  const m = new THREE.MeshBasicMaterial({ map: T.skyTexture(map.sky.top, map.sky.mid, map.sky.bottom), side: THREE.BackSide, fog: false, depthWrite: false });
  const s = new THREE.Mesh(geo, m); s.renderOrder = -1; group.add(s);
  if (map.clouds) {
    // de noche (evento) las nubes son siluetas azuladas iluminadas por la luna
    const cm = map.night ? new THREE.MeshStandardMaterial({ color: 0x3a4566, roughness: 1, flatShading: true, emissive: 0x141c33, emissiveIntensity: 0.6, fog: false })
      : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x8899aa, emissiveIntensity: 0.35, fog: false });
    const clouds = new THREE.Group();
    for (let i = 0; i < 22; i++) {
      const c = new THREE.Group();
      const n = 3 + (i % 3);
      for (let k = 0; k < n; k++) {
        const b = new THREE.Mesh(new THREE.IcosahedronGeometry(6 + (k % 2) * 3, 0), cm);
        b.position.set(k * 7 - n * 3.5, (k % 2) * 3, (k % 3) * 2); b.scale.y = 0.6; b.rotation.set(k, i, 0);
        c.add(b);
      }
      const a = i / 22 * Math.PI * 2 + (i % 2) * 0.13, r = 180 + (i % 4) * 30;
      c.position.set(Math.cos(a) * r, 60 + (i % 5) * 14, Math.sin(a) * r);
      c.lookAt(0, c.position.y, 0);
      clouds.add(c);
    }
    group.add(clouds);
    anim.push((dt) => { clouds.rotation.y += dt * 0.004; });
  }
}

// Sombras de contacto en la base de todo lo que toca el suelo: da peso y profundidad a la escena.
function contactShadows(B, map) {
  const col = makeCollider(map.collision);
  const ao = MATS.ao || (MATS.ao = new THREE.MeshBasicMaterial({ map: T.aoTexture(), transparent: true, opacity: map.indoor ? 0.75 : 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, color: 0x000000 }));
  const strip = MATS.aostrip || (MATS.aostrip = new THREE.MeshBasicMaterial({ map: T.aoStripTexture(), transparent: true, opacity: map.indoor ? 0.6 : 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, color: 0x000000 }));
  for (const b of map.collision) {
    if (b.ramp) continue;
    const [cx, by, cz] = b.p, [w, h, d] = b.s;
    if (h < 0.5 || w > 60 || d > 60 || by < -0.5) continue;
    // ¿hay suelo justo debajo?
    const hit = raycastWorld(col, cx, by + 0.05, cz, 0, -1, 0, 0.3, false);
    const grounded = by < 0.01 || (hit && hit.t < 0.2);
    if (!grounded) continue;
    const L = Math.max(w, d), S = Math.min(w, d);
    const m = Math.min(1.1, 0.35 + h * 0.25);
    if (L > 9 || L / S > 6) {
      const g = new THREE.PlaneGeometry(L + m, S + m * 2).rotateX(-Math.PI / 2);
      B.add(g, strip, trs(cx, by + 0.012, cz, 0, w > d ? 0 : Math.PI / 2, 0), { noShadow: true });
    } else {
      const g = new THREE.PlaneGeometry(w + m * 2, d + m * 2).rotateX(-Math.PI / 2);
      B.add(g, ao, trs(cx, by + 0.012, cz), { noShadow: true });
    }
  }
}

// ---------- Mar, barco de carga y gaviotas (lado este del puerto) ----------
function waterTexture() {
  if (MATS.waterTex) return MATS.waterTex;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#1f6a8c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    const x = Math.random() * 256, y = Math.random() * 256, w = 8 + Math.random() * 30;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(170,220,240,0.22)' : 'rgba(10,50,80,0.25)';
    g.fillRect(x, y, w, 1.5 + Math.random() * 2);
    g.fillRect(x - 256, y, w, 2);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.repeat.set(40, 40);
  MATS.waterTex = t; return t;
}
function harborSea(B, S, extras, anim) {
  const tex = waterTexture();
  const water = new THREE.Mesh(new THREE.PlaneGeometry(500, 900).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ map: tex, color: 0x9fd0e6, roughness: 0.12, metalness: 0.35 }));
  water.position.set(S + 15 + 250, -0.9, 0); water.receiveShadow = true;
  extras.add(water);
  anim.push((dt) => { tex.offset.x += dt * 0.004; tex.offset.y += dt * 0.0025; });
  // muelle: borde de hormigón con bolardos y neumáticos
  B.box(S + 15.2, -0.5, 0, 0.6, 1.0, 400, mat('concreteDock'));
  for (let z = -60; z <= 60; z += 12) {
    B.add(cyl(0.22, 0.28, 0.6, 8), mat('darkMetal'), trs(S + 14, 0.3, z));
    B.add(new THREE.TorusGeometry(0.4, 0.16, 6, 10), mat('rubber'), trs(S + 15.55, -0.3, z + 6, 0, Math.PI / 2, 0));
  }
  // barco portacontenedores
  const hullM = stdMat(0x2a2f38, { roughness: 0.6 }), redM = stdMat(0x9e2b25, { roughness: 0.6 }), whiteM = stdMat(0xe9ecef, { roughness: 0.5 });
  const sx = S + 38, L = 90, W = 18;
  B.box(sx, -1, 0, W, 10, L, hullM, 4, { noShadow: true });
  B.box(sx, -5.2, 0, W + 0.1, 1.6, L + 0.1, redM, 4, { noShadow: true });
  const bow = new THREE.Shape(); bow.moveTo(-W / 2, 0); bow.lineTo(W / 2, 0); bow.lineTo(0, 16); bow.lineTo(-W / 2, 0);
  const bg = new THREE.ExtrudeGeometry(bow, { depth: 9, bevelEnabled: false }); bg.rotateX(Math.PI / 2); bg.translate(0, 4, 0);
  B.add(bg, hullM, trs(sx, 0, -L / 2, 0, Math.PI, 0), { noShadow: true });
  B.box(sx, 8.5, L / 2 - 6, W, 9, 10, whiteM, 4, { noShadow: true });
  B.box(sx, 13.7, L / 2 - 6, W + 3, 1.4, 6, whiteM, 4, { noShadow: true });
  const glassM = stdMat(0x24384f, { roughness: 0.1, metalness: 0.5 });
  for (let i = 0; i < 6; i++) B.box(sx - 7 + i * 2.8, 11, L / 2 - 11.05, 2, 1.2, 0.1, glassM, 1, { noShadow: true });
  B.add(cyl(1.2, 1.4, 6, 10), redM, trs(sx, 15.5, L / 2 - 3), { noShadow: true });
  const cols = [0xb5382c, 0x2c5f94, 0x3d7a46, 0xd27a28, 0xc9cdd2, 0x2a8a8a, 0xd6a72a];
  let k = 0;
  for (let z = -L / 2 + 12; z < L / 2 - 14; z += 6.4) for (let r = 0; r < 6; r++) {
    const tiers = 1 + ((r * 7 + k) % 3);
    for (let t = 0; t < tiers; t++) {
      const col = cols[(k * 3 + r + t) % cols.length]; k++;
      const cm = contMats(col, k);
      B.add(new THREE.BoxGeometry(2.44, 2.6, 6.1), cm.side, trs(sx - 7.3 + r * 2.92, 4 + 1.3 + t * 2.6, z), { noShadow: true });
    }
  }
  // gaviotas
  const gullM = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const gulls = [];
  for (let i = 0; i < 7; i++) {
    const gp = new THREE.Group();
    gp.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.15, 0.6), gullM));
    const wl = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3).translate(-0.45, 0, 0).rotateX(-Math.PI / 2), gullM);
    const wr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.3).translate(0.45, 0, 0).rotateX(-Math.PI / 2), gullM);
    gp.add(wl, wr); extras.add(gp);
    gulls.push({ gp, wl, wr, cx: S + 10 + Math.random() * 40, cz: -30 + Math.random() * 60, r: 12 + Math.random() * 18, h: 18 + Math.random() * 14, sp: 0.12 + Math.random() * 0.1, a: Math.random() * 6.28, f: Math.random() * 6 });
  }
  let t = 0;
  anim.push((dt) => {
    t += dt;
    for (const g of gulls) {
      g.a += dt * g.sp;
      g.gp.position.set(g.cx + Math.cos(g.a) * g.r, g.h + Math.sin(t * 0.7 + g.f) * 1.5, g.cz + Math.sin(g.a) * g.r);
      g.gp.rotation.y = -g.a; g.gp.rotation.z = 0.25;
      const fl = Math.sin(t * 7 + g.f) * 0.5;
      g.wl.rotation.z = fl; g.wr.rotation.z = -fl;
    }
  });
}

// ---------- Pétalos de cerezo cayendo (santuario) ----------
function petals(extras, anim, S) {
  const N = 220;
  const geo = new THREE.PlaneGeometry(0.09, 0.06);
  const m = new THREE.MeshLambertMaterial({ color: 0xf6b6cf, side: THREE.DoubleSide });
  const inst = new THREE.InstancedMesh(geo, m, N);
  inst.frustumCulled = false;
  const P = [];
  for (let i = 0; i < N; i++) P.push({ x: (Math.random() * 2 - 1) * S, y: Math.random() * 12, z: (Math.random() * 2 - 1) * S, v: 0.5 + Math.random() * 0.6, ph: Math.random() * 6.28, rs: 1 + Math.random() * 3 });
  extras.add(inst);
  const o = new THREE.Object3D();
  let t = 0;
  anim.push((dt) => {
    t += dt;
    for (let i = 0; i < N; i++) {
      const p = P[i];
      p.y -= p.v * dt; p.x += Math.sin(t * 0.8 + p.ph) * 0.4 * dt + 0.15 * dt; p.z += Math.cos(t * 0.6 + p.ph) * 0.3 * dt;
      if (p.y < 0.02) { p.y = 10 + Math.random() * 3; p.x = (Math.random() * 2 - 1) * S; p.z = (Math.random() * 2 - 1) * S; }
      o.position.set(p.x, p.y, p.z); o.rotation.set(t * p.rs + p.ph, t * p.rs * 0.7, p.ph); o.updateMatrix();
      inst.setMatrixAt(i, o.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
  });
}

// ---------- Brasas del horno y polvo en los haces de luz (fundición) ----------
function foundryParticles(e, extras, anim) {
  const mk = (n, color, size, opacity) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.PointsMaterial({ color, size, map: T.glowSprite(), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; extras.add(pts); return pts;
  };
  const embers = mk(70, 0xff9a40, 0.12, 0.95), dust = mk(260, 0xcfe0ff, 0.05, 0.5);
  const E = [], Dd = [];
  for (let i = 0; i < 70; i++) E.push({ x: 0, y: 99, z: 0, vx: 0, vy: 0, vz: 0, life: Math.random() * 2 });
  for (let i = 0; i < 260; i++) Dd.push({ x: (Math.random() * 2 - 1) * e.X, y: Math.random() * 9, z: (Math.random() * 2 - 1) * e.Z, ph: Math.random() * 6.28 });
  let t = 0;
  anim.push((dt) => {
    t += dt;
    const ep = embers.geometry.attributes.position;
    E.forEach((p, i) => {
      p.life -= dt;
      if (p.life <= 0) {
        const side = Math.random() < 0.5 ? 1 : -1, along = (Math.random() - 0.5) * 2, out = side * (3.1 + Math.random() * 0.4);
        if (Math.random() < 0.5) { p.x = along; p.z = out; } else { p.x = out; p.z = along; }
        p.y = 0.6 + Math.random(); p.vy = 0.8 + Math.random() * 1.5; p.life = 1 + Math.random() * 1.5; p.vx = (Math.random() - 0.5) * 0.6; p.vz = (Math.random() - 0.5) * 0.6;
      }
      p.y += p.vy * dt; p.x += p.vx * dt + Math.sin(t * 3 + i) * 0.2 * dt; p.z += p.vz * dt;
      ep.setXYZ(i, p.x, p.y, p.z);
    });
    ep.needsUpdate = true;
    const dp = dust.geometry.attributes.position;
    Dd.forEach((p, i) => { dp.setXYZ(i, p.x + Math.sin(t * 0.2 + p.ph) * 0.6, p.y + Math.sin(t * 0.13 + p.ph * 2) * 0.4, p.z + Math.cos(t * 0.17 + p.ph) * 0.6); });
    dp.needsUpdate = true;
  });
}
