// Estilos de IMPACTO de la bullet cam (V2).
//  freeze  — killcam normal: congelado + onda de choque, mini-órbita y la víctima sale despedida.
//  xray    — final: la víctima se vuelve translúcida, se ven los "huesos" y la bala la atraviesa.
//  shatter — final: el soldado estalla en fragmentos low-poly (con sus colores) a cámara lenta.
//  comic   — final: tres viñetas de cómic con trama y un sello gigante "ELIMINATED".
// Cada estilo recibe la BulletCam (bc) y devuelve true en update() cuando termina.
import * as THREE from 'three';
import { poseSoldier } from '../gfx/models.js';
import { play } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const R = (a, b) => a + Math.random() * (b - a);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const FINAL_STYLES = ['xray', 'shatter', 'comic'];

// La víctima sale despedida en la dirección de la bala (exagerado) mientras cae
function knockback(bc, k) {
  const v = bc.victim; if (!v) return;
  const s = v.soldier;
  bc.victimOwned = true;
  if (!bc.kbBase) bc.kbBase = s.root.position.clone();
  const flat = V(bc.dir.x, 0, bc.dir.z).normalize();
  s.root.position.copy(bc.kbBase).addScaledVector(flat, 1.3 * k).add(V(0, Math.sin(Math.min(1, k) * Math.PI) * 0.35, 0));
  s.root.visible = true;
  poseSoldier(s, { moveSpeed: 0, phase: 0, crouch: 0, pitch: 0, air: k < 0.8, dead: Math.min(1, k * 1.4), deadDir: v.deadDir || 1 });
}
function flash(bc, color, dur) { if (!bc.s.reduceFlash) bc.app.feel.flash(color, dur); }
const RING = new THREE.RingGeometry(0.8, 1, 48); // compartida: nunca se libera
function shockRing(bc, color = 0xffffff) {
  const m = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(bc.to); m.lookAt(bc.to.clone().add(bc.dir)); m.scale.setScalar(0.05);
  bc.group.add(m); (bc.disposeList || (bc.disposeList = [])).push(m.material); return m;
}
function updateRing(r, k) { r.scale.setScalar(0.05 + ss(0, 1, k) * 2.6); r.material.opacity = 0.9 * (1 - ss(0.2, 1, k)); }

// ====================== FREEZE (killcam normal) ======================
class Freeze {
  constructor(bc) {
    this.bc = bc; this.t = 0; const m = bc.m;
    play('shock'); flash(bc, 'rgba(255,255,255,.75)', 0.08);
    for (let i = 0; i < 3; i++) m.fx.blood(bc.to, bc.dir.clone().negate());
    this.ring = shockRing(bc); this.ring2 = shockRing(bc, 0xffd9a0);
    bc.el.classList.add('bc-shock');
    this.off = bc.camPos.clone().sub(bc.to);
    this.dur = bc.short ? 1.05 : 1.4;
  }
  update(dt, cam) {
    const bc = this.bc; this.t += dt; const t = this.t;
    updateRing(this.ring, t / 0.55); updateRing(this.ring2, (t - 0.08) / 0.7);
    // congelado con mini-órbita… y el tiempo vuelve de golpe
    const a = bc.s.reduceShake ? 0 : ss(0, 0.45, t) * 0.45;
    const off = this.off.clone().applyAxisAngle(V(0, 1, 0), a).multiplyScalar(1 + ss(0.45, this.dur, t) * 0.6);
    const look = bc.to.clone().lerp(bc.vChest, ss(0.45, this.dur, t));
    bc.applyCam(cam, bc.to.clone().add(off), look, 36 + ss(0.45, this.dur, t) * 12);
    if (t > 0.45) { if (!this.resumed) { this.resumed = true; bc.app.feel.add(0.4); } knockback(bc, ss(0.45, this.dur - 0.1, t)); }
    return t >= this.dur;
  }
}

