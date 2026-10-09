// Estado y movimiento compartido por jugador y bots (misma física = mismas reglas para todos).
import { BODY, moveBody, canStand } from '../core/physics.js';
import { WEAPONS } from '../data/weapons.js';

export const MOVE = {
  walk: 5.4, sprint: 7.4, crouchMul: 0.45, adsMul: 0.6, accel: 48, airAccel: 9, stopAccel: 52,
  jump: 7.3, gravity: 21, maxFall: 40,
};

let nextId = 1;
export class Actor {
  constructor({ name, team = null, isBot = false, isLocal = false, skin = 'recruit', weaponSkins = {} }) {
    this.id = nextId++;
    this.name = name; this.team = team; this.isBot = isBot; this.isLocal = isLocal;
    this.skin = skin; this.weaponSkins = weaponSkins;
    this.pos = { x: 0, y: 0, z: 0 }; this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0; this.pitch = 0;
    this.onGround = false; this.height = BODY.h; this.crouch = 0; this.crouching = false;
    this.hp = 100; this.alive = false; this.spawnShield = 0;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0; this.headshots = 0; this.assists = 0;
    this.damageBy = new Map();
    this.slots = [null, null, null]; this.slot = 0; this.lastSlot = 1;
    this.fireCd = 0; this.reloadT = 0; this.drawT = 0; this.burstLeft = 0; this.burstCd = 0; this.shellReload = false;
    this.ads = 0; this.wantAds = false; this.bloom = 0; this.sprinting = false;
    this.phase = 0; this.deadT = 0; this.respawnT = 0; this.lastHitBy = null; this.loadout = 0;
    this.ping = 20 + Math.floor(Math.random() * 60);
  }

  get eyeH() { return BODY.eye - (BODY.eye - BODY.crouchEye) * this.crouch; }
  get weapon() { return this.slots[this.slot]; }
  get wdef() { return this.slots[this.slot] ? WEAPONS[this.slots[this.slot].id] : WEAPONS.knife; }

  giveLoadout(primary, secondary, knifeOnly = false) {
    const mk = (id) => id ? { id, mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve } : null;
    this.slots = knifeOnly ? [null, null, mk('knife')] : [mk(primary), mk(secondary), mk('knife')];
    this.slot = knifeOnly ? 2 : 0; this.lastSlot = knifeOnly ? 2 : 1;
    this.reloadT = 0; this.fireCd = 0; this.drawT = this.wdef.draw; this.burstLeft = 0; this.ads = 0; this.bloom = 0;
  }

  switchTo(slot) {
    if (slot === this.slot || !this.slots[slot] || !this.alive) return false;
    this.lastSlot = this.slot; this.slot = slot;
    this.reloadT = 0; this.shellReload = false; this.burstLeft = 0; this.ads = 0;
    this.drawT = this.wdef.draw;
    return true;
  }

  // Bloqueado para disparar
  get busy() { return this.reloadT > 0 || this.drawT > 0; }

  canReload() {
    const w = this.weapon, d = this.wdef;
    return w && d.slot !== 3 && w.mag < d.mag && w.reserve > 0 && this.reloadT <= 0 && this.drawT <= 0;
  }
  startReload() {
    if (!this.canReload()) return false;
    const d = this.wdef;
    this.reloadT = d.perShell ? d.perShell + 0.25 : d.reload;
    this.shellReload = !!d.perShell;
    this.burstLeft = 0;
    return true;
  }
  // Avanza la recarga; devuelve 'shell' | 'done' | null
  tickReload(dt) {
    if (this.reloadT <= 0) return null;
    this.reloadT -= dt;
    if (this.reloadT > 0) return null;
    const w = this.weapon, d = this.wdef;
    if (this.shellReload) {
      w.mag++; w.reserve--;
      if (w.mag < d.mag && w.reserve > 0) { this.reloadT = d.perShell; return 'shell'; }
      this.shellReload = false; this.reloadT = 0; return 'done';
    }
    const need = d.mag - w.mag, take = Math.min(need, w.reserve);
    w.mag += take; w.reserve -= take; this.reloadT = 0;
    return 'done';
  }

