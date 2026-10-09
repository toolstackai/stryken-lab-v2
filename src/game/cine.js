// Cinemáticas de partida: infiltración (intro), grabadora de jugadas y FINAL KILLCAM a cámara lenta.
import * as THREE from 'three';
import { poseSoldier, setSoldierWeapon } from '../gfx/models.js';
import { WEAPONS } from '../data/weapons.js';
import { gunIcon } from '../gfx/icons.js';
import { play, playShot, setListener } from './audio.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ss = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeInOut = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);

// Capa DOM compartida por las cinemáticas
function layer() {
  let el = $('cine-ui');
  if (!el) { el = document.createElement('div'); el.id = 'cine-ui'; document.body.appendChild(el); }
  return el;
}
function skipHint(on) {
  let sk = $('cine-skip'); if (!sk) { sk = document.createElement('div'); sk.id = 'cine-skip'; sk.innerHTML = '<kbd>ESC</kbd> SKIP'; document.body.appendChild(sk); }
  sk.classList.toggle('on', on);
}
const seen = {};

// ======================= INFILTRACIÓN =======================
// Vuelo aéreo sobre el mapa con títulos → la cámara baja hasta tu soldado → entra en primera persona.
export class Intro {
  constructor(m) {
    this.m = m; this.t = 0;
    this.speed = seen.intro ? 1.35 : 1; seen.intro = true;
    this.dur = 8.2;
    this.T_FP = 7.3; // momento en que la cámara entra en la cabeza
    const me = m.me, b = m.map.bounds, R = Math.max(b.x, b.z);
    const fwd = V(-Math.sin(me.yaw), 0, -Math.cos(me.yaw)), right = V(Math.cos(me.yaw), 0, -Math.sin(me.yaw));
    const eye = V(me.pos.x, me.pos.y + 1.62, me.pos.z);
    // el vuelo termina del lado del jugador para que la bajada sea continua
    const a1 = Math.atan2(me.pos.x - fwd.x * 30, me.pos.z - fwd.z * 30);
    // exterior: vuelo alto alrededor del mapa · interior: recorrido bajo las vigas del techo
    const indoor = !!m.map.indoor;
    const air = [0, 1, 2, 3].map(i => {
      const a = a1 + (3 - i) * 0.42;
      return indoor ? V(Math.sin(a) * b.x * 0.78, 9.2 - i * 0.9, Math.cos(a) * b.z * 0.72) : V(Math.sin(a) * R * 1.3, 46 - i * 5, Math.cos(a) * R * 1.3);
    });
    const above = eye.clone().addScaledVector(fwd, indoor ? -6 : -9).add(V(0, indoor ? 4.5 : 11, 0)).addScaledVector(right, 2);
    const behind = eye.clone().addScaledVector(fwd, -2.6).add(V(0, 0.55, 0)).addScaledVector(right, 0.75);
    const close = eye.clone().addScaledVector(fwd, -0.25).addScaledVector(right, 0.05);
    this.pos = new THREE.CatmullRomCurve3([...air, above, behind, close], false, 'centripetal');
    const ctr = V(0, 1.5, 0), target = eye.clone().addScaledVector(fwd, 12).add(V(0, -0.2, 0));
    this.look = new THREE.CatmullRomCurve3([ctr, ctr, ctr.clone().lerp(eye, 0.35), ctr.clone().lerp(eye, 0.75), eye.clone().addScaledVector(fwd, 3).add(V(0, -1, 0)), target, target], false, 'centripetal');
    this.fovs = [52, 50, 48, 50, 58, 62, m.app.profile.settings.fov];
    this.buildDom();
    document.body.classList.add('letterbox-on');
    const f = $('cine-fade'); f.classList.add('white'); f.style.transition = 'opacity 0.9s'; f.style.opacity = 0;
    setTimeout(() => { f.style.transition = ''; }, 950);
    skipHint(true);
    play('whoosh');
  }

