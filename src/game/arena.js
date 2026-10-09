// ARENA (V2): rondas con economía. Se engancha a Match como el Battle Royale (match.arena).
// Fases de cada ronda: 'buy' (12 s, todos quietos en su base, se compra) → 'live' (hasta que un equipo cae o se acaba el tiempo)
// → 'post' (cámara lenta de la última baja + marcador grande "3 — 2") → siguiente ronda o fin de partida.
import * as THREE from 'three';
import { FORMATS, ECON, PRICES, GEAR } from '../data/arena.js';
import { WEAPONS } from '../data/weapons.js';
import { play } from './audio.js';
import { ArenaUI } from '../ui/arenahud.js';
import { nearestNode } from '../core/nav.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const other = (t) => t === 'blue' ? 'red' : 'blue';

// Preferencias de compra de cada bot (da personalidad: hay "francotiradores" y "escopeteros")
const STYLES = [
  ['akr', 'talon', 'scout', 'hammer'],
  ['scout', 'akr', 'aurum'],
  ['longbow', 'aurum', 'akr'],
  ['vecta', 'viper', 'brute', 'akr'],
  ['brute', 'vecta', 'akr'],
  ['talon', 'akr', 'hammer'],
];

export class Arena {
  constructor(m, opts = {}) {
    this.m = m;
    this.size = m.mode.arena;
    this.fmt = { ...FORMATS[this.size], ...(m.mode.arenaFmt || {}) };
    this.econMul = m.mode.econMul || 1;           // evento "Doble economía"
    this.round = 0; this.phase = 'pre'; this.t = 0;
    this.lossStreak = { blue: 0, red: 0 };
    this.history = [];                            // ganador de cada ronda (para los "pips" del marcador)
    this.slow = 0;                                // cámara lenta del final de ronda (segundos reales)
    this.lastKill = null;
    for (const a of m.actors) this.initActor(a);
    this.ui = new ArenaUI(this);
    // los bots no "reaparecen" en Arena: sólo al empezar ronda
    this.spawnsOf = { blue: m.map.spawns.filter(s => s.team === 'blue'), red: m.map.spawns.filter(s => s.team === 'red') };
    if (!this.spawnsOf.blue.length || !this.spawnsOf.red.length) {
      // mapa sin spawns de equipo: los dos extremos del mapa
      const sp = [...m.map.spawns].sort((a, b) => a.p[0] - b.p[0]);
      this.spawnsOf.blue = sp.slice(0, 5); this.spawnsOf.red = sp.slice(-5);
    }
  }

  initActor(a) {
    a.ar = { money: Math.round(ECON.start * this.econMul), armor: 0, bandage: 0, healT: 0, bought: [], style: pick(STYLES), dmg: 0 };
    a.respawnT = Infinity;
  }
  get frozen() { return this.phase === 'buy' || this.phase === 'pre'; }
  // Escala de tiempo del final de ronda (la App la combina con la pausa y la micropausa)
  get timeScale() { return this.slow > 0 ? 0.3 : 1; }
  alive(team) { return this.m.actors.filter(a => a.team === team && a.alive); }

  // ---------------- Rondas ----------------
  // Antes de la infiltración: cada uno en su base (sin interfaz de ronda)
  placeAll() { const idx = { blue: 0, red: 0 }; for (const a of this.m.actors) this.respawn(a, idx[a.team]++); }
  begin() { this.startRound(); }

  startRound() {
    const m = this.m;
    this.round++;
    this.phase = 'buy'; this.t = ECON.buyTime; this.slow = 0; this.lastKill = null;
    // limpiar restos de la ronda anterior
    for (const p of m.pickups) m.dropMesh(p.mesh);
    m.pickups.length = 0;
    for (const p of m.projectiles) m.scene.remove(p.mesh);
    m.projectiles.length = 0;
    m.fx.clear && m.fx.clear();
    if (m.death) m.death.finish(false);
    this.spectating = null;
    const idx = { blue: 0, red: 0 };
    for (const a of m.actors) this.respawn(a, idx[a.team]++);
    for (const a of m.actors) if (a.isBot) this.botBuy(a);
    this.planRoute();
    this.ui.roundStart();
    play('match');
  }

