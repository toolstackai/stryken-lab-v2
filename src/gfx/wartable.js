// Secuencia 6 — MESA TÁCTICA (selector de modo): sala de operaciones a oscuras con una mesa que proyecta
// el MAPA REAL en holograma (hecho con sus cajas de colisión). Pasar el ratón por un modo = el holograma se
// reconstruye con su mapa; clic = elegirlo. CONFIRM vuelve al lobby.
import * as THREE from 'three';
import { stdMat } from './models.js';
import { makeEnv } from './env.js';
import { buildMapData } from '../data/maps.js';
import { MODES, DIFFICULTY, LISTS, modeAvailable, weekEndsIn } from '../data/modes.js';
import { rankOf, rankBadge } from '../data/ranks.js';
import { play } from '../game/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const MODE_INFO = {
  dm: { obj: 'Every operator for themselves. First to reach the kill target wins the sector.', tag: 'FREE FOR ALL' },
  tdm: { obj: 'Two squads, one sector. First team to the kill target takes control.', tag: '5 VS 5' },
  knife: { obj: 'Blades only. Close the distance and strike first — no firearms allowed.', tag: 'MELEE' },
  br: { obj: 'Drop onto Korva Island with nothing but a blade. Loot, survive the closing storm, be the last operator standing.', tag: '24 SOLO' },
  arena1: { obj: 'One life per round. Earn money, buy your gun in the 12-second buy phase and outplay a single opponent. First to 5 rounds.', tag: 'RANKED · 1 VS 1' },
  arena3: { obj: 'Three operators per side, one life per round. Save, force-buy or go full armor — the economy decides who has the better guns. First to 6.', tag: 'RANKED · 3 VS 3' },
  arena5: { obj: 'Five-stack round warfare with a full economy and a bigger map pool. First to 7 rounds takes the RP.', tag: 'RANKED · 5 VS 5' },
  arena2: { obj: 'Round-based duo fights with the full Arena economy. Unranked — practice your buys.', tag: 'ROTATION · 2 VS 2' },
  arena4: { obj: 'Four per side, one life per round, full economy. Unranked.', tag: 'ROTATION · 4 VS 4' },
  snipers: { obj: 'Everyone spawns with a Longbow and a Rhino. One shot, one kill — move between scopes.', tag: 'ROTATION · FFA' },
  lowgrav: { obj: 'Gravity at 45%. Long jumps, floaty fights and rooftops nobody could reach before.', tag: 'ROTATION · FFA' },
  evecon: { obj: 'WEEKEND EVENT — Arena 3v3 where every dollar counts twice. Full buys from round two. Earns event points.', tag: 'EVENT · x2 MONEY' },
  evknife: { obj: 'WEEKEND EVENT — Knives only. Every kill stacks +7% speed until you die (max +35%). Earns event points.', tag: 'EVENT · SPEED STACKS' },
  evnight: { obj: 'WEEKEND EVENT — Korva Island after dark. Your flashlight is all you have. Earns event points.', tag: 'EVENT · NIGHT BR' },
  blades: { obj: 'Blue team gets Longbows, red team gets knives. Snipers hold the angles, blades close the gap.', tag: 'ROTATION · TEAMS' },
};
const LOCKED = [['GUN GAME', 'harbor'], ['CAPTURE THE FLAG', 'foundry']];

