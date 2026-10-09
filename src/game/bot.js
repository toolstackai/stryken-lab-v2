// Cerebro de bot: percepción (vista/oído), navegación por la malla y combate con puntería "humana".
import { nearestNode, findPath } from '../core/nav.js';
import { clearLine } from '../core/physics.js';
import { WEAPONS } from '../data/weapons.js';

const R = (a, b) => a + Math.random() * (b - a);
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

export class BotBrain {
  constructor(actor, diff) {
    this.a = actor; this.diff = diff;
    this.target = null; this.seenT = 0; this.react = 0; this.lastSeen = null; this.lastSeenT = -99;
    this.path = null; this.pi = 0; this.goal = null; this.repathT = 0;
    this.think = Math.random() * 0.2; this.strafe = 1; this.strafeT = 0;
    this.errYaw = 0; this.errPitch = 0; this.aimHead = false;
    this.semiT = 0; this.burstShots = 0; this.burstPause = 0;
    this.stuckT = 0; this.lastPos = { x: 0, z: 0 }; this.jumpT = 0; this.crouchT = 0;
    this.heard = null; this.desiredYaw = actor.yaw; this.desiredPitch = 0;
    this.skill = R(0.85, 1.15); // variación entre bots
  }

  reset() { this.target = null; this.path = null; this.goal = null; this.lastSeen = null; this.heard = null; this.burstShots = 0; }

  hear(pos, now) { if (!this.target) this.heard = { ...pos, t: now }; }
  hurtBy(attacker, now) {
    if (!attacker || attacker === this.a) return;
    this.hurtByA = attacker; this.hurtT = now;
    // al recibir un impacto el pulso se va (no siguen clavados en tu cabeza mientras les disparas)
    const f = this.diff.flinch || 0; this.errYaw += R(-f, f); this.errPitch += R(-f, f) * 0.6;
    if (!this.target || !this.targetVisible) { this.lastSeen = { ...attacker.pos }; this.lastSeenT = now; this.heard = { ...attacker.pos, t: now }; }
  }

  enemies(match) { return match.actors.filter(o => o !== this.a && o.alive && !o.brAir && (!match.mode.teams || o.team !== this.a.team)); }