  respawn(a, i) {
    const m = this.m, sp = this.spawnsOf[a.team], s = sp[i % sp.length];
    const survived = a.alive && this.round > 1;
    // armas: si sobreviviste conservas todo (con munición rellena); si no, P9 + cuchillo
    if (!survived) {
      a.slots = [null, { id: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve }, { id: 'knife', mag: Infinity, reserve: 0 }];
      a.ar.armor = 0;
    } else {
      for (const w of a.slots) if (w && w.id !== 'knife') { const d = WEAPONS[w.id]; w.mag = this.magOf(w.id); w.reserve = this.reserveOf(w.id); void d; }
    }
    a.ar.bought = []; a.ar.healT = 0;
    a.slot = a.slots[0] ? 0 : 1; a.lastSlot = a.slots[0] ? 1 : 2;
    a.reloadT = 0; a.fireCd = 0; a.burstLeft = 0; a.ads = 0; a.bloom = 0; a.drawT = 0;
    Object.assign(a.pos, { x: s.p[0], y: s.p[1], z: s.p[2] });
    Object.assign(a.vel, { x: 0, y: 0, z: 0 });
    a.yaw = s.yaw; a.pitch = 0; a.hp = 100; a.alive = true; a.onGround = true; a.crouching = false; a.crouch = 0;
    a.spawnShield = 0; a.deadT = 0; a.damageBy.clear(); a.lastHitBy = null; a.spawnTime = m.time; a.respawnT = Infinity;
    a.soldier.root.visible = !a.isLocal;
    if (a.isLocal) {
      m.controller.deathCam = null;
      m.controller.recPitch = m.controller.recYaw = 0;
      m.onSwitch(a);
      m.app.ui.hud.onSpawn(m);
      m.vm.play('raise', 0.8);
    } else {
      a.brain.reset();
      m.onSwitch(a);
    }
  }
  magOf(id) { return id === 'boomer' ? 2 : WEAPONS[id].mag; }
  reserveOf(id) { return id === 'boomer' ? 0 : WEAPONS[id].reserve; }

  // Ruta del equipo: en rangos altos los bots empujan JUNTOS por la misma calle
  planRoute() {
    const m = this.m, coord = !!(m.diff && m.diff.coord);
    const lanes = [-0.6, 0, 0.6];
    for (const team of ['blue', 'red']) {
      const lane = pick(lanes), sx = team === 'blue' ? 1 : -1;
      for (const a of this.alive(team)) {
        if (!a.brain) continue;
        const z = (coord ? lane : pick(lanes)) * m.map.bounds.z + R(-2, 2);
        const x = sx * R(0, m.map.bounds.x * 0.25);
        const n = nearestNode(m.nav, x, 0, z);
        if (n < 0) continue;
        const nn = m.nav.nodes[n];
        a.brain.goal = { x: nn.x, y: nn.y, z: nn.z }; a.brain.goalT = m.time + ECON.buyTime + R(9, 14); a.brain.reachedGoal = false; a.brain.path = null;
      }
    }
  }