// ---------- Holograma del mapa ----------
const HOLO_VS = `
  attribute float aBaseY; attribute float aDelay;
  uniform float uT; varying float vY; varying float vK;
  void main() {
    float k = clamp((uT - aDelay) / 0.45, 0.0, 1.0); k = 1.0 - pow(1.0 - k, 3.0);
    vec3 p = position; p.y = aBaseY + (p.y - aBaseY) * k;
    vY = p.y; vK = k;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const HOLO_FS = `
  uniform vec3 uColor; uniform float uOpacity; uniform float uScan; uniform float uTime; uniform float uFade;
  varying float vY; varying float vK;
  void main() {
    float scan = smoothstep(0.9, 0.0, abs(vY - uScan));
    float flick = 0.9 + 0.1 * sin(uTime * 37.0 + vY * 2.3);
    float a = (uOpacity * flick + scan * 0.45) * vK * uFade;
    gl_FragColor = vec4(uColor * (1.0 + scan * 1.2), a);
  }`;
function holoMat(color, opacity) {
  return new THREE.ShaderMaterial({
    vertexShader: HOLO_VS, fragmentShader: HOLO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity }, uScan: { value: 0 }, uTime: { value: 0 }, uFade: { value: 1 } },
  });
}
function buildHolo(mapId) {
  const map = buildMapData(mapId), R = Math.max(map.bounds.x, map.bounds.z);
  // fuera suelos y techos grandes (taparían el interior)
  const boxes = map.collision.filter(b => {
    const area = b.s[0] * b.s[2];
    if (b.p[1] < -0.5 || (b.noBullet && b.s[1] > 10)) return false; // suelo base y límites invisibles (isla)
    if (area > 30 && b.s[1] < 0.6 && b.p[1] > 3) return false;
    if (area > 30 && b.s[1] < 0.4 && b.p[1] <= 0.1) return false;
    return true;
  });
  const fp = [], fb = [], fd = [], lp = [], lb = [], ld = [];
  for (const b of boxes) {
    const [x, y, z] = b.p, [w, h, d] = b.s;
    const x0 = x - w / 2, x1 = x + w / 2, y0 = y, y1 = y + h, z0 = z - d / 2, z1 = z + d / 2;
    const delay = Math.hypot(x, z) / R * 0.9 + Math.random() * 0.12;
    const c = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0]];
    for (const [a, b2, cc, dd] of faces) for (const i of [a, b2, cc, a, cc, dd]) { fp.push(...c[i]); fb.push(y0); fd.push(delay); }
    for (const [a, b2] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) { lp.push(...c[a], ...c[b2]); lb.push(y0, y0); ld.push(delay, delay); }
  }
  const geo = (p, b, d) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('aBaseY', new THREE.Float32BufferAttribute(b, 1)); g.setAttribute('aDelay', new THREE.Float32BufferAttribute(d, 1)); return g; };
  const group = new THREE.Group();
  const fill = new THREE.Mesh(geo(fp, fb, fd), holoMat(0x3fe0ff, 0.06));
  const lines = new THREE.LineSegments(geo(lp, lb, ld), holoMat(0x7ff0ff, 0.55));
  fill.frustumCulled = lines.frustumCulled = false;
  group.add(fill, lines);
  // puntos de aparición
  const sp = map.spawns.map(s => s.p);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp.flatMap(p => [p[0], p[1] + 0.6, p[2]]), 3));
  const scol = map.spawns.flatMap(s => s.team === 'red' ? [1, 0.3, 0.3] : s.team === 'blue' ? [0.35, 0.6, 1] : [1, 0.85, 0.4]);
  sg.setAttribute('color', new THREE.Float32BufferAttribute(scol, 3));
  const spawns = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(spawns);
  const s = 1.7 / (2 * R);
  group.scale.set(s, s * 2.0, s);
  return { group, mats: [fill.material, lines.material], spawns, map, t: 0, fade: 1, dying: false };
}

function screenTex(lines, hue) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 288;
  const g = c.getContext('2d');
  g.fillStyle = `hsl(${hue} 60% 6%)`; g.fillRect(0, 0, 512, 288);
  g.strokeStyle = `hsla(${hue} 90% 60% / .18)`; for (let x = 0; x < 512; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 288); g.stroke(); } for (let y = 0; y < 288; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = `hsl(${hue} 90% 65%)`; g.font = 'bold 22px monospace';
  lines.forEach((l, i) => g.fillText(l, 22, 40 + i * 30));
  g.strokeStyle = `hsl(${hue} 90% 60%)`; g.lineWidth = 3; g.beginPath();
  for (let x = 0; x < 512; x += 8) g.lineTo(x, 240 + Math.sin(x * 0.05) * 14 + Math.sin(x * 0.17) * 6);
  g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class WarTable {
  constructor(app, onClose) {
    this.app = app; this.onClose = onClose; this.t = 0;
    const P = app.profile;
    this.sel = modeAvailable(P.mode) ? P.mode : 'dm'; this.view = this.sel;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04070b);
    scene.fog = new THREE.Fog(0x04070b, 6, 16);
    scene.environment = makeEnv(app.renderer, '#14202c', '#1c2a38', '#05070a', 'wartable'); scene.environmentIntensity = 0.5;
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 50);
    scene.add(new THREE.HemisphereLight(0x5a7a9a, 0x0a0c10, 0.5));
    const key = new THREE.SpotLight(0xbfd8ff, 18, 12, 0.6, 0.7, 1.4); key.position.set(-2, 5, 3); key.target.position.set(0, 0.9, 0); scene.add(key, key.target);
    this.holoLight = new THREE.PointLight(0x3fe0ff, 4, 5, 1.6); this.holoLight.position.set(0, 2.4, 0); scene.add(this.holoLight);
    // suelo y mesa
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 48).rotateX(-Math.PI / 2), stdMat(0x0c1016, { roughness: 0.35, metalness: 0.5 })); scene.add(floor);
    const metal = stdMat(0x1a2029, { roughness: 0.45, metalness: 0.7 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.45, 0.88, 40), metal); base.position.y = 0.44; scene.add(base);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.08, 48), stdMat(0x0d1218, { roughness: 0.7, metalness: 0.5 })); top.position.y = 0.92; scene.add(top);
    const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gg = gc.getContext('2d');
    gg.strokeStyle = 'rgba(63,224,255,.5)'; gg.lineWidth = 1;
    for (let i = 0; i <= 256; i += 16) { gg.beginPath(); gg.moveTo(i, 0); gg.lineTo(i, 256); gg.stroke(); gg.beginPath(); gg.moveTo(0, i); gg.lineTo(256, i); gg.stroke(); }
    const gridTex = new THREE.CanvasTexture(gc);
    this.glassMat = new THREE.MeshBasicMaterial({ map: gridTex, color: 0x3fe0ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const glass = new THREE.Mesh(new THREE.CircleGeometry(1.38, 48).rotateX(-Math.PI / 2), this.glassMat); glass.position.y = 0.965; scene.add(glass);
    this.rimMat = new THREE.MeshBasicMaterial({ color: 0x3fe0ff });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.46, 0.018, 6, 64), this.rimMat); rim.rotation.x = Math.PI / 2; rim.position.y = 0.965; scene.add(rim);
    // cono del proyector
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.6, 0.9, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x3fe0ff, transparent: true, opacity: 0.035, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.y = 1.42; scene.add(cone); this.cone = cone;
    // pantallas de inteligencia al fondo
    const scr = [
      [-3.6, 1.9, -3.2, 0.5, ['SAT FEED // SECTOR 7', 'UPLINK ......... OK', 'THERMAL ........ ON', 'OPERATORS ...... 12'], 195],
      [0, 2.3, -4.4, 0, ['OPERATION BRIEFING', 'PRIORITY: HIGH', 'ROE: WEAPONS FREE', 'EXFIL: NONE'], 190],
      [3.6, 1.9, -3.2, -0.5, ['THREAT ANALYSIS', 'HOSTILES ... CONFIRMED', 'CLASS ...... MIXED', 'ETA ........ 00:30'], 10],
    ];
    this.screens = [];
    for (const [x, y, z, ry, lines, hue] of scr) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: screenTex(lines, hue), transparent: true, opacity: 0.9 }));
      m.position.set(x, y, z); m.rotation.y = ry; scene.add(m); this.screens.push(m);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.5, 0.06), metal); fr.position.set(x, y, z - 0.04); fr.rotation.y = ry; scene.add(fr);
    }
    // polvo en el haz
    const N = 90, pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, r = Math.random() * 1.3; pos.set([Math.cos(a) * r, 1 + Math.random() * 1.2, Math.sin(a) * r], i * 3); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.motes = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x9ff4ff, size: 0.018, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    scene.add(this.motes);
    this.holoRoot = new THREE.Group(); this.holoRoot.position.y = 0.975; scene.add(this.holoRoot);
    this.holos = [];
    this.cache = {};
    this.showMap(MODES[this.view].map, true);
    this.buildDom();
    play('whoosh');
  }

  // ---------- holograma ----------
  showMap(mapId, first = false) {
    if (this.holos.length && this.holos[this.holos.length - 1].map.id === mapId) return;
    for (const h of this.holos) h.dying = true;
    const h = buildHolo(mapId);
    h.t = first ? -0.5 : -0.12;
    this.holoRoot.add(h.group); this.holos.push(h);
    if (!first) play('tease');
  }

  // ---------- DOM ----------
  buildDom() {
    const P = this.app.profile;
    const el = this.el = document.createElement('div');
    el.id = 'wt';
    // V2: listas de modos (clasificatoria / casual / rotación semanal)
    let n = 0;
    const days = Math.ceil(weekEndsIn() / 864e5);
    const rp = (P.ranked || {}).rp || 0;
    const cards = LISTS.map(([list, title]) => {
      const ids = Object.keys(MODES).filter(id => MODES[id].list === list && modeAvailable(id));
      const head = `<div class="wt-list-h ${list}"><b>${title}</b>${list === 'ranked' ? `<span class="wt-rank">${rankBadge(rp, { size: 22, anim: false })}${rankOf(rp).label}</span>` : list === 'rotating' ? `<span>CHANGES IN ${days}D</span>` : ''}</div>`;
      return head + ids.map((id) => { const m = MODES[id], i = n++; return `
      <button class="wt-card ${id === this.sel ? 'on' : ''} l-${list}" data-mode="${id}" style="animation-delay:${0.15 + i * 0.05}s">
        <span class="wt-idx">${String(i + 1).padStart(2, '0')}</span><b>${m.name}</b><small>${MODE_INFO[id].tag} · ${m.maps ? m.maps.length + ' MAPS' : m.map.toUpperCase()}</small><i class="wt-sel">SELECTED</i>
      </button>`; }).join('');
    }).join('') + LOCKED.map(([n2, mp], i) => `
      <button class="wt-card locked" data-lock="${mp}" style="animation-delay:${0.6 + i * 0.05}s"><span class="wt-idx">🔒</span><b>${n2}</b><small>COMING SOON</small></button>`).join('');
    el.innerHTML = `
      <div class="wt-vig"></div>
      <button class="wt-back" id="wt-back">‹ BACK <kbd>ESC</kbd></button>
      <div class="wt-left"><div class="wt-head"><small>WAR TABLE</small><b>SELECT OPERATION</b></div><div class="wt-list">${cards}</div></div>
      <div class="wt-right" id="wt-intel"></div>
      <div class="wt-coords" id="wt-coords"></div>`;
    document.body.appendChild(el);
    this.intel(this.view);
    el.querySelectorAll('.wt-card[data-mode]').forEach(c => {
      c.addEventListener('mouseenter', () => this.preview(c.dataset.mode));
      c.addEventListener('mouseleave', () => this.preview(null));
      c.addEventListener('click', () => this.select(c.dataset.mode));
    });
    el.querySelectorAll('.wt-card.locked').forEach(c => {
      c.addEventListener('mouseenter', () => { clearTimeout(this.pvTO); this.showMap(c.dataset.lock); });
      c.addEventListener('mouseleave', () => this.preview(null));
      c.addEventListener('click', () => { play('empty'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); });
    });
    el.querySelector('#wt-back').addEventListener('click', () => this.close());
    this.onKey = (e) => { if (e.code === 'Escape') this.close(); };
    addEventListener('keydown', this.onKey);
    void P;
  }
  intel(id) {
    const P = this.app.profile, m = MODES[id];
    const mm = Math.floor(m.time / 60), ss = String(m.time % 60).padStart(2, '0');
    const box = this.el.querySelector('#wt-intel');
    box.innerHTML = `
      <small class="wt-k">OPERATION</small>
      <h2>${m.name}</h2>
      <div class="wt-map"><i></i>SECTOR · ${m.map.toUpperCase()}</div>
      <p>${esc(MODE_INFO[id].obj)}</p>
      <div class="wt-stats"><div><b>${m.players}</b><small>OPERATORS</small></div>${m.br ? '<div><b>6</b><small>STORM PHASES</small></div><div><b>1</b><small>SURVIVOR</small></div>' : m.arena ? `<div><b>${m.target}</b><small>ROUNDS TO WIN</small></div><div><b>$</b><small>ECONOMY</small></div>` : `<div><b>${mm}:${ss}</b><small>TIME LIMIT</small></div><div><b>${m.target}</b><small>${m.teams ? 'TEAM TARGET' : 'KILL TARGET'}</small></div>`}</div>
      ${m.list === 'ranked' ? `<small class="wt-k">YOUR RANK</small><div class="wt-rankrow">${rankBadge((P.ranked || {}).rp || 0, { size: 44 })}<div><b>${rankOf((P.ranked || {}).rp || 0).label}</b><small>${(P.ranked || {}).rp || 0} RP · WIN +20–30 · LOSS −15–20</small></div></div>` : `<small class="wt-k">BOT DIFFICULTY</small>
      <div class="seg wt-diff">${Object.entries(DIFFICULTY).map(([d, D]) => `<button data-d="${d}" class="${P.difficulty === d ? 'on' : ''}">${D.name}</button>`).join('')}</div>`}
      <div class="wt-btns"><button class="btn cyan" id="wt-ok">${id === this.sel ? 'CONFIRM' : 'SELECT'} <kbd>↵</kbd></button><button class="btn dark" id="wt-custom">CUSTOM MATCH</button></div>`;
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
    box.querySelectorAll('[data-d]').forEach(b => b.addEventListener('click', () => {
      P.difficulty = b.dataset.d; this.app.ui.save(); play('ui');
      box.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b));
    }));
    box.querySelector('#wt-ok').addEventListener('click', () => { if (id !== this.sel) this.select(id); else this.close(); });
    box.querySelector('#wt-custom').addEventListener('click', () => this.close('custom'));
    const map = this.holos.length ? this.holos[this.holos.length - 1].map : null;
    this.el.querySelector('#wt-coords').innerHTML = `<b>${m.map.toUpperCase()}</b> · ${map ? map.collision.length : 0} STRUCTURES · ${map ? map.spawns.length : 0} INSERTION POINTS`;
  }
  // Pasar el ratón: el holograma cambia al mapa del modo (con un pequeño retardo al salir, como el probador)
  preview(id) {
    clearTimeout(this.pvTO);
    if (!id) { this.pvTO = setTimeout(() => this.preview(this.sel), 160); return; }
    if (id === this.view && this.holos.length && this.holos[this.holos.length - 1].map.id === MODES[id].map) return;
    this.view = id;
    this.showMap(MODES[id].map);
    this.intel(id);
    play('uiHover');
  }
  select(id) {
    const P = this.app.profile;
    this.sel = id; P.mode = id; this.app.ui.save();
    this.el.querySelectorAll('.wt-card[data-mode]').forEach(c => c.classList.toggle('on', c.dataset.mode === id));
    const c = this.el.querySelector(`.wt-card[data-mode="${id}"]`); c.classList.remove('stamp'); void c.offsetWidth; c.classList.add('stamp');
    this.view = null; this.preview(id);
    this.intel(id);
    this.pulse = 1;
    play('medal');
  }
  close(next = null) {
    if (this.closing) return;
    this.closing = true;
    removeEventListener('keydown', this.onKey);
    play('ui');
    this.onClose(next);
  }

  update(dt, aspect) {
    this.t += dt;
    const t = this.t;
    // la cámara orbita despacio alrededor de la mesa
    const a = -0.5 + Math.sin(t * 0.12) * 0.35, narrow = aspect < 1.2 ? 1.35 : 1;
    this.camera.position.set(Math.sin(a) * 4.1 * narrow, 2.75 + Math.sin(t * 0.3) * 0.05, Math.cos(a) * 4.1 * narrow);
    this.camera.lookAt(0, 0.95, 0);
    this.camera.aspect = aspect; this.camera.updateProjectionMatrix();
    this.holoRoot.rotation.y = t * 0.12;
    this.pulse = Math.max(0, (this.pulse || 0) - dt * 2);
    this.holoLight.intensity = 3.5 + Math.sin(t * 13) * 0.3 + this.pulse * 8;
    this.rimMat.color.setHSL(0.52, 1, 0.55 + this.pulse * 0.3);
    this.glassMat.opacity = 0.3 + Math.sin(t * 2) * 0.05 + this.pulse * 0.3;
    this.cone.material.opacity = 0.035 + this.pulse * 0.05;
    this.motes.rotation.y = t * 0.05;
    for (const s of this.screens) s.material.opacity = 0.82 + Math.sin(t * 9 + s.position.x) * 0.04;
    for (let i = this.holos.length - 1; i >= 0; i--) {
      const h = this.holos[i];
      h.t += dt;
      if (h.dying) { h.fade -= dt * 4; if (h.fade <= 0) { this.holoRoot.remove(h.group); h.group.traverse(o => o.geometry && o.geometry.dispose()); h.mats.forEach(m => m.dispose()); this.holos.splice(i, 1); continue; } }
      for (const m of h.mats) { m.uniforms.uT.value = Math.max(0, h.t); m.uniforms.uTime.value = t; m.uniforms.uScan.value = ((t * 6) % 26) - 4; m.uniforms.uFade.value = clamp01(h.fade); }
      h.spawns.material.opacity = clamp01((h.t - 0.9) * 2) * 0.9 * clamp01(h.fade) * (0.75 + Math.sin(t * 6) * 0.25);
    }
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    clearTimeout(this.pvTO);
    this.el.remove();
    this.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}
