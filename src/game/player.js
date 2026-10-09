// Control del jugador local: mirar, moverse, disparar, retroceso, cámara y viewmodel.
import * as THREE from 'three';
import { play } from './audio.js';

const R = (a, b) => a + Math.random() * (b - a);

export class LocalController {
  constructor(match, actor, input, vm, camera) {
    this.m = match; this.a = actor; this.input = input; this.vm = vm; this.cam = camera;
    this.recPitch = 0; this.recYaw = 0;       // retroceso acumulado (se recupera)
    this.punch = 0; this.punchV = 0;          // golpe visual de cámara
    this.shakeT = 0; this.shakeA = 0;
    this.land = 0; this.lastPhase = 0; this.roll = 0; this.bob = 0;
    this.sprintBlend = 0; this.fireHeld = 0;
    this.lookDX = 0; this.lookDY = 0;
    this.time = 0; this.zoomFov = 78;
    this.deathCam = null;
  }
  get settings() { return this.m.app.profile.settings; }

  addRecoil(d) {
    const ads = this.a.ads, crouch = this.a.crouching ? 0.85 : 1;
    const k = (1 - 0.3 * ads) * crouch;
    const shots = this.fireHeld;
    const v = d.recoilV * k * R(0.85, 1.15) * (shots > 10 ? 0.6 : 1);
    // patrón: primeras balas suben, luego deriva lateral
    const h = d.recoilH * k * (shots > 5 ? R(-1.6, 1.6) + Math.sin(shots * 0.7) * 1.2 : R(-0.6, 0.6));
    this.a.pitch += v; this.a.yaw -= h;
    this.recPitch += v; this.recYaw += h;
    this.punchV += d.recoilV * 30 * (1 - 0.5 * ads);
  }
  // Compatibilidad: el antiguo temblor aleatorio ahora suma trauma al sistema de game feel (V2)
  shake(a, t = 0.3) { this.m.app.feel.add(Math.min(0.8, a * 7 * Math.min(1.5, t / 0.3))); }

  // Lógica del frame mientras está vivo
  update(dt) {
    const a = this.a, inp = this.input, m = this.m, s = this.settings;
    this.time += dt;
    const typing = m.app.ui.chatOpen;
    const canAct = inp.enabled && !typing && !m.ended;
    // mirar
    const d = a.wdef;
    const zoom = 1 + (d.adsZoom - 1) * a.ads;
    const aimZoom = d.scopeMag ? 1 + (d.scopeMag - 1) * a.ads : zoom;
    const sens = 0.0021 * s.sens * (a.ads > 0.5 ? s.adsSens / Math.sqrt(aimZoom) : 1);
    this.lookDX = inp.dx; this.lookDY = inp.dy;
    if (canAct) {
      a.yaw -= inp.dx * sens;
      a.pitch -= inp.dy * sens * (s.invertY ? -1 : 1);
    }
    // recuperación del retroceso cuando no se dispara
    const rr = d.recoilRecover * dt;
    if (!(inp.mouse[0] && canAct) || a.fireCd < -0.05) {
      const dp = Math.min(this.recPitch, this.recPitch * rr + 0.0004);
      a.pitch -= dp; this.recPitch -= dp;
      const dy = this.recYaw * Math.min(1, rr);
      a.yaw += dy; this.recYaw -= dy;
      if (!inp.mouse[0]) this.fireHeld = 0;
    }
    a.pitch = Math.max(-1.5, Math.min(1.5, a.pitch));

    // movimiento
    const frozen = m.arena && m.arena.frozen; // fase de compra: se mira y se cambia de arma, pero no se mueve ni dispara
    const k = (c) => canAct && !frozen && inp.down(c);
    const fwd = (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), right = (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0);
    const firing = canAct && !frozen && inp.mouse[0];
    const input = {
      fwd, right, jump: k('Space'), crouch: k('ControlLeft') || k('KeyC') || k('ControlRight'),
      sprint: k('ShiftLeft') && !firing,
    };
    a.wantAds = canAct && inp.mouse[2] && !a.sprinting;
    const wasGround = a.onGround;
    const hs = a.move(m.col, input, dt);
    if (a.jumped) { play('jump', null, 0.6); a.jumped = false; }
    if (!wasGround && a.onGround && a.landSpeed > 4) { this.land = Math.min(1, a.landSpeed / 12); play('land', null, 0.7); if (a.landSpeed > 8) this.m.app.feel.add(Math.min(0.3, (a.landSpeed - 8) * 0.05)); }
    this.land = Math.max(0, this.land - dt * 3);
    // pasos
    if (a.onGround && hs > 2.5 && !a.crouching) {
      if (Math.floor(a.phase / Math.PI) !== Math.floor(this.lastPhase / Math.PI)) play('step', null, a.sprinting ? 0.8 : 0.5);
    }
    this.lastPhase = a.phase;
    this.sprintBlend += ((a.sprinting && hs > 3 ? 1 : 0) - this.sprintBlend) * Math.min(1, dt * 10);
    this.roll += ((-right * 0.012) - this.roll) * Math.min(1, dt * 8);

    // armas
    if (canAct) {
      if (inp.hit('Digit1')) m.trySwitch(a, 0);
      if (inp.hit('Digit2')) m.trySwitch(a, 1);
      if (inp.hit('Digit3')) m.trySwitch(a, 2);
      if (inp.hit('KeyQ')) m.trySwitch(a, a.lastSlot);
      if (inp.wheel) {
        const order = [0, 1, 2].filter(i => a.slots[i]);
        const i = order.indexOf(a.slot);
        m.trySwitch(a, order[(i + (inp.wheel > 0 ? 1 : order.length - 1)) % order.length]);
      }
      if (inp.hit('KeyR') && a.startReload()) m.onReload(a);
      if (inp.hit('KeyV')) this.vm.play('inspect', 2.2);
      if (inp.hit('KeyG')) m.dropWeapon(a);
      if (inp.hit('KeyE')) m.tryPickup(a);
      if (inp.hit('KeyT')) m.spray(a);
      if (m.arena && inp.hit('Digit4')) m.arena.useBandage(a);
      if (m.arena && inp.hit('KeyF')) m.arena.ui.quickBuy();
    }
    const pressed = canAct && !frozen && inp.mousePressed[0];
    const heavy = canAct && !frozen && d.melee && inp.mousePressed[2];
    if (firing && a.fireCd <= 0 && !a.busy) this.fireHeld++;
    m.tickWeapon(a, dt, firing || heavy, pressed || heavy, heavy);
  }

