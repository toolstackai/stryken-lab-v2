// Secuencia 4 — muerte y reaparición:
//   1. caída en primera persona (la cámara cae al suelo de lado, el color se apaga)
//   2. KILLCAM: repetición desde los ojos del asesino, con SU arma en pantalla y cámara lenta en el disparo
//   3. redespliegue: vista táctica desde el cielo que cae en picado hasta tu soldado y levanta el arma
// El mundo sigue vivo durante toda la secuencia; sólo se sobreescriben las poses visibles durante la repetición.
import * as THREE from 'three';
import { poseSoldier, setSoldierWeapon } from '../gfx/models.js';
import { ViewModel } from '../gfx/viewmodel.js';
import { WEAPONS } from '../data/weapons.js';
import { gunIcon } from '../gfx/icons.js';
import { play, playShot, setListener } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const UP = V(0, 1, 0);
const fwdOf = (yaw, pitch = 0) => V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
const rightOf = (yaw) => V(Math.cos(yaw), 0, -Math.sin(yaw));
const lookQuat = (from, to) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(from, to, UP));
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// Emblema y tarjeta de jugador generados a partir del nombre (cada bot tiene la suya, siempre la misma)
export function emblemSVG(name) {
  const h = hash(name), hue = h % 360, hue2 = (hue + 40 + (h >>> 9) % 80) % 360;
  const shapes = [
    'M32 4 56 18v28L32 60 8 46V18z',                       // hexágono
    'M32 4 56 12v20c0 14-10 24-24 28C18 56 8 46 8 32V12z', // escudo
    'M32 2 62 32 32 62 2 32z',                             // rombo
    'M32 4a28 28 0 1 0 .1 0z',                             // círculo
  ];
  const glyphs = [
    '<path d="M32 16a11 11 0 0 0-11 11c0 5 3 8 5 9v6h12v-6c2-1 5-4 5-9a11 11 0 0 0-11-11zm-5 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="#fff"/><path d="M28 44h8v4h-8z" fill="#fff"/>', // calavera
    '<path d="M36 12 22 34h9l-3 18 14-22h-9z" fill="#fff"/>',             // rayo
    '<circle cx="32" cy="32" r="11" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M32 14v10M32 40v10M14 32h10M40 32h10" stroke="#fff" stroke-width="3.5"/>', // mira
    '<path d="M32 14l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#fff"/>', // estrella
    '<path d="M14 26l18 10 18-10v8L32 44 14 34zM14 16l18 10 18-10v8L32 34 14 24z" fill="#fff"/>', // galones
  ];
  const shape = shapes[(h >>> 3) % shapes.length], glyph = glyphs[(h >>> 6) % glyphs.length];
  return `<svg viewBox="0 0 64 64"><defs><linearGradient id="eg${h}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 75% 55%)"/><stop offset="1" stop-color="hsl(${hue2} 70% 30%)"/></linearGradient></defs><path d="${shape}" fill="url(#eg${h})" stroke="rgba(255,255,255,.85)" stroke-width="2.5"/>${glyph}</svg>`;
}
function cardBg(name) {
  const h = hash(name + 'card'), hue = h % 360, ang = 20 + (h >>> 4) % 140;
  return `linear-gradient(${ang}deg, hsla(${hue},70%,45%,.55), transparent 60%), repeating-linear-gradient(${ang + 90}deg, rgba(255,255,255,.05) 0 2px, transparent 2px 9px), linear-gradient(180deg, rgba(26,30,44,.96), rgba(12,14,22,.97))`;
}

import { BulletCam, findKillShot } from './bulletcam.js';