  update(dt) {
    const m = this.m;
    if (this.slow > 0) this.slow = Math.max(0, this.slow - dt / 0.3); // dt viene escalado: se descuenta en tiempo real
    // curaciones en curso
    for (const a of m.actors) if (a.ar.healT > 0 && a.alive) {
      a.ar.healT -= dt;
      a.hp = Math.min(100, a.hp + GEAR.bandage.heal / GEAR.bandage.use * dt);
      if (a.isLocal) m.app.ui.hud.setHealth(a);
      if (a.ar.healT <= 0) { a.ar.healT = 0; if (a.isLocal) play('heal'); }
    }
    if (this.phase === 'buy') {
      const before = Math.ceil(this.t);
      this.t -= dt;
      if (Math.ceil(this.t) !== before && before <= 3 && before > 0) play('tick');
      if (this.t <= 0) this.goLive();
    } else if (this.phase === 'live') {
      this.t -= dt;
      const before = Math.ceil(this.t + dt);
      if (Math.ceil(this.t) !== before && before <= 10 && before > 0) play('tick');
      if (this.t <= 0) this.timeout();
      // bots: vendarse si están heridos y no ven a nadie
      for (const a of m.actors) if (a.isBot && a.alive && a.ar.bandage > 0 && a.hp < 55 && a.ar.healT <= 0 && !(a.brain.target && a.brain.targetVisible)) this.useBandage(a);
    } else if (this.phase === 'post') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.decided) { this.phase = 'over'; m.end(); }
        else this.startRound();
      }
    }
    this.ui.update(dt);
  }

  goLive() {
    this.phase = 'live'; this.t = this.fmt.round;
    this.ui.goLive();
    this.m.app.ui.hud.announce(this.matchPoint() ? 'MATCH POINT' : 'FIGHT', this.matchPoint() ? 'red' : 'gold');
    play('streak');
  }
  matchPoint() { const s = this.m.teamScore, w = this.fmt.win; return s.blue === w - 1 || s.red === w - 1; }

  timeout() {
    // gana quien tenga más operadores vivos; empate → más vida total; empate total → la ronda es para quien defendía menos rondas
    const b = this.alive('blue'), r = this.alive('red');
    const hp = (L) => L.reduce((s, a) => s + a.hp, 0);
    let w;
    if (b.length !== r.length) w = b.length > r.length ? 'blue' : 'red';
    else if (hp(b) !== hp(r)) w = hp(b) > hp(r) ? 'blue' : 'red';
    else w = this.m.teamScore.blue <= this.m.teamScore.red ? 'blue' : 'red';
    this.endRound(w, 'time');
  }

  // Llamado desde Match.kill
  onKill(v, k, weaponId) {
    const m = this.m;
    v.respawnT = Infinity;
    v.ar.healT = 0;
    if (k && k !== v && k.team !== v.team) {
      const close = weaponId === 'knife' || weaponId === 'brute';
      const pay = Math.round((close ? ECON.killClose : ECON.kill) * this.econMul);
      this.earn(k, pay, close ? 'CLOSE-RANGE KILL' : 'KILL');
    }
    this.lastKill = { v, k, t: m.time };
    if (this.phase !== 'live') return;
    const b = this.alive('blue').length, r = this.alive('red').length;
    if (!b || !r) this.endRound(b ? 'blue' : 'red', 'elim');
    else if (m.me.alive) {
      // aviso de "último en pie"
      const mine = this.alive(m.me.team).length, theirs = this.alive(other(m.me.team)).length;
      if (mine === 1 && this.size > 1 && !this.clutchShown) { this.clutchShown = true; m.app.ui.hud.announce(`1 VS ${theirs} · CLUTCH`, 'red'); }
    }
  }

  earn(a, n, why) {
    a.ar.money = Math.min(ECON.max, a.ar.money + n);
    if (a.isLocal) this.ui.moneyPop(n, why);
  }

  endRound(winner, reason) {
    const m = this.m;
    if (this.phase !== 'live') return;
    this.phase = 'post'; this.t = ECON.postTime; this.clutchShown = false;
    m.teamScore[winner]++;
    this.history.push(winner);
    const loser = other(winner);
    this.lossStreak[winner] = 0; this.lossStreak[loser]++;
    const lose = Math.min(ECON.loseMax, ECON.lose + ECON.loseStep * (this.lossStreak[loser] - 1));
    for (const a of m.actors) this.earn(a, Math.round((a.team === winner ? ECON.win : lose) * this.econMul), a.team === winner ? 'ROUND WON' : 'ROUND LOSS BONUS');
    this.decided = m.teamScore[winner] >= this.fmt.win;
    // cámara lenta de la última baja (si fue hace nada) y marcador gigante
    if (this.lastKill && m.time - this.lastKill.t < 0.6) { this.slow = 1.3; play('slowmo'); }
    if (this.decided) this.t = 2.2;
    this.ui.roundEnd(winner, reason, this.decided);
    play(winner === m.me.team ? 'victory' : 'defeat');
  }

  // Tras la secuencia de muerte: modo espectador (cámara detrás de un compañero vivo)
  afterDeath() {
    const m = this.m;
    if (m.death) { const d = m.death; m.death = null; d.finish(false); }
    m.controller.deathCam = null; // a partir de aquí la cámara es del espectador (lateUpdate)
    this.specSnap = true;
    this.spectate(1);
  }
  spectate(dir = 1) {
    const mates = this.alive(this.m.me.team);
    if (!mates.length) {
      // sin compañeros vivos: la cámara de muerte vuelve a mirar a quien te mató
      this.spectating = null; this.ui.spectate(null);
      const me = this.m.me; if (!me.alive && !this.m.controller.deathCam) this.m.controller.startDeathCam(me.lastKiller && me.lastKiller.alive ? me.lastKiller : null);
      return;
    }
    const i = mates.indexOf(this.spectating);
    this.spectating = mates[(i + dir + mates.length) % mates.length];
    this.specSnap = true;
    this.ui.spectate(this.spectating);
  }
  // Cámara: se aplica después de la del jugador (Match.update)
  lateUpdate(dt) {
    const m = this.m, me = m.me, cam = m.app.camera;
    if (me.alive || m.death) return;
    if (this.spectating && !this.spectating.alive) this.spectate(1);
    const s = this.spectating;
    if (!s) return;
    const eye = V(s.pos.x, s.pos.y + s.eyeH, s.pos.z);
    const fwd = V(-Math.sin(s.yaw), 0, -Math.cos(s.yaw)), right = V(Math.cos(s.yaw), 0, -Math.sin(s.yaw));
    const want = eye.clone().addScaledVector(fwd, -2.4).addScaledVector(right, 0.55).add(V(0, 0.45, 0));
    const dv = want.clone().sub(eye), L = dv.length(); dv.normalize();
    const hit = m.raycast(eye, dv, L);
    if (hit) want.copy(eye).addScaledVector(dv, Math.max(0.3, hit.t - 0.25));
    // al cambiar de compañero la cámara salta (no cruza el mapa); después le sigue con suavidad
    if (this.specSnap || this.lastSpec !== s) { cam.position.copy(want); this.lastSpec = s; }
    else cam.position.lerp(want, Math.min(1, dt * 10));
    const look = eye.clone().addScaledVector(fwd, 12).add(V(0, Math.sin(s.pitch) * 12, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(cam.position, look, V(0, 1, 0)));
    if (this.specSnap) { cam.quaternion.copy(q); this.specSnap = false; } else cam.quaternion.slerp(q, Math.min(1, dt * 8));
    const fov = m.app.profile.settings.fov; if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }

  // ---------------- Compras ----------------
  canBuy(a) { return this.phase === 'buy' && a.alive; }
  owns(a, id) {
    if (GEAR[id]) return id === 'bandage' ? a.ar.bandage > 0 : a.ar.armor >= GEAR[id].armor;
    return a.slots.some(w => w && w.id === id);
  }
  price(id) { return GEAR[id] ? GEAR[id].price : PRICES[id]; }

  buy(a, id) {
    if (!this.canBuy(a)) return 'phase';
    // volver a pulsar algo comprado en esta ronda = devolverlo
    const bi = a.ar.bought.findIndex(b => b.id === id);
    if (bi >= 0) return this.sell(a, bi);
    if (this.owns(a, id)) return 'owned';
    const price = this.price(id);
    if (a.ar.money < price) return 'money';
    a.ar.money -= price;
    if (GEAR[id]) {
      if (id === 'bandage') a.ar.bandage = 1;
      else { a.ar.bought.push({ id, price, prevArmor: a.ar.armor }); a.ar.armor = Math.max(a.ar.armor, GEAR[id].armor); if (a.isLocal) play('armorUp'); return 'ok'; }
      a.ar.bought.push({ id, price });
      if (a.isLocal) play('buy');
      return 'ok';
    }
    const def = WEAPONS[id], slot = def.slot === 2 ? 1 : 0;
    a.ar.bought.push({ id, price, slot, prev: a.slots[slot] });
    a.slots[slot] = { id, mag: this.magOf(id), reserve: this.reserveOf(id) };
    a.slot = slot; a.drawT = 0;
    this.m.onSwitch(a);
    if (a.isLocal) { play('buy'); this.m.app.ui.hud.setSlots(a); }
    return 'ok';
  }
  sell(a, bi) {
    const b = a.ar.bought[bi];
    a.ar.bought.splice(bi, 1);
    a.ar.money += b.price;
    if (b.id === 'bandage') a.ar.bandage = 0;
    else if (GEAR[b.id]) a.ar.armor = b.prevArmor;
    else {
      a.slots[b.slot] = b.prev;
      a.slot = a.slots[0] ? 0 : 1;
      this.m.onSwitch(a);
      if (a.isLocal) this.m.app.ui.hud.setSlots(a);
    }
    if (a.isLocal) play('ui');
    return 'sold';
  }

  // IA de compra: ronda de pistolas, ahorro (eco), compra parcial o compra completa
  botBuy(a) {
    const M = a.ar.money, has = (id) => this.owns(a, id);
    const primary = a.slots[0] && a.slots[0].id;
    const tryBuy = (id) => { if (!has(id) && a.ar.money >= this.price(id)) this.buy(a, id); };
    if (this.round === 1) {
      if (Math.random() < 0.55) tryBuy('vest'); else tryBuy('rhino');
      return;
    }
    if (!primary) {
      const full = a.ar.style.find(id => PRICES[id] + 1000 <= M) || a.ar.style.find(id => PRICES[id] + 400 <= M);
      if (full) this.buy(a, full);
      else if (M >= 2000) this.buy(a, pick(['viper', 'vecta', 'brute']));
      else if (M < 1500) { if (Math.random() < 0.5) tryBuy('rhino'); return; } // eco
    }
    tryBuy(a.ar.money >= 1000 ? 'heavy' : 'vest');
    if (a.ar.money >= 600 && Math.random() < 0.6) tryBuy('bandage');
  }

  useBandage(a) {
    if (!a.alive || a.ar.bandage <= 0 || a.ar.healT > 0 || a.hp >= 100) return false;
    a.ar.bandage = 0; a.ar.healT = GEAR.bandage.use;
    if (a.isLocal) { play('heal'); this.m.app.ui.hud.toast('HEALING…'); }
    return true;
  }

  // Blindaje: absorbe la mitad del daño hasta agotarse
  absorb(v, amount) {
    if (!v.ar || v.ar.armor <= 0) return amount;
    const soak = Math.min(v.ar.armor, amount * 0.5);
    v.ar.armor -= soak;
    if (v.ar.armor <= 0.5) { v.ar.armor = 0; if (v.isLocal) play('armorBreak'); }
    return amount - soak;
  }

  // Rendimiento 0..1 para los RP: K/D y cuota de daño del equipo
  perf() {
    const me = this.m.me, team = this.m.actors.filter(a => a.team === me.team);
    const tDmg = team.reduce((s, a) => s + (a.ar.dmg || 0), 0);
    const share = tDmg > 0 ? me.ar.dmg / tDmg : 0;
    const kd = me.kills / Math.max(1, me.deaths);
    return Math.max(0, Math.min(1, 0.5 * Math.min(1, kd / 2) + 0.5 * Math.min(1, share * this.size)));
  }

  dispose() { this.ui.dispose(); }
}
