// BULLET CAM (V2): la bala que mata, en cámara lenta, desde el cañón hasta la víctima.
// La crean la killcam normal (DeathSeq, estilo 'freeze', versión corta) y la FINAL KILLCAM (estilo aleatorio).
// Fases: launch (sale del cañón) → flight (persecución que FRENA al acercarse) → approach (casi parada, de perfil)
//        → impact (lo resuelve el estilo de src/game/impacts.js).
// Sin bala: Boomer = se persigue la granada (el mundo avanza a cámara lenta); cuchillo = órbita lenta alrededor del golpe.
import * as THREE from 'three';
import { propModel } from '../gfx/propmodels.js';
import { poseSoldier, setSoldierWeapon } from '../gfx/models.js';
import { WEAPONS } from '../data/weapons.js';
import { play, setMuffle, setListener } from './audio.js';
import { makeImpact } from './impacts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Posa a todos los soldados según la grabación en el instante t (igual que la killcam)
export function poseFromRec(m, rec, t, skipId = null) {
  for (const a of m.actors) {
    if (a.id === skipId) continue;
    const s = a.soldier, st = rec.sample(a.id, t);
    if (!st) { s.root.visible = false; continue; }
    if (a.isLocal) s.root.traverse(o => { if (o.isMesh && o.userData.realMat && o.material !== o.userData.realMat) o.material = o.userData.realMat; });
    s.root.visible = st.alive || st.deadT < 5;
    setSoldierWeapon(s, st.w, st.ws);
    s.root.position.set(st.x, st.y, st.z); s.root.rotation.y = st.yaw;
    poseSoldier(s, { moveSpeed: st.alive ? st.speed : 0, phase: st.phase, crouch: st.crouch, air: !st.ground && st.alive, pitch: st.pitch, dead: st.alive ? 0 : st.deadT / 0.45, deadDir: st.deadDir });
  }
}

// ¿Con qué se hizo la baja? Devuelve null si no hay nada que seguir (la killcam sigue como siempre).
export function findKillShot(rec, kill) {
  if (!kill || kill.k == null) return null;
  const evs = rec.events, w = kill.weaponId;
  const last = (pred) => { for (let i = evs.length - 1; i >= 0; i--) if (pred(evs[i])) return evs[i]; return null; };
  if (w === 'knife') { const e = last(e => e.type === 'melee' && e.id === kill.k && e.t <= kill.t && e.t > kill.t - 0.5); return e ? { kind: 'knife', ev: e } : null; }
  if (w === 'boomer') {
    const lob = last(e => e.type === 'lob' && e.id === kill.k && e.pos && e.t <= kill.t && e.t > kill.t - 4);
    const boom = last(e => e.type === 'boom' && e.t <= kill.t + 0.02 && e.t >= kill.t - 0.05);
    return lob && boom ? { kind: 'grenade', ev: lob, boom } : null;
  }
  const e = last(e => e.type === 'shot' && e.id === kill.k && e.t <= kill.t && e.t > kill.t - 0.3);
  if (!e) return null;
  return { kind: WEAPONS[w] && WEAPONS[w].pellets > 1 ? 'pellets' : 'bullet', ev: e };
}

// Último fotograma grabado ANTES de la baja (la víctima aún está viva)
function aliveFrameT(rec, t) {
  let best = rec.frames.length ? rec.frames[0].t : t;
  for (const f of rec.frames) { if (f.t < t) best = f.t; else break; }
  return best;
}

const ringGeo = new THREE.TorusGeometry(1, 0.06, 6, 28);
const streakGeo = (() => { const g = new THREE.CylinderGeometry(1, 0.15, 1, 10, 1, true); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5); return g; })();
const pelletGeo = new THREE.SphereGeometry(0.012, 8, 6);