export class DeathSeq {
  constructor(m, killer, weaponId, head) {
    this.m = m; this.me = m.me;
    this.killer = killer && killer !== m.me ? killer : null;
    this.weaponId = weaponId; this.head = head;
    this.t = 0; this.stage = 'fall'; this.st = 0;
    this.kt = m.time;
    const me = this.me, k = this.killer, rec = m.rec;
    // ¿hay suficiente grabación para la killcam?
    this.canKC = !!(k && rec.frames.length && rec.frames[0].t < this.kt - 1.0 && m.app.profile.settings.killcam !== false);
    this.t0 = this.canKC ? Math.max(rec.frames[0].t, this.kt - 2.2) : 0;
    this.t1 = this.kt + 0.7;
    this.pt = this.t0;
    this.killEv = rec.events.slice().reverse().find(e => e.type === 'kill' && e.v === me.id) || null;
    // V2 · BULLET CAM corta (estilo congelar + onda de choque) al final de la killcam
    this.bshot = this.canKC && this.killEv && this.killEv.k === (k && k.id) ? findKillShot(rec, this.killEv) : null;
    this.info = k ? {
      hp: Math.max(1, Math.ceil(k.hp)), dist: Math.round(Math.hypot(k.pos.x - me.pos.x, k.pos.y - me.pos.y, k.pos.z - me.pos.z)),
      dealt: Math.round(k.damageBy.get(me) || 0), streak: k.streak, lvl: k.isBot ? 4 + hash(k.name) % 96 : 1,
    } : null;

    // ---- caída: de la cabeza al suelo, girando de lado y mirando al asesino ----
    const cam = m.app.camera;
    this.p0 = cam.position.clone(); this.q0 = cam.quaternion.clone();
    const f = fwdOf(me.yaw), r = rightOf(me.yaw), dd = me.deadDir || 1;
    const eye = V(me.pos.x, me.pos.y + me.eyeH, me.pos.z);
    let p1 = V(me.pos.x, me.pos.y + 0.3, me.pos.z).addScaledVector(r, dd * 0.35).addScaledVector(f, 0.2);
    const dv = p1.clone().sub(eye), dl = dv.length(); dv.normalize();
    const hit = m.raycast(eye, dv, dl);
    if (hit) p1 = eye.clone().addScaledVector(dv, Math.max(0.2, hit.t - 0.25));
    this.p1 = p1;
    const look = k ? V(k.pos.x, k.pos.y + 1.35, k.pos.z) : p1.clone().addScaledVector(f, 4).add(V(0, 0.5, 0));
    this.q1 = lookQuat(p1, look).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), dd * 0.9));

    this.buildDom();
    document.body.classList.add('dk-on', 'dk-dead');
    play('bodyfall');
  }

  // ---------- DOM ----------
  buildDom() {
    const k = this.killer, I = this.info;
    let el = $('dk-ui');
    if (!el) { el = document.createElement('div'); el.id = 'dk-ui'; document.body.appendChild(el); }
    const wid = this.weaponId in WEAPONS ? this.weaponId : null;
    const w = wid ? WEAPONS[wid] : null;
    const cause = this.weaponId === 'fall' ? 'FELL TO YOUR DEATH' : this.weaponId === 'zone' ? 'CONSUMED BY THE STORM' : 'SELF-ELIMINATED';
    const br = this.m.br, place = br ? this.me.brPlace : 0;
    const card = k ? `
      <div class="dk-card" style="background:${cardBg(k.name)}">
        <div class="dk-emblem">${emblemSVG(k.name)}</div>
        <div class="dk-who"><small>KILLED BY</small><b>${esc(k.name)}</b><span>LV ${I.lvl}${I.streak > 1 ? ` · <em>${I.streak} STREAK</em>` : ''}</span></div>
        ${w ? `<div class="dk-gun"><img src="${gunIcon(wid).white}"><span>${w.name}</span></div>` : ''}
        ${this.head ? '<div class="dk-head">HEADSHOT</div>' : ''}
        <div class="dk-hp"><i style="width:${Math.min(100, I.hp)}%"></i></div>
      </div>
      <div class="dk-stats">
        <div style="animation-delay:.55s"><b class="${I.hp <= 30 ? 'red' : ''}">${I.hp}</b><small>HP LEFT</small></div>
        <div style="animation-delay:.65s"><b>${I.dist}<i>m</i></b><small>DISTANCE</small></div>
        <div style="animation-delay:.75s"><b>${I.dealt}</b><small>YOUR DAMAGE</small></div>
      </div>
      <div class="dk-rev"><i></i>REVENGE AVAILABLE</div>` : `
      <div class="dk-card kia"><div class="dk-who"><small>K.I.A.</small><b>${cause}</b></div></div>`;
    el.innerHTML = `
      <div class="dk-blood"></div>
      <div class="dk-grain"></div>
      <div class="dk-slam"><i>◀◀</i><b>KILLCAM</b></div>
      <div class="dk-rec"><span><i></i>KILLCAM</span><div class="dk-tl"><i></i><b style="left:${this.canKC ? ((this.kt - this.t0) / (this.t1 - this.t0) * 100).toFixed(1) : 0}%"></b></div></div>
      <div class="dk-slow">SLOW MOTION</div>
      <div class="dk-bottom">${card}</div>
      ${br ? `<div class="dk-place"><small>ELIMINATED</small><b>#${place}</b><span>OF ${this.m.actors.length}</span></div>` : ''}
      <div class="dk-hint"><span class="dk-skip"><kbd>SPACE</kbd> ${this.canKC ? 'SKIP KILLCAM' : br ? 'CONTINUE' : this.m.arena ? 'SPECTATE' : 'RESPAWN'}</span>${br || this.m.arena ? '' : '<span><kbd>B</kbd> LOADOUT</span>'}</div>
      <div class="dk-dep"><div class="dk-grid"></div><div class="dk-scan"></div>
        <div class="dk-dtitle"><small>REDEPLOYING</small><b>${esc(this.m.map.name)}</b></div>
        <div class="dk-alt">ALT <b id="dk-alt">24</b>m</div><div class="dk-reticle"></div></div>`;
    el.className = 'dks-fall';
  }
  setStage(s) {
    this.stage = s; this.st = 0;
    const el = $('dk-ui'); if (el) el.className = 'dks-' + s;
    document.body.classList.toggle('dk-dead', s === 'fall' || s === 'card' || s === 'kcIn');
    document.body.classList.toggle('dk-kc', s === 'kc');
    document.body.classList.toggle('dk-deploying', s === 'deploy');
  }

  // Espacio / clic: saltar la killcam e ir directo al redespliegue
  skip() { if (this.t > 0.4 && this.stage !== 'deploy') this.wantDeploy = true; }

  // ---------- Bucle ----------
  // Se llama después de syncVisuals y de la cámara del jugador: puede sobreescribir poses y cámara.
  update(dt, cam) {
    this.t += dt; this.st += dt;
    const m = this.m;
    if (this.wantDeploy && this.bc) { this.bc.finish(); this.bc = null; }
    const loadout = m.app.ui.loadoutOpen;
    if (this.wantDeploy && this.stage !== 'deploy' && !loadout) { this.wantDeploy = false; if (this.stage === 'kc') this.endReplay(); this.startDeploy(); }
    if (m.death !== this) return; // Arena/BR: startDeploy pudo cerrar esta secuencia (espectador / fin de partida)
    switch (this.stage) {
      case 'fall': this.fall(cam); if (this.st > (this.canKC ? 0.95 : 1.3)) { if (this.canKC) { this.setStage('kcIn'); play('rewind'); } else this.setStage('card'); } break;
      case 'card': this.fall(cam); if (this.st > (m.br ? 2.6 : 1.5) && !loadout) this.startDeploy(); break;
      case 'kcIn': this.fall(cam); if (this.st > 0.42) this.startReplay(); break;
      case 'kc':
        if (this.bc) { if (this.bc.update(dt, cam)) { this.bc.finish(); this.bc = null; this.endReplay(); if (loadout || this.m.arena) this.setStage('card'); else this.startDeploy(); } break; }
        if (this.bshot && this.pt >= this.bshot.ev.t - 0.001) { this.bc = new BulletCam(m, m.rec, this.killEv, this.bshot, { style: 'freeze', short: true }); break; }
        this.replay(dt, cam); if (this.pt >= this.t1) { this.endReplay(); if (loadout) this.setStage('card'); else this.startDeploy(); } break;
      case 'deploy': this.deploy(cam); break;
    }
  }

  fall(cam) {
    const t = this.t;
    this.me.soldier.root.visible = false; // en primera persona no ves tu propio cuerpo
    const k = clamp01(t / 0.55);
    const pos = this.p0.clone().lerp(this.p1, k * k);
    // rebote al tocar el suelo + temblor
    if (t > 0.55) { const b = clamp01((t - 0.55) / 0.3); pos.y += Math.sin(b * Math.PI) * 0.05 * (1 - b); }
    const q = this.q0.clone().slerp(this.q1, easeInOut(clamp01(t / 0.7)));
    if (t > 0.52 && t < 0.75) { const j = (0.75 - t) * 0.12; q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler((Math.random() - 0.5) * j, (Math.random() - 0.5) * j, 0))); }
    // respiración muy leve en el suelo
    pos.y += Math.sin(t * 1.4) * 0.006;
    cam.position.copy(pos); cam.quaternion.copy(q);
    const fov = this.m.app.profile.settings.fov - ss(0, 0.8, t) * 6;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    if (t > 0.5 && !this.thud) { this.thud = true; play('land', null, 0.9); }
  }

  // ---------- KILLCAM ----------
  startReplay() {
    const m = this.m;
    this.setStage('kc');
    m.quiet = true; // silencia disparos/efectos en vivo mientras se ve la repetición
    if (!m.kvm) {
      m.kvm = new ViewModel();
      m.kvm.scene.environment = m.vm.scene.environment; m.kvm.scene.environmentIntensity = m.vm.scene.environmentIntensity;
    }
    this.kvm = m.kvm; this.kvm.anim = null; this.kvm.kick = this.kvm.kickV = 0;
    this.kvm.world = m.vm.world; this.kvm.pipSize = m.vm.pipSize;
    this.prevYaw = null; this.hitSaid = false; this.slowSaid = false;
    play('killcam');
  }
  timeScale() {
    const k = this.kt;
    return 1 - 0.72 * Math.min(ss(k - 0.5, k - 0.12, this.pt), 1 - ss(k + 0.18, k + 0.55, this.pt));
  }
  replay(dt, cam) {
    const m = this.m, rec = m.rec, k = this.killer;
    const prev = this.pt, sc = this.timeScale();
    this.pt = Math.min(this.t1, this.pt + dt * sc);
    const pt = this.pt;
    $('dk-ui').classList.toggle('dk-slowmo', sc < 0.6);
    if (sc < 0.6 && !this.slowSaid) { this.slowSaid = true; play('slowmo'); }
    const tl = document.querySelector('#dk-ui .dk-tl > i'); if (tl) tl.style.width = ((pt - this.t0) / (this.t1 - this.t0) * 100).toFixed(1) + '%';
    // poses de la grabación
    for (const a of m.actors) {
      const s = a.soldier, st = rec.sample(a.id, pt);
      if (!st || a === k) { s.root.visible = false; continue; }
      s.root.visible = st.alive || st.deadT < 5;
      setSoldierWeapon(s, st.w, st.ws);
      s.root.position.set(st.x, st.y, st.z); s.root.rotation.y = st.yaw;
      poseSoldier(s, { moveSpeed: st.alive ? st.speed : 0, phase: st.phase, crouch: st.crouch, air: !st.ground && st.alive, pitch: st.pitch, dead: st.alive ? 0 : st.deadT / 0.45, deadDir: st.deadDir });
    }
    const ks = rec.sample(k.id, pt);
    if (!ks) { this.pt = this.t1; return; }
    const eye = V(ks.x, ks.y + (ks.eye || 1.62), ks.z);
    const wdef = WEAPONS[ks.w] || WEAPONS.akr;
    // en armas con mira telescópica no apuntamos del todo, así se sigue viendo el arma
    const ads = ks.ads || 0;
    // eventos del intervalo (prev, pt]
    for (const e of rec.events) {
      if (e.t <= prev || e.t > pt) continue;
      if (e.type === 'shot') {
        const shooter = m.actors.find(a => a.id === e.id); if (!shooter) continue;
        let mz;
        if (shooter === k) {
          const f = fwdOf(ks.yaw, ks.pitch), r = rightOf(ks.yaw);
          mz = eye.clone().addScaledVector(f, 0.7).addScaledVector(r, 0.14 * (1 - ads)).add(V(0, -0.12 * (1 - ads) - 0.04, 0));
          this.kvm.fire(e.sound === 'shotgun' || e.sound === 'sniper' ? 1.4 : 1);
          m.fx.flashLight.position.copy(mz); m.fx.flashLight.intensity = 4; m.fx.flashT = 0.05;
          playShot(e.sound || 'rifle');
        } else {
          shooter.soldier.root.updateMatrixWorld(true);
          mz = shooter.soldier.gun.userData.muzzle.getWorldPosition(V(0, 0, 0));
          m.fx.muzzle(mz, e.sound === 'shotgun' ? 1.5 : 1.1);
          playShot(e.sound || 'rifle', shooter.pos);
        }
        m.fx.tracer(mz, e.to, e.tracer || 0xffe9a8, 0.026);
        if (e.hit) m.fx.blood(e.to, mz.clone().sub(e.to).normalize()); else if (e.normal) m.fx.impact(e.to, e.normal);
      } else if (e.type === 'lob') {
        const shooter = m.actors.find(a => a.id === e.id); if (!shooter) continue;
        if (shooter === k) { this.kvm.fire(1.4); playShot(e.sound || 'launcher'); }
        else { shooter.soldier.root.updateMatrixWorld(true); m.fx.muzzle(shooter.soldier.gun.userData.muzzle.getWorldPosition(V(0, 0, 0)), 1.5); playShot(e.sound || 'launcher', shooter.pos); }
      } else if (e.type === 'boom') {
        m.fx.explosion(e.pos); play('explosion', e.pos, 1.5);
      } else if (e.type === 'melee' && e.id === k.id) {
        this.kvm.play(e.heavy ? 'stab' : 'slash', e.heavy ? 0.5 : 0.32); play('knife');
      } else if (e.type === 'kill' && e === this.killEv && !this.hitSaid) {
        this.hitSaid = true;
        play('kill'); play(e.head ? 'headshot' : 'hit');
        const el = $('dk-ui'); el.classList.add('dk-hit'); setTimeout(() => el.classList.remove('dk-hit'), 450);
      }
    }
    // cámara: los ojos del asesino
    cam.position.copy(eye);
    cam.rotation.set(ks.pitch, ks.yaw, 0, 'YXZ');
    const zoom = 1 + ((wdef.adsZoom || 1) - 1) * ads;
    const fov = this.m.app.profile.settings.fov / zoom;
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    setListener(eye.x, eye.y, eye.z, ks.yaw);
    // su arma en primera persona
    this.kvm.setWeapon(ks.w in WEAPONS ? ks.w : 'akr', ks.ws || 'factory', k.skin);
    if (this.lastW && this.lastW !== ks.w) this.kvm.play('draw', 0.35);
    this.lastW = ks.w;
    let dyaw = 0, dp = 0;
    if (this.prevYaw != null) { dyaw = Math.atan2(Math.sin(ks.yaw - this.prevYaw), Math.cos(ks.yaw - this.prevYaw)); dp = ks.pitch - this.prevPitch; }
    this.prevYaw = ks.yaw; this.prevPitch = ks.pitch;
    const sdt = Math.max(1e-4, dt * sc);
    this.kvm.update(dt * sc, {
      ads, speed: ks.alive ? ks.speed : 0, onGround: ks.ground, sprint: ks.speed > 6.6, sprintBlend: ss(6.2, 7.2, ks.speed) * (1 - ads), crouch: ks.crouch,
      phase: ks.phase, time: pt, lookDX: -dyaw / sdt * 6, lookDY: -dp / sdt * 6, land: 0, vx: 0, vy: 0, hidden: false,
    });
  }
  endReplay() {
    const m = this.m;
    m.quiet = false;
    this.kvm = null;
    // las armas visibles vuelven a las reales
    for (const a of m.actors) if (a.weapon) setSoldierWeapon(a.soldier, a.weapon.id, a.weaponSkins[a.weapon.id] || 'factory');
    const el = $('dk-ui'); if (el) el.classList.remove('dk-slowmo');
  }

  // ---------- REDESPLIEGUE ----------
  startDeploy() {
    const m = this.m, me = this.me;
    if (m.br) { if (this.stage === 'kc') this.endReplay(); m.br.afterDeath(); return; }
    if (m.arena) { if (this.stage === 'kc') this.endReplay(); m.arena.afterDeath(); return; }
    this.setStage('deploy');
    m.spawn(me);
    me.spawnShield = Math.max(me.spawnShield, 2.6);
    const eye = V(me.pos.x, me.pos.y + me.eyeH, me.pos.z), f = fwdOf(me.yaw);
    // altura limitada por el techo (mapas interiores)
    const up = m.raycast(eye, UP, 30);
    const H = up ? Math.max(2.4, up.t - 0.7) : 24;
    let start = eye.clone().add(V(0, H, 0)).addScaledVector(f, -H * 0.3);
    const dv = start.clone().sub(eye), dl = dv.length(); dv.normalize();
    const hit = m.raycast(eye, dv, dl);
    if (hit) start = eye.clone().addScaledVector(dv, Math.max(1, hit.t - 0.4));
    this.d = { eye, start, H: start.y - eye.y, qa: lookQuat(start, V(me.pos.x, me.pos.y + 0.6, me.pos.z)), qb: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, me.yaw, 0, 'YXZ')) };
    this.deployDur = 1.05;
    play('deploy');
  }
  deploy(cam) {
    const d = this.d, k = clamp01(this.st / this.deployDur);
    // caída en picado: lenta arriba, rápida al final
    const e = k * k * k * 0.75 + k * 0.25;
    cam.position.lerpVectors(d.start, d.eye, e);
    cam.quaternion.copy(d.qa).slerp(d.qb, ss(0.55, 1.0, k));
    // desde el cielo ves a tu operador en la retícula; al llegar a la cabeza desaparece (primera persona)
    const s = this.me.soldier;
    s.root.visible = k < 0.82;
    if (s.root.visible) s.root.traverse(o => { if (o.isMesh && o.userData.realMat && o.material !== o.userData.realMat) o.material = o.userData.realMat; });
    const fov = 44 + (this.m.app.profile.settings.fov - 44) * ss(0.5, 1, k);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    const alt = $('dk-alt'); if (alt) alt.textContent = Math.max(0, Math.round(d.H * (1 - e)));
    if (k >= 1) this.finish(true);
  }

  // Fin normal (true) o cancelación por fin de partida (false)
  finish(landed) {
    const m = this.m;
    if (this.bc) { this.bc.finish(); this.bc = null; }
    if (this.stage === 'kc') this.endReplay();
    m.quiet = false;
    const el = $('dk-ui'); if (el) el.remove();
    document.body.classList.remove('dk-on', 'dk-dead', 'dk-kc', 'dk-deploying');
    if (landed) {
      document.body.classList.add('dk-land'); setTimeout(() => document.body.classList.remove('dk-land'), 600);
      m.vm.play('raise', 0.85);
      m.app.ui.hud.buildIn();
      play('deployLand');
      this.me.spawnTime = m.time;
    }
    m.death = null;
  }
}