  // input: { fwd, right, jump, crouch, sprint } (valores -1..1 / bool)
  move(col, input, dt) {
    const d = this.wdef;
    // agacharse (con comprobación de techo al levantarse)
    if (input.crouch) this.crouching = true;
    else if (this.crouching && canStand(col, this.pos)) this.crouching = false;
    const target = this.crouching ? 1 : 0;
    this.crouch += (target - this.crouch) * Math.min(1, dt * 12);
    this.height = BODY.h - (BODY.h - BODY.crouchH) * this.crouch;

    let fx = input.right || 0, fz = input.fwd || 0;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // adelante = -Z cuando yaw = 0
    const wx = fx * c - fz * s, wz = -fx * s - fz * c;
    this.sprinting = !!input.sprint && fz > 0.3 && !this.crouching && this.ads < 0.3 && this.onGround !== false && this.reloadT <= 0;
    let speed = (this.sprinting ? MOVE.sprint : MOVE.walk) * d.moveMul * (this.rush || 1);
    if (this.crouching) speed *= MOVE.crouchMul;
    speed *= 1 - (1 - MOVE.adsMul) * this.ads;
    if (this.healT > 0) { speed *= 0.5; this.sprinting = false; }
    const v = this.vel;
    const tx = wx * speed, tz = wz * speed;
    if (this.onGround) {
      const a = (len > 0.01 ? MOVE.accel : MOVE.stopAccel) * dt;
      const dx = tx - v.x, dz = tz - v.z, dl = Math.hypot(dx, dz);
      if (dl <= a) { v.x = tx; v.z = tz; } else { v.x += dx / dl * a; v.z += dz / dl * a; }
      if (input.jump && !this.crouching) { v.y = MOVE.jump; this.onGround = false; this.jumped = true; }
    } else if (len > 0.01) {
      // control aéreo limitado sin superar la velocidad objetivo
      v.x += wx * MOVE.airAccel * dt; v.z += wz * MOVE.airAccel * dt;
      const h = Math.hypot(v.x, v.z), cap = Math.max(speed, h - MOVE.airAccel * dt);
      if (h > cap) { v.x *= cap / h; v.z *= cap / h; }
    }
    v.y = Math.max(-MOVE.maxFall, v.y - MOVE.gravity * dt);
    this.landSpeed = 0;
    moveBody(col, this, dt);
    const hs = Math.hypot(v.x, v.z);
    if (this.onGround) this.phase += hs * dt * 1.55;
    return hs;
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }

  // Dispersión actual (radianes) — la base del "counter-strafe": quieto = preciso.
  spread() {
    const d = this.wdef;
    let s = d.spreadHip + (d.spreadAds - d.spreadHip) * this.ads;
    const mv = Math.min(1, this.speed / (MOVE.walk * 0.9));
    s += d.spreadMove * mv * mv * (1 - 0.5 * this.ads);
    if (!this.onGround) s += d.spreadAir;
    if (this.crouching && this.onGround) s *= d.spreadCrouch;
    return s + this.bloom;
  }

  hitboxes() {
    const p = this.pos, h = this.height;
    const head = 0.15, bw = 0.27, lw = 0.22;
    return [
      { part: 'head', min: [p.x - head, p.y + h - 0.3, p.z - head], max: [p.x + head, p.y + h + 0.02, p.z + head] },
      { part: 'body', min: [p.x - bw, p.y + h * 0.48, p.z - bw * 0.8], max: [p.x + bw, p.y + h - 0.3, p.z + bw * 0.8] },
      { part: 'legs', min: [p.x - lw, p.y, p.z - lw], max: [p.x + lw, p.y + h * 0.48, p.z + lw] },
    ];
  }
}
