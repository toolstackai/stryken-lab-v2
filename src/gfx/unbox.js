// Apertura de cajas: maletín 3D con seguros, costuras que escalan de color según la rareza,
// estallido de la tapa y el premio que sube girando con su haz de luz.
import * as THREE from 'three';
import { makeGun, makeSoldier, poseSoldier, stdMat } from './models.js';
import { makeEnv } from './env.js';
import { glowSprite, smokeSprite } from './textures.js';
import { RARITY } from '../data/cosmetics.js';
import { play } from '../game/audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const backOut = (t) => { const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const RCOL = { common: 0xb8c2d0, rare: 0x3d8bff, epic: 0xa24dff, legendary: 0xffb321 };
const ORDER = ['common', 'rare', 'epic', 'legendary'];

function stencil(text, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#2a2f37'; g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 256, 2, 2); }
  g.strokeStyle = 'rgba(242,194,48,0.85)'; g.lineWidth = 6; g.strokeRect(18, 18, 476, 220);
  g.fillStyle = 'rgba(242,194,48,0.9)';
  for (let x = 30; x < 482; x += 36) { g.save(); g.translate(x, 214); g.transform(1, 0, -0.6, 1, 0, 0); g.fillRect(0, 0, 18, 14); g.restore(); }
  g.fillStyle = 'rgba(235,238,244,0.9)'; g.font = '900 italic 74px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center';
  g.fillText(text, 256, 120);
  g.font = '700 26px "Barlow Condensed", sans-serif'; g.fillStyle = 'rgba(235,238,244,0.6)'; g.fillText(sub, 256, 168);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Unbox {
  // reward: { type: 'weaponSkin'|'charSkin'|'coins', id, name, rarity, amount?, weapon? }
  constructor(app, { title, legend, reward }) {
    this.app = app; this.reward = reward; this.title = title;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.Fog(0x06080d, 7, 18);
    scene.environment = makeEnv(app.renderer, '#202838', '#3a4256', '#08090c', 'unbox'); scene.environmentIntensity = 0.7;
    this.camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.05, 60);
    this.t = 0; this.phase = 'idle'; this.openT = 0; this.revealT = 0; this.shake = 0;
    // suelo, anillos y pedestal
    const floor = new THREE.Mesh(new THREE.CircleGeometry(12, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.2, metalness: 0.6 }));
    floor.receiveShadow = true; scene.add(floor);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.6, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x1a1f2a, roughness: 0.35, metalness: 0.7 }));
    ped.position.y = 0.15; ped.receiveShadow = true; scene.add(ped);
    this.ringMat = new THREE.MeshBasicMaterial({ color: RCOL.common, transparent: true, opacity: 0.6 });
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.02, 6, 8), this.ringMat); this.ring.rotation.x = Math.PI / 2; this.ring.rotation.z = Math.PI / 8; this.ring.position.y = 0.305; scene.add(this.ring);
    this.ring2 = new THREE.Mesh(new THREE.RingGeometry(2.0, 2.04, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: RCOL.common, transparent: true, opacity: 0.25 }));
    this.ring2.position.y = 0.01; scene.add(this.ring2);
    // ---- maletín ----
    const crate = this.crate = new THREE.Group(); crate.position.y = 0.3; scene.add(crate);
    const metal = new THREE.MeshStandardMaterial({ color: legend ? 0x2a2418 : 0x252a33, roughness: 0.4, metalness: 0.7 });
    const trim = new THREE.MeshStandardMaterial({ color: legend ? 0xc9a24a : 0x8c96a6, roughness: 0.3, metalness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.8, 1.2), metal); body.position.y = 0.4; body.castShadow = true; crate.add(body);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.62), new THREE.MeshStandardMaterial({ map: stencil(legend ? 'LEGENDARY' : 'SUPPLY DROP', legend ? 'RARE OR BETTER · GUARANTEED' : 'STRYKEN · DAILY ISSUE'), roughness: 0.6, metalness: 0.3 }));
    front.position.set(0, 0.4, 0.601); crate.add(front);
    for (const x of [-1.01, 1.01]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.82, 1.24), trim); s.position.set(x, 0.4, 0); crate.add(s); }
    for (const z of [-0.61, 0.61]) { const s = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.06, 0.04), trim); s.position.set(0, 0.03, z); crate.add(s); }
    // costuras luminosas (cambian de color durante la apertura)
    this.seamMat = new THREE.MeshBasicMaterial({ color: RCOL.common });
    const seams = [[0, 0.8, 0.605, 2.0, 0.025, 0.02], [0, 0.8, -0.605, 2.0, 0.025, 0.02], [1.005, 0.8, 0, 0.02, 0.025, 1.2], [-1.005, 0.8, 0, 0.02, 0.025, 1.2]];
    for (const [x, y, z, w, h, d] of seams) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), this.seamMat); m.position.set(x, y, z); crate.add(m); }
    // tapa con bisagra atrás
    const lid = this.lid = new THREE.Group(); lid.position.set(0, 0.8, -0.6); crate.add(lid);
    const lidBox = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.22, 1.24), metal); lidBox.position.set(0, 0.11, 0.6); lidBox.castShadow = true; lid.add(lidBox);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.04, 6, 12, Math.PI), trim); handle.position.set(0, 0.22, 0.6); lid.add(handle);
    for (const x of [-0.6, 0.6]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.24, 1.26), trim); r.position.set(x, 0.11, 0.6); lid.add(r); }
    // seguros (saltan uno a uno)
    this.latches = [-0.65, -0.22, 0.22, 0.65].map((x) => {
      const g = new THREE.Group(); g.position.set(x, 0.86, 0.62); crate.add(g);
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.05), trim); p.position.y = -0.06; g.add(p);
      const led = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.01), this.seamMat); led.position.set(0, -0.02, 0.03); g.add(led);
      return g;
    });
    // luz interior + haz
    this.inner = new THREE.PointLight(RCOL.rare, 0, 6, 1.5); this.inner.position.set(0, 1.3, 0); scene.add(this.inner);
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gg = gc.getContext('2d');
    const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(255,255,255,1)'); gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
    this.beamMat = new THREE.MeshBasicMaterial({ color: RCOL.rare, alphaMap: new THREE.CanvasTexture(gc), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.75, 9, 32, 1, true), this.beamMat); beam.position.y = 5.3; scene.add(beam);
    // luces
    scene.add(new THREE.HemisphereLight(0x8fa8d8, 0x08090c, 0.5));
    const key = new THREE.SpotLight(0xffffff, 60, 14, 0.42, 0.6, 1.2); key.position.set(2.5, 6, 4.5); key.target.position.set(0, 0.8, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    scene.add(key, key.target);
    this.rimA = new THREE.DirectionalLight(0x9fb8e0, 1.6); this.rimA.position.set(-4, 3, -4); scene.add(this.rimA);
    const rimB = new THREE.DirectionalLight(0x9fd8ff, 0.8); rimB.position.set(4, 2, -3); scene.add(rimB);
    // chispas (pool) y partículas flotantes
    this.sparks = [];
    for (let i = 0; i < 90; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: RCOL.rare }));
      s.visible = false; scene.add(s); this.sparks.push({ s, v: V(0, 0, 0), life: 0 });
    }
    this.smoke = [];
    for (let i = 0; i < 14; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeSprite(), transparent: true, depthWrite: false, opacity: 0, color: 0x9aa4b8 }));
      s.visible = false; scene.add(s); this.smoke.push({ s, v: V(0, 0, 0), life: 0 });
    }
    const N = 140, pp = new Float32Array(N * 3); this.motes = [];
    for (let i = 0; i < N; i++) this.motes.push({ x: (Math.random() - 0.5) * 9, y: Math.random() * 6, z: (Math.random() - 0.5) * 6, ph: Math.random() * 6.28 });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.moteMat = new THREE.PointsMaterial({ color: RCOL.common, size: 0.03, map: glowSprite(), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    this.dust = new THREE.Points(pg, this.moteMat); this.dust.frustumCulled = false; scene.add(this.dust);
    // premio (oculto hasta abrir)
    this.prize = this.buildPrize(reward); this.prize.visible = false; scene.add(this.prize);
    this.color = new THREE.Color(RCOL.common); this.target = RCOL.common; this.tier = 0;
    this.buildDom();
  }

  buildPrize(r) {
    const g = new THREE.Group();
    if (r.type === 'weaponSkin') {
      const gun = makeGun(r.weapon || 'akr', r.id, { shadows: true });
      const s = 2.0 / 0.95; gun.scale.setScalar(s); gun.rotation.y = Math.PI / 2;
      const bb = new THREE.Box3().setFromObject(gun), c = bb.getCenter(V(0, 0, 0)); gun.position.sub(c);
      g.add(gun);
    } else if (r.type === 'charSkin') {
      const so = makeSoldier(r.id, 'akr', 'factory', { pose: 'hero' });
      poseSoldier(so, { moveSpeed: 0, phase: 0, crouch: 0, pitch: 0.12, dead: 0 });
      so.root.position.y = -0.95; so.root.rotation.y = Math.PI; so.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      g.add(so.root); this.prizeSoldier = so;
    } else {
      const coin = stdMat(0xffc93c, { roughness: 0.25, metalness: 0.9, emissive: 0x3a2600, emissiveIntensity: 0.6 });
      for (let i = 0; i < 9; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.07, 24), coin);
        c.position.set((i % 3 - 1) * 0.28 + Math.sin(i) * 0.05, Math.floor(i / 3) * 0.075 - 0.15, ((i * 7) % 3 - 1) * 0.1); c.castShadow = true; g.add(c);
      }
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 24), coin); top.position.set(0, 0.25, 0); top.rotation.x = 1.1; g.add(top);
    }
    return g;
  }

  buildDom() {
    const el = this.el = document.createElement('div');
    el.id = 'unbox-ui';
    el.innerHTML = `<div class="ub-head"><small>SUPPLY DROP</small><b>${esc(this.title)}</b></div>
      <div class="ub-hint" id="ub-hint"><span class="ub-hold"><i></i></span>CLICK TO OPEN</div>
      <div class="ub-reveal" id="ub-reveal"></div>`;
    document.body.appendChild(el);
    el.addEventListener('mousedown', (e) => { if (!e.target.closest('button')) this.click(); });
  }

  click() {
    if (this.phase === 'idle') { this.phase = 'opening'; this.openT = 0; document.getElementById('ub-hint').classList.add('busy'); play('latch'); }
    else if (this.phase === 'opening' && this.openT > 0.6) this.openT = Math.max(this.openT, 3.25); // acelerar
  }

  // Escalada de suspenso: el color sube de nivel hasta la rareza real
  teaseTier(k) {
    const real = ORDER.indexOf(this.reward.rarity);
    let tier = 0;
    if (real >= 1 && k > 0.3) tier = 1;
    if (real >= 2 && k > 0.55) tier = 2;
    if (real >= 3 && k > 0.8) tier = 3;
    return tier;
  }

  burst(n, speed, color) {
    let k = 0;
    for (const p of this.sparks) {
      if (p.life > 0) continue;
      p.s.visible = true; p.s.material.color.set(color); p.s.position.set((Math.random() - 0.5) * 1.6, 1.15, (Math.random() - 0.5) * 0.9);
      const a = Math.random() * 6.28;
      p.v.set(Math.cos(a) * speed * Math.random(), speed * (0.8 + Math.random()), Math.sin(a) * speed * Math.random());
      p.life = 0.8 + Math.random() * 0.8; p.s.scale.setScalar(0.06 + Math.random() * 0.08);
      if (++k >= n) break;
    }
    let j = 0;
    for (const p of this.smoke) { if (j++ > 8) break; p.s.visible = true; p.s.position.set((Math.random() - 0.5) * 1.5, 1.0, (Math.random() - 0.5) * 1.0); p.v.set((Math.random() - 0.5) * 1.5, 0.6 + Math.random(), (Math.random() - 0.5) * 1.5); p.life = 1.6; p.s.scale.setScalar(0.8); }
  }

  update(dt, aspect) {
    this.t += dt; const t = this.t;
    const cam = this.camera; cam.aspect = aspect;
    const narrow = Math.max(1, 1.7 / aspect);
    let shake = 0, camPos, look, fov = 34;
    if (this.phase === 'idle') {
      // el maletín respira y la cámara orbita despacio
      const intro = ss(0, 1.6, t);
      camPos = V(Math.sin(t * 0.25) * 1.2, 2.6 - intro * 0.4, (8.5 - intro * 2) * narrow);
      look = V(0, 0.75, 0);
      this.crate.position.y = 0.3 + Math.sin(t * 1.5) * 0.008;
      this.seamMat.color.setHex(RCOL.common).multiplyScalar(0.5 + Math.sin(t * 3) * 0.3);
    } else if (this.phase === 'opening') {
      this.openT += dt;
      const k = clamp01(this.openT / 3.4);
      // seguros: saltan en 0.25, 0.55, 0.85, 1.15 s
      this.latches.forEach((l, i) => {
        const at = 0.25 + i * 0.3, p = ss(at, at + 0.12, this.openT);
        l.rotation.x = -p * 1.4; l.position.z = 0.62 + p * 0.03;
        if (this.openT >= at && !l.userData.popped) { l.userData.popped = true; play('latch'); this.burst(4, 1.5, this.color); }
      });
      // costuras: escalan de rareza con un destello en cada subida
      const tier = this.teaseTier(k);
      if (tier !== this.tier) { this.tier = tier; play(tier >= 2 ? 'teaseUp' : 'latch'); this.flash = 1; }
      this.color.lerp(new THREE.Color(RCOL[ORDER[tier]]), Math.min(1, dt * 6));
      const pulse = 0.6 + Math.sin(this.openT * (10 + k * 18)) * 0.4;
      this.seamMat.color.copy(this.color).multiplyScalar(0.8 + pulse * 0.8);
      this.inner.color.copy(this.color); this.inner.intensity = k * 6;
      this.ringMat.color.copy(this.color); this.ring2.material.color.copy(this.color); this.moteMat.color.copy(this.color); this.rimA.color.copy(this.color);
      // temblor creciente; la tapa se entreabre dejando escapar luz
      shake = ss(0.3, 1, k) * 0.04 * (this.reward.rarity === 'legendary' ? 1.6 : 1);
      this.crate.rotation.z = (Math.random() - 0.5) * shake * 1.5; this.crate.position.x = (Math.random() - 0.5) * shake;
      this.lid.rotation.x = -ss(0.55, 1, k) * 0.12 - Math.random() * shake;
      if (this.openT > 1.4 && !this.whine) { this.whine = true; play('tease'); }
      camPos = V(0.5, 2.0 - k * 0.3, 6.2 * narrow - k * 1.5);
      look = V(0, 0.85, 0);
      fov = 34 - k * 4;
      if (k >= 1) this.open();
    } else {
      // revelado: la tapa sale despedida, haz de luz y el premio sube girando
      this.revealT += dt; const r = this.revealT;
      const lidK = ss(0, 0.35, r);
      this.lid.rotation.x = -lidK * 1.9; this.lid.position.y = 0.8 + Math.sin(lidK * Math.PI) * 0.15;
      this.crate.rotation.z *= 0.8; this.crate.position.x *= 0.8;
      this.beamMat.opacity = ss(0, 0.2, r) * (0.18 - ss(0.4, 2.5, r) * 0.1);
      this.inner.intensity = 14 - ss(0.2, 1.5, r) * 8;
      const rise = backOut(clamp01((r - 0.1) / 1.1));
      this.prize.visible = true;
      const base = this.reward.type === 'charSkin' ? 2.12 : 1.95;
      this.prize.position.set(0, 0.6 + rise * (base - 0.6) + Math.sin(t * 1.4) * (this.reward.type === 'charSkin' ? 0.01 : 0.04), 0);
      const isChar = this.reward.type === 'charSkin';
      // el operador gira hasta quedar de frente y luego se balancea; el arma gira sin parar
      this.prize.rotation.y = (1 - rise) * (isChar ? 6.6 : 3.5) + (isChar ? -0.45 + Math.sin(r * 0.45) * 0.55 : r * 0.6);
      this.prize.scale.setScalar(0.3 + rise * 0.7);
      shake = (1 - ss(0, 0.5, r)) * 0.05;
      const sideK = ss(0.3, 1.6, r);
      const shift = sideK * 1.25 * Math.min(1.2, aspect / 1.6);
      camPos = V(Math.sin(t * 0.2) * 0.5 - shift * 0.8, 2.0 + sideK * 0.3, (6.8 - sideK * 0.2) * narrow);
      look = V(-shift, 0.95 + sideK * (this.reward.type === 'charSkin' ? 1.25 : 0.7), 0);
      fov = 34;
    }
    if (this.flash) { this.flash = Math.max(0, this.flash - dt * 3); this.inner.intensity += this.flash * 10; }
    camPos.x += (Math.random() - 0.5) * shake; camPos.y += (Math.random() - 0.5) * shake;
    cam.position.lerp(camPos, this.t < 0.05 ? 1 : Math.min(1, dt * 4)); cam.lookAt(look);
    cam.fov = fov; cam.updateProjectionMatrix();
    // partículas
    for (const p of this.sparks) {
      if (p.life <= 0) continue;
      p.life -= dt; p.v.y -= 6 * dt; p.s.position.addScaledVector(p.v, dt); p.s.material.opacity = Math.min(1, p.life * 2);
      if (p.life <= 0) p.s.visible = false;
    }
    for (const p of this.smoke) {
      if (p.life <= 0) continue;
      p.life -= dt; p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5); p.s.scale.multiplyScalar(1 + dt * 0.9);
      p.s.material.opacity = Math.min(0.35, p.life * 0.25); if (p.life <= 0) p.s.visible = false;
    }
    const dp = this.dust.geometry.attributes.position;
    this.motes.forEach((m, i) => dp.setXYZ(i, m.x + Math.sin(t * 0.3 + m.ph) * 0.3, (m.y + t * 0.2) % 6, m.z + Math.cos(t * 0.2 + m.ph) * 0.3));
    dp.needsUpdate = true;
    this.ring.rotation.z += dt * 0.4;
  }

  open() {
    this.phase = 'reveal'; this.revealT = 0;
    const r = this.reward, rc = RCOL[r.rarity];
    this.color.setHex(rc); this.seamMat.color.setHex(rc); this.beamMat.color.setHex(rc); this.inner.color.setHex(rc);
    this.burst(70, 5, this.color); this.flash = 1.5;
    play('crateOpen'); setTimeout(() => play('reveal_' + r.rarity), 250);
    document.getElementById('ub-hint').classList.add('gone');
    const R = RARITY[r.rarity];
    const kind = r.type === 'weaponSkin' ? 'WEAPON SKIN · WORKS ON EVERY WEAPON' : r.type === 'charSkin' ? 'OPERATOR SKIN' : 'CURRENCY';
    const el = document.getElementById('ub-reveal');
    el.innerHTML = `<div class="ub-rar ${r.rarity}" style="--rc:${R.color}"><span>${R.name}</span></div>
      <div class="ub-name">${esc(r.name)}</div><div class="ub-kind">${kind}${r.dupe ? ' · DUPLICATE → +' + r.dupe + ' COINS' : ''}</div>
      <div class="ub-btns">${r.type !== 'coins' && !r.dupe ? '<button class="btn cyan" id="ub-equip">EQUIP NOW</button>' : ''}<button class="btn dark" id="ub-done">CONTINUE</button></div>`;
    el.classList.add('on', r.rarity);
    document.body.classList.add('ub-flash-' + r.rarity);
    setTimeout(() => document.body.classList.remove('ub-flash-' + r.rarity), 900);
  }

  dispose() { this.el.remove(); }
}
