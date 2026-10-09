// GUNSMITH (prototipo): estudio 3D con preview del arma. Clic en el arma = vista despiezada con
// componentes editables (boca, cañón, mira, cargador, culata, empuñadura, bajo cañón).
import * as THREE from 'three';
import { makeGun, GUN_PARTS, stdMat } from '../gfx/models.js';
import { makeEnv } from '../gfx/env.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../data/weapons.js';
import { play } from '../game/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const backOut = (t) => { const c = 1.6; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SLOTS = ['MUZZLE', 'BARREL', 'OPTIC', 'UNDERBARREL', 'MAGAZINE', 'GRIP', 'STOCK'];
const OFFSET = { MUZZLE: V(0, 0.01, -0.15), BARREL: V(0, 0.01, -0.08), OPTIC: V(0, 0.1, 0), UNDERBARREL: V(0, -0.07, -0.04), MAGAZINE: V(0, -0.12, 0.01), GRIP: V(0, -0.08, 0.05), STOCK: V(0, 0.01, 0.12), RECEIVER: V(0, 0, 0) };

// Clasifica cada pieza del modelo en un "slot" editable (heurística por posición).
function classify(def) {
  const mz = def.muzzle[2];
  return def.parts.map((p) => {
    const [, y, z] = p.p;
    if (p.name === 'mag' || p.name === 'drum') return 'MAGAZINE';
    if (p.t === 'blade') return 'RECEIVER';
    if ((p.t === 'c' || p.t === 'cx') && z <= mz + 0.09) return 'MUZZLE';
    if (p.t === 'c' && z < -0.25 && y < def.sightY - 0.02) return 'BARREL';
    if (y >= def.sightY - 0.02 && y > 0.06 && Math.abs(z) < 0.35) return 'OPTIC';
    if (p.t === 'b' && z < -0.45) return 'BARREL';
    if (p.t === 'b' && p.r && y < -0.03 && Math.abs(z - def.hands.r[2]) < 0.1) return 'GRIP';
    if (z > 0.18) return 'STOCK';
    if (p.t === 'b' && z < -0.2 && y <= 0.06) return 'UNDERBARREL';
    return 'RECEIVER';
  });
}

// Accesorios: stats en puntos (sobre 100) y constructor de la pieza nueva (coords del arma).
const M = {
  dark: stdMat(0x2b2e35, { roughness: 0.45, metalness: 0.2 }), steel: stdMat(0x6a707c, { roughness: 0.35, metalness: 0.3 }),
  red: stdMat(0xff2a2a, { emissive: 0xff2020, emissiveIntensity: 2 }), cyan: stdMat(0x48d8ff, { emissive: 0x2aa8d8, emissiveIntensity: 1.4, transparent: true, opacity: 0.75 }),
  rubber: stdMat(0x1a1b1f, { roughness: 0.95 }), tan: stdMat(0xb8986a, { roughness: 0.7 }), beam: new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0.55 }),
};
const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; return o; };
const cylZ = (r, l, m, x, y, z, seg = 10) => { const g = new THREE.CylinderGeometry(r, r, l, seg); g.rotateX(Math.PI / 2); const o = new THREE.Mesh(g, m); o.position.set(x, y, z); return o; };
const group = (...k) => { const g = new THREE.Group(); k.forEach(o => g.add(o)); return g; };