export class BulletCam {
  // opts: { style, short, onImpact }
  constructor(m, rec, kill, shot, opts = {}) {
    this.m = m; this.rec = rec; this.kill = kill; this.shot = shot;
    this.short = !!opts.short; this.styleId = opts.style || 'freeze';
    this.app = m.app; this.s = m.app.profile.settings;
    this.killer = m.actors.find(a => a.id === kill.k);
    this.victim = m.actors.find(a => a.id === kill.v);
    this.kind = shot.kind;
    this.t = 0; this.phase = this.kind === 'knife' ? 'orbit' : 'launch';
    this.group = new THREE.Group(); m.scene.add(this.group);
    this.rings = []; this.ringAcc = 0;
    this.camPos = null; this.camLook = null;

    // ---- congelar el mundo justo antes del impacto ----
    this.freezeT = aliveFrameT(rec, kill.t);
    if (this.kind === 'grenade') { this.t0 = shot.ev.t; this.t1 = shot.boom.t; }
    poseFromRec(m, rec, this.kind === 'grenade' ? this.t0 : this.freezeT);
    m.scene.updateMatrixWorld(true);

    // ---- trayectoria ----
    const vs = rec.sample(kill.v, this.freezeT);
    this.vChest = vs ? V(vs.x, vs.y + (kill.head ? (vs.height || 1.8) - 0.12 : 1.15), vs.z) : V(0, 1, 0);
    if (this.kind === 'grenade') {
      this.from = shot.ev.pos.clone(); this.vel = shot.ev.vel.clone(); this.g = (WEAPONS.boomer.projectile || { gravity: 12 }).gravity;
      this.tau = Math.max(0.1, this.t1 - this.t0);
      this.to = shot.boom.pos.clone();
    } else if (this.kind === 'knife') {
      const ks = rec.sample(kill.k, this.freezeT);
      this.from = ks ? V(ks.x, ks.y + 1.2, ks.z) : this.vChest.clone().add(V(1, 0, 0));
      this.to = this.vChest.clone();
    } else {
      const g = this.killer && this.killer.soldier.gun;
      this.from = g && g.userData.muzzle ? g.userData.muzzle.getWorldPosition(V(0, 0, 0)) : this.vChest.clone().add(V(0, 0, 5));
      this.to = shot.ev.to.clone();
    }
    this.dir = this.to.clone().sub(this.from); this.dist = Math.max(0.5, this.dir.length()); this.dir.normalize();
    if (this.kind === 'grenade') { const ve = this.vel.clone().add(V(0, -this.g * this.tau, 0)); this.dir = ve.normalize(); }
    const up = Math.abs(this.dir.y) > 0.95 ? V(1, 0, 0) : V(0, 1, 0);
    this.side = this.dir.clone().cross(up).normalize(); this.up = this.side.clone().cross(this.dir).normalize();

    // duraciones (tiempo real)
    const S = this.short;
    this.L = this.kind === 'knife' ? 0 : S ? 0.22 : 0.4;
    this.F = this.kind === 'knife' ? (S ? 0.7 : 1.3) : this.kind === 'grenade' ? (S ? 1.0 : 1.8) : S ? Math.min(1.1, Math.max(0.6, 0.5 + this.dist * 0.02)) : Math.min(2.6, Math.max(1.1, 0.9 + this.dist * 0.035));
    this.A = this.kind === 'knife' ? 0 : S ? 0.4 : 0.85;
    this.approachGap = Math.min(0.45, this.dist * 0.3); // la bala se "para" a esta distancia del objetivo

    // ---- proyectil ----
    if (this.kind === 'pellets') {
      this.pellets = [];
      const mat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.8, roughness: 0.35 });
      this.pelletMat = mat;
      for (let i = 0; i < 9; i++) {
        const p = new THREE.Mesh(pelletGeo, mat); p.scale.setScalar(1.6);
        const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * Math.min(0.35, this.dist * 0.04);
        p.userData.off = this.side.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(this.up, Math.sin(a) * r);
        this.group.add(p); this.pellets.push(p);
      }
    } else if (this.kind !== 'knife') {
      const id = this.kind === 'grenade' ? 'grenade' : 'bullet';
      this.bullet = propModel(id) || new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 12).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8703a, metalness: 1, roughness: 0.25 }));
      this.bullet.scale.setScalar(this.kind === 'grenade' ? 1.4 : 2.4);
      this.group.add(this.bullet);
      // estela de calor (cono aditivo detrás de la bala)
      this.streak = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: this.kind === 'grenade' ? 0xffb070 : 0xffe2b0, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      this.group.add(this.streak);
    }
    this.ringMat = new THREE.MeshBasicMaterial({ color: 0xdff4ff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false });

    // ---- interfaz ----
    const w = WEAPONS[kill.weaponId];
    const el = this.el = document.createElement('div'); el.id = 'bc-ui';
    el.className = 'bc-' + this.kind + (S ? ' bc-short' : '');
    el.innerHTML = `<div class="bc-tag"><i></i>${this.kind === 'knife' ? 'BLADE CAM' : this.kind === 'grenade' ? 'GRENADE CAM' : 'BULLET CAM'}</div>
      <div class="bc-meter"><b id="bc-dist">0.0</b><small>M</small><span>${w ? esc(w.name) : ''}</span></div>
      <div class="bc-speed" id="bc-speed">×1.00</div><div class="bc-vig"></div>`;
    document.body.appendChild(el); document.body.classList.add('bc-on');
    setMuffle(0.85);
    play(this.kind === 'knife' ? 'slowmo' : 'bulletLaunch');
    if (this.kind !== 'knife') setTimeout(() => play('bulletFlight'), S ? 60 : 180);
    // fogonazo propio, pequeño y breve (el del juego, congelado delante de la cámara, tapaba la escena)
    if (this.kind !== 'knife') {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g2 = c.getContext('2d');
      const gr = g2.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,60,.6)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
      g2.fillStyle = gr; g2.fillRect(0, 0, 64, 64);
      this.flashTex = new THREE.CanvasTexture(c);
      this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.flash.position.copy(this.from).addScaledVector(this.dir, 0.06); this.flash.scale.setScalar(0.22); this.group.add(this.flash);
    }
    this.impact = null;
  }

  // posición del proyectil para un progreso s (0..1) del recorrido
  pathAt(s) {
    if (this.kind === 'grenade') { const t = s * this.tau; return this.from.clone().addScaledVector(this.vel, t).add(V(0, -0.5 * this.g * t * t, 0)); }
    return this.from.clone().addScaledVector(this.dir, this.dist * s);
  }

  // Avanza en tiempo REAL. Devuelve true al terminar.
  update(dt, cam) {
    this.t += dt;
    const { L, F, A } = this;
    this.m.fx.update(dt); // los efectos que quedaban de la repetición se apagan (no se quedan congelados delante)
    if (this.flash) { const k = clamp01(this.t / 0.5); this.flash.material.opacity = 1 - k; this.flash.scale.setScalar(0.22 + k * 0.25); this.flash.visible = k < 1; }
    const t = this.t, sEnd = 1 - this.approachGap / this.dist;
    let s, phase;
    if (this.kind === 'knife') { phase = t < F ? 'orbit' : 'impact'; s = 1; }
    else if (t < L) { phase = 'launch'; s = 0.02 * (t / L); }
    else if (t < L + F) { phase = 'flight'; const u = (t - L) / F; s = 0.02 + (sEnd - 0.02) * (1 - Math.pow(1 - u, 2.6)); } // frena al acercarse
    else if (t < L + F + A) { phase = 'approach'; const u = (t - L - F) / A; s = sEnd + (1 - sEnd) * (u * u * u); }   // casi parada… y entra
    else { phase = 'impact'; s = 1; }
    if (phase !== this.phase) {
      if (phase === 'approach') { play('timeFreeze'); this.el.classList.add('bc-approach'); }
      this.phase = phase;
    }
    if (phase === 'impact') {
      if (!this.impact) {
        if (this.bullet) this.bullet.visible = this.styleId === 'xray';
        if (this.streak) this.streak.visible = false;
        if (this.pellets) this.pellets.forEach(p => { p.visible = false; });
        this.el.classList.add('bc-hit');
        this.impact = makeImpact(this.styleId, this);
      }
      this.updateRings(dt);
      // la partida (en la killcam normal sigue viva) no debe recolocar a nadie: posamos todo desde la grabación;
      // a la víctima sólo mientras el estilo no la controle (empuje, fragmentos…)
      poseFromRec(this.m, this.rec, this.kind === 'grenade' ? this.t1 : this.freezeT, this.victimOwned ? this.kill.v : null);
      return this.impact.update(dt, cam);
    }
    // grenada: el mundo avanza a cámara lenta durante su vuelo
    if (this.kind === 'grenade') poseFromRec(this.m, this.rec, this.t0 + s * this.tau);
    else poseFromRec(this.m, this.rec, this.freezeT);

    const p = this.pathAt(s);
    // velocidad aparente (para el contador ×0.05)
    const sp = this.lastS != null ? Math.abs(s - this.lastS) * this.dist / Math.max(1e-4, dt) : 0; this.lastS = s;
    const realV = this.kind === 'grenade' ? 34 : 900;
    const sEl = document.getElementById('bc-speed'); if (sEl) sEl.textContent = '×' + Math.max(0.001, sp / realV).toFixed(sp / realV < 0.01 ? 3 : 2);
    const dEl = document.getElementById('bc-dist'); if (dEl) dEl.textContent = Math.max(0, this.dist * (1 - s)).toFixed(1);

    // proyectil
    const dirNow = this.kind === 'grenade' ? this.vel.clone().add(V(0, -this.g * s * this.tau, 0)).normalize() : this.dir;
    if (this.bullet) {
      this.bullet.position.copy(p);
      this.bullet.lookAt(p.x - dirNow.x, p.y - dirNow.y, p.z - dirNow.z); // la punta (−z) mira hacia donde vuela
      this.bullet.rotateZ(t * (this.kind === 'grenade' ? 9 : 26));     // giro por las estrías
      const len = Math.min(1.6, this.dist * s) * (phase === 'approach' ? 0.4 : 1);
      this.streak.position.copy(p); this.streak.lookAt(p.x - dirNow.x, p.y - dirNow.y, p.z - dirNow.z);
      this.streak.scale.set(0.007, 0.007, Math.max(0.01, len));
      this.streak.material.opacity = 0.22 * (phase === 'launch' ? t / L : 1);
    }
    if (this.pellets) for (const pe of this.pellets) pe.position.copy(p).addScaledVector(pe.userData.off, s);
    // anillos de aire cada ~0.5 m recorridos
    if (this.kind !== 'knife') {
      const travelled = this.dist * s;
      if (this.lastTrav == null) this.lastTrav = travelled;
      this.ringAcc += travelled - this.lastTrav; this.lastTrav = travelled;
      if (this.ringAcc > (this.short ? 0.9 : 0.5) && phase === 'flight') { this.ringAcc = 0; this.spawnRing(p, dirNow); }
    }
    this.updateRings(dt);

    // ---- cámara ----
    let pos, look, fov;
    if (this.kind === 'knife') {
      const mid = this.from.clone().lerp(this.to, 0.5), a = t / F * 2.2 + 0.4;
      pos = mid.clone().add(V(Math.cos(a) * 2.2, 0.5 + 0.3 * Math.sin(t), Math.sin(a) * 2.2)); look = mid; fov = 50 - t / F * 10;
    } else if (phase === 'launch') {
      pos = this.from.clone().addScaledVector(this.side, 0.35).addScaledVector(this.up, 0.08).addScaledVector(this.dir, 0.25);
      look = p.clone().addScaledVector(dirNow, 0.15); fov = 40;
    } else if (phase === 'flight') {
      const u = (t - L) / F, orb = (this.s.reduceShake ? 0.6 : 2.4) * u + 0.6;
      const r = this.side.clone().multiplyScalar(Math.cos(orb)).addScaledVector(this.up, Math.sin(orb));
      const back = this.pellets ? 1.15 : this.kind === 'grenade' ? 0.7 : 0.36; // el racimo de perdigones necesita más plano
      pos = p.clone().addScaledVector(dirNow, -back).addScaledVector(r, this.pellets ? 0.4 : 0.17);
      look = p.clone().addScaledVector(dirNow, 1.4); fov = 46 - u * 12;
    } else { // approach: de perfil, se ve la bala y la víctima a la vez
      const u = (t - L - F) / A, mid = p.clone().lerp(this.to, 0.6);
      pos = mid.clone().addScaledVector(this.side, 1.7 + 0.2 * u).addScaledVector(this.up, 0.2).addScaledVector(this.dir, -0.35);
      look = mid; fov = 36 - u * 6;
    }
    // no atravesar paredes
    const d = pos.clone().sub(look), Ld = d.length(); d.normalize();
    const hit = this.m.raycast(look, d, Ld);
    if (hit) pos.copy(look).addScaledVector(d, Math.max(0.15, hit.t - 0.1));
    const k = phase === 'launch' || !this.camPos ? 1 : Math.min(1, dt * (phase === 'approach' ? 5 : 14));
    if (!this.camPos) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    this.applyCam(cam, this.camPos, this.camLook, fov, false);
    return false;
  }

  // Coloca la cámara; con clamp, nunca detrás de una pared respecto al punto que mira
  applyCam(cam, pos, look, fov, clamp = true) {
    if (clamp) {
      const d = pos.clone().sub(look), L = d.length();
      if (L > 0.05) { d.multiplyScalar(1 / L); const hit = this.m.raycast(look, d, L); if (hit) pos = look.clone().addScaledVector(d, Math.max(0.15, hit.t - 0.12)); }
    }
    cam.position.copy(pos); cam.up.set(0, 1, 0); cam.lookAt(look);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    setListener(pos.x, pos.y, pos.z, Math.atan2(-(look.x - pos.x), -(look.z - pos.z)));
  }

  spawnRing(p, dir) {
    const r = new THREE.Mesh(ringGeo, this.ringMat.clone());
    r.position.copy(p); r.lookAt(p.clone().add(dir)); r.scale.setScalar(0.03);
    r.userData.t = 0; this.group.add(r); this.rings.push(r);
  }
  updateRings(dt) {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.userData.t += dt;
      const k = r.userData.t / 0.9;
      if (k >= 1) { this.group.remove(r); r.material.dispose(); this.rings.splice(i, 1); continue; }
      r.scale.setScalar(0.03 + k * 0.32); r.material.opacity = 0.45 * (1 - k);
    }
  }

  finish() {
    if (this.done) return; this.done = true;
    if (this.impact && this.impact.finish) this.impact.finish();
    for (const r of this.rings) r.material.dispose();
    this.m.scene.remove(this.group);
    if (this.streak) this.streak.material.dispose();
    if (this.pelletMat) this.pelletMat.dispose();
    if (this.flash) { this.flash.material.dispose(); this.flashTex.dispose(); }
    this.ringMat.dispose();
    for (const d of this.disposeList || []) d.dispose();
    this.el.remove(); document.body.classList.remove('bc-on');
    setMuffle(0);
  }
}
