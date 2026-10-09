// BATTLE ROYALE (KORVA ISLAND)
//   avión que cruza la isla → salto → caída libre (W = picado) → paracaídas automático → aterrizaje sólo con cuchillo
//   botín con rareza en el suelo · blindaje · curas · zona que se cierra por fases · sin reapariciones
//   el último operador en pie gana
import * as THREE from 'three';
import { rollLoot, ITEMS, WEAPON_RARITY, ZONE_PHASES, RARITY_ORDER } from '../data/loot.js';
import { WEAPONS } from '../data/weapons.js';
import { makePlane, makeChute, makeZoneWall, lootModel } from '../gfx/brgfx.js';
import { setSoldierSkydive, makeGun, setSoldierWeapon } from '../gfx/models.js';
import { gunIcon } from '../gfx/icons.js';
import { disposeTree } from '../gfx/bake.js';
import { raycastWorld, moveBody } from '../core/physics.js';
import { play, loopSound } from './audio.js';
import { BRHud } from '../ui/brhud.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerpK = (rate, dt) => 1 - Math.exp(-rate * dt);
const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const rank = (r) => RARITY_ORDER.indexOf(r);
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export const BR = {
  planeH: 130, planeV: 16, edge: 147, half: 150,
  glideH: 15, diveH: 27, glideV: 30, diveV: 50,       // caída libre (m/s)
  chuteAGL: 45, chuteH: 11, chuteV: 6, chuteFast: 9,  // paracaídas
  R0: 215,                                            // radio inicial de la zona (cubre las esquinas de la isla)
  streamIn: 70, streamOut: 95, takeR: 2.0, autoR: 1.4,
  shadowExt: 70,
};
const CHUTE_COLORS = [0xe85a2a, 0x2a8ae8, 0xe8c22a, 0x3ac46a, 0xc43a9a, 0xe8e8e8];
const CELL = 12;

export class BattleRoyale {
  constructor(m) {
    this.m = m; this.map = m.map; this.t = 0; this.started = false;
    // ---- avión: recta aleatoria que pasa cerca del centro ----
    const ang = Math.random() * Math.PI * 2, off = R(-45, 45);
    const dir = this.pdir = V(Math.cos(ang), 0, Math.sin(ang));
    const perp = V(-dir.z, 0, dir.x);
    this.p0 = perp.multiplyScalar(off).addScaledVector(dir, -250); this.p0.y = BR.planeH;
    this.pLen = 500; this.ps = 0;
    this.openS = 1e9; this.exitS = 0;
    for (let s = 0; s <= this.pLen; s += 2) {
      const x = this.p0.x + dir.x * s, z = this.p0.z + dir.z * s;
      if (Math.abs(x) < 138 && Math.abs(z) < 138) { this.openS = Math.min(this.openS, s); this.exitS = s; }
    }
    this.planePos = this.p0.clone();
    this.plane = makePlane(); this.plane.position.copy(this.p0); this.plane.rotation.y = yawTo(dir.x, dir.z);
    m.scene.add(this.plane);
    // ---- zona ----
    this.zone = { x: 0, z: 0, r: BR.R0 }; this.zi = 0; this.zs = 'wait'; this.zt = ZONE_PHASES[0].wait;
    this.next = this.pickNext(this.zone, ZONE_PHASES[0].scale);
    this.wall = makeZoneWall(); m.scene.add(this.wall);
    this.dmgT = 0;
    // ---- botín ----
    this.items = []; this.grid = new Map(); this.nextId = 1; this.shown = new Set(); this.streamT = 0;
    const rng = seeded(Math.random() * 1e9);
    for (const L of this.map.loot) {
      rollLoot(rng, L.tier).forEach((e, i) => { const a = rng() * 6.28; this.spawnItem(e, L.p[0] + Math.cos(a) * 0.7 * i, L.p[1], L.p[2] + Math.sin(a) * 0.7 * i); });
    }
    this.fading = []; // paracaídas que se pliegan
    // prototipos de botín construidos ya (y sus shaders compilados en warmup): sin tirones al aterrizar
    this.protoShow = new THREE.Group(); this.protoShow.visible = false;
    for (const id of Object.keys(WEAPON_RARITY)) this.protoShow.add(lootModel({ type: 'weapon', id, rarity: WEAPON_RARITY[id] }));
    for (const id of Object.keys(ITEMS)) this.protoShow.add(lootModel({ type: 'item', id, rarity: ITEMS[id].rarity }));
    for (const r of RARITY_ORDER) this.protoShow.add(lootModel({ type: 'item', id: 'armor3', rarity: r }));
    this.protoShow.add(makeChute());
    m.scene.add(this.protoShow);
    // todo lo que un arma recogida necesita por primera vez (icono del HUD, aspecto del jugador, arma en primera persona)
    // se genera al cargar: si no, cada primera recogida o baja costaba 50–100 ms en plena pelea
    const me = m.me;
    for (const id of Object.keys(WEAPON_RARITY)) {
      gunIcon(id);
      const sk = me.weaponSkins[id];
      if (sk && sk !== 'factory') disposeTree(makeGun(id, sk));
      m.vm.setWeapon(id, sk || 'factory', me.skin);
    }
    gunIcon('knife');
    // ---- todos al avión ----
    for (const a of m.actors) this.board(a);
    // cada soldado ya tiene montadas todas las armas del botín (clones baratos de prototipos compartidos)
    const ids = Object.keys(WEAPON_RARITY);
    for (const a of m.actors) { for (const id of ids) setSoldierWeapon(a.soldier, id, a.weaponSkins[id] || 'factory'); setSoldierWeapon(a.soldier, 'knife', a.weaponSkins.knife || 'factory'); }
    this.ui = new BRHud(m, this);
    // sombras nítidas que siguen al jugador (en vez de cubrir 300 m con el mismo mapa de sombras)
    const sc = m.sun.shadow.camera; Object.assign(sc, { left: -BR.shadowExt, right: BR.shadowExt, top: BR.shadowExt, bottom: -BR.shadowExt }); sc.updateProjectionMatrix();
    this.sunDir = m.sun.position.clone().normalize();
    this.fog0 = { near: m.scene.fog.near, far: m.scene.fog.far };
    this.camP = new THREE.Vector3(); this.camInit = false;
  }