  buildDom() {
    const m = this.m, mode = m.mode;
    const now = new Date(), hh = String(now.getHours()).padStart(2, '0'), mm = String(now.getMinutes()).padStart(2, '0');
    const coords = { harbor: '41.3851° N · 2.1734° E', foundry: '51.4816° N · 3.1791° W', shrine: '35.0116° N · 135.7681° E' }[m.mapId] || '00.0000° N · 00.0000° E';
    const team = (t) => m.actors.filter(a => a.team === t).map((a, i) => `<li style="animation-delay:${1.2 + i * 0.09}s" class="${a.isLocal ? 'me' : ''}">${esc(a.name)}</li>`).join('');
    const el = layer();
    el.innerHTML = `
      <div class="in-title">
        <small>OPERATION</small>
        <h1>${m.map.name.split('').map((c, i) => `<span style="animation-delay:${0.5 + i * 0.07}s">${c}</span>`).join('')}</h1>
        <div class="in-mode">${mode.name}<i></i>${mode.arena ? 'FIRST TO ' + mode.target + ' ROUNDS' : mode.teams ? 'FIRST TEAM TO ' + mode.target : 'FIRST TO ' + mode.target + ' KILLS'}</div>
      </div>
      <div class="in-data">
        <div style="animation-delay:1.6s"><b>LOCATION</b> ${m.map.name} DISTRICT · ${coords}</div>
        <div style="animation-delay:1.9s"><b>LOCAL TIME</b> ${hh}:${mm}</div>
        <div style="animation-delay:2.2s"><b>OBJECTIVE</b> ${mode.arena ? `ONE LIFE PER ROUND · BUY, SURVIVE, WIN ${mode.target}` : `${mode.knifeOnly ? 'BLADES ONLY — ' : ''}ELIMINATE ${mode.target} HOSTILES`}</div>
        <div style="animation-delay:2.5s"><b>OPERATORS</b> ${m.actors.length} DEPLOYED</div>
      </div>
      ${mode.teams ? `<div class="in-teams"><ul class="blue"><h4>BLUE TEAM</h4>${team('blue')}</ul><div class="in-vs">VS</div><ul class="red"><h4>RED TEAM</h4>${team('red')}</ul></div>` : ''}`;
    el.className = 'intro-on';
  }

  skip() { if (this.t < this.T_FP - 0.05) this.t = this.T_FP - 0.05; }

  // Devuelve true cuando la cámara ya está en primera persona
  update(dt, cam) {
    this.t += dt * this.speed;
    const t = this.t;
    // tiempo → parámetro del recorrido: vuelo (0–4.4 s), bajada (4.4–6.4 s), empuje a la cabeza (6.4–7.3 s)
    let u;
    if (t < 4.4) u = (t / 4.4) * (3 / 6);
    else if (t < 6.4) u = 3 / 6 + easeInOut((t - 4.4) / 2.0) * (2 / 6);
    else u = 5 / 6 + easeInOut(clamp01((t - 6.4) / 0.9)) * (1 / 6);
    cam.position.copy(this.pos.getPoint(u));
    cam.lookAt(this.look.getPoint(Math.min(1, u)));
    const f = this.fovs, s = Math.min(f.length - 2, Math.floor(u * (f.length - 1))), lt = u * (f.length - 1) - s;
    cam.fov = f[s] + (f[s + 1] - f[s]) * lt; cam.updateProjectionMatrix();
    // títulos: se van antes de la bajada
    const el = layer();
    el.classList.toggle('intro-out', t > 4.0);
    return t >= this.T_FP;
  }

  finish() {
    if (this.bc) { this.bc.finish(); this.bc = null; }
    const el = layer(); el.className = ''; el.innerHTML = '';
    document.body.classList.remove('letterbox-on');
    skipHint(false);
  }
}

