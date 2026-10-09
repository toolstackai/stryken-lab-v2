// Arma + brazos en primera persona: se dibuja en su propia escena encima del mundo (no atraviesa paredes).
// Animaciones por fotogramas clave: levantar (con cerrojo), recarga con la mano llevando el cargador,
// recarga en vacío (cerrojo), inspección, inercia, humo del cañón y luz del fogonazo.
import * as THREE from 'three';
import { updateReticle } from './optics.js';
import { bakeTree, bakeGroup, disposeTree } from './bake.js';
import { makeGun, makeViewArms, GUN_PARTS, stdMat } from './models.js';
import { muzzleSprite, smokeSprite } from './textures.js';
import { WEAPONS } from '../data/weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const win = (k, a, b) => clamp01((k - a) / (b - a));           // 0..1 dentro de [a,b]
const bump = (k, a, b) => Math.sin(win(k, a, b) * Math.PI);      // 0→1→0 dentro de [a,b]

// Interpola una pista de fotogramas clave [[k, Vector3|number], ...] con suavizado.
function track(k, keys) {
  if (k <= keys[0][0]) return clone(keys[0][1]);
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i], [b, vb] = keys[i + 1];
    if (k <= b) {
      const t = ease(clamp01((k - a) / Math.max(1e-6, b - a)));
      return typeof va === 'number' ? va + (vb - va) * t : va.clone().lerp(vb, t);
    }
  }
  return clone(keys[keys.length - 1][1]);
}
const clone = (v) => typeof v === 'number' ? v : v.clone();