  // ======================= actores =======================
  board(a) {
    a.brAir = 'plane'; a.alive = true; a.hp = 100; a.spawnShield = 0;
    a.armor = 0; a.armorMax = 0; a.armorItem = null; a.heals = { bandage: 0, medkit: 0 }; a.healT = 0; a.healItem = null;
    a.brPlace = 0; a.brElimT = 0; a.brFallT = 0; a.brTilt = 0;
    a.giveLoadout(null, null, true); this.m.onSwitch(a);
    Object.assign(a.vel, { x: 0, y: 0, z: 0 }); a.onGround = false;
    a.pos.x = this.p0.x; a.pos.y = this.p0.y - 3; a.pos.z = this.p0.z;
    a.yaw = this.plane.rotation.y + Math.PI; a.pitch = -0.25;
    a.soldier.root.visible = false; a.soldier.root.rotation.order = 'YXZ';
    setSoldierSkydive(a.soldier, true); setSoldierSkydive(a.soldier, false); // brazos de caída construidos ya (sin tirón al saltar)
    if (a.isBot) {
      a.weaponSkins = {}; // el botín sale de fábrica
      a.brTarget = this.pickDrop();
      const s = (a.brTarget.x - this.p0.x) * this.pdir.x + (a.brTarget.z - this.p0.z) * this.pdir.z;
      a.brJumpS = clamp(s - R(20, 45), this.openS + R(0, 12), this.exitS - R(0, 10));
    }
  }
  // Destino de caída de un bot: una zona con nombre o un punto de botín cualquiera, alcanzable desde la ruta del avión
  // Los destinos se reparten: cada bot evita caer a menos de 30 m de otro (como jugadores reales que buscan su sitio)
  pickDrop() {
    const lat = (x, z) => Math.abs((x - this.p0.x) * -this.pdir.z + (z - this.p0.z) * this.pdir.x);
    const taken = this.drops || (this.drops = []);
    let best = null, bs = -1e9;
    for (let i = 0; i < 14; i++) {
      let c;
      const pois = this.map.pois.filter(p => lat(p.x, p.z) < 120);
      if (pois.length && Math.random() < 0.4) {
        const p = pois[Math.floor(Math.random() * pois.length)], a = Math.random() * 6.28, r = Math.random() * p.r * 0.7;
        c = { x: p.x + Math.cos(a) * r, z: p.z + Math.sin(a) * r };
      } else {
        const pts = this.map.loot.filter(l => lat(l.p[0], l.p[2]) < 120), src = pts.length ? pts : this.map.loot;
        const l = src[Math.floor(Math.random() * src.length)]; c = { x: l.p[0], z: l.p[2] };
      }
      let md = 60; for (const t of taken) md = Math.min(md, Math.hypot(t.x - c.x, t.z - c.z));
      const sc = md + Math.random() * 6;
      if (sc > bs) { bs = sc; best = c; }
    }
    taken.push(best);
    return best;
  }

  jump(a) {
    if (a.brAir !== 'plane') return;
    a.brAir = 'fall'; a.brFallT = 0;
    const d = this.pdir;
    a.pos.x = this.planePos.x - d.x * 15; a.pos.z = this.planePos.z - d.z * 15; a.pos.y = this.planePos.y - 2;
    a.vel.x = d.x * BR.planeV * 0.8; a.vel.z = d.z * BR.planeV * 0.8; a.vel.y = -4;
    a.soldier.root.visible = true;
    if (a.isLocal) {
      play('whoosh'); play('clunk', null, 0.6);
      this.wind = this.wind || loopSound('wind');
      this.ui.onJump();
      document.body.classList.add('br-falling');
    }
  }
  openChute(a) {
    a.brAir = 'chute';
    a.chute = makeChute(CHUTE_COLORS[a.id % CHUTE_COLORS.length]);
    a.chute.scale.setScalar(0.01); a.chuteT = 0;
    this.m.scene.add(a.chute);
    if (a.isLocal) { play('chute'); this.m.controller.shake(0.05, 0.35); }
    else play('chute', a.pos, 0.5);
  }
  land(a) {
    a.brAir = null; a.soldier.root.rotation.x = 0; setSoldierSkydive(a.soldier, false); for (const L of a.soldier.legs) L.leg.rotation.z = 0;
    a.vel.x *= 0.3; a.vel.z *= 0.3;
    if (a.chute) { this.fading.push({ o: a.chute, t: 0 }); a.chute = null; }
    if (a.isLocal) {
      const m = this.m;
      m.vm.play('raise', 0.9); play('deployLand'); play('land', null, 0.9);
      m.controller.land = 1;
      m.app.ui.hud.buildIn();
      document.body.classList.remove('br-air', 'br-falling', 'br-dive');
      if (this.wind) { this.wind.stop(); this.wind = null; }
      this.camBlend = { t: 0, p: m.app.camera.position.clone(), q: m.app.camera.quaternion.clone() };
      const poi = this.poiAt(a.pos.x, a.pos.z);
      this.ui.landed(poi ? poi.name : null);
      a.spawnTime = m.time;
    } else play('land', a.pos, 0.6);
  }
  poiAt(x, z) {
    let best = null, bd = 1e9;
    for (const p of this.map.pois) { const d = Math.hypot(p.x - x, p.z - z); if (d < p.r * 1.1 && d < bd) { bd = d; best = p; } }
    return best;
  }
  agl(a) {
    const h = raycastWorld(this.m.col, a.pos.x, a.pos.y + 0.1, a.pos.z, 0, -1, 0, 400);
    return h ? h.t - 0.1 : 400;
  }

