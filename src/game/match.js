// Una partida: mundo, actores (jugador + bots), combate, puntuación, fin de partida.
import * as THREE from 'three';
import { buildMapData } from '../data/maps.js';
import { MODES, DIFFICULTY, randomBotName, BOT_CHAT } from '../data/modes.js';
import { WEAPONS, damageAt, PRIMARIES } from '../data/weapons.js';
import { CHAR_SKINS, WEAPON_SKINS } from '../data/cosmetics.js';
import { makeCollider, raycastWorld, rayBox, clearLine, BODY } from '../core/physics.js';
import { buildNav } from '../core/nav.js';
import { buildWorld } from '../gfx/world.js';
import { makeSoldier, setSoldierWeapon, poseSoldier, makeGun, disposeSoldierCache } from '../gfx/models.js';
import { FX } from '../gfx/fx.js';
import { makeEnv } from '../gfx/env.js';
import { ViewModel } from '../gfx/viewmodel.js';
import { Actor } from './actor.js';
import { BotBrain } from './bot.js';
import { LocalController } from './player.js';
import { playShot, play, setListener, startAmbient, stopAmbient } from './audio.js';
import { Intro, Recorder, FinalKillcam } from './cine.js';
import { Podium } from '../gfx/podium.js';
import { DeathSeq } from './death.js';
import { disposeTree, bakeTree } from '../gfx/bake.js';
import { BattleRoyale } from './br.js';
import { propModel } from '../gfx/propmodels.js';
import { Arena } from './arena.js';
import { MOVE } from './actor.js';
import { diffForRank } from '../data/ranks.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const HIT_MAT = new THREE.MeshBasicMaterial({ color: 0xffb0a0 });
const SHADOW_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
function setShadowOnly(s, on) {
  s.root.traverse(o => {
    if (!o.isMesh) return;
    if (on && o.material !== SHADOW_ONLY) { o.userData.realMat = o.material; o.material = SHADOW_ONLY; }
    else if (!on && o.material === SHADOW_ONLY && o.userData.realMat) o.material = o.userData.realMat;
  });
}
const STREAKS = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'MULTI KILL', 5: 'KILLING SPREE', 7: 'RAMPAGE', 10: 'UNSTOPPABLE', 15: 'GODLIKE' };