// ====================== RAYOS X ======================
class XRay {
  constructor(bc) {
    this.bc = bc; this.t = 0;
    play('xray'); flash(bc, 'rgba(95,230,255,.6)', 0.07);
    bc.victimOwned = true; // ya está posada en el instante del impacto; que nadie le devuelva sus materiales
    bc.el.classList.add('bc-xray'); if (bc.kill.head) bc.el.classList.add('bc-head');
    this.skin = new THREE.MeshBasicMaterial({ color: 0x5fe6ff, transparent: true, opacity: 0.11, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bone = new THREE.MeshBasicMaterial({ color: 0xbfd6ee, transparent: true, opacity: 0.7, depthWrite: false });
    this.bones = []; this.swapped = [];
    const s = bc.victim && bc.victim.soldier;
    // primero se recogen las mallas y DESPUÉS se añaden los huesos (añadirlos durante traverse era un bucle infinito)
    const meshes = []; if (s) s.root.traverse(o => { if (o.isMesh && o.visible) meshes.push(o); });
    meshes.forEach(o => {
      this.swapped.push([o, o.material]); o.material = this.skin;
      // "hueso": la misma pieza encogida hacia su centro (se lee como esqueleto low-poly)
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const c = o.geometry.boundingBox.getCenter(V(0, 0, 0));
      const b = new THREE.Mesh(o.geometry, this.bone); b.scale.setScalar(0.36); b.position.copy(c).multiplyScalar(0.64);
      o.add(b); this.bones.push(b);
    });
    this.exit = bc.to.clone().addScaledVector(bc.dir, 0.75);
    this.dur = 2.5;
  }
  restore() {
    if (this.restored) return; this.restored = true;
    for (const [o, mat] of this.swapped) o.material = mat;
    for (const b of this.bones) b.parent && b.parent.remove(b);
    this.bc.el.classList.remove('bc-xray');
  }
  update(dt, cam) {
    const bc = this.bc; this.t += dt; const t = this.t;
    // la bala atraviesa el cuerpo muy despacio
    const u = ss(0, 1.15, t);
    if (bc.bullet) {
      const p = bc.to.clone().lerp(this.exit, u);
      bc.bullet.visible = t < 1.25; bc.bullet.position.copy(p);
      bc.bullet.lookAt(p.x - bc.dir.x, p.y - bc.dir.y, p.z - bc.dir.z); bc.bullet.rotateZ(t * 8);
    }
    if (t > 0.5 && !this.crack) { this.crack = true; bc.el.classList.add('bc-crack'); play(bc.kill.head ? 'headshot' : 'hit'); }
    if (t > 1.1 && !this.out) { this.out = true; play('shock'); for (let i = 0; i < 4; i++) bc.m.fx.blood(this.exit, bc.dir); bc.m.fx.impact(this.exit, bc.dir.clone().negate()); }
    const pos = bc.to.clone().addScaledVector(bc.side, 2.3).addScaledVector(bc.up, 0.2).addScaledVector(bc.dir, -0.3 + 0.5 * u);
    bc.applyCam(cam, pos, bc.to.clone().addScaledVector(bc.dir, 0.4 * u).add(V(0, -0.25 * ss(1.3, this.dur, t), 0)), 38 + ss(1.3, this.dur, t) * 12);
    if (t > 1.35) { this.restore(); knockback(bc, ss(1.35, 2.2, t)); }
    return t >= this.dur;
  }
  finish() { this.restore(); this.skin.dispose(); this.bone.dispose(); }
}

// ====================== FRAGMENTOS LOW-POLY ======================
class Shatter {
  constructor(bc) {
    this.bc = bc; this.t = 0;
    play('shatter'); play('shock'); flash(bc, 'rgba(255,255,255,.7)', 0.07);
    bc.el.classList.add('bc-shatter');
    const s = bc.victim && bc.victim.soldier;
    const samples = [];
    if (s) {
      s.root.updateMatrixWorld(true);
      const meshes = []; s.root.traverse(o => { if (o.isMesh && o.visible && o.geometry.attributes.position) meshes.push(o); });
      const tris = meshes.map(o => (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3);
      const total = tris.reduce((a, b) => a + b, 0) || 1, N = 190;
      const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0);
      meshes.forEach((o, mi) => {
        const n = Math.max(2, Math.round(N * tris[mi] / total)), pos = o.geometry.attributes.position, idx = o.geometry.index;
        const mat = Array.isArray(o.material) ? o.material[0] : o.material;
        const base = mat && mat.color ? mat.color.clone() : new THREE.Color(0x888888);
        const vc = o.geometry.attributes.color; // los soldados horneados guardan su color por vértice
        for (let i = 0; i < n; i++) {
          const ti = Math.floor(Math.random() * tris[mi]) * 3;
          const ia = idx ? idx.getX(ti) : ti, ib = idx ? idx.getX(ti + 1) : ti + 1, ic = idx ? idx.getX(ti + 2) : ti + 2;
          const col = base.clone(); if (vc) col.multiply(new THREE.Color().fromBufferAttribute(vc, ia));
          a.fromBufferAttribute(pos, ia); b.fromBufferAttribute(pos, ib); c.fromBufferAttribute(pos, ic);
          const p = a.add(b).add(c).multiplyScalar(1 / 3).applyMatrix4(o.matrixWorld).clone();
          samples.push({ p, col });
        }
      });
      s.root.visible = false; bc.victimOwned = true;
    }
    const n = samples.length;
    this.im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), Math.max(1, n));
    this.im.castShadow = false; this.im.frustumCulled = false;
    this.frags = samples.map(({ p, col }, i) => {
      this.im.setColorAt(i, col);
      const away = p.clone().sub(bc.to); const dl = away.length() || 1; away.multiplyScalar(1 / dl);
      const vel = bc.dir.clone().multiplyScalar(R(1.5, 5.5)).addScaledVector(away, R(0.6, 2.8) / Math.max(0.4, dl)).add(V(R(-0.6, 0.6), R(0.4, 2.4), R(-0.6, 0.6)));
      return { p, vel, size: R(0.045, 0.1), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R(0, 6), R(0, 6), R(0, 6))), axis: V(R(-1, 1), R(-1, 1), R(-1, 1)).normalize(), spin: R(3, 14) };
    });
    if (this.im.instanceColor) this.im.instanceColor.needsUpdate = true;
    bc.group.add(this.im);
    this.ground = bc.victim ? bc.victim.soldier.root.position.y : bc.to.y - 1;
    this.center = bc.vChest.clone();
    const off = bc.camPos.clone().sub(this.center); this.a = Math.atan2(off.z, off.x); this.rad = Math.max(2.2, Math.min(3.2, Math.hypot(off.x, off.z)));
    this.ring = shockRing(bc);
    this.dur = 3.0; this._m = new THREE.Matrix4(); this._s = V(1, 1, 1); this._dq = new THREE.Quaternion();
  }
  update(dt, cam) {
    const bc = this.bc; this.t += dt; const t = this.t;
    updateRing(this.ring, t / 0.6);
    const ts = t < 0.9 ? 0.12 : 0.12 + 0.88 * ss(0.9, 1.7, t); // cámara superlenta y luego vuelve el tiempo
    const gdt = dt * ts;
    this.frags.forEach((f, i) => {
      f.vel.y -= 9.8 * gdt; f.p.addScaledVector(f.vel, gdt);
      if (f.p.y < this.ground + f.size / 2) { f.p.y = this.ground + f.size / 2; f.vel.y *= -0.3; f.vel.x *= 0.7; f.vel.z *= 0.7; f.spin *= 0.6; }
      f.q.multiply(this._dq.setFromAxisAngle(f.axis, f.spin * gdt));
      this._s.setScalar(f.size * (t > 2.3 ? 1 - ss(2.3, this.dur, t) : 1));
      this.im.setMatrixAt(i, this._m.compose(f.p, f.q, this._s));
    });
    this.im.instanceMatrix.needsUpdate = true;
    if (!bc.s.reduceShake) this.a += dt * 0.55;
    const pos = this.center.clone().add(V(Math.cos(this.a) * this.rad, 0.45 + t * 0.12, Math.sin(this.a) * this.rad));
    bc.applyCam(cam, pos, this.center.clone().addScaledVector(bc.dir, 0.4 * ss(0, 2, t)), 46);
    return t >= this.dur;
  }
  finish() { this.im.geometry.dispose(); this.im.material.dispose(); this.im.dispose && this.im.dispose(); }
}