  canSee(match, o, fovCheck = true) {
    const a = this.a;
    const dx = o.pos.x - a.pos.x, dz = o.pos.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > (match.br ? 48 : 85)) return false;
    if (fovCheck && d > 4) {
      const da = Math.abs(angDiff(yawTo(dx, dz), a.yaw));
      if (da > 1.25) return false;
    }
    const ey = a.pos.y + a.eyeH;
    return clearLine(match.col, a.pos.x, ey, a.pos.z, o.pos.x, o.pos.y + o.height - 0.15, o.pos.z) ||
      clearLine(match.col, a.pos.x, ey, a.pos.z, o.pos.x, o.pos.y + o.height * 0.6, o.pos.z);
  }

  update(match, dt) {
    const a = this.a, now = match.time, wd = a.wdef;
    const input = { fwd: 0, right: 0, jump: false, crouch: false, sprint: false, trigger: false, ads: false };
    this.think -= dt;
    if (this.think <= 0) {
      this.think = R(0.12, 0.2);
      // percepción: elegir el enemigo visible más cercano
      let best = null, bd = 1e9;
      for (const o of this.enemies(match)) {
        const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
        // battle royale: sin arma de fuego se busca botín antes que pelea (salvo si te atacan o lo tienes encima)
        if (match.br && d > 9 && !(this.hurtByA === o && now - this.hurtT < 6) && !a.slots.some((w, i) => i < 2 && w && (w.mag > 0 || w.reserve > 0))) continue;
        // herido y con curas: primero curarse (se aparta de peleas lejanas)
        // entre bots se pelea a menos distancia: el jugador es quien más llama la atención
        if (match.br && o.isBot && d > 30 && !(this.hurtByA === o && now - this.hurtT < 6)) continue;
        if (match.br && a.hp < 45 && d > 14 && a.heals && (a.heals.bandage || a.heals.medkit) && now - (this.hurtT || -99) > 3) continue;
        const fov = !(this.target === o && this.targetVisible);
        if (d < bd && this.canSee(match, o, fov)) { bd = d; best = o; }
      }
      if (best) {
        if (best !== this.target) {
          this.target = best;
          this.react = R(...this.diff.react) / this.skill + (match.br ? 0.35 : 0); // en BR nadie espera al enemigo: tarda más en reaccionar
          const e = this.diff.aimErr / this.skill;
          this.errYaw = R(-e, e) * 2.2; this.errPitch = R(-e, e);
          this.aimHead = Math.random() < (this.diff.head ?? 0.25) * this.skill;
        }
        this.targetVisible = true;
        this.lastSeen = { ...best.pos }; this.lastSeenT = now;
      } else {
        this.targetVisible = false;
        if (this.target && (!this.target.alive || now - this.lastSeenT > 3)) this.target = null;
      }
    }
    if (this.target && !this.target.alive) { this.target = null; this.targetVisible = false; }

    // ---------- Armas ----------
    const w = a.weapon;
    if (!match.mode.knifeOnly) {
      const prim = a.slots[0], sec = a.slots[1], has = (s) => s && (s.mag > 0 || s.reserve > 0);
      if (a.slot === 0 && prim && !has(prim) && has(sec)) a.switchTo(1) && match.onSwitch(a);
      else if (a.slot === 1 && has(prim) && !this.targetVisible) a.switchTo(0) && match.onSwitch(a);
      else if (a.slot === 2) { if (has(prim) || (prim && !has(sec))) a.switchTo(0) && match.onSwitch(a); else if (sec) a.switchTo(1) && match.onSwitch(a); }
      else if (match.br && a.slot !== 2 && !has(a.weapon) && !has(a.slot === 0 ? sec : prim)) a.switchTo(2) && match.onSwitch(a);
    }
    if (w && wd.slot !== 3 && w.mag === 0 && !a.busy) { if (a.startReload()) match.onReload(a); }
    else if (w && wd.slot !== 3 && !this.target && w.mag < wd.mag * 0.4 && !a.busy && now - this.lastSeenT > 2) { if (a.startReload()) match.onReload(a); }

    // ---------- Movimiento ----------
    let moveTo = null, wantDist = 0;
    const kind = wd.kind;
    const prefer = kind === 'SNIPER' ? 30 : kind === 'MARKSMAN' ? 20 : kind === 'SHOTGUN' ? 4 : kind === 'MELEE' ? 0 : kind === 'SMG' ? 9 : 15;
    if (this.target && this.targetVisible) {
      const t = this.target;
      const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
      if (d > prefer + 6 || kind === 'MELEE') { moveTo = t.pos; wantDist = prefer; }
      // strafe de combate
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeT = R(0.35, 1.1); if (Math.random() < 0.15) this.strafe = 0; }
    } else if (this.lastSeen && now - this.lastSeenT < 6) {
      moveTo = this.lastSeen;
    } else if (this.heard && now - this.heard.t < 6 && !(match.br && (!a.slots.some((w, i) => i < 2 && w) || a.hp < 60 || this.a.id % 2))) {
      moveTo = this.heard;
    }
    let run = false;
    if (!moveTo && match.br) { const g = match.br.botGoal(this, now); if (g) { moveTo = g; run = !!g.run; } }
    if (!moveTo) {
      // patrulla: ir hacia la zona de algún enemigo (los jugadores reales también se buscan)
      if (!this.goal || this.reachedGoal || now > this.goalT) {
        const en = this.enemies(match);
        const pick = en.length && Math.random() < 0.6 ? en[Math.floor(Math.random() * en.length)].pos : null;
        const nodes = match.nav.mainNodes;
        const n = pick ? nearestNode(match.nav, pick.x + R(-8, 8), pick.y, pick.z + R(-8, 8)) : nodes[Math.floor(Math.random() * nodes.length)];
        const nn = n >= 0 ? match.nav.nodes[n] : match.nav.nodes[nodes[0]];
        this.goal = { x: nn.x, y: nn.y, z: nn.z }; this.goalT = now + R(8, 16); this.reachedGoal = false; this.path = null;
      }
      moveTo = this.goal;
    }

    let mx = 0, mz = 0;
    if (moveTo) {
      const dToGoal = Math.hypot(moveTo.x - a.pos.x, moveTo.z - a.pos.z);
      if (dToGoal > wantDist + 0.8) {
        this.repathT -= dt;
        // como mucho 2 búsquedas A* por fotograma entre todos los bots (el resto espera su turno sin parar de andar)
        if (match.pathT !== now) { match.pathT = now; match.pathN = 0; }
        if ((!this.path || this.repathT <= 0 || this.pi >= this.path.length) && now >= (this.noPathT || 0) && match.pathN < 2) {
          match.pathN++;
          this.repathT = this.targetVisible ? 0.6 : 1.5;
          const s = nearestNode(match.nav, a.pos.x, a.pos.y, a.pos.z), g = nearestNode(match.nav, moveTo.x, moveTo.y, moveTo.z);
          // en mapas grandes la búsqueda se limita según la distancia: un destino inalcanzable ya no recorre toda la isla
          const far = Math.hypot(moveTo.x - a.pos.x, moveTo.z - a.pos.z) / (match.nav.cell || 1);
          const gn = g >= 0 ? match.nav.nodes[g] : null;
          this.path = gn && Math.hypot(gn.x - moveTo.x, gn.z - moveTo.z) < 4 ? findPath(match.nav, s, g, 3000 + far * far * 8) : null; this.pi = 1;
          // sin camino: no reintentar cada fotograma
          if (!this.path) { if (this.brGoal && this.brGoal.it) this.brGoal.it.bad = (this.brGoal.it.bad || 0) + 1; this.goal = null; this.brGoal = null; this.noPathT = now + 1.2; }
        }
        if (this.path && this.pi < this.path.length) {
          const n = match.nav.nodes[this.path[this.pi]];
          const dx = n.x - a.pos.x, dz = n.z - a.pos.z, d = Math.hypot(dx, dz);
          if (d < 0.6 && Math.abs(n.y - a.pos.y) < 1.4) this.pi++;
          else { mx = dx / d; mz = dz / d; if (n.y - a.pos.y > 0.5 && d < 1.6 && a.onGround) input.jump = true; }
        } else { mx = (moveTo.x - a.pos.x) / dToGoal; mz = (moveTo.z - a.pos.z) / dToGoal; }
      } else if (moveTo === this.goal) this.reachedGoal = true;
    }

    // atasco: saltar y re-planificar
    const moved = Math.hypot(a.pos.x - this.lastPos.x, a.pos.z - this.lastPos.z);
    this.lastPos.x = a.pos.x; this.lastPos.z = a.pos.z;
    if ((mx || mz) && moved < 0.01 * dt * 60) { this.stuckT += dt; if (this.stuckT > 0.5) { input.jump = true; this.path = null; this.stuckT = 0; if (Math.random() < 0.3) this.goal = null; } }
    else this.stuckT = 0;

    // ---------- Puntería ----------
    let fighting = false;
    if (this.target && this.targetVisible) {
      const t = this.target;
      const aimY = this.aimHead ? t.pos.y + t.height - 0.14 : t.pos.y + t.height * 0.68;
      const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z, dy = aimY - (a.pos.y + a.eyeH);
      const hd = Math.hypot(dx, dz);
      // anticipar un poco el movimiento del objetivo
      const lead = Math.min(0.12, hd / 300);
      // temblor permanente (nadie apunta perfecto) + más error cuanto más rápido se mueve el objetivo
      const wob = this.diff.wobble || 0, ph = now * 1.7 + this.a.id * 3.1;
      const moving = Math.min(1, Math.hypot(t.vel.x, t.vel.z) / 6) * wob * 1.5;
      this.desiredYaw = yawTo(dx + t.vel.x * lead, dz + t.vel.z * lead) + this.errYaw + (Math.sin(ph) + Math.sin(ph * 2.3)) * 0.5 * (wob + moving);
      this.desiredPitch = Math.atan2(dy, hd) + this.errPitch + Math.sin(ph * 1.6 + 1) * 0.5 * wob;
      const decay = Math.exp(-dt * (this.diff.settle || 2.2) * this.skill);
      this.errYaw *= decay; this.errPitch *= decay;
      fighting = true;
      this.react -= dt;
    } else if (this.heard && now - this.heard.t < 2.5 && !this.target) {
      this.desiredYaw = yawTo(this.heard.x - a.pos.x, this.heard.z - a.pos.z); this.desiredPitch = 0;
    } else if (mx || mz) {
      this.desiredYaw = yawTo(mx, mz); this.desiredPitch = 0;
    }
    const turn = this.diff.aimSpeed * this.skill * (fighting ? 1 : 0.6);
    const dyaw = angDiff(this.desiredYaw, a.yaw);
    a.yaw += Math.sign(dyaw) * Math.min(Math.abs(dyaw), (Math.abs(dyaw) * 7 + 0.6) * turn * dt * 0.35);
    a.pitch += (this.desiredPitch - a.pitch) * Math.min(1, dt * turn);

    // ---------- Disparo ----------
    if (fighting && this.react <= 0) {
      const t = this.target;
      const d = Math.hypot(t.pos.x - a.pos.x, t.pos.z - a.pos.z);
      const tol = Math.max(0.02, Math.atan2(0.35, d)) * (1.2 + (1 - this.diff.burstCtrl));
      const onTarget = Math.abs(angDiff(this.desiredYaw - this.errYaw, a.yaw)) < tol + Math.abs(this.errYaw) && Math.abs(this.desiredPitch - a.pitch) < tol * 1.5 + 0.03;
      const inRange = kind === 'MELEE' ? d < WEAPONS.knife.melee + 0.3 : d < (kind === 'SHOTGUN' ? 22 : kind === 'SMG' ? 45 : 85);
      if (kind === 'SNIPER' || kind === 'MARKSMAN' || (d > 18 && kind !== 'SHOTGUN' && kind !== 'SMG')) input.ads = true;
      if (onTarget && inRange && !a.busy) {
        if (this.burstPause > 0) this.burstPause -= dt;
        else if (wd.auto && wd.slot !== 3) {
          input.trigger = true;
          if (a.fireCd <= 0) this.burstShots++;
          const maxBurst = d > 25 ? 4 : d > 12 ? 7 : 14;
          if (this.burstShots >= maxBurst * this.diff.burstCtrl + 2) { this.burstShots = 0; this.burstPause = R(0.15, 0.35); }
        } else {
          this.semiT -= dt;
          if (this.semiT <= 0) { input.trigger = true; this.semiT = kind === 'SNIPER' ? R(0.3, 0.7) : R(0.12, 0.28) / this.skill; }
        }
      }
      // counter-strafe: frenar para disparar con precisión (rifles/snipers)
      const precise = kind === 'SNIPER' || kind === 'MARKSMAN' || kind === 'RIFLE' || kind === 'BURST' || kind === 'LMG';
      const stopToShoot = precise && (input.trigger || this.burstPause > 0) && Math.random() < this.diff.burstCtrl;
      if (!stopToShoot && kind !== 'SNIPER') {
        // strafe perpendicular al objetivo
        const px = -(t.pos.z - a.pos.z), pz = t.pos.x - a.pos.x, pl = Math.hypot(px, pz) || 1;
        mx += px / pl * this.strafe * 0.9; mz += pz / pl * this.strafe * 0.9;
      } else if (stopToShoot && !moveTo) { mx = 0; mz = 0; }
      if (stopToShoot) { mx *= 0.15; mz *= 0.15; }
      // agacharse a veces en duelos
      this.crouchT -= dt;
      if (this.crouchT <= 0) { this.crouching = Math.random() < 0.18 && kind !== 'MELEE'; this.crouchT = R(0.6, 1.6); }
      input.crouch = this.crouching;
      if (kind === 'MELEE' && d < 6 && Math.random() < 0.02) input.jump = true;
    } else this.crouching = false;

    // convertir dirección de mundo a entrada local
    const l = Math.hypot(mx, mz);
    if (l > 0.01) {
      mx /= Math.max(1, l); mz /= Math.max(1, l);
      const s = Math.sin(a.yaw), c = Math.cos(a.yaw);
      input.right = mx * c - mz * s;
      input.fwd = -mx * s - mz * c;
      input.sprint = (!fighting && input.fwd > 0.7 && !this.targetVisible) || (run && input.fwd > 0.7);
    }
    return input;
  }
}