export function dirFrom(yaw, pitch) {
  const cp = Math.cos(pitch);
  return V(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
}

export class Match {
  constructor(app, opts) {
    this.app = app;
    this.modeId = opts.mode;
    this.mode = { ...MODES[opts.mode], ...(opts.overrides || {}) };
    // mapa al azar dentro de la lista del modo (si no se eligió uno)
    this.mapId = opts.map || (this.mode.maps ? pick(this.mode.maps) : this.mode.map);
    // clasificatoria: la dificultad de los bots sigue a tu rango (contra bots el elo no mide nada real)
    this.ranked = this.mode.list === 'ranked' && !opts.unranked;
    this.diff = this.ranked ? diffForRank((app.profile.ranked || {}).rp || 0) : DIFFICULTY[opts.difficulty || 'normal'];
    // modo rotativo "gravedad baja"
    this.gravity0 = MOVE.gravity; if (this.mode.gravity) MOVE.gravity = this.gravity0 * this.mode.gravity;
    this.time = 0; this.timeLeft = this.mode.time; this.ended = false; this.endT = 0;
    this.teamScore = { blue: 0, red: 0 };
    this.projectiles = []; this.pickups = []; this.timers = [];
    this.stats = { shots: 0, hits: 0, headshots: 0, bestStreak: 0, damage: 0 };
    this.wkills = {};
    this.medals = {}; this.firstBlood = false;
    this.phase = 'intro'; this.introShown = true;
    this.rec = new Recorder();

    // ---- Mundo ----
    const map = this.map = buildMapData(this.mapId);
    // evento nocturno: cielo, niebla y luces de luna ANTES de construir el mundo (el cielo y el entorno salen de aquí)
    if (this.mode.night) { map.night = true; map.sky = { top: '#02040c', mid: '#0c1636', bottom: '#1a2444' }; map.fog = { ...map.fog, color: 0x0a1020 }; }
    this.col = makeCollider(map.collision);
    this.nav = buildNav(this.col, map.bounds, map.spawns.map(s => s.p), map.navCell || 1);
    const scene = this.scene = new THREE.Scene();
    scene.fog = new THREE.Fog(map.fog.color, map.fog.near, map.fog.far);
    scene.background = new THREE.Color(map.fog.color);
    const q = app.profile.settings.quality;
    const { group, anim } = buildWorld(map, scene, q);
    scene.add(group); this.anim = anim; this.worldGroup = group;
    const hemi = new THREE.HemisphereLight(map.hemi.sky, map.hemi.ground, map.hemi.i); scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(map.sun.color, map.sun.intensity);
    const sd = V(...map.sun.dir).normalize();
    const ext = Math.max(map.bounds.x, map.bounds.z) + 6;
    sun.position.copy(sd).multiplyScalar(120); sun.target.position.set(0, 0, 0);
    sun.castShadow = q !== 'low';
    sun.shadow.mapSize.set(2048, 2048); // 4096 costaba 4× más memoria y relleno sin diferencia visible a esta distancia
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 20, far: 260 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);
    if (this.mode.night) this.makeNight(hemi, sun, map);
    this.fx = new FX(scene);
    this.vm = new ViewModel();
    const env = makeEnv(app.renderer, map.sky.top, map.sky.mid, map.indoor ? '#2a2a2e' : '#6a665c');
    scene.environment = env; scene.environmentIntensity = map.indoor ? 0.35 : 0.45;
    this.vm.scene.environment = env; this.vm.scene.environmentIntensity = map.indoor ? 0.5 : 0.6;
    this.vm.onEvent = (ev) => play(ev);
    // las miras telescópicas pintan el mundo aumentado en su lente
    this.vm.world = { scene, camera: app.camera }; this.vm.pipSize = q === 'low' ? 256 : q === 'medium' ? 384 : 512;

    // ---- Actores ----
    this.actors = [];
    const P = app.profile;
    const me = this.me = new Actor({ name: P.name, isLocal: true, skin: P.charSkin, weaponSkins: P.weaponSkins });
    me.team = this.mode.teams ? 'blue' : null;
    this.addActor(me);
    const total = opts.bots != null ? opts.bots + 1 : this.mode.players;
    const party = (P.party || []).slice(0, 2);
    for (let i = 1; i < total; i++) {
      const pm = party[i - 1];
      const team = this.mode.teams ? (i < total / 2 ? 'blue' : 'red') : null;
      this.addBot(pm ? pm.name : (opts.names && opts.names[i - 1]) || randomBotName(), team, pm ? pm.skin : null, true);
    }
    this.controller = new LocalController(this, me, app.input, this.vm, app.camera);
    this.nextChurn = R(35, 70);
    this.nextChat = R(15, 35);
    this.lookTarget = null; this.lookT = 0;

    // primeros spawns
    for (const a of this.actors) if (!a.isLocal) this.spawn(a);
    this.spawn(me);
    if (this.mode.arena) { this.arena = new Arena(this, opts); this.arena.placeAll(); }
    startAmbient(this.mapId);
    // battle royale: todos al avión (sin infiltración)
    if (this.mode.br) { this.br = new BattleRoyale(this); this.phase = 'live'; }
    this.warmup();
    // infiltración: el mundo se ve pero nadie se mueve hasta que la cámara entra en primera persona
    if (!this.br) this.intro = new Intro(this);
    this.onSkip = (e) => {
      if (e.type === 'keydown' && !['Escape', 'Space', 'Enter'].includes(e.code)) return;
      if (this.phase === 'intro') { this.intro.skip(); if (e.type === 'mousedown') this.app.input.lock(); }
      else if (this.phase === 'killcam') this.kc.skip();
      else if (this.phase === 'live' && this.death && e.code !== 'Escape') this.death.skip();
      else if (this.phase === 'podium' && this.podium && this.podium.t > 1.2) this.toRewards();
    };
    addEventListener('keydown', this.onSkip); addEventListener('mousedown', this.onSkip);
  }

  // Evento "Noche en Korva": luz de luna, niebla oscura y linterna del jugador
  makeNight(hemi, sun, map) {
    const s = this.scene;
    hemi.color.set(0x5a6a9a); hemi.groundColor.set(0x101418); hemi.intensity = 0.32;
    sun.color.set(0x9ab4ff); sun.intensity = 0.35;
    s.fog.color.set(0x0a1020); s.fog.near = 12; s.fog.far = 95; s.background = new THREE.Color(0x070b16);
    this.nightFog = s.fog.color.clone();
    const fl = this.flashlight = new THREE.SpotLight(0xfff2d8, 26, 42, 0.42, 0.55, 1.4);
    fl.castShadow = false; s.add(fl, fl.target);
    // cielo: estrellas (con un leve centelleo) y luna con halo, en la dirección de la luz de luna
    const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08, th = u * Math.PI * 2, ph = Math.acos(1 - v);
      const r = 520; pos.set([Math.sin(ph) * Math.cos(th) * r, Math.cos(ph) * r, Math.sin(ph) * Math.sin(th) * r], i * 3);
      const w = 0.6 + Math.random() * 0.4, b = Math.random() < 0.15; col.set([w * (b ? 0.8 : 1), w * (b ? 0.9 : 1), w], i * 3);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = this.stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: 0.9, depthWrite: false }));
    stars.renderOrder = -1; s.add(stars);
    const sd = new THREE.Vector3(...map.sun.dir).normalize();
    const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ color: 0xe8eeff, fog: false }));
    moon.position.copy(sd).multiplyScalar(480); moon.lookAt(0, 0, 0); s.add(moon);
    const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hg = hc.getContext('2d');
    const gr = hg.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(190,210,255,.55)'); gr.addColorStop(1, 'rgba(190,210,255,0)'); hg.fillStyle = gr; hg.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), fog: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.setScalar(150); halo.position.copy(moon.position).multiplyScalar(1.01); s.add(halo);
    this.moonSky = [stars, moon, halo];
  }
  updateNight() {
    const fl = this.flashlight; if (!fl) return;
    const cam = this.app.camera, d = new THREE.Vector3(); cam.getWorldDirection(d);
    fl.position.copy(cam.position).addScaledVector(d, 0.3).add(new THREE.Vector3(0, -0.15, 0));
    fl.target.position.copy(cam.position).addScaledVector(d, 10);
    fl.visible = this.me.alive && !this.me.brAir;
    if (this.scene.fog && this.nightFog) this.scene.fog.color.copy(this.nightFog); // el BR cambia la niebla con la tormenta: de noche manda la luna
    // el cielo nocturno acompaña a la cámara (está "en el infinito")
    for (const o of this.moonSky) { if (!o.userData.base) o.userData.base = o.position.clone(); o.position.copy(o.userData.base).add(cam.position); }
    this.stars.material.opacity = 0.75 + Math.sin(this.time * 1.7) * 0.08;
  }

  // Compila todos los shaders de una vez (incluidos efectos ocultos) para evitar tirones la primera vez que aparecen
  warmup() {
    const r = this.app.renderer, hidden = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    try { r.compile(this.scene, this.app.camera); r.compile(this.vm.scene, this.vm.camera); } catch (e) { /* no crítico */ }
    for (const o of hidden) o.visible = false;
  }

  // Fin de la infiltración: primera persona, levantar el arma y armar el HUD
  startLive() {
    this.intro.finish();
    this.phase = 'live';
    const me = this.me;
    me.spawnShield = 1.5; me.spawnTime = this.time;
    this.vm.play('raise', 1.05);
    play('draw');
    // momento de apertura (skill game-designer): destello y pequeño golpe de cámara al tomar el control
    this.app.feel.hit('small', { trauma: 0.22, fov: 2.5 });
    if (!this.app.profile.settings.reduceFlash) this.app.feel.flash('rgba(255,255,255,.7)', 0.07);
    this.app.ui.hud.buildIn();
    if (this.arena) this.arena.begin();
    else this.after(0.6, () => { this.app.ui.hud.announce(this.mode.knifeOnly ? 'BLADES OUT' : 'ENGAGE', 'gold'); play('streak'); });
    this.app.ui.afterIntro();
  }

  addActor(a) {
    a.soldier = makeSoldier(a.skin, 'akr', 'factory', { team: this.mode.teams ? a.team : null });
    a.soldier.root.visible = false;
    this.scene.add(a.soldier.root);
    this.actors.push(a);
    return a;
  }
  addBot(name, team, skin = null, silent = false) {
    const skins = Object.keys(CHAR_SKINS);
    const ws = {};
    if (Math.random() < 0.6) for (const id of PRIMARIES) ws[id] = pick(Object.keys(WEAPON_SKINS).filter(k => !WEAPON_SKINS[k].exclusive));
    const b = new Actor({ name, team, isBot: true, skin: skin || pick(skins), weaponSkins: ws });
    b.brain = new BotBrain(b, this.diff);
    b.loadout = Math.floor(Math.random() * 10);
    this.addActor(b);
    if (!silent) this.app.ui.hud.chat(null, `${name} joined the game`, '#f2c230');
    return b;
  }
  removeActor(a) {
    this.scene.remove(a.soldier.root);
    disposeSoldierCache(a.soldier); disposeTree(a.soldier.root); // sus mallas horneadas son propias: liberar memoria de vídeo
    this.actors.splice(this.actors.indexOf(a), 1);
    for (const o of this.actors) if (o.brain && o.brain.target === a) o.brain.reset();
  }

  // ---------------- Spawns ----------------
  spawn(a) {
    const enemies = this.actors.filter(o => o !== a && o.alive && (!this.mode.teams || o.team !== a.team));
    let cands = this.map.spawns.filter(s => !this.mode.teams || !s.team || s.team === a.team);
    if (!cands.length) cands = this.map.spawns;
    let best = null, bs = -1e9;
    for (const s of cands) {
      const [x, y, z] = s.p;
      let md = 60;
      for (const e of enemies) md = Math.min(md, Math.hypot(e.pos.x - x, e.pos.z - z));
      let sc = md + Math.random() * 8;
      if (md < 12) sc -= 40;
      for (const e of enemies) if (Math.hypot(e.pos.x - x, e.pos.z - z) < 40 && clearLine(this.col, x, y + 1.6, z, e.pos.x, e.pos.y + 1.6, e.pos.z)) { sc -= 25; break; }
      if (sc > bs) { bs = sc; best = s; }
    }
    const [x, y, z] = best.p;
    Object.assign(a.pos, { x: x + R(-0.4, 0.4), y, z: z + R(-0.4, 0.4) });
    Object.assign(a.vel, { x: 0, y: 0, z: 0 });
    a.yaw = best.team ? best.yaw : Math.atan2(x, z) + R(-0.3, 0.3); a.pitch = 0; a.hp = 100; a.alive = true; a.onGround = true; a.crouching = false; a.crouch = 0;
    a.spawnShield = 1.6; a.deadT = 0; a.damageBy.clear(); a.lastHitBy = null; a.spawnTime = this.time; a.rush = 1;
    if (a.isLocal) {
      const L = this.app.profile.loadouts[this.app.profile.loadout] || this.app.profile.loadouts[0];
      this.giveFor(a, L);
      this.controller.deathCam = null;
      this.onSwitch(a);
      play('spawn');
      this.app.ui.hud.onSpawn(this);
    } else {
      const L = this.app.profile.loadouts[a.loadout] || { primary: 'akr', secondary: 'p9' };
      // bots: loadout fijo con algo de variedad
      if (Math.random() < 0.3) a.loadout = Math.floor(Math.random() * 10);
      this.giveFor(a, L);
      a.brain.reset();
      this.onSwitch(a);
    }
    a.soldier.root.visible = !a.isLocal;
  }

  // Loadout según el modo: libre, forzado (francotiradores) o dividido por equipos (Longbow vs cuchillo)
  giveFor(a, L) {
    const M = this.mode;
    if (M.split && a.team && M.split[a.team]) { const S = M.split[a.team]; a.giveLoadout(S.primary || null, S.secondary || null, !!S.knife); return; }
    if (M.force) { a.giveLoadout(M.force.primary, M.force.secondary, false); return; }
    a.giveLoadout(L.primary, L.secondary, M.knifeOnly);
  }

  // ---------------- Armas ----------------
  trySwitch(a, slot) { if (a.switchTo(slot)) this.onSwitch(a); }
  onSwitch(a) {
    const w = a.weapon; if (!w) return;
    const skin = a.weaponSkins[w.id] || 'factory';
    setSoldierWeapon(a.soldier, w.id, skin);
    if (a.isLocal) {
      this.vm.setWeapon(w.id, skin, a.skin);
      this.vm.play('draw', WEAPONS[w.id].draw);
      play('draw');
      this.app.ui.hud.setSlots(a);
    }
  }
  onReload(a) {
    const d = a.wdef;
    if (a.isLocal) {
      if (d.perShell) { this.vm.play('shell', d.perShell); play('magOut'); }
      else {
        const empty = a.weapon.mag === 0;
        if (empty) a.reloadT *= 1.18; // recarga en vacío: más larga (tirar del cerrojo)
        this.vm.play('reload', a.reloadT, { empty });
      }
    } else play('magOut', a.pos, 0.6);
  }

  tickWeapon(a, dt, held, pressed, heavy = false) {
    const d = a.wdef, w = a.weapon;
    if (!w) return;
    a.fireCd -= dt;
    if (a.drawT > 0) a.drawT -= dt;
    if (a.spawnShield > 0) a.spawnShield -= dt;
    const r = a.tickReload(dt);
    if (r && a.isLocal) {
      if (r === 'shell') { this.vm.play('shell', d.perShell); play('shell'); }
      else if (r === 'done') { if (d.perShell) { this.vm.play('pump', 0.45); play('pump'); } }
      this.app.ui.hud.setAmmo(a);
    }
    a.bloom = Math.max(0, a.bloom - d.bloomRecover * dt);
    const canAds = !d.melee && a.drawT <= 0 && !(a.reloadT > 0 && !d.perShell) && !a.sprinting;
    const target = a.wantAds && canAds ? 1 : 0;
    a.ads += Math.sign(target - a.ads) * Math.min(Math.abs(target - a.ads), dt / d.adsTime);
    // ráfaga en curso
    if (a.burstLeft > 0) {
      a.burstCd -= dt;
      if (a.burstCd <= 0) {
        if (w.mag > 0) { this.fireOnce(a); a.burstLeft--; a.burstCd = 60 / d.rpm; } else a.burstLeft = 0;
        if (a.burstLeft <= 0) a.fireCd = d.burstGap;
      }
      return;
    }
    if (held && a.healT > 0 && this.br) this.br.cancelHeal(a);
    if (!held || a.fireCd > 0 || a.busy) return;
    if (!d.auto && !pressed) return;
    if (d.melee) { this.melee(a, heavy); a.fireCd = heavy ? 0.95 : 60 / d.rpm; return; }
    if (w.mag <= 0) {
      if (pressed) { play('empty', a.isLocal ? null : a.pos); a.fireCd = 0.2; }
      if (w.reserve > 0 && a.startReload()) this.onReload(a);
      return;
    }
    if (a.reloadT > 0 && d.perShell && w.mag > 0) { a.reloadT = 0; a.shellReload = false; }
    if (d.burst) { a.burstLeft = d.burst; a.burstCd = 0; return this.tickWeapon(a, 0, false, false); }
    this.fireOnce(a);
    a.fireCd = 60 / d.rpm;
  }

  eyeOf(a) { return V(a.pos.x, a.pos.y + a.eyeH, a.pos.z); }

  fireOnce(a) {
    const d = a.wdef, w = a.weapon;
    w.mag--;
    a.spawnShield = 0;
    const eye = this.eyeOf(a);
    const fwd = dirFrom(a.yaw, a.pitch);
    const spread = a.spread() * (a.isBot ? (this.diff.spreadMul || 1) : 1); // los bots no tienen pulso de jugador
    a.bloom = Math.min(d.bloomMax, a.bloom + d.bloom);
    // origen visual del disparo (cañón)
    let muzzle;
    if (a.isLocal) {
      const right = V(Math.cos(a.yaw), 0, -Math.sin(a.yaw));
      muzzle = eye.clone().addScaledVector(fwd, 0.7).addScaledVector(right, 0.14 * (1 - a.ads)).add(V(0, -0.12 * (1 - a.ads) - 0.04, 0));
      this.vm.fire(d.sound === 'shotgun' || d.sound === 'sniper' ? 1.4 : 1);
      this.fx.flashLight.position.copy(muzzle); this.fx.flashLight.intensity = 4; this.fx.flashT = 0.05;
      this.controller.addRecoil(d);
      this.app.feel.add({ sniper: 0.2, shotgun: 0.17, launcher: 0.15, magnum: 0.11, heavy: 0.045 }[d.sound] || 0.025);
      this.stats.shots++;
      playShot(d.sound);
      if (d.bolt) this.after(0.26, () => { if (a.alive && a.weapon && a.weapon.id === 'longbow') { this.vm.play('bolt', 0.7); play('bolt'); } });
      if (d.id === 'brute') this.after(0.23, () => { if (a.alive && a.weapon && a.weapon.id === 'brute') { this.vm.play('pump', 0.45); play('pump'); } });
      this.app.ui.hud.setAmmo(a);
    } else {
      a.soldier.gun.userData.muzzle.updateWorldMatrix(true, false);
      muzzle = a.soldier.gun.userData.muzzle.getWorldPosition(V(0, 0, 0));
      if (!this.quiet) { this.fx.muzzle(muzzle, d.sound === 'shotgun' ? 1.5 : 1); playShot(d.sound, a.pos); }
    }
    // oído de los bots
    for (const o of this.actors) if (o.brain && o !== a && Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z) < 45) o.brain.hear(a.pos, this.time);

    if (d.projectile) {
      const dir = fwd.clone();
      this.projectiles.push({ pos: muzzle.clone(), vel: dir.multiplyScalar(d.projectile.speed), owner: a, life: 6, def: d, mesh: this.grenadeMesh() });
      this.rec.events.push({ type: 'lob', t: this.time, id: a.id, sound: d.sound, pos: muzzle.clone(), vel: fwd.clone().multiplyScalar(d.projectile.speed) });
      return;
    }
    // perdigones / bala
    const hitActors = new Map();
    for (let i = 0; i < d.pellets; i++) {
      const dir = this.spreadDir(fwd, spread);
      const res = this.trace(a, eye, dir, 300);
      const end = eye.clone().addScaledVector(dir, res.t);
      if (!this.quiet && (i < 3 || i % 3 === 0)) this.fx.tracer(muzzle, end, d.tracer, d.sound === 'sniper' ? 0.04 : 0.022);
      if (i === 0 || i === 3) this.rec.shot(this, a, end, res.normal, res.actor, d.sound, d.tracer);
      if (res.actor) {
        const dist = res.t;
        let dmg = damageAt(d, dist) * (res.part === 'head' ? d.headMul : res.part === 'legs' ? d.legMul : 1);
        const prev = hitActors.get(res.actor) || { dmg: 0, head: false };
        prev.dmg += dmg; prev.head = prev.head || res.part === 'head';
        hitActors.set(res.actor, prev);
        if (!this.quiet) this.fx.blood(end, dir.clone().negate());
      } else if (res.normal && !this.quiet) {
        this.fx.impact(end, res.normal);
        if (Math.random() < 0.4) play('impact', end, 0.5);
      }
      // silbido de bala cerca del jugador
      if (!a.isLocal && this.me.alive && res.actor !== this.me) {
        const m = this.me, mp = V(m.pos.x, m.pos.y + 1.4, m.pos.z);
        const t = mp.clone().sub(eye).dot(dir);
        if (t > 2 && t < res.t) { const close = eye.clone().addScaledVector(dir, t).distanceTo(mp); if (close < 1.2 && Math.random() < 0.5) play('whiz', mp, 0.7); }
      }
    }
    for (const [victim, h] of hitActors) this.damage(victim, a, h.dmg, h.head, d.id, fwd);
  }

  spreadDir(fwd, spread) {
    if (spread <= 0) return fwd.clone();
    const r = spread * Math.sqrt(Math.random()), th = Math.random() * Math.PI * 2;
    const up = Math.abs(fwd.y) > 0.99 ? V(1, 0, 0) : V(0, 1, 0);
    const right = fwd.clone().cross(up).normalize(), u = right.clone().cross(fwd).normalize();
    return fwd.clone().addScaledVector(right, Math.cos(th) * r).addScaledVector(u, Math.sin(th) * r).normalize();
  }

  raycast(o, dir, max) { return raycastWorld(this.col, o.x, o.y, o.z, dir.x, dir.y, dir.z, max); }

  // Rayo contra mundo + hitboxes. Devuelve { t, actor?, part?, normal? }
  trace(shooter, o, dir, max) {
    const wh = this.raycast(o, dir, max);
    let best = wh ? wh.t : max, actor = null, part = null;
    for (const v of this.actors) {
      if (v === shooter || !v.alive || v.brAir === 'plane') continue;
      if (this.mode.teams && v.team === shooter.team) continue;
      // descarte rápido por distancia al rayo
      const tx = v.pos.x - o.x, ty = v.pos.y + 1 - o.y, tz = v.pos.z - o.z;
      const along = tx * dir.x + ty * dir.y + tz * dir.z;
      if (along < 0 || along > best + 1) continue;
      const px = tx - dir.x * along, py = ty - dir.y * along, pz = tz - dir.z * along;
      if (px * px + py * py + pz * pz > 2.5) continue;
      for (const hb of v.hitboxes()) {
        const t = rayBox(o.x, o.y, o.z, dir.x, dir.y, dir.z, ...hb.min, ...hb.max);
        if (t >= 0 && t < best) { best = t; actor = v; part = hb.part; }
      }
    }
    return { t: best, actor, part, normal: actor ? null : wh ? V(wh.nx, wh.ny, wh.nz) : null };
  }

  melee(a, heavy) {
    const d = WEAPONS.knife;
    if (a.isLocal) { this.vm.play(heavy ? 'stab' : 'slash', heavy ? 0.5 : 0.32); }
    this.rec.events.push({ type: 'melee', t: this.time, id: a.id, heavy });
    if (!this.quiet) play('knife', a.isLocal ? null : a.pos);
    a.spawnShield = 0;
    const eye = this.eyeOf(a), fwd = dirFrom(a.yaw, a.pitch);
    // barrido en abanico
    let best = null;
    for (const off of [0, -0.25, 0.25, -0.45, 0.45]) {
      const dir = dirFrom(a.yaw + off, a.pitch);
      const res = this.trace(a, eye, dir, d.melee);
      if (res.actor) { best = res; break; }
      if (!best && res.normal && off === 0) best = res;
    }
    this.after(heavy ? 0.18 : 0.09, () => {
      if (!a.alive || !best) return;
      if (best.actor) {
        const v = best.actor;
        // apuñalar por la espalda = muerte instantánea
        const toV = V(v.pos.x - a.pos.x, 0, v.pos.z - a.pos.z).normalize();
        const vf = dirFrom(v.yaw, 0).setY(0).normalize();
        const back = toV.dot(vf) > 0.5;
        const dmg = heavy ? (back ? 200 : d.heavyDamage) : (back ? 110 : d.damage);
        play('knifeHit', v.isLocal ? null : v.pos);
        this.fx.blood(V(v.pos.x, v.pos.y + 1.2, v.pos.z), fwd.clone().negate());
        this.damage(v, a, dmg, false, 'knife', fwd);
      } else if (best.normal) {
        const p = eye.clone().addScaledVector(fwd, best.t);
        this.fx.impact(p, best.normal); play('impact', p, 0.8);
      }
    });
  }

  grenadeMesh() {
    // V2: granada de 40 mm modelada en Blender (la punta mira hacia donde vuela)
    const pm = propModel('grenade');
    if (pm) { pm.scale.setScalar(1.25); this.scene.add(pm); return pm; }
    if (!this._gGeo) { this._gGeo = new THREE.SphereGeometry(0.07, 8, 6); this._gMat = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.6, flatShading: true }); }
    const g = new THREE.Mesh(this._gGeo, this._gMat);
    this.scene.add(g); return g;
  }

  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.vel.y -= p.def.projectile.gravity * dt;
      const step = p.vel.length() * dt, dir = p.vel.clone().normalize();
      const res = this.trace(p.owner, p.pos, dir, step);
      let boom = p.life <= 0;
      if (res.actor || res.normal) { p.pos.addScaledVector(dir, Math.max(0, res.t - 0.05)); boom = true; }
      else p.pos.addScaledVector(dir, step);
      p.mesh.position.copy(p.pos);
      p.spin = (p.spin || 0) + dt * 14; p.mesh.lookAt(p.pos.x - dir.x, p.pos.y - dir.y, p.pos.z - dir.z); p.mesh.rotateZ(p.spin);
      if (Math.random() < 0.6) this.fx.smokePuff(p.pos, 0.15);
      if (boom) { this.explode(p.pos, p.owner, p.def); this.scene.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
  }

  explode(pos, owner, d) {
    if (!this.quiet) { this.fx.explosion(pos); play('explosion', pos, 1.5); }
    this.rec.events.push({ type: 'boom', t: this.time, pos: pos.clone() });
    const R0 = d.projectile.radius;
    for (const v of this.actors) {
      if (!v.alive) continue;
      if (this.mode.teams && v.team === owner.team && v !== owner) continue;
      const c = V(v.pos.x, v.pos.y + 1, v.pos.z), dist = Math.max(0, c.distanceTo(pos) - 0.6);
      if (dist > R0) continue;
      if (!clearLine(this.col, pos.x, pos.y + 0.1, pos.z, c.x, c.y, c.z)) continue;
      const k = 1 - dist / R0;
      let dmg = d.damage * (0.25 + 0.75 * k);
      if (v === owner) dmg *= 0.5;
      const push = c.clone().sub(pos).normalize().multiplyScalar(9 * k);
      v.vel.x += push.x; v.vel.z += push.z; v.vel.y += Math.max(3, push.y + 4 * k); v.onGround = false;
      this.damage(v, owner, dmg, false, 'boomer', push.normalize());
    }
    const me = this.me;
    const md = Math.hypot(me.pos.x - pos.x, me.pos.y - pos.y, me.pos.z - pos.z);
    if (md < 25) this.controller.shake(0.05 * (1 - md / 25) + 0.01, 0.5);
    for (const o of this.actors) if (o.brain && Math.hypot(o.pos.x - pos.x, o.pos.z - pos.z) < 40) o.brain.hear(owner.pos, this.time);
  }

  // ---------------- Daño y muertes ----------------
  damage(v, attacker, amount, head, weaponId, dir) {
    if (!v.alive || this.ended) return;
    if (v.spawnShield > 0 && attacker !== v) return;
    if (this.mode.teams && attacker && attacker !== v && attacker.team === v.team) return;
    amount = Math.round(amount);
    let armorDmg = 0;
    if (this.br && weaponId !== 'zone') { const left = this.br.absorb(v, amount, attacker); armorDmg = amount - left; amount = left; }
    else if (this.arena && weaponId !== 'fall') { const left = Math.round(this.arena.absorb(v, amount)); armorDmg = amount - left; amount = left; }
    if (attacker && attacker.ar && attacker !== v) attacker.ar.dmg += Math.min(amount, Math.max(0, v.hp));
    v.hp -= amount;
    v.lastHitBy = attacker;
    if (attacker && attacker !== v) v.damageBy.set(attacker, (v.damageBy.get(attacker) || 0) + amount);
    const killed = v.hp <= 0;
    if (attacker && attacker.isLocal && v !== attacker) {
      this.stats.hits++; this.stats.damage += amount;
      this.app.ui.hud.hitmarker(killed ? 'kill' : head ? 'head' : armorDmg && !amount ? 'armor' : 'hit');
      play(head ? 'headshot' : armorDmg && !amount ? 'armorHit' : 'hit');
      if (this.br) { const p = V(v.pos.x, v.pos.y + v.height + 0.25, v.pos.z); if (armorDmg) this.br.ui.num(p, armorDmg, 'armor'); if (amount) this.br.ui.num(p, amount, head ? 'head' : 'hp'); }
      else this.app.ui.hud.dmgNum(v, Math.min(amount, amount + v.hp), head, killed);
    }
    if (v.isLocal) {
      play('hurt');
      if (attacker && attacker !== v) {
        const ang = Math.atan2(-(attacker.pos.x - v.pos.x), -(attacker.pos.z - v.pos.z)) - v.yaw;
        this.app.ui.hud.damage(ang, amount);
      } else this.app.ui.hud.damage(null, amount);
      if (weaponId !== 'zone') { this.controller.punchV -= 3; this.app.feel.add(0.08 + Math.min(0.3, amount / 200)); }
      this.app.ui.hud.setHealth(v);
    } else if (v.brain) v.brain.hurtBy(attacker, this.time);
    if (!v.isLocal) { play('flesh', v.pos, 0.6); v.flashT = 0.09; }
    if (killed) this.kill(v, attacker, weaponId, head);
  }

  kill(v, k, weaponId, head) {
    const vStreak = v.streak;
    this.rec.kill(this, k, v, weaponId, head);
    v.alive = false; v.hp = 0; v.deaths++; v.streak = 0; v.deadT = 0.0001; v.deadDir = Math.random() < 0.5 ? 1 : -1;
    v.respawnT = v.isLocal ? 4.2 : R(2.5, 4);
    v.soldier.root.visible = true;
    if (this.br) this.br.onKill(v, k);
    if (!v.isLocal && !this.quiet) play('death', v.pos, 0.7);
    if (k && k !== v) {
      k.kills++; k.score += 100 + (head ? 25 : 0); k.streak++;
      if (k.isLocal && WEAPONS[weaponId]) this.wkills[weaponId] = (this.wkills[weaponId] || 0) + 1; // maestría
      if (this.mode.rush) { k.rush = Math.min(1.35, (k.rush || 1) + 0.07); if (k.isLocal) this.app.ui.hud.toast(`RUSH +${Math.round((k.rush - 1) * 100)}% SPEED`); }
      if (head) k.headshots++;
      if (this.mode.teams && !this.arena) this.teamScore[k.team]++;
      if (k.isLocal) {
        this.stats.headshots += head ? 1 : 0;
        this.stats.bestStreak = Math.max(this.stats.bestStreak, k.streak);
        play('kill');
        // game feel: una baja normal es "media"; cabeza, explosivo o baja múltiple es "grande"
        const multi = this.time - (k.lastKillT ?? -99) < 4;
        this.app.feel.hit(head || multi || weaponId === 'boomer' ? 'large' : 'medium', head ? { flashColor: 'rgba(255,210,58,.5)' } : {});
        var mc = multi ? (k.multi || 1) + 1 : 1; // contador de baja múltiple para el texto que crece
        this.app.ui.hud.scorePop(head ? '+125' : '+100', head);
        this.app.ui.hud.killBanner(v.name, head, mc >= 2 ? '×' + mc : null, mc);
        this.awardMedals(k, v, weaponId, head, vStreak);
      }
    } else if (k === v) { v.score = Math.max(0, v.score - 50); }
    for (const [o, dmg] of v.damageBy) if (o !== k && o.alive !== undefined && dmg >= 40) { o.assists++; o.score += 50; if (o.isLocal) this.app.ui.hud.toast('+50 ASSIST'); }
    this.app.ui.hud.killfeed(k, v, weaponId, head);
    // soltar arma principal
    if (!this.mode.knifeOnly && !this.br && v.slots[0] && (v.slots[0].mag + v.slots[0].reserve > 0)) {
      this.addPickup(v.slots[0], V(v.pos.x + R(-0.4, 0.4), v.pos.y, v.pos.z + R(-0.4, 0.4)), v.weaponSkins[v.slots[0].id]);
    }
    if (k && k !== v) this.firstBlood = true;
    if (v.isLocal) {
      if (k && k !== v) v.lastKiller = k;
      this.controller.startDeathCam(k);
      play('death');
      if (this.death) this.death.finish(false);
      this.death = new DeathSeq(this, k && k !== v ? k : null, weaponId, head);
      v.respawnT = this.br ? Infinity : 99; // el redespliegue lo decide la secuencia (en BR no hay)
      if (this.app.ui.loadoutOpen) this.app.ui.closeLoadout();
      this.app.ui.hud.setHealth(v);
    }
    // charla de bots
    if (Math.random() < 0.03) {
      const talker = Math.random() < 0.5 ? v : k;
      if (talker && talker.isBot) this.after(R(0.8, 2.5), () => this.app.ui.hud.chat(talker.name, pick(BOT_CHAT)));
    }
    if (this.arena) this.arena.onKill(v, k, weaponId);
    if (!this.br) this.checkLead();
    this.checkWin();
  }

  // Medallas al estilo de los shooters modernos (sólo para el jugador local)
  awardMedals(k, v, weaponId, head, vStreak) {
    const meds = [];
    if (!this.firstBlood) meds.push('FIRST BLOOD');
    if (head) meds.push('HEADSHOT');
    const dist = Math.hypot(k.pos.x - v.pos.x, k.pos.z - v.pos.z);
    if (weaponId === 'knife') meds.push('BLADE');
    else if (weaponId === 'boomer') meds.push('BOOM');
    else if (dist > 35) meds.push('LONGSHOT');
    else if (dist < 3) meds.push('POINT BLANK');
    if (k.lastKiller === v) { meds.push('REVENGE'); k.lastKiller = null; }
    if (vStreak >= 3) meds.push('BUZZKILL');
    k.multi = this.time - (k.lastKillT ?? -99) < 4 ? (k.multi || 1) + 1 : 1; k.lastKillT = this.time;
    if (k.multi >= 2) meds.push(['DOUBLE KILL', 'TRIPLE KILL', 'FURY KILL', 'FRENZY KILL'][Math.min(k.multi - 2, 3)]);
    if (k.streak % 5 === 0) meds.push('STREAK ' + k.streak);
    for (const n of meds) this.medals[n] = (this.medals[n] || 0) + 1;
    if (meds.length) this.app.ui.hud.medals(meds);
  }

  // Avisos de liderato para el jugador (sólo FFA)
  checkLead() {
    if (this.mode.teams || this.ended) return;
    const st = this.standings(), lead = st[0] === this.me && this.me.kills > 0 && (st[1] ? st[1].kills < this.me.kills : true);
    if (lead !== !!this.hadLead) {
      if (lead) { this.app.ui.hud.announce('YOU TOOK THE LEAD', 'gold'); play('streak'); }
      else if (this.hadLead) this.app.ui.hud.announce('YOU LOST THE LEAD', 'red');
      this.hadLead = lead;
    }
    const left = this.mode.target - Math.max(...this.actors.map(a => a.kills));
    if (left <= 3 && left > 0 && left !== this.lastLeft) { this.lastLeft = left; this.app.ui.hud.announce(`${left} KILL${left > 1 ? 'S' : ''} LEFT`, 'white'); }
  }

  checkWin() {
    if (this.ended) return;
    if (this.br) { if (this.actors.filter(a => a.alive).length <= 1) this.end(); return; }
    if (this.arena) return; // la Arena decide por rondas
    const t = this.mode.target;
    if (this.mode.teams) { if (this.teamScore.blue >= t || this.teamScore.red >= t) this.end(); }
    else if (this.actors.some(a => a.kills >= t)) this.end();
  }

  standings() {
    if (this.br) return this.br.standings();
    return [...this.actors].sort((a, b) => b.score - a.score || b.kills - a.kills || a.deaths - b.deaths);
  }

  end() {
    if (this.ended) return;
    this.ended = true; this.endT = 0;
    if (this.death) this.death.finish(false);
    const me = this.me, st = this.standings();
    let win, place = st.indexOf(me) + 1;
    if (this.mode.teams) win = this.teamScore[me.team] > this.teamScore[me.team === 'blue' ? 'red' : 'blue'];
    else win = place === 1;
    let coins = me.kills * 5 + me.assists * 2 + (win ? 60 : 0) + (place <= 3 ? 20 : 0) + 10;
    let xp = me.score + (win ? 300 : 100);
    if (this.br) {
      place = me.alive ? 1 : me.brPlace; win = place === 1;
      const n = st.length, alive = me.alive ? this.time : me.brElimT;
      coins = me.kills * 8 + Math.max(0, n - place) * 3 + (win ? 120 : 0) + 10;
      xp = me.score + Math.round(alive * 1.5) + Math.max(0, n - place) * 20 + (win ? 600 : 0);
    }
    this.app.input.unlock();
    this.result = { win, place, coins, xp, kills: me.kills, deaths: me.deaths, headshots: this.stats.headshots, standings: st, teamScore: this.teamScore, stats: this.stats, medals: this.medals, assists: me.assists, score: me.score };
    this.app.onMatchEnd(this.result);
    this.phase = 'ending';
    play(win ? 'victory' : 'defeat');
    if (this.br) { this.br.ui.el.classList.add('ending'); document.body.classList.remove('br-out', 'br-dive'); }
    if (this.br) this.app.ui.hud.endBanner(win, win ? 'LAST OPERATOR STANDING' : `PLACED #${place} OF ${st.length}`, win ? 'VICTORY' : 'ELIMINATED');
    else this.app.ui.hud.endBanner(win, this.mode.teams ? `BLUE ${this.teamScore.blue} — ${this.teamScore.red} RED` : `#${place} OF ${st.length}`);
  }

  // Tras el banner: killcam final si se grabó la última muerte; si no, directo al podio
  afterEnding() {
    this.app.ui.hud.hide();
    // BR perdido: no hay podio (la partida sigue sin ti): informe sobre una toma aérea del lugar de la caída
    if (this.br && !this.result.win) { this.br.ui.el.classList.remove('on'); this.phase = 'rewards'; this.app.ui.showAfterAction(this.result, this); return; }
    if (this.rec.canReplay(this)) { this.phase = 'killcam'; this.kc = new FinalKillcam(this, this.rec); }
    else this.toPodium();
  }
  toPodium() {
    if (this.kc) { this.kc.finish(); this.kc = null; }
    const r = this.result, st = r.standings;
    const pool = this.mode.teams ? st.filter(a => a.team === (r.win ? this.me.team : (this.me.team === 'blue' ? 'red' : 'blue'))) : st;
    const top = pool.slice(0, 3).map(a => {
      const w = a.slots[0] ? a.slots[0].id : (a.weapon ? a.weapon.id : 'akr');
      return { name: a.name, skin: a.skin, weapon: w === 'knife' ? 'akr' : w, weaponSkin: a.weaponSkins[w], score: a.score, kills: a.kills, deaths: a.deaths, isLocal: a.isLocal, team: a.team };
    });
    const title = { main: r.win ? 'VICTORY' : 'DEFEAT', sub: this.br ? `LAST OPERATOR STANDING · ${this.map.name}` : this.mode.teams ? `${(r.win ? this.me.team : (this.me.team === 'blue' ? 'red' : 'blue')).toUpperCase()} TEAM TOP PLAYERS` : `TOP PLAYERS · ${this.map.name}` };
    this.podium = new Podium(this.app.renderer, top, { win: r.win, teams: this.mode.teams, title });
    this.podium.el.addEventListener('click', () => { if (this.podium.t > 1.2) this.toRewards(); });
    this.phase = 'podium';
    const f = document.getElementById('cine-fade'); f.classList.remove('white'); f.style.transition = ''; f.style.opacity = 1;
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.8s'; f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 850); });
    play('podium');
    this.after(8.5, () => { if (this.phase === 'podium') this.toRewards(); });
  }
  toRewards() {
    if (this.phase !== 'podium') return;
    this.phase = 'rewards';
    if (this.br) this.br.ui.el.classList.remove('on');
    this.podium.el.classList.add('pd-dim');
    this.app.ui.showAfterAction(this.result, this);
  }

  // ---------------- Pickups / drop / spray ----------------
  addPickup(w, pos, skin = 'factory') {
    const mesh = makeGun(w.id, skin, { shadows: false });
    bakeTree(mesh, { shadow: false, skip: (m) => !!m.userData.keep }); // un arma tirada: de ~23 piezas a unas pocas
    const holder = new THREE.Group(); holder.add(mesh);
    mesh.rotation.set(0, 0, Math.PI / 2); mesh.position.y = 0.06;
    holder.position.copy(pos); holder.rotation.y = Math.random() * 6.28;
    this.scene.add(holder);
    // caer al suelo
    const g = raycastWorld(this.col, pos.x, pos.y + 1, pos.z, 0, -1, 0, 20);
    if (g) holder.position.y = pos.y + 1 - g.t;
    this.pickups.push({ w: { ...w }, mesh: holder, life: 30, skin });
    if (this.pickups.length > 14) { const o = this.pickups.shift(); this.dropMesh(o.mesh); }
  }
  // quita un arma del suelo y libera su memoria
  dropMesh(m) {
    this.scene.remove(m); disposeTree(m);
  }
  dropWeapon(a) {
    if (this.br) { if (!a.brAir) this.br.dropWeapon(a); return; }
    if (a.slot === 2 || !a.weapon || this.mode.knifeOnly) return;
    const w = a.weapon;
    const f = dirFrom(a.yaw, 0);
    this.addPickup(w, V(a.pos.x + f.x * 1.2, a.pos.y + 0.5, a.pos.z + f.z * 1.2), a.weaponSkins[w.id]);
    a.slots[a.slot] = null;
    const next = [0, 1, 2].find(i => a.slots[i]);
    a.slot = -1; a.switchTo(next);
    this.onSwitch(a);
    play('pickup');
  }
  nearPickup(a) {
    let best = null, bd = 1.8;
    for (const p of this.pickups) {
      const d = Math.hypot(p.mesh.position.x - a.pos.x, p.mesh.position.z - a.pos.z);
      if (d < bd && Math.abs(p.mesh.position.y - a.pos.y) < 1.5) { bd = d; best = p; }
    }
    return best;
  }
  tryPickup(a) {
    if (this.br && this.br.tryTake(a)) return;
    const p = this.nearPickup(a);
    if (!p) return;
    const slot = WEAPONS[p.w.id].slot - 1;
    const old = a.slots[slot];
    if (old) this.addPickup(old, V(a.pos.x, a.pos.y + 0.5, a.pos.z), a.weaponSkins[old.id]);
    a.slots[slot] = { ...p.w };
    if (p.skin) a.weaponSkins = { ...a.weaponSkins, [p.w.id]: p.skin };
    this.dropMesh(p.mesh); this.pickups.splice(this.pickups.indexOf(p), 1);
    a.slot = -1; a.switchTo(slot); this.onSwitch(a);
    play('pickup');
  }
  autoAmmo(a) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const own = a.slots.find(s => s && s.id === p.w.id);
      if (!own) continue;
      if (Math.hypot(p.mesh.position.x - a.pos.x, p.mesh.position.z - a.pos.z) > 1.1) continue;
      const max = WEAPONS[own.id].reserve;
      if (own.reserve >= max) continue;
      own.reserve = Math.min(max, own.reserve + p.w.mag + p.w.reserve);
      this.dropMesh(p.mesh); this.pickups.splice(i, 1);
      if (a.isLocal) { play('pickup'); this.app.ui.hud.toast('+AMMO'); this.app.ui.hud.setAmmo(a); }
    }
  }
  spray(a) {
    if (this.sprayCd > this.time) return;
    const eye = this.eyeOf(a), dir = dirFrom(a.yaw, a.pitch);
    const hit = this.raycast(eye, dir, 4);
    if (!hit) return;
    const s = this.app.profile.settings;
    this.fx.spray(eye.clone().addScaledVector(dir, hit.t), V(hit.nx, hit.ny, hit.nz), s.sprayText || 'GG', s.sprayColor || '#3fe0ff');
    play('spray');
    this.sprayCd = this.time + 2;
  }

  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

  // ---------------- Bucle ----------------
  update(dt) {
    const cam = this.app.camera;
    if (this.phase === 'intro') {
      // el mundo vive (nubes, agua, partículas) pero los jugadores esperan
      this.syncVisuals(dt);
      for (const f of this.anim) f(dt);
      this.fx.update(dt);
      if (this.intro.update(dt, cam)) this.startLive();
      setListener(cam.position.x, cam.position.y, cam.position.z, this.me.yaw);
      return;
    }
    if (this.phase === 'ending') {
      // cámara lenta del último instante mientras aparece VICTORIA / DERROTA
      this.endT += dt;
      const slow = dt * 0.25;
      for (const f of this.anim) f(slow);
      this.fx.update(slow);
      for (const a of this.actors) if (!a.alive) a.deadT += slow;
      this.syncVisuals(slow);
      this.controller.updateCamera(slow);
      if (this.endT > 2.4) this.afterEnding();
      return;
    }
    if (this.phase === 'killcam') {
      for (const f of this.anim) f(dt);
      this.updateProjectiles(0);
      if (this.kc.update(dt, cam)) this.toPodium();
      return;
    }
    if (this.phase === 'podium' || this.phase === 'rewards') {
      this.time += dt;
      for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.time) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
      if (this.podium) this.podium.update(dt, innerWidth / innerHeight);
      else if (this.br) this.br.outro(dt);
      if (this.phase === 'rewards') this.app.ui.aarTick(dt);
      return;
    }
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i].t <= this.time) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
    const ui = this.app.ui.hud;
    if (!this.ended && !this.arena) {
      const prevSec = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      if (Math.ceil(this.timeLeft) !== prevSec && prevSec <= 10 && prevSec > 0) play('tick');
      if (this.timeLeft <= 0) { this.timeLeft = 0; this.end(); }
    } else this.endT += dt;

    const me = this.me;
    if (this.br && !this.ended) this.br.update(dt);
    if (this.arena && !this.ended) this.arena.update(dt);
    const frozen = this.arena && this.arena.frozen;
    // jugador local
    if (me.alive) {
      // latido con poca vida
      if (me.hp < 35 && this.time > (this.beatT || 0)) { play('heartbeat', null, 0.9); this.beatT = this.time + (me.hp < 20 ? 0.6 : 0.85); }
      // protegido mientras elige loadout justo después de aparecer
      if (this.app.ui.loadoutOpen && this.time - me.spawnTime < 12) me.spawnShield = Math.max(me.spawnShield, 0.4);
      if (!this.death && !me.brAir) this.controller.update(dt);
      this.autoAmmo(me);
      // límites del mapa / caída
      if (me.pos.y < -20) this.damage(me, me, 999, false, 'fall', V(0, -1, 0));
    } else {
      me.deadT += dt; me.respawnT -= dt;
      if (!this.death && me.respawnT <= 0 && !this.ended && !this.app.ui.loadoutOpen) this.spawn(me);
    }

    // bots
    for (const a of this.actors) {
      if (a.isLocal) continue;
      if (!a.alive) {
        a.deadT += dt; a.respawnT -= dt;
        if (a.respawnT <= 0 && !this.ended) this.spawn(a);
        continue;
      }
      if (a.brAir) continue; // en el avión / cayendo: lo mueve el battle royale
      const input = this.ended || frozen ? { fwd: 0, right: 0 } : a.brain.update(this, dt);
      a.wantAds = !!input.ads;
      const wasG = a.onGround;
      const hs = a.move(this.col, input, dt);
      a.jumped = false;
      if (!this.ended && !frozen) this.tickWeapon(a, dt, input.trigger, input.trigger);
      if (a.pos.y < -20) this.damage(a, a, 999, false, 'fall', V(0, -1, 0));
      // pasos audibles
      if (a.onGround && hs > 3 && !a.crouching && Math.floor(a.phase / Math.PI) !== Math.floor((a.lastPh || 0) / Math.PI)) play('step', a.pos, 0.9);
      if (!wasG && a.onGround && a.landSpeed > 6) play('land', a.pos, 0.5);
      a.lastPh = a.phase;
      this.autoAmmo(a);
    }
    this.updateProjectiles(dt);

    // pickups
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i]; p.life -= dt;
      if (p.life <= 0) { this.dropMesh(p.mesh); this.pickups.splice(i, 1); }
    }
    if (this.br) this.br.ui.prompt();
    else { const near = me.alive ? this.nearPickup(me) : null; ui.pickupPrompt(near ? WEAPONS[near.w.id].name : null); }

    // entra/sale gente (como un servidor público)
    if (!this.ended && !this.br && !this.arena && this.time > this.nextChurn) {
      this.nextChurn = this.time + R(40, 90);
      const bots = this.actors.filter(a => a.isBot && !(this.app.profile.party || []).some(p => p.name === a.name));
      const leaver = bots.length ? bots[Math.floor(Math.random() * bots.length)] : null;
      if (leaver && leaver !== this.standings()[0]) {
        ui.chat(null, `${leaver.name} left the game`, '#f2c230');
        const team = leaver.team;
        this.removeActor(leaver);
        this.after(R(2, 6), () => { if (!this.ended) { const b = this.addBot(randomBotName(), team); this.spawn(b); } });
      }
    }
    if (!this.ended && this.time > this.nextChat) {
      this.nextChat = this.time + R(40, 90);
      const bots = this.actors.filter(a => a.isBot);
      if (bots.length) ui.chat(pick(bots).name, pick(BOT_CHAT));
    }

    this.syncVisuals(dt);
    this.controller.updateCamera(dt);
    if (this.br) this.br.lateUpdate(dt);
    if (this.arena) this.arena.lateUpdate(dt);
    if (this.death) this.death.update(dt, cam);
    else setListener(cam.position.x, cam.position.y, cam.position.z, me.alive ? me.yaw : Math.atan2(-this.app.camera.getWorldDirection(V(0, 0, 0)).x, -this.app.camera.getWorldDirection(V(0, 0, 0)).z));
    this.fx.update(dt);
    for (const f of this.anim) f(dt);
    if (this.flashlight) this.updateNight();
    this.updateLookTarget(dt);
    this.rec.record(this, dt);
  }

  // Sombras de soldados sólo cerca de la cámara: cada soldado se dibujaba dos veces (también en el mapa de sombras)
  // aunque estuviera a 100 m, donde su sombra ni se distingue.
  shadowLOD(dt) {
    this.shT = (this.shT || 0) - dt;
    if (this.shT > 0) return;
    this.shT = 0.25;
    const c = this.app.camera.position;
    for (const a of this.actors) {
      const s = a.soldier, near = a.isLocal || Math.hypot(a.pos.x - c.x, a.pos.z - c.z) < 35;
      if (s.castNear === near) continue;
      s.castNear = near;
      if (!s.casters) { s.casters = []; s.root.traverse(o => { if (o.isMesh && o.castShadow) s.casters.push(o); }); }
      for (const o of s.casters) o.castShadow = near;
    }
  }
  syncVisuals(dt) {
    this.shadowLOD(dt);
    for (const a of this.actors) {
      const s = a.soldier;
      // el jugador local sólo proyecta sombra (no se ve a sí mismo)
      if (a.isLocal) setShadowOnly(s, a.alive && this.phase !== 'intro' && !a.brAir);
      if (!a.alive && a.deadT > 6) { s.root.visible = false; continue; }
      if (this.br && !a.isLocal) { const c = this.app.camera.position; if (Math.hypot(a.pos.x - c.x, a.pos.z - c.z) > 170) { s.root.visible = false; continue; } }
      s.root.visible = true;
      s.root.position.set(a.pos.x, a.pos.y, a.pos.z);
      s.root.rotation.y = a.yaw;
      if (a.alive) a.deadT = 0;
      poseSoldier(s, { moveSpeed: a.alive ? a.speed : 0, phase: a.phase, crouch: a.crouch, air: !a.onGround && a.alive, pitch: a.pitch, dead: a.alive ? 0 : a.deadT / 0.45, deadDir: a.deadDir });
      if (!a.alive && a.deadT > 4.5) s.root.position.y -= (a.deadT - 4.5) * 0.4; // se hunde y desaparece
      // destello blanco-rojizo al recibir un impacto
      const flash = (a.flashT || 0) > 0;
      if (flash) a.flashT -= dt;
      if (flash !== !!s.flashing) {
        s.flashing = flash;
        s.root.traverse(o => { if (!o.isMesh) return; if (flash) { o.userData.mat = o.material; o.material = HIT_MAT; } else if (o.userData.mat) o.material = o.userData.mat; });
      }
    }
  }

  // Nombre del enemigo al mirarlo un rato (como en el original) y compañeros siempre
  updateLookTarget(dt) {
    const me = this.me;
    if (!me.alive || me.brAir) { this.lookTarget = null; return; }
    const eye = this.eyeOf(me), dir = dirFrom(me.yaw, me.pitch);
    const res = this.trace(me, eye, dir, 120);
    if (res.actor && res.actor === this.lookTarget) this.lookT += dt;
    else { this.lookTarget = res.actor; this.lookT = 0; }
  }

  dispose() {
    removeEventListener('keydown', this.onSkip); removeEventListener('mousedown', this.onSkip);
    if (this.phase === 'intro') this.intro.finish();
    if (this.kc) this.kc.finish();
    if (this.death) this.death.finish(false);
    if (this.podium) this.podium.dispose();
    if (this.br) this.br.dispose();
    if (this.arena) this.arena.dispose();
    MOVE.gravity = this.gravity0;
    stopAmbient();
    this.fx.clear();
    this.worldGroup.traverse(o => { if (o.isMesh && o.parent === this.worldGroup) o.geometry.dispose(); });
  }
}