  // Cámara en primera persona (vivo) o cámara de muerte
  updateCamera(dt) {
    const a = this.a, cam = this.cam, s = this.settings;
    this.punchV += (-this.punch * 260 - this.punchV * 24) * dt; this.punch += this.punchV * dt;
    const sh = this.m.app.feel.offsets(), sx = sh.yaw, sy = sh.pitch;
    if (a.alive) {
      const mv = a.onGround ? Math.min(1, a.speed / 5.4) * (1 - 0.8 * a.ads) : 0;
      this.bob += (mv - this.bob) * Math.min(1, dt * 8);
      const bobY = (Math.abs(Math.cos(a.phase)) - 0.6) * 0.045 * this.bob * (a.sprinting ? 1.4 : 1);
      const bobR = Math.sin(a.phase) * 0.006 * this.bob;
      cam.position.set(a.pos.x, a.pos.y + a.eyeH - this.land * 0.12 + bobY, a.pos.z);
      cam.rotation.set(a.pitch + this.punch * 0.02 + sy, a.yaw + sx, this.roll + bobR + sh.roll, 'YXZ');
      const d = a.wdef;
      const zoom = 1 + (d.adsZoom - 1) * a.ads;
      const fov = (s.fov + this.sprintBlend * 6 - this.m.app.feel.fovKick()) / zoom;
      if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
      this.vm.update(dt, {
        ads: a.ads, speed: a.speed, onGround: a.onGround, sprint: a.sprinting, sprintBlend: this.sprintBlend, crouch: a.crouch,
        phase: a.phase, time: this.time, lookDX: this.lookDX, lookDY: this.lookDY, land: this.land,
        vx: a.vel.x * Math.cos(a.yaw) - a.vel.z * Math.sin(a.yaw), vy: a.onGround ? 0 : a.vel.y,
        hidden: d.scope && a.ads > 0.85,
      });
    } else if (this.deathCam) {
      // cámara de muerte: se eleva detrás del cadáver mirando al asesino
      const dc = this.deathCam; dc.t += dt;
      const k = Math.min(1, dc.t / 0.9), e = 1 - Math.pow(1 - k, 3);
      const killer = dc.killer && dc.killer !== a ? dc.killer : null;
      const look = killer ? new THREE.Vector3(killer.pos.x, killer.pos.y + 1.4, killer.pos.z) : new THREE.Vector3(a.pos.x, a.pos.y + 0.5, a.pos.z);
      const base = new THREE.Vector3(a.pos.x, a.pos.y + 1.6, a.pos.z);
      const away = base.clone().sub(look).setY(0).normalize();
      if (!isFinite(away.x)) away.set(0, 0, 1);
      const target = base.clone().addScaledVector(away, 2.6).add(new THREE.Vector3(0, 1.2, 0));
      // no atravesar paredes
      const dir = target.clone().sub(base), L = dir.length(); dir.normalize();
      const hit = this.m.raycast(base, dir, L);
      if (hit) target.copy(base).addScaledVector(dir, Math.max(0.3, hit.t - 0.3));
      cam.position.lerpVectors(dc.from, target, e);
      const q = new THREE.Matrix4().lookAt(cam.position, look, new THREE.Vector3(0, 1, 0));
      const tq = new THREE.Quaternion().setFromRotationMatrix(q);
      cam.quaternion.slerp(tq, Math.min(1, dt * 6));
      if (Math.abs(cam.fov - s.fov) > 0.01) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
    }
  }

  startDeathCam(killer) {
    this.deathCam = { t: 0, killer, from: this.cam.position.clone() };
    this.recPitch = this.recYaw = 0; this.fireHeld = 0;
  }
}