const ATTACH = {
  MUZZLE: [
    { id: 'factory', name: 'FACTORY', stats: {} },
    { id: 'comp', name: 'COMPENSATOR', stats: { control: 10, mobility: -2 }, build: (d) => { const [x, y, z] = d.muzzle; return group(box(0.04, 0.04, 0.08, M.dark, x, y, z - 0.03), box(0.042, 0.01, 0.012, M.steel, x, y + 0.016, z - 0.015), box(0.042, 0.01, 0.012, M.steel, x, y + 0.016, z - 0.045)); } },
    { id: 'supp', name: 'SUPPRESSOR', stats: { range: 8, mobility: -6, control: 4 }, build: (d) => { const [x, y, z] = d.muzzle; return group(cylZ(0.024, 0.22, M.dark, x, y, z - 0.1, 12), cylZ(0.026, 0.02, M.steel, x, y, z - 0.005, 12)); } },
    { id: 'flash', name: 'FLASH HIDER', stats: { accuracy: 4 }, build: (d) => { const [x, y, z] = d.muzzle; const g = group(cylZ(0.016, 0.03, M.dark, x, y, z)); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.add(box(0.008, 0.008, 0.05, M.dark, x + Math.cos(a) * 0.014, y + Math.sin(a) * 0.014, z - 0.04)); } return g; } },
  ],
  BARREL: [
    { id: 'factory', name: 'FACTORY', stats: {} },
    { id: 'short', name: 'CQB SHORT', stats: { mobility: 9, range: -12, accuracy: -4 }, scale: 0.72 },
    { id: 'long', name: 'MARKSMAN LONG', stats: { range: 14, accuracy: 6, mobility: -8 }, scale: 1.3 },
  ],
  OPTIC: [
    { id: 'factory', name: 'IRON SIGHTS', stats: {} },
    { id: 'reddot', name: 'RED DOT', stats: { accuracy: 6, mobility: -1 }, build: (d) => { const y = Math.max(0.09, d.sightY) + 0.01; return group(box(0.04, 0.012, 0.07, M.dark, 0, y - 0.01, -0.06), box(0.045, 0.04, 0.012, M.dark, 0, y + 0.016, -0.085), box(0.03, 0.025, 0.004, M.cyan, 0, y + 0.018, -0.079), box(0.008, 0.008, 0.008, M.red, 0, y + 0.018, -0.05)); } },
    { id: 'holo', name: 'HOLO SIGHT', stats: { accuracy: 8, mobility: -2 }, build: (d) => { const y = Math.max(0.09, d.sightY) + 0.01; return group(box(0.05, 0.014, 0.09, M.dark, 0, y - 0.008, -0.05), box(0.006, 0.05, 0.08, M.dark, 0.026, y + 0.02, -0.05), box(0.006, 0.05, 0.08, M.dark, -0.026, y + 0.02, -0.05), box(0.05, 0.008, 0.08, M.dark, 0, y + 0.046, -0.05), box(0.046, 0.04, 0.004, M.cyan, 0, y + 0.02, -0.088)); } },
    { id: 'scope', name: '3.5X SCOPE', stats: { range: 10, accuracy: 10, mobility: -6 }, build: (d) => { const y = Math.max(0.09, d.sightY) + 0.035; return group(cylZ(0.022, 0.26, M.dark, 0, y, -0.06), cylZ(0.032, 0.06, M.dark, 0, y, -0.2), cylZ(0.028, 0.05, M.dark, 0, y, 0.08), cylZ(0.029, 0.004, M.cyan, 0, y, -0.232), box(0.02, 0.03, 0.03, M.dark, 0, y - 0.03, -0.12), box(0.02, 0.03, 0.03, M.dark, 0, y - 0.03, 0.02)); } },
  ],
  UNDERBARREL: [
    { id: 'factory', name: 'NONE', stats: {} },
    { id: 'vgrip', name: 'VERTICAL GRIP', stats: { control: 10, mobility: -3 }, build: (d) => group(box(0.03, 0.1, 0.035, M.rubber, 0, -0.08, d.hands.l[2])) },
    { id: 'agrip', name: 'ANGLED GRIP', stats: { control: 5, mobility: 2 }, build: (d) => group(box(0.03, 0.05, 0.08, M.rubber, 0, -0.055, d.hands.l[2] - 0.02, 0.6)) },
    { id: 'laser', name: 'TACTICAL LASER', stats: { accuracy: 7 }, build: (d) => { const z = d.hands.l[2] - 0.04; const beam = box(0.004, 0.004, 3, M.beam, 0.045, 0.0, z - 1.5); return group(box(0.03, 0.03, 0.07, M.dark, 0.045, 0.0, z), box(0.012, 0.012, 0.004, M.red, 0.045, 0, z - 0.037), beam); } },
  ],
  MAGAZINE: [
    { id: 'factory', name: 'FACTORY MAG', stats: {} },
    { id: 'ext', name: 'EXTENDED MAG', stats: { mobility: -4, control: -1, firerate: 2 }, scaleY: 1.45 },
    { id: 'fast', name: 'FAST MAG', stats: { mobility: 3 }, tint: 0xd8a23a },
    { id: 'drum', name: 'DRUM MAG', stats: { mobility: -9, control: 3 }, build: (d, c) => { const g = group(); const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 16), M.dark); dr.rotation.z = Math.PI / 2; dr.position.set(0, c.y - 0.05, c.z); g.add(dr, box(0.03, 0.05, 0.04, M.dark, 0, c.y + 0.03, c.z)); return g; }, hideFactory: true },
  ],
  GRIP: [
    { id: 'factory', name: 'FACTORY GRIP', stats: {} },
    { id: 'rubber', name: 'RUBBERIZED', stats: { control: 4, accuracy: 2 }, tint: 0x1a1b1f },
    { id: 'tan', name: 'ERGO TAN', stats: { mobility: 3 }, tint: 0xb8986a },
  ],
  STOCK: [
    { id: 'factory', name: 'FACTORY STOCK', stats: {} },
    { id: 'skeleton', name: 'SKELETON', stats: { mobility: 7, control: -5 }, build: (d, c) => group(box(0.012, 0.012, 0.3, M.steel, 0, c.y + 0.03, c.z - 0.02), box(0.012, 0.012, 0.28, M.steel, 0, c.y - 0.03, c.z), box(0.04, 0.12, 0.025, M.rubber, 0, c.y - 0.01, c.z + 0.14)), hideFactory: true },
    { id: 'none', name: 'NO STOCK', stats: { mobility: 12, control: -12, accuracy: -6 }, hideFactory: true },
    { id: 'heavy', name: 'HEAVY STOCK', stats: { control: 9, mobility: -6 }, scale: 1.18 },
  ],
};

function baseStats(w) {
  const dps = w.damage * w.pellets * w.rpm / 60;
  return {
    damage: Math.min(100, Math.round(w.damage * w.pellets / 1.15)),
    firerate: Math.min(100, Math.round(w.rpm / 11)),
    range: Math.min(100, Math.round(20 + w.falloffEnd * 0.55)),
    accuracy: Math.min(100, Math.round(100 - w.spreadHip * 900)),
    mobility: Math.min(100, Math.round(w.moveMul * 100 - 40)),
    control: Math.min(100, Math.round(100 - w.recoilV * 1100)),
    dps: Math.round(dps),
  };
}
const STAT_NAMES = [['damage', 'DAMAGE'], ['firerate', 'FIRE RATE'], ['range', 'RANGE'], ['accuracy', 'ACCURACY'], ['mobility', 'MOBILITY'], ['control', 'RECOIL CONTROL']];
const KIND_ORDER = ['RIFLE', 'BURST', 'SMG', 'LMG', 'MARKSMAN', 'SNIPER', 'SHOTGUN', 'LAUNCHER', 'PISTOL'];