const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion();
export class ViewModel {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4a4036, 1.6));
    const d = new THREE.DirectionalLight(0xfff2dd, 2.2); d.position.set(-1, 2, 1.2); this.scene.add(d);
    const r = new THREE.DirectionalLight(0x9fc4ff, 0.8); r.position.set(1.5, 0.5, -1); this.scene.add(r);
    this.root = new THREE.Group(); this.scene.add(this.root);   // sway / bob / inercia
    this.holder = new THREE.Group(); this.root.add(this.holder); // pose del arma
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: muzzleSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flash.visible = false; this.flash.renderOrder = 10;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 1.6, 1.4);
    this.flashT = 0;
    this.kick = 0; this.kickV = 0; this.kickRot = 0;
    this.sway = new THREE.Vector2(); this.swayT = new THREE.Vector2();
    this.inert = V(0, 0, 0);
    this.shells = [];
    this.shellGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.03, 6); this.shellGeo.rotateZ(Math.PI / 2);
    this.shellMat = stdMat(0xd8a640, { metalness: 0.8, roughness: 0.3 });
    // humo del cañón
    this.smoke = [];
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeSprite(), transparent: true, depthWrite: false, opacity: 0, color: 0xcfcfcf }));
      s.visible = false; this.scene.add(s); this.smoke.push({ s, life: 0 });
    }
    this.heat = 0; this.sinceShot = 9; this.smokeT = 0; this.si = 0;
    this.id = null; this.anim = null; this.tint = 1;
    this.baseRot = V(0.04, 0.16, -0.06);
    this.onEvent = null; // callback de sonidos sincronizados ('magOut', 'magIn', 'bolt'...)
    // pose del arma durante la recarga (sube y gira para enseñar el hueco del cargador)
    this.rp = { rz: -0.55, rx: 0.14, ry: 0.12, x: -0.035, y: 0.07, z: -0.03 };
  }

  setWeapon(id, skin = 'factory', armSkin = 'recruit') {
    const key = id + skin + armSkin;
    if (this.key === key) return;
    this.key = key; this.id = id;
    while (this.holder.children.length) { const c = this.holder.children[0]; this.holder.remove(c); disposeTree(c); }
    const def = GUN_PARTS[id];
    this.def = def; this.w = WEAPONS[id];
    this.gun = makeGun(id, skin);
    // pose de recarga: en bullpups el cargador está detrás de la empuñadura y quedaba fuera de pantalla
    const nm = this.gun.userData.named, rearMag = nm.mag && nm.mag.userData.home.z > 0.05;
    this.rp = rearMag ? { rz: -0.42, rx: 0.5, ry: 0.14, x: -0.03, y: 0.15, z: -0.13 } : { rz: -0.55, rx: 0.14, ry: 0.12, x: -0.035, y: 0.07, z: -0.03 };
    this.drumAng = 0; this.drumTo = 0;
    // rendimiento: piezas fijas fundidas por material (cargador, cerrojo, corredera, retícula y lente quedan sueltos)
    bakeTree(this.gun, { skip: (m) => !!m.userData.home || !!m.userData.keep });
    this.holder.add(this.gun);
    this.gun.userData.muzzle.add(this.flash, this.flashLight);
    const arms = makeViewArms(armSkin);
    bakeGroup(arms.right); bakeGroup(arms.left);
    this.armR = arms.right; this.armL = arms.left;
    this.armR.position.set(...def.hands.r); this.armR.rotation.set(0.45, 0.32, 0.1);
    this.gun.add(this.armR);
    if (def.knife) {
      this.armR.rotation.set(0.35, 0.3, 0.15);
      this.armL.position.set(-0.32, -0.14, 0.05); this.armL.rotation.set(0.6, 0.4, -0.4);
      this.holder.add(this.armL); this.armL.visible = false;
    } else if (def.pistol) {
      this.armL.position.set(...def.hands.l); this.armL.rotation.set(0.5, -0.3, 0.2);
      this.gun.add(this.armL);
    } else {
      this.armL.position.set(...def.hands.l); this.armL.rotation.set(0.38, -0.62, 0.35);
      this.gun.add(this.armL);
    }
    this.lHome = this.armL.position.clone();
    this.lRot = this.armL.rotation.clone();
    // puntos de la mano izquierda: cargador y palanca de carga
    const named = this.gun.userData.named;
    this.magGrip = named.mag ? named.mag.userData.home.clone().add(V(0, -0.045, 0.005)) : null;
    this.charge = def.pistol ? V(0, def.sightY * 0.6, 0.06) : V(-0.06, Math.max(0.02, def.sightY * 0.35), -0.03);
    const L = def.len;
    this.hip = def.knife ? V(0.2, -0.21, -0.44) : def.pistol ? V(0.12, -0.13, -0.38) : V(0.15, -0.2, -0.34 - L * 0.08);
    this.adsPos = V(0, -def.sightY, def.pistol ? -0.36 : (def.sightY > 0.11 ? -0.2 : -0.38) - L * 0.05);
    // ópticas: el ojo queda a su distancia de ojo (eye relief) detrás de la parte trasera de la mira
    this.optic = this.gun.userData.optic || null;
    if (this.optic) {
      const op = this.optic;
      this.adsPos.z = -op.relief - (op.spec.at[2] + op.rearZ);
      if (op.ret) op.ret.visible = false;
    }
    // miras de hierro: el ojo a su distancia del alza (en pistolas, con el brazo extendido)
    const ir = this.gun.userData.irons;
    if (ir && !this.optic) this.adsPos.z = -ir.relief - ir.rearZ;
  }

  // Disparo: retroceso visual + fogonazo + luz + casquillo + calor del cañón
  fire(strength = 1) {
    this.kickV += 1.6 * strength; this.kickRot += 0.12 * strength;
    if (!this.def || this.def.knife) return;
    this.flash.visible = true; this.flashT = 0.05; this.flash.scale.setScalar(this.w.sound === 'shotgun' ? 0.32 : 0.22);
    this.flash.material.rotation = Math.random() * 6.28;
    this.flashLight.intensity = 6 * strength;
    this.heat = Math.min(14, this.heat + (this.w.sound === 'sniper' || this.w.sound === 'shotgun' ? 4 : 1)); this.sinceShot = 0;
    const slide = this.gun.userData.named.slide; if (slide) { slide.position.z = slide.userData.home.z + 0.04; }
    if (this.gun.userData.named.drum) this.drumTo += Math.PI / 3; // el tambor avanza una recámara por disparo
    if (this.w.projectile || this.w.bolt) return;
    const s = new THREE.Mesh(this.shellGeo, this.shellMat);
    const m = this.gun.userData.muzzle;
    s.position.set(0.04, this.def.sightY * 0.5, m.position.z * 0.35); this.gun.add(s);
    this.shells.push({ m: s, v: V(1.3 + Math.random() * 0.5, 1.2 + Math.random() * 0.6, 0.3), life: 0.6 });
  }

  // Animaciones: 'raise', 'reload' (opts.empty), 'shell', 'bolt', 'pump', 'draw', 'inspect', 'slash', 'stab'
  play(name, dur, opts = {}) { this.anim = { name, t: 0, dur, opts, fired: {} }; }
  // Muñeca/antebrazo al agarrar la palanca de carga: el brazo llega desde abajo a la izquierda (no tapa la pantalla)
  chargePose(w) { this.armL.rotation.x = lerp(this.armL.rotation.x, 0.96, w); this.armL.rotation.y = lerp(this.armL.rotation.y, -0.41, w); this.armL.rotation.z = lerp(this.armL.rotation.z, 0.3, w); }

  // Lanza un evento de sonido una sola vez cuando la animación pasa por k
  cue(a, k, at, ev) { if (k >= at && !a.fired[ev + at]) { a.fired[ev + at] = true; if (this.onEvent) this.onEvent(ev); } }

  update(dt, st) {
    if (!this.gun) return;
    // resorte del retroceso
    this.kickV += (-this.kick * 220 - this.kickV * 22) * dt; this.kick += this.kickV * dt;
    this.kickRot *= Math.exp(-dt * 14);
    // balanceo por movimiento del ratón
    this.swayT.set(-st.lookDX * 0.0012, st.lookDY * 0.0012).clampScalar(-0.05, 0.05);
    this.sway.lerp(this.swayT, Math.min(1, dt * 10));
    // inercia: el arma se queda atrás al moverte de lado y al saltar/caer
    const it = V(-(st.vx || 0) * 0.0045, -(st.vy || 0) * 0.004, 0).clampScalar(-0.035, 0.035);
    this.inert.lerp(it, Math.min(1, dt * 7));
    const ads = ease(clamp01(st.ads)); this.adsBlend = ads;
    const t = st.time;
    const mv = Math.min(1, st.speed / 5.4) * (st.onGround ? 1 : 0.2);
    const bobAmt = mv * (1 - ads * 0.85) * (st.sprint ? 1.6 : 1);
    const bx = Math.sin(st.phase) * 0.012 * bobAmt, by = -Math.abs(Math.cos(st.phase)) * 0.012 * bobAmt;
    const breathe = Math.sin(t * 1.6) * 0.0025 * (1 - ads * 0.8);

    const p = this.hip.clone().lerp(this.adsPos, ads);
    const br = this.baseRot; let rx = br.x * (1 - ads), ry = br.y * (1 - ads), rz = br.z * (1 - ads);
    // sprint
    const sp = st.sprintBlend || 0;
    p.x += sp * 0.04; p.y -= sp * 0.04; p.z += sp * 0.03; rx -= sp * 0.25; ry += sp * (this.def.pistol ? 0.3 : 0.75); rz += sp * 0.2;
    // aterrizaje / agacharse / inercia
    p.y -= (st.land || 0) * 0.05 + st.crouch * 0.015 * (1 - ads);
    p.x += this.inert.x * (1 - ads * 0.7); p.y += this.inert.y * (1 - ads * 0.7); rz += this.inert.x * 3 * (1 - ads);
    // retroceso
    p.z += this.kick * 0.055 * (1 - ads * 0.4); rx += this.kickRot * (1 - ads * 0.5);
    // reset de piezas animables
    const named = this.gun.userData.named;
    this.armL.position.copy(this.lHome); this.armL.rotation.copy(this.lRot);
    if (named.mag) { named.mag.position.copy(named.mag.userData.home); named.mag.visible = true; }
    if (named.bolt) named.bolt.position.copy(named.bolt.userData.home);
    if (named.pump) named.pump.position.copy(named.pump.userData.home);
    if (named.drum) { this.drumAng += (this.drumTo - this.drumAng) * Math.min(1, dt * 16); named.drum.rotation.z = this.drumAng; }
    if (named.slide) named.slide.position.z = lerp(named.slide.position.z, named.slide.userData.home.z, Math.min(1, dt * 25));
    if (this.def.knife) this.armL.visible = false;
    const a = this.anim;
    if (a) {
      a.t += dt;
      const k = clamp01(a.t / a.dur);
      const H0 = this.lHome, C = this.charge;
      switch (a.name) {
        case 'draw': { const e = 1 - ease(k); p.y -= e * 0.25; rx -= e * 0.9; break; }
        case 'raise': {
          // sube desde abajo girando y comprueba la recámara (tira de la palanca de carga)
          const e = 1 - ease(win(k, 0, 0.45));
          p.y -= e * 0.32; p.x += e * 0.06; rx -= e * 1.1; rz += e * 0.6; ry -= e * 0.3;
          if (!this.def.knife) {
            const tilt = bump(k, 0.42, 1.0);
            rz += tilt * 0.22; ry -= tilt * 0.12;
            const hand = track(k, [[0.48, H0], [0.6, C], [0.68, C.clone().add(V(0, 0, 0.07))], [0.74, C], [0.92, H0]]);
            this.armL.position.copy(hand);
            this.chargePose(bump(k, 0.48, 0.92));
            rx -= bump(k, 0.68, 0.78) * 0.05;
            if (named.slide) named.slide.position.z = named.slide.userData.home.z + bump(k, 0.6, 0.76) * 0.04;
            this.cue(a, k, 0.66, 'bolt');
          }
          break;
        }
        case 'reload': {
          if (named.drum || !named.mag) {
            // tambor / sin cargador: giro del tambor con la mano
            const tilt = Math.sin(k * Math.PI);
            // el tambor mira a la cámara mientras gira (antes el giro lo escondía)
            rz -= tilt * 0.5; rx += tilt * 0.22; ry -= tilt * 0.12; p.y -= tilt * 0.035;
            if (named.drum) named.drum.rotation.z = this.drumAng + k * Math.PI * 4;
            this.armL.position.y -= bump(k, 0.15, 0.75) * 0.12; this.armL.position.z += bump(k, 0.15, 0.75) * 0.08;
            this.cue(a, k, 0.15, 'magOut'); this.cue(a, k, 0.7, 'magIn');
            break;
          }
          const empty = !!a.opts.empty;
          // inclinación del arma (entra, se mantiene, sale)
          const tilt = Math.min(win(k, 0.03, 0.18), 1 - win(k, empty ? 0.9 : 0.84, 1));
          const RP = this.rp, et = ease(tilt);
          rz += et * RP.rz; rx += et * RP.rx; ry += et * RP.ry; p.y += et * RP.y; p.x += et * RP.x; p.z += et * RP.z;
          const M = this.magGrip;
          const out = M.clone().add(V(0.03, -0.44, 0.12)), low = M.clone().add(V(0, -0.4, 0.13)), near = M.clone().add(V(0, -0.06, 0.02)), over = M.clone().add(V(0, 0.018, 0));
          const keys = empty
            ? [[0.1, H0], [0.2, M], [0.26, M], [0.4, out], [0.46, low], [0.56, near], [0.6, over], [0.63, M], [0.7, C], [0.76, C.clone().add(V(0, 0, 0.075))], [0.8, C], [0.92, H0]]
            : [[0.12, H0], [0.24, M], [0.3, M], [0.46, out], [0.5, low], [0.62, near], [0.67, over], [0.71, M], [0.88, H0]];
          const hand = track(k, keys);
          this.armL.position.copy(hand);
          // la muñeca gira hacia abajo al agarrar el cargador
          const gripW = empty ? bump(k, 0.12, 0.66) : bump(k, 0.14, 0.76);
          this.armL.rotation.x = lerp(this.lRot.x, 0.95, gripW); this.armL.rotation.z = lerp(this.lRot.z, 0.05, gripW);
          // el cargador acompaña a la mano mientras lo lleva
          const tOut = empty ? [0.26, 0.42] : [0.3, 0.48], tIn = empty ? [0.46, 0.6] : [0.5, 0.67];
          if (k > tOut[0] && k < tOut[1]) named.mag.position.copy(named.mag.userData.home).add(hand.clone().sub(M));
          else if (k >= tOut[1] && k < tIn[0]) named.mag.visible = false;
          else if (k >= tIn[0] && k < tIn[1]) { const d = hand.clone().sub(M); d.y = Math.min(d.y, 0); named.mag.position.copy(named.mag.userData.home).add(d); }
          // golpes: al sacar y al encajar (el arma se sacude)
          rx += bump(k, tOut[0], tOut[0] + 0.06) * 0.035;
          rx -= bump(k, tIn[1] - 0.02, tIn[1] + 0.06) * 0.07; p.y += bump(k, tIn[1] - 0.02, tIn[1] + 0.06) * 0.012;
          this.cue(a, k, tOut[0] + 0.01, 'magOut'); this.cue(a, k, tIn[1] - 0.01, 'magIn');
          if (empty) {
            this.chargePose(bump(k, 0.64, 0.9));
            rx -= bump(k, 0.76, 0.84) * 0.06; rz -= bump(k, 0.76, 0.84) * 0.05;
            if (named.slide) named.slide.position.z = named.slide.userData.home.z + bump(k, 0.7, 0.8) * 0.045;
            if (named.bolt) named.bolt.position.z = named.bolt.userData.home.z + bump(k, 0.7, 0.8) * 0.06;
            this.cue(a, k, 0.75, 'bolt');
          }
          break;
        }
        case 'shell': {
          const h = Math.sin(k * Math.PI); rz += 0.35 * h; rx += 0.1 * h;
          this.armL.position.y -= h * 0.08; this.armL.position.z += h * 0.12;
          break;
        }
        case 'pump': case 'bolt': {
          const h = Math.sin(clamp01(k * 1.2) * Math.PI);
          if (named.pump) named.pump.position.z += h * 0.09;
          if (named.bolt) { named.bolt.position.z += h * 0.08; named.bolt.position.y += h * 0.02; }
          rx += h * 0.06; rz += h * 0.12;
          if (a.name === 'bolt') this.armL.visible = true;
          break;
        }
        case 'inspect': {
          // 1) mostrar el lado izquierdo  2) girarla y mirar el lado derecho  3) toque al cargador  4) volver
          const s1 = bump(k, 0.05, 0.5), s2 = bump(k, 0.42, 0.92);
          ry += s1 * 0.95 - s2 * 0.55; rz += s1 * 0.5 - s2 * 0.45; rx += s1 * 0.08 + s2 * 0.18;
          p.x -= s1 * 0.07 + s2 * 0.02; p.y += s2 * 0.03; p.z += s1 * 0.04 + s2 * 0.03;
          if (this.magGrip && !this.def.knife) {
            const tap = bump(k, 0.62, 0.86);
            this.armL.position.lerp(this.magGrip, tap);
            this.armL.rotation.x = lerp(this.lRot.x, 0.9, tap);
            if (k > 0.72 && k < 0.78) named.mag.position.y -= bump(k, 0.72, 0.78) * 0.012;
            this.cue(a, k, 0.74, 'magIn');
          }
          break;
        }
        case 'slash': {
          const s = Math.sin(k * Math.PI);
          ry += s * 1.1 - 0.2 * k; rz -= s * 0.9; p.x -= s * 0.22; p.z -= s * 0.06; rx += s * 0.3;
          break;
        }
        case 'stab': {
          const s = Math.sin(k * Math.PI);
          // la hoja se gira de lado en el pico de la estocada (antes apuntaba al ojo y sólo se veía el pomo)
          p.z -= s * 0.25; p.x -= s * 0.1; rx -= s * 0.42; ry += s * 0.45; rz -= s * 0.35;
          break;
        }
      }
      if (a.t >= a.dur) this.anim = null;
    }
    this.holder.position.copy(p);
    this.holder.rotation.set(rx, ry, rz);
    this.root.position.set(this.sway.x + bx, this.sway.y + by + breathe, 0);
    this.root.rotation.set(this.sway.y * 1.5, this.sway.x * 2, -this.sway.x * 1.5);
    // fogonazo, luz y casquillos
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    this.flashLight.intensity *= Math.exp(-dt * 40);
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const s = this.shells[i]; s.life -= dt;
      s.v.y -= 6 * dt; s.m.position.addScaledVector(s.v, dt); s.m.rotation.x += dt * 20; s.m.rotation.y += dt * 13;
      if (s.life <= 0) { this.gun.remove(s.m); this.shells.splice(i, 1); }
    }
    // humo del cañón tras disparar seguido
    this.sinceShot += dt; this.heat = Math.max(0, this.heat - dt * (this.sinceShot > 0.3 ? 2.2 : 0.4));
    if (this.heat > 4 && this.sinceShot > 0.12 && !this.def.knife) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.05;
        const sm = this.smoke[this.si++ % this.smoke.length];
        this.root.updateMatrixWorld(true);
        this.gun.userData.muzzle.getWorldPosition(sm.s.position);
        sm.life = 1.1; sm.v = V((Math.random() - 0.5) * 0.02, 0.06 + Math.random() * 0.04, (Math.random() - 0.5) * 0.02);
        sm.s.scale.setScalar(0.02); sm.s.visible = true; sm.a = Math.min(0.32, this.heat * 0.035);
      }
    }
    for (const sm of this.smoke) {
      if (sm.life <= 0) continue;
      sm.life -= dt;
      sm.s.position.addScaledVector(sm.v, dt); sm.v.x += Math.sin(t * 3 + sm.life * 5) * dt * 0.02;
      sm.s.scale.multiplyScalar(1 + dt * 1.6);
      sm.s.material.opacity = sm.a * Math.min(1, sm.life * 1.5) * Math.min(1, (1.1 - sm.life) * 6);
      if (sm.life <= 0) sm.s.visible = false;
    }
    this.root.visible = !st.hidden;
    this.updateOptic();
  }

  // Óptica: retícula colimada (reflex/holo) o lente aumentada (telescópica)
  updateOptic() {
    const op = this.optic; this.pipOn = false;
    if (!op) return;
    this.root.updateMatrixWorld(true);
    if (op.ret) { updateReticle(op, this.camera.position); return; }
    if (op.lens) {
      _m.copy(op.group.matrixWorld).invert();
      _v.copy(this.camera.position).applyMatrix4(_m);
      const u = op.lensMat.uniforms, ads = this.adsBlend || 0;
      // desalineación del ojo respecto al eje → sombra del visor
      u.uEye.value.set(_v.x / (op.lensR * 3), (_v.y - op.axisY) / (op.lensR * 3));
      const behind = _v.z > op.rearZ;
      u.uActive.value = behind ? Math.min(1, Math.max(0, (ads - 0.35) / 0.5)) : 0;
      this.pipOn = u.uActive.value > 0.01 && !!this.world;
    }
  }
  // Imagen aumentada: una segunda cámara mira a lo largo del eje de la mira y pinta en la lente
  renderPip(renderer) {
    const op = this.optic, W = this.world;
    if (!this.pip) {
      const n = this.pipSize || 512;
      this.pip = { rt: new THREE.WebGLRenderTarget(n, n, { samples: 2, type: THREE.HalfFloatType }), cam: new THREE.PerspectiveCamera(10, 1, 0.05, 600) };
    }
    const cam = this.pip.cam;
    op.group.getWorldQuaternion(_q);
    cam.position.copy(W.camera.position);
    cam.quaternion.copy(W.camera.quaternion).multiply(_q);
    // aumento real: el campo de la lente = (tamaño angular de la lente en pantalla) / aumentos
    op.lens.getWorldPosition(_v);
    const frac = (op.lensR / Math.max(0.01, _v.length())) / Math.tan(this.camera.fov * Math.PI / 360);
    const ang = Math.atan(frac * Math.tan(W.camera.fov * Math.PI / 360));
    cam.fov = Math.max(1, 2 * ang * 180 / Math.PI / op.mag); cam.updateProjectionMatrix();
    const auto = renderer.shadowMap.autoUpdate, prev = renderer.getRenderTarget(), ac = renderer.autoClear;
    renderer.shadowMap.autoUpdate = false; renderer.autoClear = true;
    renderer.setRenderTarget(this.pip.rt); renderer.render(W.scene, cam);
    renderer.setRenderTarget(prev); renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac;
    op.lensMat.uniforms.uMap.value = this.pip.rt.texture;
  }

  render(renderer, aspect) {
    this.camera.aspect = aspect; this.camera.fov = 62 - 12 * (this.adsBlend || 0); this.camera.updateProjectionMatrix();
    if (this.pipOn) this.renderPip(renderer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}