// ====================== CÓMIC ======================
const TAUNTS = ['GG.', 'TOO EASY.', 'NEXT!', 'SIT DOWN.', 'CALCULATED.', 'NOT TODAY.'];
class Comic {
  constructor(bc) {
    this.bc = bc; this.t = 0;
    play('comicPow'); flash(bc, 'rgba(255,255,255,.8)', 0.06);
    const m = bc.m, r = m.app.renderer, cam = m.app.camera;
    const shot = (c) => { r.setRenderTarget(null); r.render(m.scene, c); return r.domElement.toDataURL('image/jpeg', 0.85); };
    const tmp = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 300);
    // 1) el impacto (lo que se ve ahora)
    const p1 = shot(cam);
    // 2) la cara del asesino
    let p2 = p1;
    const k = bc.killer && bc.killer.soldier.root;
    if (k) {
      const yaw = k.rotation.y, f = V(-Math.sin(yaw), 0, -Math.cos(yaw));
      const head = k.position.clone().add(V(0, 1.62, 0));
      tmp.position.copy(head).addScaledVector(f, 1.25).add(V(0.25, 0.05, 0)); tmp.lookAt(head); tmp.fov = 32; tmp.updateProjectionMatrix();
      p2 = shot(tmp);
    }
    // 3) la víctima saliendo despedida
    knockback(bc, 0.55);
    const vc = bc.vChest.clone();
    tmp.position.copy(vc).addScaledVector(bc.side, 2.6).add(V(0, 0.6, 0)).addScaledVector(bc.dir, 0.5); tmp.lookAt(vc.clone().addScaledVector(bc.dir, 0.6)); tmp.fov = 44; tmp.updateProjectionMatrix();
    const p3 = shot(tmp);
    const kName = esc(bc.kill.kName || ''), vName = esc(bc.kill.vName || '');
    const el = this.el = document.createElement('div'); el.id = 'bc-comic';
    el.innerHTML = `
      <div class="cm-p cm-1" style="background-image:url(${p1})"><b class="cm-sfx">${bc.kind === 'knife' ? 'SHNK!' : bc.kind === 'grenade' ? 'KA-BOOM!' : 'KRAK!'}</b></div>
      <div class="cm-p cm-2" style="background-image:url(${p2})"><span class="cm-say">${TAUNTS[Math.floor(Math.random() * TAUNTS.length)]}</span><small>${kName}</small></div>
      <div class="cm-p cm-3" style="background-image:url(${p3})"><b class="cm-sfx cm-pow">POW!</b></div>
      <div class="cm-stamp"><b>ELIMINATED</b><span>${vName}</span></div>`;
    document.body.appendChild(el);
    this.dur = 3.2;
  }
  update(dt) {
    this.t += dt; const t = this.t;
    for (const [cls, at] of [['cm-1', 0], ['cm-2', 0.35], ['cm-3', 0.7]]) {
      if (t >= at && !this[cls]) { this[cls] = true; this.el.querySelector('.' + cls).classList.add('in'); if (at > 0) play('comicPow'); }
    }
    if (t >= 1.15 && !this.stamp) { this.stamp = true; this.el.classList.add('stamp'); play('shock'); this.bc.app.feel.add(0.35); }
    if (t >= this.dur - 0.3) this.el.classList.add('out');
    return t >= this.dur;
  }
  finish() { this.el.remove(); }
}

export function makeImpact(style, bc) {
  const S = { freeze: Freeze, xray: XRay, shatter: Shatter, comic: Comic }[style] || Freeze;
  return new S(bc);
}