// ======================= GRABADORA =======================
// Guarda ~7 s de estado de todos los actores (30 fps) + disparos y muertes para la killcam.
export class Recorder {
  constructor() { this.frames = []; this.events = []; this.acc = 1; this.lastKill = null; }
  record(m, dt) {
    this.acc += dt;
    if (this.acc < 1 / 30) return;
    this.acc = 0;
    const f = { t: m.time, a: new Map() };
    for (const a of m.actors) f.a.set(a.id, { x: a.pos.x, y: a.pos.y, z: a.pos.z, yaw: a.yaw, pitch: a.pitch, crouch: a.crouch, alive: a.alive, speed: a.speed, ads: a.ads || 0, phase: a.phase, ground: a.onGround, w: a.weapon ? a.weapon.id : 'knife', ws: a.weapon ? (a.weaponSkins[a.weapon.id] || 'factory') : 'factory', deadT: a.deadT, deadDir: a.deadDir || 1, eye: a.eyeH, height: a.height });
    this.frames.push(f);
    const cut = m.time - 10.5; // margen para la killcam de muerte (se ve mientras la partida sigue)
    while (this.frames.length && this.frames[0].t < cut) this.frames.shift();
    while (this.events.length && this.events[0].t < cut) this.events.shift();
  }
  shot(m, a, to, normal, hitActor, sound, tracer) { this.events.push({ type: 'shot', t: m.time, id: a.id, to: to.clone(), normal: normal ? normal.clone() : null, hit: !!hitActor, sound, tracer }); }
  kill(m, k, v, weaponId, head) {
    const e = { type: 'kill', t: m.time, k: k ? k.id : null, v: v.id, weaponId, head, kName: k ? k.name : '', vName: v.name };
    this.events.push(e);
    if (k && k !== v) this.lastKill = e;
  }
  // Estado interpolado de un actor en el instante t
  sample(id, t) {
    const fr = this.frames;
    if (!fr.length) return null;
    let i = fr.findIndex(f => f.t >= t);
    if (i <= 0) return fr[i === 0 ? 0 : fr.length - 1].a.get(id) || null;
    const A = fr[i - 1].a.get(id), B = fr[i].a.get(id);
    if (!A || !B) return A || B || null;
    const k = (t - fr[i - 1].t) / Math.max(1e-6, fr[i].t - fr[i - 1].t);
    const L = (p, q) => p + (q - p) * k;
    let dy = B.yaw - A.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    return { ...B, x: L(A.x, B.x), y: L(A.y, B.y), z: L(A.z, B.z), yaw: A.yaw + dy * k, pitch: L(A.pitch, B.pitch), crouch: L(A.crouch, B.crouch), phase: L(A.phase, B.phase), deadT: L(A.deadT, B.deadT), alive: k < 0.5 ? A.alive : B.alive };
  }
  canReplay(m) {
    const k = this.lastKill;
    return !!(k && this.frames.length && this.frames[0].t < k.t - 2.5 && m.time - k.t < 6 && m.actors.some(a => a.id === k.k));
  }
}

// ======================= FINAL KILLCAM =======================
import { BulletCam, findKillShot } from './bulletcam.js';
import { FINAL_STYLES } from './impacts.js';
import { saveProfile } from './profile.js';