  // Movimiento en el aire (jugador y bots usan las mismas reglas)
  airStep(a, inp, dt) {
    const v = a.vel, s = Math.sin(a.yaw), c = Math.cos(a.yaw);
    let fx = inp.right || 0, fz = inp.fwd || 0;
    const len = Math.hypot(fx, fz); if (len > 1) { fx /= len; fz /= len; }
    const wx = fx * c - fz * s, wz = -fx * s - fz * c;
    if (a.brAir === 'fall') {
      a.brFallT += dt;
      a.brDive = fz > 0.3;
      const hs = a.brDive ? BR.diveH : BR.glideH, vs = a.brDive ? BR.diveV : BR.glideV, k = lerpK(1.5, dt);
      v.x += (wx * hs - v.x) * k; v.z += (wz * hs - v.z) * k; v.y += (-vs - v.y) * k;
      const agl = this.agl(a);
      if (agl < BR.chuteAGL || (inp.chute && a.brFallT > 0.8 && agl < 110)) this.openChute(a);
    } else {
      a.chuteT += dt;
      const k = lerpK(2.0, dt), moving = len > 0.01;
      const tx = moving ? wx * BR.chuteH : -s * 1.5, tz = moving ? wz * BR.chuteH : -c * 1.5;
      v.x += (tx - v.x) * k; v.z += (tz - v.z) * k;
      v.y += (-(fz > 0.3 ? BR.chuteFast : BR.chuteV) - v.y) * lerpK(1.8, dt);
    }
    const was = a.onGround; a.onGround = false;
    moveBody(this.m.col, a, dt);
    a.pos.x = clamp(a.pos.x, -BR.edge, BR.edge); a.pos.z = clamp(a.pos.z, -BR.edge, BR.edge);
    if (a.onGround && !was) this.land(a);
  }
  botAirInput(a, dt) {
    const T = a.brTarget, dx = T.x - a.pos.x, dz = T.z - a.pos.z, d = Math.hypot(dx, dz);
    const want = yawTo(dx, dz);
    a.yaw += angDiff(want, a.yaw) * lerpK(3, dt);
    return { fwd: a.brAir === 'fall' ? (d > 14 ? 1 : 0) : (d > 2.5 ? 1 : 0), right: 0, chute: false };
  }
  myAirInput() {
    const inp = this.m.app.input, ok = inp.enabled && !this.m.app.ui.chatOpen;
    const k = (c) => ok && inp.down(c);
    return { fwd: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0), right: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0), chute: ok && inp.hit('Space') };
  }
  // Mirar con el ratón mientras estás en el avión o en el aire (cámara en tercera persona)
  myLook() {
    const m = this.m, inp = m.app.input, me = m.me, s = m.app.profile.settings;
    if (!inp.enabled || m.app.ui.chatOpen) return;
    const sens = 0.0021 * s.sens;
    me.yaw -= inp.dx * sens; me.pitch -= inp.dy * sens * (s.invertY ? -1 : 1);
    me.pitch = clamp(me.pitch, me.brAir === 'plane' ? -0.9 : -1.35, 0.35);
  }

  // ======================= curas y blindaje =======================
  canHeal(a, id) { const I = ITEMS[id]; return a.heals[id] > 0 && a.hp < I.cap && a.healT <= 0; }
  startHeal(a, id) {
    if (!a.alive || a.brAir || !this.canHeal(a, id)) {
      if (a.isLocal && a.heals[id] <= 0) this.m.app.ui.hud.toast(`NO ${ITEMS[id].name}S`);
      else if (a.isLocal && a.hp >= ITEMS[id].cap) this.m.app.ui.hud.toast(id === 'bandage' ? 'BANDAGES HEAL UP TO 75' : 'ALREADY AT FULL HEALTH');
      return false;
    }
    a.healT = ITEMS[id].time; a.healItem = id;
    if (a.isLocal) { play('heal'); this.ui.channel(id, a.healT); }
    return true;
  }
  cancelHeal(a) {
    if (a.healT <= 0) return;
    a.healT = 0; a.healItem = null;
    if (a.isLocal) this.ui.channel(null);
  }
  finishHeal(a) {
    const I = ITEMS[a.healItem];
    a.heals[a.healItem]--;
    a.hp = Math.min(I.cap, a.hp + I.heal);
    if (a.isLocal) { play('heal', null, 0.6); this.m.app.ui.hud.setHealth(a); this.ui.channel(null); this.ui.healed(I.heal); }
    a.healT = 0; a.healItem = null;
  }
  // El blindaje absorbe el daño de las armas (la zona lo atraviesa). Devuelve el daño que llega a la vida.
  absorb(v, amount, attacker) {
    if (!v.armor || amount <= 0) return amount;
    const ab = Math.min(v.armor, amount);
    v.armor -= ab;
    if (v.armor <= 0) { v.armor = 0; play('armorBreak', v.isLocal ? null : v.pos, v.isLocal ? 1 : 0.8); if (attacker && attacker.isLocal) this.ui.armorBreak(); }
    return amount - ab;
  }

  // ======================= botín =======================
  key(ix, iz) { return ix * 4099 + iz; }
  spawnItem(e, x, y, z, ground = true) {
    const it = { id: this.nextId++, e, x, y, z, mesh: null, t: Math.random() * 6, gone: false };
    if (ground) { const g = raycastWorld(this.m.col, x, y + 0.8, z, 0, -1, 0, 6, false); if (g) it.y = y + 0.8 - g.t; }
    this.items.push(it);
    const k = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
    let l = this.grid.get(k); if (!l) this.grid.set(k, l = []);
    l.push(it); it.cell = l;
    return it;
  }
  removeItem(it) {
    if (it.gone) return; it.gone = true;
    it.cell.splice(it.cell.indexOf(it), 1);
    this.items.splice(this.items.indexOf(it), 1);
    if (it.mesh) { this.m.scene.remove(it.mesh); it.mesh = null; this.shown.delete(it); }
  }
  itemsNear(x, z, r) {
    const out = [];
    for (let ix = Math.floor((x - r) / CELL); ix <= Math.floor((x + r) / CELL); ix++)
      for (let iz = Math.floor((z - r) / CELL); iz <= Math.floor((z + r) / CELL); iz++) {
        const l = this.grid.get(this.key(ix, iz)); if (!l) continue;
        for (const it of l) { const d = Math.hypot(it.x - x, it.z - z); if (d <= r) out.push(it); }
      }
    return out;
  }
  // ¿Le sirve a este actor? (para bots y para la recogida automática)
  wants(a, e) {
    if (e.type === 'weapon') {
      const slot = WEAPONS[e.id].slot - 1, cur = a.slots[slot];
      return !cur || rank(e.rarity) > rank(WEAPON_RARITY[cur.id] || 'common');
    }
    const I = ITEMS[e.id];
    if (I.kind === 'armor') return (e.val ?? I.armor) > a.armor + 10;
    if (I.kind === 'heal') return a.heals[e.id] < I.max;
    if (I.kind === 'ammo') return [0, 1].some(i => a.slots[i] && a.slots[i].reserve < WEAPONS[a.slots[i].id].reserve);
    return false;
  }
  label(e) {
    if (e.type === 'weapon') return WEAPONS[e.id].name;
    const I = ITEMS[e.id];
    return I.name + (e.n > 1 ? ' ×' + e.n : '') + (I.kind === 'armor' ? ` (${e.val ?? I.armor})` : '');
  }
  // Coger un objeto del suelo
  take(a, it) {
    const e = it.e, m = this.m;
    if (e.type === 'weapon') {
      const slot = WEAPONS[e.id].slot - 1, old = a.slots[slot];
      this.removeItem(it);
      if (old) this.dropEntry({ type: 'weapon', id: old.id, rarity: WEAPON_RARITY[old.id] || 'common', w: { ...old } }, a.pos, 0.6);
      a.slots[slot] = { ...e.w };
      a.slot = -1; a.switchTo(slot); m.onSwitch(a);
      this.cancelHeal(a);
      if (a.isLocal) { play('pickup'); this.ui.got(e); }
      return true;
    }
    const I = ITEMS[e.id];
    if (I.kind === 'armor') {
      const val = e.val ?? I.armor;
      this.removeItem(it);
      if (a.armor > 0 && a.armorItem) this.dropEntry({ type: 'item', id: a.armorItem, rarity: ITEMS[a.armorItem].rarity, n: 1, val: a.armor }, a.pos, 0.6);
      a.armor = val; a.armorMax = I.armor; a.armorItem = e.id;
      if (a.isLocal) { play('pickup'); play('armorUp'); this.ui.got(e); }
      return true;
    }
    if (I.kind === 'heal') {
      const room = I.max - a.heals[e.id]; if (room <= 0) return false;
      const n = Math.min(room, e.n || 1);
      a.heals[e.id] += n; e.n = (e.n || 1) - n;
      if (e.n <= 0) this.removeItem(it);
      if (a.isLocal) { play('pickup'); this.ui.got({ ...e, n }); }
      return true;
    }
    if (I.kind === 'ammo') {
      let any = false;
      for (const i of [0, 1]) { const w = a.slots[i]; if (!w) continue; const D = WEAPONS[w.id]; if (w.reserve < D.reserve) { w.reserve = Math.min(D.reserve, w.reserve + D.mag * 2); any = true; } }
      if (!any) return false;
      this.removeItem(it);
      if (a.isLocal) { play('pickup'); this.ui.got(e); m.app.ui.hud.setAmmo(a); }
      return true;
    }
    return false;
  }
  // Objeto más cercano que se coge con E (armas y blindaje; curas y munición se cogen solas)
  nearTake(a) {
    let best = null, bd = BR.takeR;
    for (const it of this.itemsNear(a.pos.x, a.pos.z, BR.takeR)) {
      if (Math.abs(it.y - a.pos.y) > 1.6) continue;
      // con E sólo armas y blindaje; curas y munición se recogen al pasar (si caben)
      const manual = it.e.type === 'weapon' || ITEMS[it.e.id].kind === 'armor';
      if (!manual) continue;
      const d = Math.hypot(it.x - a.pos.x, it.z - a.pos.z);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }
  tryTake(a) {
    const it = this.nearTake(a);
    if (!it) return false;
    if (!this.take(a, it) && a.isLocal) this.m.app.ui.hud.toast(it.e.type === 'item' && ITEMS[it.e.id].kind === 'heal' ? 'POUCH FULL' : 'NOT NEEDED');
    return true;
  }
  dropEntry(e, pos, r = 0.9) {
    const a = Math.random() * 6.28;
    return this.spawnItem(e, pos.x + Math.cos(a) * r, pos.y + 0.5, pos.z + Math.sin(a) * r);
  }
  dropWeapon(a) {
    const w = a.weapon; if (!w || a.slot === 2) return;
    const f = V(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
    this.spawnItem({ type: 'weapon', id: w.id, rarity: WEAPON_RARITY[w.id] || 'common', w: { ...w } }, a.pos.x + f.x * 1.3, a.pos.y + 0.5, a.pos.z + f.z * 1.3);
    a.slots[a.slot] = null;
    const next = [0, 1, 2].find(i => a.slots[i]);
    a.slot = -1; a.switchTo(next); this.m.onSwitch(a);
    play('pickup');
  }
  // Mallas sólo cerca de la cámara (el resto del botín existe pero no se dibuja)
  stream() {
    const c = this.m.app.camera.position, add = [];
    for (const it of this.items) {
      const d = Math.hypot(it.x - c.x, it.z - c.z);
      if (!it.mesh && d < BR.streamIn) add.push([d, it]);
      else if (it.mesh && d > BR.streamOut) { this.m.scene.remove(it.mesh); it.mesh = null; this.shown.delete(it); }
    }
    add.sort((p, q) => p[0] - q[0]);
    for (const [, it] of add.slice(0, 5)) {
      it.mesh = lootModel(it.e); it.mesh.position.set(it.x, it.y, it.z); it.mesh.rotation.y = it.t;
      this.m.scene.add(it.mesh); this.shown.add(it);
    }
  }

  // ======================= muertes =======================
  aliveCount() { let n = 0; for (const a of this.m.actors) if (a.alive) n++; return n; }
  onKill(v, k) {
    const m = this.m;
    v.brPlace = this.aliveCount() + 1; v.brElimT = m.time; v.respawnT = Infinity;
    this.cancelHeal(v);
    if (v.chute) { this.fading.push({ o: v.chute, t: 0 }); v.chute = null; }
    v.brAir = null; v.soldier.root.rotation.x = 0; setSoldierSkydive(v.soldier, false); for (const L of v.soldier.legs) L.leg.rotation.z = 0;
    // su equipo queda en el suelo
    const drops = [];
    for (const i of [0, 1]) { const w = v.slots[i]; if (w) drops.push({ type: 'weapon', id: w.id, rarity: WEAPON_RARITY[w.id] || 'common', w: { ...w } }); }
    if (v.armor > 0 && v.armorItem) drops.push({ type: 'item', id: v.armorItem, rarity: ITEMS[v.armorItem].rarity, n: 1, val: v.armor });
    if (v.heals.bandage) drops.push({ type: 'item', id: 'bandage', rarity: 'common', n: v.heals.bandage });
    if (v.heals.medkit) drops.push({ type: 'item', id: 'medkit', rarity: 'rare', n: v.heals.medkit });
    if (Math.random() < 0.6) drops.push({ type: 'item', id: 'ammo', rarity: 'common', n: 1 });
    drops.forEach((e, i) => { const a = i / drops.length * 6.28; this.spawnItem(e, v.pos.x + Math.cos(a) * 0.9, v.pos.y + 0.5, v.pos.z + Math.sin(a) * 0.9); });
    v.armor = 0; v.heals = { bandage: 0, medkit: 0 };
    this.ui.onElim(v, k);
  }
  afterDeath() { if (!this.m.ended) this.m.end(); }
  standings() {
    return [...this.m.actors].sort((a, b) => (b.alive - a.alive) || (a.alive ? b.kills - a.kills : b.brElimT - a.brElimT) || b.kills - a.kills);
  }

  // ======================= zona =======================
  pickNext(c, scale) {
    const r = c.r * scale;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, d = Math.sqrt(Math.random()) * (c.r - r) * 0.9;
      const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d, lim = BR.half - Math.max(14, r * 0.5);
      if (Math.abs(x) < lim && Math.abs(z) < lim) return { x, z, r };
    }
    return { x: c.x * 0.5, z: c.z * 0.5, r };
  }
  dps() { const P = ZONE_PHASES; return this.zs === 'wait' ? (this.zi ? P[this.zi - 1].dps : 1) : P[Math.min(this.zi, P.length - 1)].dps; }
  outside(a, z = this.zone) { return Math.hypot(a.pos.x - z.x, a.pos.z - z.z) > z.r; }
  zoneStep(dt) {
    const P = ZONE_PHASES, m = this.m;
    if (this.zs !== 'done') {
      this.zt -= dt;
      if (this.zs === 'wait' && this.zt <= 0) {
        this.zs = 'shrink'; this.zt = P[this.zi].shrink; this.from = { ...this.zone };
        this.ui.zoneAlert('THE STORM IS CLOSING IN', 'storm'); play('zoneWarn');
      } else if (this.zs === 'shrink') {
        const k = 1 - Math.max(0, this.zt) / P[this.zi].shrink;
        this.zone = { x: this.from.x + (this.next.x - this.from.x) * k, z: this.from.z + (this.next.z - this.from.z) * k, r: this.from.r + (this.next.r - this.from.r) * k };
        if (this.zt <= 0) {
          this.zone = { ...this.next }; this.zi++;
          if (this.zi < P.length) {
            this.zs = 'wait'; this.zt = P[this.zi].wait; this.next = this.pickNext(this.zone, P[this.zi].scale);
            this.ui.zoneAlert(P[this.zi].scale === 0 ? 'FINAL CIRCLE' : 'NEW SAFE ZONE MARKED', 'safe'); play('zoneWarn', null, 0.6);
          } else { this.zs = 'done'; this.next = null; }
        }
      }
    }
    // antes de la primera fase la tormenta aún no existe (la isla entera es segura)
    this.formed = this.zi > 0 || this.zs !== 'wait';
    this.wall.visible = this.formed;
    this.wall.position.set(this.zone.x, -2, this.zone.z);
    this.wall.scale.set(Math.max(0.01, this.zone.r), 1, Math.max(0.01, this.zone.r));
    this.wall.material.uniforms.uTime.value = this.t;
    // daño fuera de la zona (una vez por segundo)
    this.dmgT += dt;
    if (this.dmgT >= 1) {
      this.dmgT -= 1;
      const dps = this.dps();
      if (this.formed) for (const a of [...m.actors]) if (a.alive && !a.brAir && this.outside(a)) m.damage(a, null, dps, false, 'zone', null);
    }
  }

  // ======================= bots =======================
  // Objetivo de un bot sin enemigo a la vista: huir de la zona, buscar botín o merodear dentro del círculo
  botGoal(b, now) {
    const a = b.a, p = a.pos;
    const inStorm = this.outside(a, { ...this.zone, r: this.zone.r - 4 });
    const nz = this.next, toNext = nz && Math.hypot(p.x - nz.x, p.z - nz.z) > nz.r * 0.85 && (this.zs === 'shrink' || this.zt < 35);
    if (inStorm || toNext) {
      const Z = inStorm ? this.zone : nz, dx = Z.x - p.x, dz = Z.z - p.z, d = Math.hypot(dx, dz) || 1, st = Math.min(d, 40);
      if (!b.brGoal || b.brGoal.kind !== 'zone' || now > b.brGoalT) { b.brGoal = { x: p.x + dx / d * st + R(-4, 4), y: p.y, z: p.z + dz / d * st + R(-4, 4), kind: 'zone', run: true }; b.brGoalT = now + 3; }
      return b.brGoal;
    }
    const g = b.brGoal;
    const done = !g || g.kind === 'zone' || now > b.brGoalT || (g.it && (g.it.gone || !this.wants(a, g.it.e))) || Math.hypot(g.x - p.x, g.z - p.z) < 1.2;
    if (done) {
      let best = null, bd = 1e9;
      for (const it of this.itemsNear(p.x, p.z, 38)) {
        if ((it.bad || 0) >= 2 || !this.wants(a, it.e) || (it.claim && it.claim !== a && it.claimT > now)) continue;
        const d = Math.hypot(it.x - p.x, it.z - p.z) + Math.abs(it.y - p.y) * 3 - (it.e.type === 'weapon' && !a.slots[0] && !a.slots[1] ? 20 : 0);
        if (d < bd) { bd = d; best = it; }
      }
      if (best) {
        best.claim = a; best.claimT = now + 12;
        b.brGoal = { x: best.x, y: best.y, z: best.z, kind: 'item', it: best }; b.brGoalT = now + 14;
      } else {
        // merodear: un punto dentro del círculo siguiente a 15–40 m
        const Z = nz || this.zone;
        for (let i = 0; i < 8; i++) {
          const ang = Math.random() * 6.28, r = R(15, 40), x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
          if (Math.hypot(x - Z.x, z - Z.z) < Z.r * 0.9 && Math.abs(x) < 145 && Math.abs(z) < 145) { b.brGoal = { x, y: p.y, z, kind: 'roam' }; break; }
          if (i === 7) b.brGoal = { x: p.x + (Z.x - p.x) * 0.3, y: p.y, z: p.z + (Z.z - p.z) * 0.3, kind: 'roam' };
        }
        b.brGoalT = now + R(8, 14);
      }
    }
    return b.brGoal;
  }
  botGround(a, dt) {
    const b = a.brain;
    // recoger lo que pisa
    a.brScanT = (a.brScanT || 0) - dt;
    if (a.brScanT <= 0) {
      a.brScanT = 0.2;
      for (const it of this.itemsNear(a.pos.x, a.pos.z, 1.7)) if (Math.abs(it.y - a.pos.y) < 1.5 && this.wants(a, it.e)) { this.take(a, it); break; }
    }
    // curarse a cubierto
    if (a.healT <= 0 && a.hp < 62 && !b.targetVisible && this.m.time - b.lastSeenT > 2.5) {
      if (a.hp < 45 && a.heals.medkit) this.startHeal(a, 'medkit');
      else if (a.hp < 75 && a.heals.bandage) this.startHeal(a, 'bandage');
    }
    if (a.healT > 0 && b.targetVisible) this.cancelHeal(a);
  }

  // ======================= bucle =======================
  begin() {
    this.started = true;
    const m = this.m;
    m.scene.remove(this.protoShow);
    // el despliegue desde el lobby deja la pantalla en blanco (la infiltración normal la desvanece; aquí no hay infiltración)
    document.body.classList.remove('letterbox-on');
    const f = document.getElementById('cine-fade');
    if (f) { f.classList.add('white'); f.style.transition = 'opacity 0.9s'; f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 950); }
    document.body.classList.add('br-on', 'br-air');
    m.app.ui.hud.el.classList.remove('hud-intro');
    m.app.ui.afterIntro();
    this.engine = loopSound('plane');
    this.ui.start();
    play('match');
  }
  // Antes de jugador y bots
  update(dt) {
    const m = this.m, me = m.me;
    if (!this.started) this.begin();
    this.t += dt;
    // avión
    if (this.plane) {
      this.ps += BR.planeV * dt;
      this.planePos.copy(this.p0).addScaledVector(this.pdir, this.ps);
      this.plane.position.copy(this.planePos); this.plane.position.y += Math.sin(this.t * 0.7) * 0.6;
      this.plane.rotation.z = Math.sin(this.t * 0.5) * 0.035;
      for (const p of this.plane.userData.props) p.rotation.z += dt * 40;
      const open = this.ps >= this.openS;
      if (open && !this.doorsOpen) { this.doorsOpen = true; this.ui.doorsOpen(); play('clunk'); }
      if (this.ps > this.exitS && !this.ejected) {
        this.ejected = true;
        for (const a of m.actors) if (a.alive && a.brAir === 'plane') { if (a.isLocal) this.ui.toastBig('AUTO-DEPLOYED'); this.jump(a); }
      }
      if (this.ps > this.pLen) { m.scene.remove(this.plane); this.plane = null; }
      if (this.engine) {
        const d = this.plane ? m.app.camera.position.distanceTo(this.planePos) : 999;
        this.engine.set(me.brAir === 'plane' ? 0.5 : clamp(0.45 - d / 500, 0, 0.45));
        if (!this.plane) { this.engine.stop(); this.engine = null; }
      }
    }
    if (me.alive && me.brAir) this.myLook();
    for (const a of m.actors) {
      if (!a.alive) continue;
      if (a.brAir === 'plane') {
        a.pos.x = this.planePos.x; a.pos.y = this.planePos.y - 3; a.pos.z = this.planePos.z;
        if (a.isLocal) { if (this.doorsOpen && m.app.input.enabled && m.app.input.hit('Space')) this.jump(a); }
        else if (this.doorsOpen && this.ps >= a.brJumpS) this.jump(a);
      } else if (a.brAir) this.airStep(a, a.isLocal ? this.myAirInput() : this.botAirInput(a, dt), dt);
      else {
        if (a.healT > 0) { a.healT -= dt; if (a.healT <= 0) this.finishHeal(a); }
        if (a.isBot) this.botGround(a, dt);
      }
    }
    // jugador en el suelo: teclas de curación y recogida automática
    if (me.alive && !me.brAir) {
      const inp = m.app.input, ok = inp.enabled && !m.app.ui.chatOpen && !m.death;
      if (ok) {
        if (inp.hit('Digit4')) this.startHeal(me, 'bandage');
        if (inp.hit('Digit5')) this.startHeal(me, 'medkit');
        if (inp.hit('KeyH')) this.startHeal(me, me.hp < 75 && me.heals.bandage && !(me.hp < 50 && me.heals.medkit) ? 'bandage' : 'medkit');
        if (me.healT > 0 && (inp.mouse[0] || inp.hit('Digit1') || inp.hit('Digit2') || inp.hit('Digit3') || inp.hit('KeyQ'))) this.cancelHeal(me);
      }
      this.autoT = (this.autoT || 0) - dt;
      if (this.autoT <= 0) {
        this.autoT = 0.15;
        for (const it of this.itemsNear(me.pos.x, me.pos.z, BR.autoR)) {
          if (it.e.type !== 'item' || Math.abs(it.y - me.pos.y) > 1.4) continue;
          const k = ITEMS[it.e.id].kind;
          if ((k === 'heal' || k === 'ammo') && this.wants(me, it.e)) { this.take(me, it); break; }
        }
      }
    }
    this.zoneStep(dt);
    // paracaídas plegándose
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i]; f.t += dt;
      f.o.scale.set(1 + f.t * 0.6, Math.max(0.02, 1 - f.t * 1.6), 1 + f.t * 0.6); f.o.position.y -= dt * 2.5;
      if (f.t > 0.65) { this.m.scene.remove(f.o); this.fading.splice(i, 1); }
    }
    this.streamT -= dt;
    if (this.streamT <= 0) { this.streamT = 0.2; this.stream(); }
    for (const it of this.shown) {
      it.t += dt;
      const md = it.mesh.children[0];
      md.rotation.y = it.t * 0.9; md.position.y = 0.06 + Math.sin(it.t * 2.2) * 0.05;
    }
  }

  // Después de syncVisuals y de la cámara del jugador: poses en el aire, cámara en tercera persona, niebla, sombras
  lateUpdate(dt) {
    const m = this.m, me = m.me, cam = m.app.camera;
    for (const a of m.actors) {
      const s = a.soldier;
      if (!a.alive || !a.brAir) continue;
      if (a.brAir === 'plane') { s.root.visible = false; continue; }
      setSoldierSkydive(s, a.brAir === 'fall');
      if (a.brAir === 'fall') {
        // piernas estiradas hacia atrás, ligeramente abiertas; al picar se cierran
        for (const [i, L] of s.legs.entries()) { L.leg.rotation.set(a.brDive ? 0.15 : 0.35, 0, (i ? -1 : 1) * (a.brDive ? 0.05 : 0.22)); L.knee.rotation.x = a.brDive ? 0.15 : 0.7; }
        s.spine.rotation.x = -0.2; s.head.rotation.x = -0.55;
      }
      const tilt = a.brAir === 'fall' ? (a.brDive ? -1.3 : -1.05) : 0;
      a.brTilt += (tilt - a.brTilt) * lerpK(5, dt);
      s.root.rotation.x = a.brTilt;
      s.root.position.y += Math.sin(-a.brTilt) * 0.9;
      if (a.chute) {
        const k = clamp(a.chuteT / 0.45, 0, 1), e = 1 + Math.sin(k * Math.PI) * 0.25 * (1 - k * 0.3);
        a.chute.scale.set(k * e, k, k * e);
        a.chute.position.set(a.pos.x, a.pos.y + 1.7, a.pos.z);
        a.chute.rotation.set(Math.sin(this.t * 1.3 + a.id) * 0.06, a.yaw, Math.sin(this.t * 0.9 + a.id) * 0.08);
      }
    }
    // cámara
    if (me.alive && me.brAir) {
      const look = me.brAir === 'plane' ? this.planePos.clone().add(V(0, 2, 0)) : V(me.pos.x, me.pos.y + 1.1, me.pos.z);
      const dist = me.brAir === 'plane' ? 36 : me.brAir === 'fall' ? 5.2 : 7.5;
      const f = V(-Math.sin(me.yaw) * Math.cos(me.pitch), Math.sin(me.pitch), -Math.cos(me.yaw) * Math.cos(me.pitch));
      const want = look.clone().addScaledVector(f, -dist).add(V(0, me.brAir === 'plane' ? 7 : me.brAir === 'chute' ? 1.6 : 1.0, 0));
      if (me.brAir !== 'plane') {
        const dv = want.clone().sub(look), L = dv.length(); dv.normalize();
        const hit = m.raycast(look, dv, L); if (hit) want.copy(look).addScaledVector(dv, Math.max(0.6, hit.t - 0.3));
      }
      if (!this.camInit) { this.camP.copy(want); this.camInit = true; }
      this.camP.lerp(want, me.brAir === 'plane' ? lerpK(8, dt) : lerpK(me.brFallT < 1 ? 3 : 12, dt));
      cam.position.copy(this.camP);
      cam.lookAt(look);
      const sp = Math.hypot(me.vel.x, me.vel.y, me.vel.z);
      const fov = m.app.profile.settings.fov + (me.brAir === 'fall' ? ss(25, 50, sp) * 14 : 0);
      cam.fov += (fov - cam.fov) * lerpK(4, dt); cam.updateProjectionMatrix();
      document.body.classList.toggle('br-dive', me.brAir === 'fall' && !!me.brDive);
      if (this.wind) this.wind.set(me.brAir === 'fall' ? 0.15 + ss(25, 50, sp) * 0.35 : 0.08, sp);
      // sacudida a gran velocidad
      if (me.brAir === 'fall' && me.brDive) { cam.position.x += (Math.random() - 0.5) * 0.04; cam.position.y += (Math.random() - 0.5) * 0.04; }
    } else if (this.camBlend) {
      // del tercero a primera persona sin corte
      const B = this.camBlend; B.t += dt;
      const k = ss(0, 0.45, B.t);
      cam.position.lerpVectors(B.p, cam.position.clone(), k);
      cam.quaternion.slerpQuaternions(B.q, cam.quaternion.clone(), k);
      if (k >= 1) this.camBlend = null;
    }
    // niebla: desde el aire se ve toda la isla
    const fog = m.scene.fog, air = me.alive && me.brAir ? 1 : 0;
    this.airK = (this.airK ?? 1) + (air - (this.airK ?? 1)) * lerpK(air ? 4 : 1.2, dt);
    fog.near = this.fog0.near + (240 - this.fog0.near) * this.airK; fog.far = this.fog0.far + (590 - this.fog0.far) * this.airK;
    // sombras que siguen a la cámara (ajustadas a la rejilla para que no tiemblen)
    const c = me.alive && !me.brAir ? me.pos : cam.position;
    const gx = Math.round(c.x / 2) * 2, gz = Math.round(c.z / 2) * 2;
    m.sun.target.position.set(gx, 0, gz); m.sun.position.set(gx, 0, gz).addScaledVector(this.sunDir, 120);
    this.ui.update(dt);
  }

  // Tras perder: dron que orbita alto sobre el lugar de la eliminación mientras se ve el informe
  outro(dt) {
    const m = this.m, cam = m.app.camera, me = m.me;
    this.ot = (this.ot || 0) + dt;
    const a = this.ot * 0.08 + me.yaw, c = V(me.pos.x, me.pos.y + 1, me.pos.z);
    cam.position.set(c.x + Math.sin(a) * 38, c.y + 26, c.z + Math.cos(a) * 38);
    cam.lookAt(c);
    for (const f of m.anim) f(dt);
    m.fx.update(dt);
    this.wall.material.uniforms.uTime.value += dt;
  }

  dispose() {
    if (this.engine) this.engine.stop(); if (this.wind) this.wind.stop();
    this.engine = this.wind = null;
    document.body.classList.remove('br-on', 'br-air', 'br-falling', 'br-dive', 'br-out');
    this.ui.dispose();
  }
}