export class Gunsmith {
  constructor(app) {
    this.app = app;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x14120d);
    scene.fog = new THREE.Fog(0x14120d, 6, 14);
    scene.environment = makeEnv(app.renderer, '#5a5440', '#7a6e52', '#1a1812', 'bench'); scene.environmentIntensity = 0.55;
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 50);
    // INTERIOR DE LA MOCHILA: paredes de lona curvadas, tapete de trabajo y luz que entra por la abertura
    const lona = document.createElement('canvas'); lona.width = lona.height = 256; const lg = lona.getContext('2d');
    lg.fillStyle = '#4a4632'; lg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 256; i += 3) { lg.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.06})`; lg.fillRect(0, i, 256, 1); lg.fillRect(i, 0, 1, 256); }
    lg.strokeStyle = 'rgba(230,215,170,0.35)'; lg.setLineDash([6, 5]); lg.lineWidth = 2;
    lg.beginPath(); lg.moveTo(0, 40); lg.lineTo(256, 40); lg.moveTo(0, 216); lg.lineTo(256, 216); lg.moveTo(128, 0); lg.lineTo(128, 256); lg.stroke();
    const lt = new THREE.CanvasTexture(lona); lt.wrapS = lt.wrapT = THREE.RepeatWrapping; lt.repeat.set(6, 2); lt.colorSpace = THREE.SRGBColorSpace;
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.2, 7, 40, 1, true), new THREE.MeshStandardMaterial({ map: lt, roughness: 1, side: THREE.BackSide }));
    walls.position.set(0, 2.6, -0.6); scene.add(walls);
    const mat = document.createElement('canvas'); mat.width = 512; mat.height = 256; const mg = mat.getContext('2d');
    mg.fillStyle = '#1f2a26'; mg.fillRect(0, 0, 512, 256);
    mg.strokeStyle = 'rgba(160,200,180,0.18)'; mg.lineWidth = 1;
    for (let x = 0; x <= 512; x += 16) { mg.beginPath(); mg.moveTo(x, 0); mg.lineTo(x, 256); mg.stroke(); }
    for (let y = 0; y <= 256; y += 16) { mg.beginPath(); mg.moveTo(0, y); mg.lineTo(512, y); mg.stroke(); }
    mg.strokeStyle = 'rgba(200,230,210,0.35)'; mg.lineWidth = 2;
    for (let x = 0; x <= 512; x += 64) { mg.beginPath(); mg.moveTo(x, 0); mg.lineTo(x, 256); mg.stroke(); }
    mg.fillStyle = 'rgba(210,235,220,0.5)'; mg.font = '10px monospace';
    for (let x = 64; x < 512; x += 64) mg.fillText(String(x / 16), x + 3, 12);
    const mt = new THREE.CanvasTexture(mat); mt.colorSpace = THREE.SRGBColorSpace; mt.anisotropy = 8;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 2.7), [stdMat(0x2a2620), stdMat(0x2a2620), new THREE.MeshStandardMaterial({ map: mt, roughness: 0.85 }), stdMat(0x2a2620), stdMat(0x2a2620), stdMat(0x2a2620)]);
    bench.position.set(0, 0.54, 0); bench.receiveShadow = true; scene.add(bench);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x24221a, roughness: 1 })); scene.add(ground);
    // utilería sobre el tapete
    const P = (geo, m, x, y, z, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(0, ry, rz); o.castShadow = o.receiveShadow = true; scene.add(o); return o; };
    const magM = stdMat(0x3a3e46, { roughness: 0.45, metalness: 0.2 }), olive = stdMat(0x4f5a38, { roughness: 0.7 });
    P(new THREE.BoxGeometry(0.12, 0.05, 0.36), magM, -2.1, 0.625, 0.75, 0.3); P(new THREE.BoxGeometry(0.12, 0.05, 0.36), magM, -1.92, 0.625, 0.8, 0.45);
    P(new THREE.SphereGeometry(0.11, 10, 8), olive, 2.15, 0.71, 0.75); P(new THREE.CylinderGeometry(0.04, 0.04, 0.06, 8), magM, 2.15, 0.83, 0.75);
    P(new THREE.TorusGeometry(0.11, 0.05, 8, 16), stdMat(0x6a6a60, { roughness: 0.9 }), 1.75, 0.65, 0.95, 0, Math.PI / 2).rotation.x = Math.PI / 2;
    P(new THREE.BoxGeometry(0.28, 0.03, 0.07), stdMat(0xb83a2a, { roughness: 0.5 }), -1.6, 0.615, -0.95, 0.8);
    P(new THREE.BoxGeometry(0.05, 0.008, 0.08), stdMat(0xc9ccd2, { roughness: 0.25, metalness: 0.6 }), 1.45, 0.604, -0.9, 0.3);
    P(new THREE.BoxGeometry(0.05, 0.008, 0.08), stdMat(0xc9ccd2, { roughness: 0.25, metalness: 0.6 }), 1.5, 0.604, -0.82, 0.6);
    // halo del arma sobre el tapete
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.12, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8b56a, transparent: true, opacity: 0.5 }));
    this.ring.position.y = 0.605; scene.add(this.ring);
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.27, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xd8b56a, transparent: true, opacity: 0.3 }));
    this.ring2.position.y = 0.605; scene.add(this.ring2);
    // luz: entra por la abertura de la mochila (arriba) + relleno cálido + contraluz frío
    scene.add(new THREE.HemisphereLight(0xffe2b0, 0x2a2418, 0.55));
    const key = this.key = new THREE.SpotLight(0xffe0b0, 70, 14, 0.55, 0.7, 1.2); key.position.set(0.4, 6, 1.4); key.target.position.set(0, 1.0, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    scene.add(key, key.target);
    const rimC = new THREE.DirectionalLight(0x6fb8ff, 1.3); rimC.position.set(-4, 2, -3); scene.add(rimC);
    const rimO = new THREE.DirectionalLight(0xffa860, 1.0); rimO.position.set(4, 1.5, -3); scene.add(rimO);
    // foco que resalta el componente seleccionado
    this.focus = new THREE.SpotLight(0xffffff, 0, 8, 0.18, 0.6, 1); this.focus.position.set(0, 4, 3); scene.add(this.focus, this.focus.target);
    // haz de luz desde la abertura
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gg = gc.getContext('2d');
    const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 2.2, 5.5, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xffdcaa, alphaMap: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.06, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    shaft.position.set(0.2, 3.6, 0.6); scene.add(shaft);
    // polvo en el haz
    const N = 160, pp = new Float32Array(N * 3); this.motes = [];
    for (let i = 0; i < N; i++) this.motes.push({ x: (Math.random() - 0.5) * 5, y: 0.6 + Math.random() * 3.5, z: (Math.random() - 0.5) * 3, ph: Math.random() * 6.28 });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xffe2b8, size: 0.016, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; scene.add(this.dust);
    this.ghosts = [];

    this.root = new THREE.Group(); this.root.position.y = 1.15; scene.add(this.root);
    this.t = 0; this.yaw = 0.6; this.yawV = 0; this.explode = 0; this.exploding = false; this.camK = 0;
    this.drag = null; this.items = [];
    this.buildDom();
  }

  // ---------------- DOM ----------------
  buildDom() {
    const el = this.el = document.createElement('div');
    el.id = 'gunsmith'; el.className = 'hidden';
    el.innerHTML = `
      <div class="gs-top"><button class="gs-back">‹ BACK</button><div><small id="gs-crumb">LOADOUT</small><h1 id="gs-title">GUNSMITH</h1></div></div>
      <div class="gs-tabs" id="gs-tabs"><button class="gs-tab on" data-t="loadouts">LOADOUTS</button><button class="gs-tab" data-t="chars">OPERATORS</button><button class="gs-tab" data-t="skins">WEAPON SKINS</button></div>
      <div class="gs-list" id="gs-list"></div>
      <div class="gs-stats" id="gs-stats"></div>
      <div class="gs-name" id="gs-name"></div>
      <svg class="gs-lines" id="gs-lines"></svg>
      <div class="gs-labels" id="gs-labels"></div>
      <div class="gs-drawer" id="gs-drawer"></div>
      <div class="gs-hint" id="gs-hint">CLICK THE WEAPON TO CUSTOMIZE · DRAG TO ROTATE</div>
      <div class="gs-flash" id="gs-flash"></div>`;
    document.body.appendChild(el);
    el.querySelector('.gs-back').addEventListener('click', () => { play('ui'); this.back(); });
    el.querySelectorAll('.gs-tab').forEach(b => b.addEventListener('click', () => { play('ui'); if (this.onTab) this.onTab(b.dataset.t); }));
    const cv = this.app.canvas;
    this.onDown = (e) => { if (this.open && e.target === cv) this.drag = { x: e.clientX, y: e.clientY, moved: 0 }; };
    this.onMove = (e) => { if (!this.drag) return; const dx = e.clientX - this.drag.x; this.drag.x = e.clientX; this.drag.moved += Math.abs(dx); if (!this.exploding) this.yawV = dx * 0.5; };
    this.onUp = (e) => { if (!this.drag) return; const d = this.drag; this.drag = null; if (d.moved < 6) this.click(e); };
    addEventListener('mousedown', this.onDown); addEventListener('mousemove', this.onMove); addEventListener('mouseup', this.onUp);
    addEventListener('keydown', (e) => { if (this.open && e.code === 'Escape' && !document.getElementById('bag')) this.back(); });
  }

  // Nivel 1: mesa de loadouts dentro de la mochila
  openBench(onClose, onTab) {
    const P = this.app.profile;
    P.attachments = P.attachments || {};
    this.onClose = onClose; this.onTab = onTab; this.mode = 'loadout'; this.fromBench = true;
    this.open = true; this.el.classList.remove('hidden'); this.el.classList.add('bench');
    this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in');
    this.benchSlot = 'primary';
    this.introT = 0; this.fromAbove = true;
    this.renderLoadouts();
    this.preview(P.loadouts[P.loadout][this.benchSlot], true);
    this.setExplode(false, true);
  }
  renderLoadouts() {
    const P = this.app.profile;
    document.getElementById('gs-title').textContent = 'LOADOUT';
    document.getElementById('gs-crumb').textContent = 'INVENTORY › BACKPACK';
    this.el.classList.add('bench');
    const box = document.getElementById('gs-list');
    box.innerHTML = `<div class="gs-cat">LOADOUTS</div>` + P.loadouts.map((L, i) => `<button class="gs-item gs-lo ${P.loadout === i ? 'on' : ''}" data-i="${i}"><span>${i < 3 ? 'CUSTOM ' + (i + 1) : 'LOADOUT ' + (i + 1)}</span><small>${WEAPONS[L.primary].name} · ${WEAPONS[L.secondary].name}</small></button>`).join('') +
      `<div class="gs-cat">SLOT</div><div class="gs-slots"><button data-s="primary" class="${this.benchSlot === 'primary' ? 'on' : ''}">PRIMARY</button><button data-s="secondary" class="${this.benchSlot === 'secondary' ? 'on' : ''}">SECONDARY</button></div>`;
    box.querySelectorAll('.gs-lo').forEach(b => {
      const i = +b.dataset.i;
      b.addEventListener('mouseenter', () => { if (!this.exploding) { play('uiHover'); this.preview(P.loadouts[i][this.benchSlot]); } });
      b.addEventListener('mouseleave', () => { if (!this.exploding) this.preview(P.loadouts[P.loadout][this.benchSlot]); });
      b.addEventListener('click', () => { P.loadout = i; this.app.ui.save(); play('magIn'); this.renderLoadouts(); this.preview(P.loadouts[i][this.benchSlot]); this.app.ui.refreshLobby(); });
    });
    box.querySelectorAll('.gs-slots button').forEach(b => b.addEventListener('click', () => { this.benchSlot = b.dataset.s; play('ui'); this.renderLoadouts(); this.preview(P.loadouts[P.loadout][this.benchSlot]); }));
    document.getElementById('gs-hint').textContent = 'HOVER TO PREVIEW · CLICK THE WEAPON TO OPEN THE GUNSMITH';
  }
  back() {
    if (this.exploding) return this.setExplode(false);
    if (this.mode === 'weapon' && this.fromBench) { this.mode = 'loadout'; this.renderLoadouts(); const P = this.app.profile; this.preview(P.loadouts[P.loadout][this.benchSlot]); return; }
    this.close();
  }

  openFor(loadoutIndex, slotKey, onClose) {
    const P = this.app.profile;
    this.loadoutIndex = loadoutIndex; this.slotKey = slotKey; this.onClose = onClose;
    P.attachments = P.attachments || {};
    if (!this.open) { this.open = true; this.el.classList.remove('hidden'); this.el.classList.remove('in'); void this.el.offsetWidth; this.el.classList.add('in'); }
    this.mode = 'weapon';
    document.getElementById('gs-title').textContent = 'GUNSMITH';
    document.getElementById('gs-crumb').textContent = `${loadoutIndex < 3 ? 'CUSTOM LOADOUT ' + (loadoutIndex + 1) : 'LOADOUT ' + (loadoutIndex + 1)} › ${slotKey.toUpperCase()}`;
    const list = slotKey === 'secondary' ? SECONDARIES : PRIMARIES;
    this.renderList(list);
    this.selected = P.loadouts[loadoutIndex][slotKey];
    if (!this.fromBench) { this.camK = 0; this.introT = 0; this.fromAbove = false; }
    this.preview(this.selected, !this.fromBench);
    this.setExplode(false, true);
  }
  close() {
    this.open = false; this.setExplode(false, true); this.fromBench = false; this.el.classList.remove('bench');
    this.el.classList.add('hidden');
    this.app.profile && this.app.ui.save();
    if (this.onClose) this.onClose();
  }

  renderList(ids) {
    const groups = {};
    for (const id of ids) (groups[WEAPONS[id].kind] = groups[WEAPONS[id].kind] || []).push(id);
    const box = document.getElementById('gs-list');
    box.innerHTML = KIND_ORDER.filter(k => groups[k]).map(k => `<div class="gs-cat">${k === 'SMG' ? 'SMGS' : k + 'S'}</div>` + groups[k].map(id =>
      `<button class="gs-item" data-id="${id}"><span>${WEAPONS[id].name}</span><i></i></button>`).join('')).join('');
    box.querySelectorAll('.gs-item').forEach(b => {
      b.addEventListener('mouseenter', () => { if (!this.exploding) { play('uiHover'); this.preview(b.dataset.id); } });
      b.addEventListener('mouseleave', () => { if (!this.exploding) this.preview(this.selected); });
      b.addEventListener('click', () => {
        this.selected = b.dataset.id;
        this.app.profile.loadouts[this.loadoutIndex][this.slotKey] = this.selected;
        play('magIn'); this.preview(this.selected); this.markList();
      });
    });
    this.markList();
  }
  markList() { document.querySelectorAll('.gs-item[data-id]').forEach(b => { b.classList.toggle('on', b.dataset.id === this.selected); b.classList.toggle('peek', b.dataset.id === this.previewId && b.dataset.id !== this.selected); }); }

  // ---------------- Modelo ----------------
  preview(id, instant = false) {
    if (id === this.previewId && !instant) return;
    this.previewId = id; this.markList();
    // el arma anterior sale por la izquierda; la nueva entra girando desde la derecha
    if (this.leaving) { this.root.remove(this.leaving); this.leaving = null; }
    if (this.gun && !instant) { const old = this.gun; old.userData.leave = 0; this.leaving = old; }
    else if (this.gun) this.root.remove(this.gun);
    const def = GUN_PARTS[id], skin = this.app.profile.weaponSkins[id] || 'factory';
    const g = makeGun(id, skin, { shadows: true });
    const slotsOf = classify(def);
    const holder = new THREE.Group();
    const scale = 2.2 / Math.max(0.6, def.len);
    // centrar el arma
    const bb = new THREE.Box3().setFromObject(g), c = bb.getCenter(V(0, 0, 0));
    g.position.sub(c);
    holder.add(g); holder.scale.setScalar(scale);
    this.root.add(holder);
    // agrupar piezas por slot
    const parts = g.children.filter(o => o.isMesh);
    const slots = {};
    parts.forEach((m, i) => { const s = slotsOf[i] || 'RECEIVER'; (slots[s] = slots[s] || []).push(m); m.userData.home = m.position.clone(); m.userData.homeScale = m.scale.clone(); m.userData.slot = s; });
    // la óptica de serie es una pieza más del slot OPTIC (sale y entra en el despiece)
    const op = g.userData.optic || g.userData.irons;
    if (op) { const o = op.group; o.userData.home = o.position.clone(); o.userData.homeScale = o.scale.clone(); o.userData.slot = 'OPTIC'; (slots.OPTIC = slots.OPTIC || []).push(o); }
    this.gun = holder; this.def = def; this.wid = id; this.slots = slots; this.inner = g; this.center = c;
    this.extra = {}; // mallas de accesorios añadidas por slot
    holder.userData.enter = instant ? 1 : 0;
    holder.traverse(o => { if (o.isMesh) o.castShadow = true; });
    // aplicar accesorios guardados
    const att = (this.app.profile.attachments || {})[id] || {};
    for (const s of SLOTS) if (att[s] && att[s] !== 'factory') this.applyAttachment(s, att[s], false);
    this.renderStats();
    const w = WEAPONS[id];
    document.getElementById('gs-name').innerHTML = `<small>${w.kind}</small><b>${w.name}</b>`;
  }

  // Nombre visible de una opción: la óptica de serie se llama por lo que es, no "iron sights"
  optName(slot, o) {
    const op = this.def && this.def.optic;
    if (slot !== 'OPTIC' || o.id !== 'factory' || !op) return o.name;
    return op.type === 'scope' ? `${op.mag}X ${op.mag > 3 ? 'SNIPER' : 'MARKSMAN'} SCOPE` : op.type === 'holo' ? 'HOLOGRAPHIC SIGHT' : op.tall ? 'BALLISTIC LADDER SIGHT' : 'REFLEX SIGHT';
  }
  availableSlots() { return SLOTS.filter(s => this.slots[s] || s === 'UNDERBARREL' && this.slots.BARREL || s === 'OPTIC' && this.slots.RECEIVER); }

  // Centro de un slot (coords del arma, sin despiece)
  slotCenter(s) {
    const ms = this.slots[s];
    if (!ms || !ms.length) {
      if (s === 'OPTIC') return V(0, this.def.sightY + 0.03, -0.05);
      if (s === 'UNDERBARREL') return V(0, -0.06, this.def.hands.l[2]);
      return V(0, 0, 0);
    }
    const b = new THREE.Box3(); ms.forEach(m => b.expandByPoint(m.userData.home));
    return b.getCenter(V(0, 0, 0));
  }

  applyAttachment(slot, optId, animate = true) {
    const opt = ATTACH[slot].find(o => o.id === optId) || ATTACH[slot][0];
    const P = this.app.profile; P.attachments = P.attachments || {};
    (P.attachments[this.wid] = P.attachments[this.wid] || {})[slot] = opt.id;
    // la pieza anterior sale despedida (fantasma) antes de cambiarla
    if (animate) {
      const olds = [...(this.slots[slot] || []).filter(m => m.visible), ...(this.extra[slot] ? [this.extra[slot]] : [])];
      const dir = OFFSET[slot].clone().normalize();
      for (const o of olds) {
        const gh = o.clone(); gh.position.copy(o.position); gh.quaternion.copy(o.quaternion); gh.scale.copy(o.scale);
        this.inner.add(gh); this.ghosts.push({ o: gh, v: dir.clone().multiplyScalar(1.4).add(V(0, 0.6, 0)), life: 0.35, s0: gh.scale.clone() });
      }
    }
    if (this.extra[slot]) { this.inner.remove(this.extra[slot]); this.extra[slot] = null; }
    const factory = this.slots[slot] || [];
    const center = this.slotCenter(slot).clone();
    factory.forEach(m => {
      m.visible = !opt.hideFactory && !(opt.build && slot !== 'UNDERBARREL' && slot !== 'MAGAZINE');
      m.scale.copy(m.userData.homeScale);
      if (m.userData.baseMat) { m.material = m.userData.baseMat; m.userData.baseMat = null; }
      m.userData.scaleZ = 1; m.userData.scaleY = 1;
    });
    if (opt.scale) factory.forEach(m => { m.userData.scaleZ = opt.scale; });
    if (opt.scaleY) factory.forEach(m => { m.userData.scaleY = opt.scaleY; });
    if (opt.tint) factory.forEach(m => { m.userData.baseMat = m.material; m.material = stdMat(opt.tint, { roughness: 0.6 }); });
    if (slot === 'MAGAZINE' && opt.build) factory.forEach(m => { m.visible = false; });
    if (opt.build) {
      const g = opt.build(this.def, center);
      g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.userData.slot = slot; g.userData.pop = animate ? 0 : 1;
      this.inner.add(g); this.extra[slot] = g;
    }
    if (animate) {
      factory.forEach(m => { m.userData.pop = 0; m.userData.fly = 0; });
      if (this.extra[slot]) this.extra[slot].userData.fly = 0;
      play('magOut'); setTimeout(() => play('magIn'), 180);
      const f = document.getElementById('gs-flash'); f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
    }
    this.renderStats(); this.renderLabels(true);
  }

  // ---------------- Interacción ----------------
  click(e) {
    if (!this.open) return;
    const r = new THREE.Raycaster(), m = new THREE.Vector2((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    r.setFromCamera(m, this.camera);
    const hit = r.intersectObject(this.gun, true)[0];
    if (hit && !this.exploding) {
      play('bolt');
      if (this.mode === 'loadout') { const P = this.app.profile; this.openFor(P.loadout, this.benchSlot, this.onClose); }
      this.setExplode(true); return;
    }
    if (hit && this.exploding) {
      // clic en una pieza: abre su cajón
      let o = hit.object; while (o && !o.userData.slot) o = o.parent;
      if (o && o.userData.slot && o.userData.slot !== 'RECEIVER') this.openDrawer(o.userData.slot);
      return;
    }
    if (!hit && this.exploding) this.setExplode(false);
  }

  setExplode(on, instant = false) {
    this.exploding = on;
    this.el.classList.toggle('exploded', on);
    document.getElementById('gs-hint').textContent = on ? 'SELECT A COMPONENT · CLICK EMPTY SPACE TO REASSEMBLE' : this.mode === 'loadout' ? 'HOVER TO PREVIEW · CLICK THE WEAPON TO OPEN THE GUNSMITH' : 'HOVER TO PREVIEW · CLICK THE WEAPON TO CUSTOMIZE';
    if (instant) this.explode = on ? 1 : 0;
    if (on) { play('draw'); this.renderLabels(); } else { document.getElementById('gs-labels').innerHTML = ''; document.getElementById('gs-lines').innerHTML = ''; this.closeDrawer(); }
  }

  renderLabels(keep) {
    const box = document.getElementById('gs-labels');
    const att = (this.app.profile.attachments || {})[this.wid] || {};
    box.innerHTML = this.availableSlots().map((s, i) => {
      const opt = ATTACH[s].find(o => o.id === (att[s] || 'factory'));
      return `<button class="gs-label ${this.drawerSlot === s ? 'on' : ''} ${opt.id !== 'factory' ? 'mod' : ''}" data-slot="${s}" style="animation-delay:${keep ? 0 : 0.25 + i * 0.06}s"><small>${s}</small><b>${this.optName(s, opt)}</b></button>`;
    }).join('');
    box.querySelectorAll('.gs-label').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); play('ui'); this.openDrawer(b.dataset.slot); });
      b.addEventListener('mouseenter', () => { this.hoverSlot = b.dataset.slot; play('uiHover'); });
      b.addEventListener('mouseleave', () => { this.hoverSlot = null; });
    });
  }

  openDrawer(slot) {
    this.drawerSlot = slot;
    const att = (this.app.profile.attachments || {})[this.wid] || {};
    const cur = att[slot] || 'factory';
    const base = baseStats(WEAPONS[this.wid]);
    const d = document.getElementById('gs-drawer');
    d.innerHTML = `<div class="gs-dtitle">${slot}</div><div class="gs-dstats" id="gs-dstats"></div><div class="gs-opts">${ATTACH[slot].map((o, i) => `
      <button class="gs-opt ${o.id === cur ? 'on' : ''}" data-id="${o.id}" style="animation-delay:${i * 0.05}s">
        <b>${this.optName(slot, o)}</b>
        <div class="gs-pros">${Object.entries(o.stats).map(([k, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${v > 0 ? '▲' : '▼'} ${STAT_NAMES.find(s => s[0] === k)?.[1] || k.toUpperCase()}</span>`).join('') || '<span class="flat">STANDARD ISSUE</span>'}</div>
      </button>`).join('')}</div>`;
    d.classList.add('on'); this.el.classList.add('drawer');
    d.querySelectorAll('.gs-opt').forEach(b => {
      b.addEventListener('click', (e) => { e.stopPropagation(); this.applyAttachment(slot, b.dataset.id); this.openDrawer(slot); });
      b.addEventListener('mouseenter', () => { this.previewStats = ATTACH[slot].find(o => o.id === b.dataset.id).stats; this.previewSlot = slot; this.renderStats(); });
      b.addEventListener('mouseleave', () => { this.previewStats = null; this.renderStats(); });
    });
    this.renderLabels(true); this.renderStats();
    void base;
  }
  closeDrawer() { this.drawerSlot = null; const d = document.getElementById('gs-drawer'); d.classList.remove('on'); this.el.classList.remove('drawer'); }

  currentStats() {
    const b = baseStats(WEAPONS[this.wid]);
    const att = (this.app.profile.attachments || {})[this.wid] || {};
    const mod = { ...b };
    for (const s of SLOTS) { const o = ATTACH[s].find(x => x.id === (att[s] || 'factory')); for (const [k, v] of Object.entries(o.stats)) mod[k] = (mod[k] || 0) + v; }
    return { base: b, mod };
  }
  renderStats() {
    const { base, mod } = this.currentStats();
    let prev = null;
    if (this.previewStats) {
      // stats si se equipara la opción bajo el ratón
      const att = (this.app.profile.attachments || {})[this.wid] || {};
      const curOpt = ATTACH[this.previewSlot].find(x => x.id === (att[this.previewSlot] || 'factory'));
      prev = { ...mod };
      for (const [k, v] of Object.entries(curOpt.stats)) prev[k] -= v;
      for (const [k, v] of Object.entries(this.previewStats)) prev[k] = (prev[k] || 0) + v;
    }
    const show = prev || mod;
    const ds = document.getElementById('gs-dstats');
    if (ds) ds.innerHTML = STAT_NAMES.map(([k, n]) => { const b = Math.max(0, Math.min(100, base[k])), v = Math.max(0, Math.min(100, show[k])), lo = Math.min(b, v), hi = Math.max(b, v); return `<div class="gs-stat"><span>${n}</span><b class="${v > b ? 'up' : v < b ? 'down' : ''}">${v}</b><div class="gs-bar"><i style="width:${lo}%"></i><em class="${v >= b ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></em></div></div>`; }).join('');
    document.getElementById('gs-stats').innerHTML = `<div class="gs-stitle">WEAPON STATS</div>` + STAT_NAMES.map(([k, n]) => {
      const b = Math.max(0, Math.min(100, base[k])), v = Math.max(0, Math.min(100, show[k]));
      const lo = Math.min(b, v), hi = Math.max(b, v);
      return `<div class="gs-stat"><span>${n}</span><b>${v}</b><div class="gs-bar"><i style="width:${lo}%"></i><em class="${v >= b ? 'up' : 'down'}" style="left:${lo}%;width:${hi - lo}%"></em></div></div>`;
    }).join('') + `<div class="gs-dps"><small>DPS</small><b>${base.dps}</b></div>`;
  }

  // ---------------- Bucle ----------------
  update(dt, aspect) {
    if (!this.open) return;
    this.t += dt; this.introT += dt;
    this.camera.aspect = aspect;
    // cámara: llegada (dolly) y acercamiento al despiezar
    this.explode += ((this.exploding ? 1 : 0) - this.explode) * Math.min(1, dt * 5);
    const intro = ease(clamp01(this.introT / 1.1));
    const ex = ease(clamp01(this.explode));
    const narrow = Math.max(1, 1.75 / aspect);
    const base = V(0, 1.95 - ex * 0.35, (5.0 - ex * 0.6) * narrow);
    let camPos = base.clone().add(V(0, (1 - intro) * 0.6, (1 - intro) * 3));
    if (this.fromAbove) camPos = base.clone().lerp(V(0, 6.5, 0.6), 1 - intro);
    this.camera.position.lerp(camPos, this.introT < 0.05 ? 1 : Math.min(1, dt * 6));
    this.camera.lookAt(0, 1.08 + ex * 0.06, 0);
    this.camera.fov = 32 + ex * 4; this.camera.updateProjectionMatrix();
    // giro: libre/automático en preview, perfil lateral al despiezar
    if (this.exploding) {
      // perfil lateral (boca a la derecha) por el camino más corto
      let d = (-Math.PI / 2 + Math.sin(this.t * 0.4) * 0.1) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 4);
    }
    else { this.yawV *= Math.exp(-dt * 3); this.yaw += (0.35 + this.yawV) * dt; }
    if (this.gun) {
      const g = this.gun;
      g.userData.enter = Math.min(1, (g.userData.enter || 0) + dt * 2.2);
      const en = backOut(g.userData.enter);
      g.rotation.set(Math.sin(this.t * 0.6) * 0.03 + ex * 0.1, this.yaw + (1 - en) * 1.2, Math.sin(this.t * 0.5) * 0.02);
      g.position.set((1 - en) * 2.2, Math.sin(this.t * 1.2) * 0.03, 0);
      // despiece escalonado por slot
      const order = ['MUZZLE', 'BARREL', 'OPTIC', 'UNDERBARREL', 'MAGAZINE', 'GRIP', 'STOCK', 'RECEIVER'];
      for (const [slot, ms] of Object.entries(this.slots)) {
        const i = order.indexOf(slot);
        const k = backOut(clamp01(this.explode * 1.25 - i * 0.04));
        const hl = this.exploding && (this.hoverSlot === slot || this.drawerSlot === slot);
        for (const m of ms) {
          m.position.copy(m.userData.home).addScaledVector(OFFSET[slot], k);
          const sz = m.userData.scaleZ || 1, sy = m.userData.scaleY || 1;
          if (m.userData.pop != null && m.userData.pop < 1) m.userData.pop = Math.min(1, m.userData.pop + dt * 4);
          const pop = m.userData.pop != null ? 1 + Math.sin(m.userData.pop * Math.PI) * 0.15 : 1;
          m.scale.set(m.userData.homeScale.x * pop, m.userData.homeScale.y * sy * pop, m.userData.homeScale.z * sz * pop);
          if (sz !== 1) { const c = this.slotCenter(slot); m.position.z = c.z + (m.userData.home.z - c.z) * sz + OFFSET[slot].z * k + (slot === 'BARREL' ? -(sz - 1) * 0.15 : slot === 'STOCK' ? (sz - 1) * 0.1 : 0); }
          if (sy !== 1) m.position.y = m.userData.home.y - (sy - 1) * 0.06 + OFFSET[slot].y * k;
          if (m.userData.fly != null && m.userData.fly < 1) { m.userData.fly = Math.min(1, m.userData.fly + dt * 3.2); m.position.addScaledVector(OFFSET[slot], (1 - backOut(m.userData.fly)) * 1.8); }
        }
        if (this.extra[slot]) {
          const x = this.extra[slot];
          if (x.userData.fly == null) x.userData.fly = 1;
          if (x.userData.fly < 1) x.userData.fly = Math.min(1, x.userData.fly + dt * 3.2);
          x.position.copy(OFFSET[slot]).multiplyScalar(k + (1 - backOut(x.userData.fly)) * 1.8);
          if (x.userData.pop < 1) x.userData.pop = Math.min(1, x.userData.pop + dt * 3);
          x.scale.setScalar(backOut(x.userData.pop));
        }
        void hl;
      }
      for (const [slot, x] of Object.entries(this.extra)) if (x && !this.slots[slot]) {
        const k = backOut(clamp01(this.explode * 1.25 - 0.2));
        x.position.copy(OFFSET[slot]).multiplyScalar(k);
        if (x.userData.pop < 1) x.userData.pop = Math.min(1, x.userData.pop + dt * 3);
        x.scale.setScalar(backOut(x.userData.pop));
      }
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]; g.life -= dt;
      g.o.position.addScaledVector(g.v, dt); g.v.y -= dt * 3; g.o.rotation.x += dt * 4;
      g.o.scale.copy(g.s0).multiplyScalar(Math.max(0.01, g.life / 0.35));
      if (g.life <= 0) { this.inner.remove(g.o); this.ghosts.splice(i, 1); }
    }
    // foco de luz sobre el componente activo; la luz principal baja un poco
    const fs = this.exploding && (this.drawerSlot || this.hoverSlot);
    if (fs && this.gun) {
      const ms = (this.slots[fs] || []).filter(m => m.visible), b = new THREE.Box3();
      ms.forEach(m => b.expandByObject(m)); if (this.extra[fs]) b.expandByObject(this.extra[fs]);
      if (!b.isEmpty()) { const c = b.getCenter(V(0, 0, 0)); this.focus.target.position.lerp(c, Math.min(1, dt * 10)); this.focus.position.set(c.x * 0.5, c.y + 3, c.z + 2.2); }
    }
    this.focus.intensity += ((fs ? 55 : 0) - this.focus.intensity) * Math.min(1, dt * 6);
    this.key.intensity += ((fs ? 32 : 70) - this.key.intensity) * Math.min(1, dt * 4);
    if (this.leaving) {
      const o = this.leaving; o.userData.leave += dt * 3;
      o.position.x = -ease(clamp01(o.userData.leave)) * 3; o.rotation.y -= dt * 2;
      if (o.userData.leave >= 1) { this.root.remove(o); this.leaving = null; }
    }
    this.ring.rotation.y += dt * 0.3; this.ring.scale.setScalar(1 + Math.sin(this.t * 2) * 0.01);
    this.ring2.material.opacity = 0.25 + Math.sin(this.t * 1.5) * 0.15;
    const dp = this.dust.geometry.attributes.position;
    this.motes.forEach((m, i) => dp.setXYZ(i, m.x + Math.sin(this.t * 0.2 + m.ph) * 0.3, (m.y + this.t * 0.05 + m.ph) % 3.5, m.z + Math.cos(this.t * 0.15 + m.ph) * 0.3));
    dp.needsUpdate = true;
    if (this.exploding) this.updateLines();
  }

  // Líneas desde cada componente hasta su etiqueta
  updateLines() {
    const labels = [...document.querySelectorAll('.gs-label')];
    if (!labels.length || !this.gun) return;
    const W = innerWidth, H = innerHeight;
    const toScreen = (v) => { const p = v.clone().project(this.camera); return { x: (p.x * 0.5 + 0.5) * W, y: (-p.y * 0.5 + 0.5) * H }; };
    const gc = toScreen(this.gun.getWorldPosition(V(0, 0, 0)));
    // anclas en pantalla de cada componente
    const items = labels.map((lb) => {
      const s = lb.dataset.slot;
      let anchor;
      const ms = this.slots[s];
      if (ms && ms.length && ms.some(m => m.visible)) { const b = new THREE.Box3(); ms.forEach(m => m.visible && b.expandByObject(m)); anchor = b.getCenter(V(0, 0, 0)); }
      else if (this.extra[s]) anchor = new THREE.Box3().setFromObject(this.extra[s]).getCenter(V(0, 0, 0));
      else anchor = this.inner.localToWorld(this.slotCenter(s).clone());
      return { lb, s, a: toScreen(anchor) };
    });
    // dos columnas (izquierda / derecha del arma), ordenadas por altura y sin solaparse
    const LW = 170, LH = 50, gap = 8, top = 110, bottom = H - (this.drawerSlot ? 230 : 90);
    const colX = { L: Math.max(20, gc.x - W * 0.34 - LW), R: Math.min(W - LW - 20, gc.x + W * 0.34) };
    let svg = '';
    for (const side of ['L', 'R']) {
      const col = items.filter(it => (side === 'L') === (it.a.x < gc.x)).sort((p, q) => p.a.y - q.a.y);
      let y = top;
      const ys = col.map(it => { const yy = Math.max(y, Math.min(bottom - LH, it.a.y - LH / 2)); y = yy + LH + gap; return yy; });
      // si se pasan del fondo, empujar hacia arriba
      for (let i = ys.length - 1, lim = bottom - LH; i >= 0; i--) { ys[i] = Math.min(ys[i], lim); lim = ys[i] - LH - gap; }
      col.forEach((it, i) => {
        const lx = colX[side], ly = ys[i];
        it.lb.style.left = lx + 'px'; it.lb.style.top = ly + 'px';
        const bx = side === 'L' ? lx + LW : lx, by = ly + LH / 2;
        const on = this.drawerSlot === it.s || this.hoverSlot === it.s;
        const mx = side === 'L' ? bx + 30 : bx - 30;
        svg += `<path d="M${it.a.x},${it.a.y} L${mx},${by} L${bx},${by}" class="${on ? 'on' : ''}"/><circle cx="${it.a.x}" cy="${it.a.y}" r="${on ? 5 : 3.5}" class="${on ? 'on' : ''}"/>`;
      });
    }
    document.getElementById('gs-lines').innerHTML = svg;
  }
}