export class FinalKillcam {
  constructor(m, rec) {
    this.m = m; this.rec = rec; this.kill = rec.lastKill;
    this.t0 = Math.max(rec.frames[0].t, this.kill.t - 3.8);
    this.t1 = this.kill.t + 1.7;
    this.pt = this.t0; this.real = 0; this.intro = 1.1; this.done = false;
    this.camPos = null; this.camLook = null; this.slowSaid = false; this.hitSaid = false;
    this.killer = m.actors.find(a => a.id === this.kill.k);
    this.victim = m.actors.find(a => a.id === this.kill.v);
    // V2 · BULLET CAM: la bala mortal en cámara lenta + un estilo de impacto al azar (nunca el mismo que la vez anterior)
    this.bshot = findKillShot(rec, this.kill);
    const P = m.app.profile, forced = m.app.debug && m.app.debug.bulletStyle;
    const pool = FINAL_STYLES.filter(s => s !== P.lastFinalStyle);
    this.bstyle = forced || pool[Math.floor(Math.random() * pool.length)];
    if (this.bshot && !forced) { P.lastFinalStyle = this.bstyle; saveProfile(P); }
    const w = WEAPONS[this.kill.weaponId] || WEAPONS.akr;
    const el = layer();
    el.className = 'kc-on';
    el.innerHTML = `
      <div class="kc-slam"><span>FINAL</span><b>KILLCAM</b></div>
      <div class="kc-tag"><i></i>FINAL KILLCAM</div>
      <div class="kc-names"><b>${esc(this.kill.kName)}</b><span>${this.kill.head ? 'HEADSHOT' : 'ELIMINATED'}</span><em>${esc(this.kill.vName)}</em></div>
      <div class="kc-weapon"><img src="${gunIcon(this.kill.weaponId in WEAPONS ? this.kill.weaponId : 'akr').white}"><span>${w.name}</span></div>
      <div class="kc-slow">SLOW MOTION</div>
      <div class="kc-grain"></div>`;
    document.body.classList.add('letterbox-on');
    skipHint(true);
    play('killcam');
    // todos los soldados pasan a ser "actores" de la repetición
    for (const a of m.actors) { a.soldier.root.visible = false; a.soldier.flashing = false; }
  }

  skip() { this.done = true; }

  timeScale() {
    const k = this.kill.t;
    // rampa suave hacia 0.2x alrededor del disparo final
    return 1 - 0.8 * Math.min(ss(k - 0.75, k - 0.3, this.pt), 1 - ss(k + 0.25, k + 0.7, this.pt));
  }

  update(dt, cam) {
    const m = this.m;
    this.real += dt;
    if (this.real < this.intro) {
      // título "FINAL KILLCAM" golpea la pantalla; la escena congelada se oscurece
      if (!this.posed) { this.posed = true; this.apply(this.pt, 0, cam, true); }
      return false;
    }
    layer().classList.add('kc-play');
    // la bala mortal toma el control (tiempo real) hasta que termina el impacto
    if (this.bc) { if (this.bc.update(dt, cam)) this.done = true; return this.done; }
    const startAt = this.bshot ? (this.bshot.kind === 'grenade' ? this.bshot.ev.t : this.bshot.kind === 'knife' ? this.bshot.ev.t : this.bshot.ev.t - 0.001) : Infinity;
    if (this.pt >= startAt) {
      layer().classList.add('kc-bullet');
      this.bc = new BulletCam(m, this.rec, this.kill, this.bshot, { style: this.bstyle });
      return false;
    }
    const prev = this.pt;
    const sc = this.timeScale();
    this.pt = Math.min(this.t1, startAt, this.pt + dt * sc);
    layer().classList.toggle('kc-slowmo', sc < 0.6);
    if (sc < 0.6 && !this.slowSaid) { this.slowSaid = true; play('slowmo'); }
    this.apply(this.pt, prev, cam, false, dt);
    if (this.pt >= this.t1) this.done = true;
    return this.done;
  }

