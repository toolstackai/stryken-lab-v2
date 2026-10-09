// Podio de fin de partida: los 3 mejores en pedestales, luces de escenario, humo y confeti.
import * as THREE from 'three';
import { makeSoldier, poseSoldier, stdMat } from './models.js';
import { makeEnv } from './env.js';
import { glowSprite, smokeSprite } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SLOTS = [
  { x: 0, h: 0.62, z: 0, color: 0xffc93c, rim: 0xffd76a, label: '1ST' },
  { x: -2.15, h: 0.42, z: 0.5, color: 0xc8d2de, rim: 0xdfe8f2, label: '2ND' },
  { x: 2.15, h: 0.26, z: 0.5, color: 0xd08a4a, rim: 0xe8a066, label: '3RD' },
];

export class Podium {
  // top: [{ name, skin, weapon, weaponSkin, score, kills, deaths, isLocal, team }], win: bool
  constructor(renderer, top, { win, teams, title }) {
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070a12);
    scene.fog = new THREE.Fog(0x070a12, 9, 22);
    scene.environment = makeEnv(renderer, '#1c2440', '#3a4466', '#0a0c12', 'podium'); scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 60);
    this.t = 0; this.win = win;
    // suelo brillante y fondo con paneles
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0e121c, roughness: 0.22, metalness: 0.5 }));
    floor.receiveShadow = true; scene.add(floor);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 12, 48, 1, true, Math.PI * 0.6, Math.PI * 0.8), new THREE.MeshStandardMaterial({ color: 0x121829, roughness: 0.8, side: THREE.BackSide }));
    back.position.set(0, 5, 1); back.rotation.y = Math.PI; scene.add(back);
    // tiras de luz verticales en el fondo
    const accent = win ? 0xffc93c : 0x3f9cff;
    this.strips = [];
    for (let i = -6; i <= 6; i++) {
      const a = i * 0.11 + Math.PI;
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, 9, 0.06), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.25 }));
      s.position.set(Math.sin(a) * 10.6, 4.5, Math.cos(a) * 10.6 + 1); scene.add(s); this.strips.push(s);
    }
    // pedestales hexagonales con borde luminoso
    this.soldiers = [];
    top.slice(0, 3).forEach((p, i) => {
      const S = SLOTS[i];
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.95, S.h, 6), new THREE.MeshStandardMaterial({ color: 0x1a1f2c, roughness: 0.35, metalness: 0.6 }));
      ped.position.set(S.x, S.h / 2, S.z); ped.receiveShadow = ped.castShadow = true; scene.add(ped);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 6, 6), new THREE.MeshBasicMaterial({ color: S.rim }));
      rim.rotation.x = Math.PI / 2; rim.rotation.z = Math.PI / 6; rim.position.set(S.x, S.h + 0.005, S.z); scene.add(rim);
      const top2 = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.82, 0.02, 6), stdMat(S.color, { roughness: 0.3, metalness: 0.7 }));
      top2.position.set(S.x, S.h + 0.01, S.z); scene.add(top2);
      const pose = i === 0 ? 'hero' : null;
      const so = makeSoldier(p.skin, p.weapon, p.weaponSkin || 'factory', { relaxed: i === 1, pose, team: teams ? p.team : null });
      so.root.position.set(S.x, S.h + 0.02, S.z);
      so.root.rotation.y = Math.PI + (i === 1 ? -0.3 : i === 2 ? 0.35 : 0);
      so.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      scene.add(so.root);
      this.soldiers.push({ s: so, slot: S, p, i });
      // foco individual
      const sp = new THREE.SpotLight(i === 0 ? 0xfff0c8 : 0xdfe8ff, 0, 12, 0.32, 0.5, 1.2);
      sp.position.set(S.x, 7, S.z + 3.5); sp.target.position.set(S.x, 1, S.z); sp.castShadow = i === 0;
      scene.add(sp, sp.target); this.soldiers[i].spot = sp;
    });
    scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x0a0c12, 0.45));
    const rimL = new THREE.DirectionalLight(win ? 0xffb050 : 0x5aa0ff, 1.6); rimL.position.set(-4, 3, -4); scene.add(rimL);
    const rimR = new THREE.DirectionalLight(0x6fd8ff, 1.2); rimR.position.set(4, 3, -4); scene.add(rimR);
    // haces volumétricos
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gg = gc.getContext('2d');
    const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
    const alpha = new THREE.CanvasTexture(gc);
    this.beams = SLOTS.map((S, i) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.95, 7, 32, 1, true), new THREE.MeshBasicMaterial({ color: i === 0 ? 0xffe2a0 : 0xcfe0ff, alphaMap: alpha, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
      b.position.set(S.x * 0.92, 3.6, S.z + 1.2); b.rotation.x = -0.32; scene.add(b); return b;
    });
    // humo bajo y partículas
    this.fog = [];
    for (let i = 0; i < 26; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeSprite(), transparent: true, opacity: 0.12, depthWrite: false, color: 0x8a9ac0 }));
      sp.position.set((Math.random() - 0.5) * 12, 0.25 + Math.random() * 0.4, (Math.random() - 0.5) * 5 + 0.5); sp.scale.setScalar(2.5 + Math.random() * 2);
      scene.add(sp); this.fog.push({ sp, v: (Math.random() - 0.5) * 0.15 });
    }
    const N = 180, pp = new Float32Array(N * 3); this.motes = [];
    for (let i = 0; i < N; i++) this.motes.push({ x: (Math.random() - 0.5) * 12, y: Math.random() * 7, z: (Math.random() - 0.5) * 6, ph: Math.random() * 6.28 });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: win ? 0xffd890 : 0x9fc8ff, size: 0.035, map: glowSprite(), transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; scene.add(this.dust);
    // confeti (sólo si ganas)
    this.confetti = null;
    if (win) {
      const CN = 260, geo = new THREE.PlaneGeometry(0.06, 0.1);
      const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, vertexColors: false });
      const inst = new THREE.InstancedMesh(geo, mat, CN); inst.frustumCulled = false;
      const cols = [0xffc93c, 0x2fc6d8, 0xff4b6b, 0xffffff, 0x7c4dff];
      const P = [];
      for (let i = 0; i < CN; i++) { P.push({ x: (Math.random() - 0.5) * 9, y: 6 + Math.random() * 8, z: (Math.random() - 0.5) * 4 + 0.5, v: 0.9 + Math.random() * 0.9, ph: Math.random() * 6.28, rs: 2 + Math.random() * 5 }); inst.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
      scene.add(inst); this.confetti = { inst, P, o: new THREE.Object3D() };
    }
    this.buildDom(top, { win, teams, title });
  }

  buildDom(top, { win, teams, title }) {
    const el = this.el = document.createElement('div');
    el.id = 'podium-ui';
    el.innerHTML = `<div class="pd-title ${win ? 'win' : 'lose'}"><small>${esc(title.sub)}</small><b>${esc(title.main)}</b></div>` +
      top.slice(0, 3).map((p, i) => `<div class="pd-plate p${i}" data-i="${i}" style="animation-delay:${1.6 + i * 0.25}s">
        <div class="pd-place">${SLOTS[i].label}</div>${i === 0 ? '<div class="pd-mvp">MVP</div>' : ''}
        <div class="pd-name ${p.isLocal ? 'me' : ''} ${p.team || ''}">${esc(p.name)}</div>
        <div class="pd-stats"><span><b>${p.score}</b>SCORE</span><span><b>${p.kills}</b>KILLS</span><span><b>${p.deaths}</b>DEATHS</span></div></div>`).join('') +
      `<div class="pd-hint">CLICK TO CONTINUE</div>`;
    document.body.appendChild(el);
  }

  update(dt, aspect) {
    this.t += dt; const t = this.t;
    const cam = this.camera; cam.aspect = aspect;
    // la cámara empieza pegada al MVP y se aleja para mostrar el podio completo
    const k = ease(clamp01((t - 0.2) / 2.8));
    const narrow = Math.max(1, 1.7 / aspect);
    const start = V(0.35, 1.95, 2.3), end = V(Math.sin(t * 0.12) * 0.8, 2.3, 8.4 * narrow);
    cam.position.copy(start.lerp(end, k));
    const look = V(0, 1.6, 0).lerp(V(0, 1.25, 0.2), k);
    cam.lookAt(look);
    cam.fov = 30 + k * 8; cam.updateProjectionMatrix();
    // focos se encienden en secuencia
    this.soldiers.forEach((o, i) => {
      const on = clamp01((t - 0.3 - i * 0.35) / 0.4);
      o.spot.intensity = on * (i === 0 ? 70 : 45);
      this.beams[i].material.opacity = on * (i === 0 ? 0.05 : 0.032);
      poseSoldier(o.s, { moveSpeed: 0, phase: 0, crouch: i === 2 ? 0.85 : 0, air: false, pitch: i === 0 ? 0.15 : -0.05, dead: 0 });
      o.s.spine.rotation.y = Math.sin(t * 0.7 + i) * 0.06;
      o.s.head.rotation.y = Math.sin(t * 0.5 + i * 2) * 0.12;
      o.s.spine.position.y += Math.sin(t * 1.6 + i) * 0.006;
    });
    this.strips.forEach((s, i) => { s.material.opacity = 0.15 + Math.max(0, Math.sin(t * 2 - i * 0.5)) * 0.35; });
    for (const f of this.fog) { f.sp.position.x += f.v * dt; if (Math.abs(f.sp.position.x) > 7) f.v *= -1; }
    const dp = this.dust.geometry.attributes.position;
    this.motes.forEach((m, i) => dp.setXYZ(i, m.x + Math.sin(t * 0.3 + m.ph) * 0.3, (m.y + t * 0.15) % 7, m.z + Math.cos(t * 0.2 + m.ph) * 0.3));
    dp.needsUpdate = true;
    if (this.confetti && t > 1.0) {
      const { inst, P, o } = this.confetti;
      P.forEach((p, i) => {
        p.y -= p.v * dt; p.x += Math.sin(t * 1.5 + p.ph) * 0.5 * dt;
        if (p.y < 0.02) p.y = 0.02;
        o.position.set(p.x, p.y, p.z); o.rotation.set(t * p.rs + p.ph, t * p.rs * 0.6, p.ph); o.updateMatrix(); inst.setMatrixAt(i, o.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    }
    // placas de nombre siguen a cada soldado
    const W = innerWidth, H = innerHeight;
    this.el.querySelectorAll('.pd-plate').forEach(pl => {
      const o = this.soldiers[+pl.dataset.i]; if (!o) return;
      const v = V(o.slot.x, o.slot.h * 0.5, o.slot.z + 0.9).project(cam);
      pl.style.left = ((v.x * 0.5 + 0.5) * W) + 'px'; pl.style.top = ((-v.y * 0.5 + 0.5) * H) + 'px';
    });
  }

  dispose() { this.el.remove(); }
}