  // Coloca a todos según la grabación y reproduce los eventos del intervalo (prev, pt]
  apply(pt, prev, cam, first, dt = 0.016) {
    const m = this.m, rec = this.rec;
    for (const a of m.actors) {
      const s = a.soldier, st = rec.sample(a.id, pt);
      if (!st) { s.root.visible = false; continue; }
      if (a.isLocal) s.root.traverse(o => { if (o.isMesh && o.userData.realMat && o.material !== o.userData.realMat) o.material = o.userData.realMat; });
      s.root.visible = st.alive || st.deadT < 5;
      setSoldierWeapon(s, st.w, st.ws);
      s.root.position.set(st.x, st.y, st.z); s.root.rotation.y = st.yaw;
      poseSoldier(s, { moveSpeed: st.alive ? st.speed : 0, phase: st.phase, crouch: st.crouch, air: !st.ground && st.alive, pitch: st.pitch, dead: st.alive ? 0 : st.deadT / 0.45, deadDir: st.deadDir });
    }
    if (!first) for (const e of rec.events) {
      if (e.t <= prev || e.t > pt) continue;
      const shooter = m.actors.find(a => a.id === e.id);
      if (e.type === 'shot' && shooter) {
        shooter.soldier.root.updateMatrixWorld(true);
        const mz = shooter.soldier.gun.userData.muzzle.getWorldPosition(V(0, 0, 0));
        m.fx.tracer(mz, e.to, e.tracer || 0xffe9a8, 0.03);
        m.fx.muzzle(mz, e.sound === 'shotgun' ? 1.5 : 1.1);
        if (e.hit) m.fx.blood(e.to, mz.clone().sub(e.to).normalize()); else if (e.normal) m.fx.impact(e.to, e.normal);
        playShot(e.sound || 'rifle', shooter.pos);
      } else if (e.type === 'kill' && e === this.kill && !this.hitSaid) {
        this.hitSaid = true;
        const v = this.victim;
        if (v) { const p = V(v.soldier.root.position.x, v.soldier.root.position.y + 1.3, v.soldier.root.position.z); for (let i = 0; i < 3; i++) m.fx.blood(p, V(Math.random() - 0.5, 0.4, Math.random() - 0.5)); }
        play('kill'); play(e.head ? 'headshot' : 'hit');
        layer().classList.add('kc-hit'); setTimeout(() => layer().classList.remove('kc-hit'), 500);
      }
    }
    m.fx.update(dt * this.timeScale());
    // cámara sobre el hombro del asesino; tras el golpe mira a la víctima
    const ks = this.killer ? rec.sample(this.killer.id, pt) : null;
    if (!ks) return;
    const yaw = ks.yaw, pitch = ks.pitch;
    const dir = V(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
    const right = V(Math.cos(yaw), 0, -Math.sin(yaw));
    const eye = V(ks.x, ks.y + (ks.eye || 1.62), ks.z);
    const near = ss(this.kill.t - 0.9, this.kill.t - 0.2, pt);
    const after = ss(this.kill.t + 0.1, this.t1, pt);
    const back = 2.1 - near * 0.5;
    let pos = eye.clone().addScaledVector(dir, -back).addScaledVector(right, 0.85 - near * 0.1).add(V(0, 0.34, 0));
    let look = eye.clone().addScaledVector(dir, 14);
    const vs = this.victim ? rec.sample(this.victim.id, pt) : null;
    if (vs) {
      const vp = V(vs.x, vs.y + 1.0, vs.z);
      look.lerp(vp, after * 0.85);
      pos.lerp(pos.clone().addScaledVector(right, 0.8).add(V(0, 0.4, 0)), after);
    }
    // evitar que la cámara atraviese paredes
    const d = pos.clone().sub(eye), L = d.length(); d.normalize();
    const hit = m.raycast(eye, d, L);
    if (hit) pos.copy(eye).addScaledVector(d, Math.max(0.25, hit.t - 0.2));
    if (!this.camPos || first) { this.camPos = pos.clone(); this.camLook = look.clone(); }
    const k = Math.min(1, dt * 9);
    this.camPos.lerp(pos, k); this.camLook.lerp(look, k);
    cam.position.copy(this.camPos); cam.lookAt(this.camLook);
    cam.fov = 55 - near * 10 + after * 6; cam.updateProjectionMatrix();
    setListener(cam.position.x, cam.position.y, cam.position.z, yaw);
  }

  finish() {
    const el = layer(); el.className = ''; el.innerHTML = '';
    document.body.classList.remove('letterbox-on');
    skipHint(false);
  }
}
