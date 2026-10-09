// Arranque: renderer, splash, lobby y partidas. window.game expone la app para pruebas.
import * as THREE from 'three';
import { loadProfile, saveProfile, levelOf } from './game/profile.js';
import { Input } from './game/input.js';
import { UI } from './ui/ui.js';
import { Lobby } from './gfx/lobby.js';
import { Match } from './game/match.js';
import { Gunsmith } from './ui/gunsmith.js';
import { Unbox } from './gfx/unbox.js';
import { Title } from './ui/title.js';
import { WarTable } from './gfx/wartable.js';
import { gunIcon, mapThumb, soldierIcon } from './gfx/icons.js';
import { setAniso } from './gfx/textures.js';
import { initAudio, setVolume, play } from './game/audio.js';
import { WEAPONS } from './data/weapons.js';
import { preloadGunModels } from './gfx/gunmodels.js';
import { preloadProps } from './gfx/propmodels.js';
import { CHAR_SKINS } from './data/cosmetics.js';
import { Feel } from './game/feel.js';
import { initCloud } from './net/cloud.js';
import { applyRanked } from './data/ranks.js';
import { activeEvent, applyEvent, applyRankReward, addMastery } from './data/events.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.canvas = $('c');
    this.profile = loadProfile();
    // primera vez: calidad según el equipo (PCs escolares suelen ser modestos)
    if (!this.profile.qualityChosen) {
      const weak = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 8) <= 4;
      this.profile.settings.quality = weak ? 'medium' : 'high';
      this.profile.qualityChosen = true; saveProfile(this.profile);
    }
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    setAniso(Math.min(8, this.renderer.capabilities.getMaxAnisotropy()));
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
    this.input = new Input(this.canvas);
    this.ui = new UI(this);
    this.feel = new Feel(this);
    this.state = 'splash';
    this.match = null; this.lobby = null;
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.last = performance.now();
    this.paused = false;
    this.timeScale = 1;
    setVolume(this.profile.settings.volume);
    addEventListener('pointerdown', () => initAudio(), { once: true });
    addEventListener('keydown', () => initAudio(), { once: true });
    this.boot();
  }

  get quality() { return this.profile.settings.quality; }
  applyQuality() {
    const q = this.quality;
    this.basePR = Math.min(devicePixelRatio, q === 'high' ? 1.75 : q === 'medium' ? 1.25 : 0.85);
    this.resScale = this.resScale || 1;
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.shadowMap.enabled = q !== 'low';
    // bloom sólo en calidad alta
    if (q === 'high' && !this.composer) {
      this.composer = new EffectComposer(this.renderer);
      this.renderPass = new RenderPass(new THREE.Scene(), this.camera);
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 0.88);
      this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    } else if (q !== 'high' && this.composer) { this.composer.dispose(); this.composer = null; }
    this.resize();
  }
  // Presupuesto de píxeles por calidad: con el escalado de Windows (125–150 %) y pantallas grandes se renderizaban
  // más píxeles que los de la pantalla (y el bloom los recorre varias veces). Alta ≈ 1080p, media ≈ 900p, baja ≈ 720p.
  pixelRatio() {
    const budget = { high: 1920 * 1080, medium: 1600 * 900, low: 1280 * 720 }[this.quality] || 1920 * 1080;
    const cap = Math.sqrt(budget / Math.max(1, innerWidth * innerHeight));
    return Math.min(this.basePR * (this.resScale || 1), cap);
  }
  resize() {
    if (this.renderer && this.basePR) { const pr = this.pixelRatio(); if (Math.abs(this.renderer.getPixelRatio() - pr) > 0.01) this.renderer.setPixelRatio(pr); }
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    if (this.composer) { this.composer.setPixelRatio(this.renderer.getPixelRatio()); this.composer.setSize(w, h); }
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  async boot() {
    const fill = $('splash-fill'), msg = $('splash-msg');
    // armas modeladas en Blender: antes de generar iconos, lobby y viewmodels
    msg.textContent = 'LOADING ARMORY'; await Promise.all([preloadGunModels(), preloadProps()]);
    const steps = [
      ['LOADING ARMORY', () => Object.keys(WEAPONS).forEach(id => gunIcon(id))],
      ['BUILDING SAFEHOUSE', () => { this.lobby = new Lobby(this.renderer); }],
      ['SCANNING SECTOR · HARBOR', () => mapThumb('harbor')],
      ['SCANNING SECTOR · FOUNDRY', () => mapThumb('foundry')],
      ['SCANNING SECTOR · SHRINE', () => mapThumb('shrine')],
      ['BRIEFING OPERATORS', () => Object.keys(CHAR_SKINS).slice(0, 4).forEach(soldierIcon)],
      ['UPLINK SECURE', () => {}],
    ];
    const logoFill = $('sp-fillogo'), pct = $('sp-pct');
    const quick = new URLSearchParams(location.search).has('autostart');
    if (document.fonts && document.fonts.ready) await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 1500))]);
    for (let i = 0; i < steps.length; i++) {
      msg.textContent = steps[i][0];
      await new Promise(r => setTimeout(r, quick ? 30 : 110));
      try { steps[i][1](); } catch (e) { console.error(e); }
      const p = Math.round((i + 1) / steps.length * 100);
      fill.style.width = p + '%'; logoFill.style.setProperty('--p', p + '%'); pct.textContent = p + '%';
    }
    // el logo se termina de "cargar" con un destello antes de pasar al título
    $('splash').classList.add('sp-done');
    await new Promise(r => setTimeout(r, quick ? 100 : 520));
    $('splash').classList.add('fade');
    setTimeout(() => $('splash').remove(), 600);
    const qs = new URLSearchParams(location.search);
    if (qs.get('autostart') || qs.has('notitle')) this.toLobby();
    else { this.toTitle(); requestAnimationFrame((t) => this.frame(t)); return; }
    if (qs.get('autostart')) {
      // modo prueba: entra directo a una partida sin pointer lock
      this.startMatch({ mode: qs.get('autostart'), difficulty: qs.get('diff') || 'normal', bots: qs.get('bots') ? +qs.get('bots') : undefined });
      this.ui.pickLoadout(+(qs.get('loadout') || 0));
      this.debug.free();
    } else {
      // popups de bienvenida: noticias la primera vez, si no recompensas diarias
      setTimeout(() => { if (this.state === 'lobby' && !this.ui.maybeDaily()) this.ui.maybeNews(); }, 500);
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  refreshLobbyScene(o = null) {
    if (!this.lobby) return;
    const P = this.profile, L = P.loadouts[P.loadout] || P.loadouts[0];
    // o = probador: { skin } o { weapon, weaponSkin }
    const w = o && o.weapon ? o.weapon : L.primary;
    this.lobby.setPlayers([
      { skin: (o && o.skin) || P.charSkin, weapon: w, weaponSkin: o && o.weaponSkin ? o.weaponSkin : P.weaponSkins[w] },
      ...P.party.map((p, i) => ({ skin: p.skin, weapon: ['scout', 'vecta'][i] })),
    ]);
  }

  // Apertura de caja: escena propia con fundido desde el lobby
  openUnbox(opts, onDone) {
    const f = $('cine-fade'); f.classList.remove('white');
    $('lobby').classList.add('cine-hide');
    this.unbox = new Unbox(this, opts);
    this.prevState = this.state; this.state = 'unbox';
    f.style.transition = ''; f.style.opacity = 1;
    requestAnimationFrame(() => { f.style.transition = 'opacity 0.7s'; f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 750); });
    const finish = (equip) => {
      f.style.transition = 'opacity 0.35s'; f.style.opacity = 1;
      setTimeout(() => {
        this.unbox.dispose(); this.unbox = null; this.state = 'lobby';
        $('lobby').classList.remove('cine-hide');
        f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 400);
        if (onDone) onDone(equip);
      }, 360);
    };
    this.unbox.el.addEventListener('click', (e) => {
      if (e.target.id === 'ub-equip') finish(true);
      else if (e.target.id === 'ub-done') finish(false);
    });
  }

  // Mesa táctica (selector de modo, secuencia 6): escena propia con fundido desde el lobby
  openWarTable() {
    if (this.state !== 'lobby') return;
    const f = $('cine-fade'); f.classList.remove('white');
    this.ui.closeModal();
    f.style.transition = 'opacity 0.3s'; f.style.opacity = 1;
    setTimeout(() => {
      $('lobby').classList.add('cine-hide');
      this.wartable = new WarTable(this, (next) => {
        f.style.transition = 'opacity 0.3s'; f.style.opacity = 1;
        setTimeout(() => {
          this.wartable.dispose(); this.wartable = null; this.state = 'lobby';
          $('lobby').classList.remove('cine-hide');
          this.ui.refreshLobby();
          f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 350);
          if (next === 'custom') this.ui.openModes('custom');
        }, 320);
      });
      this.state = 'wartable';
      f.style.transition = 'opacity 0.6s'; f.style.opacity = 0; setTimeout(() => { f.style.transition = ''; }, 650);
    }, 320);
  }

  openBench(onClose, onTab) {
    if (!this.gunsmith) this.gunsmith = new Gunsmith(this);
    this.prevState = 'lobby'; this.state = 'gunsmith';
    this.gunsmith.openBench(() => { this.state = 'lobby'; if (onClose) onClose(); }, onTab);
  }
  openGunsmith(i, key, onClose) {
    if (!this.gunsmith) this.gunsmith = new Gunsmith(this);
    this.prevState = this.state; this.state = 'gunsmith';
    this.gunsmith.openFor(i, key, () => { this.state = this.prevState; if (onClose) onClose(); });
  }

  // Pantalla de título (secuencia 5) → lobby
  toTitle() {
    this.refreshLobbyScene();
    this.lobby.setTitle(true);
    this.state = 'title';
    this.input.enabled = false;
    this.ui.hud.hide();
    this.title = new Title(this, () => {
      this.title = null;
      this.state = 'lobby';
      this.lobby.setTitle(false); this.lobby.shot = 'home';
      this.ui.showLobby();
      document.body.classList.add('lobby-enter');
      setTimeout(() => document.body.classList.remove('lobby-enter'), 1800);
      setTimeout(() => { if (this.state === 'lobby' && !this.ui.maybeDaily()) this.ui.maybeNews(); }, 1300);
    });
  }

  toLobby() {
    if (this.lobby) this.lobby.resetCine();
    $('lobby').classList.remove('cine-hide'); $('cine-fade').style.opacity = 0;
    this.state = 'lobby';
    this.input.enabled = false;
    this.ui.hud.hide();
    this.ui.showLobby();
  }

  startMatch(opts) {
    initAudio();
    this.lastMatchOpts = opts;
    this.timeScale = 1;
    if (this.match) this.endMatchCleanup();
    this.ui.hideLobby();
    $('splash-msg') && ($('splash-msg').textContent = '');
    try {
      this.match = new Match(this, opts);
    } catch (e) { console.error(e); this.ui.toast('Error starting match'); this.toLobby(); return; }
    this.state = 'match';
    this.matchStart = performance.now();
    this.ui.hud.show();
    this.ui.hud.el.classList.add('hud-intro');
    this.ui.hud.onSpawn();
    this.ui.hud.chat(null, `${this.profile.name} joined the game`, '#f2c230');
    // el loadout se elige en la mochila; la partida empieza con la infiltración
  }

  onMatchEnd(r) {
    const P = this.profile, s = P.stats;
    const before = levelOf(P.xp).lv;
    P.coins += r.coins; P.xp += r.xp;
    s.matches++; if (r.win) s.wins++; if (r.place <= 3) s.top3++;
    s.kills += r.kills; s.deaths += r.deaths; s.headshots += r.headshots;
    s.shots += r.stats.shots; s.hits += r.stats.hits; s.bestStreak = Math.max(s.bestStreak, r.stats.bestStreak);
    s.playTime += (performance.now() - this.matchStart) / 1000;
    const after = levelOf(P.xp).lv;
    if (after > before) { r.levelUp = after; P.shards += 10 * (after - before); }
    // clasificatoria (Arena): RP según victoria y rendimiento
    const M = this.match;
    if (M && M.ranked && M.arena) {
      r.perf = M.arena.perf(); r.ranked = applyRanked(P, r.win, r.perf);
      if (r.ranked.promoted) r.rankReward = applyRankReward(P, r.ranked.after.rank.id);
    }
    // evento de fin de semana: puntos y pista de recompensas
    const ev = activeEvent();
    if (M && ev && M.modeId === ev.mode) r.event = { ev, ...applyEvent(P, ev, r.win) };
    // maestría de arma (500 bajas = MASTERY GOLD para esa arma)
    if (M) r.mastered = addMastery(P, M.wkills || {});
    r.xpBefore = P.xp - r.xp; r.coinsBefore = P.coins - r.coins;
    saveProfile(P);
  }

  endMatchCleanup() {
    if (!this.match) return;
    this.match.dispose();
    this.match = null;
    this.input.unlock();
    this.input.enabled = false;
  }
  // Volver al lobby con cinemática: el soldado entra por la puerta
  returnToLobby() {
    this.endMatchCleanup();
    this.ui.hideResults(); this.ui.hidePause(); this.ui.closeLoadout();
    $('click-to-play').classList.add('hidden');
    this.toLobby();
    $('lobby').classList.add('cine-hide');
    const f = $('cine-fade'); f.classList.remove('white'); f.style.opacity = 1;
    document.body.classList.add('letterbox-on');
    this.lobby.playCine('return', 1, () => { document.body.classList.remove('letterbox-on'); $('lobby').classList.remove('cine-hide'); this.lobby.resetCine(); this.ui.refreshLobby(); });
  }
  leaveMatch() {
    if (this.match && !this.match.ended) {
      // abandonar cuenta como partida jugada (sin recompensa)
      this.profile.stats.matches++; this.profile.stats.kills += this.match.me.kills; this.profile.stats.deaths += this.match.me.deaths; saveProfile(this.profile);
    }
    this.endMatchCleanup();
    this.ui.hideResults(); this.ui.hidePause(); this.ui.closeLoadout();
    $('click-to-play').classList.add('hidden');
    this.toLobby();
  }

  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    let dt = (t - this.last) / 1000; this.last = t;
    if (this.paused) return;
    dt = Math.min(dt, 0.05);
    this.watchFps(dt);
    this.step(dt);
    this.render();
  }

  // Si el juego va lento varios segundos seguidos en partida, baja la calidad automáticamente.
  // Resolución dinámica: si los FPS bajan, se reduce la resolución interna en pasos pequeños (casi invisible)
  // y se recupera cuando sobran FPS. Sólo si ya está al mínimo varios segundos se baja la calidad gráfica.
  watchFps(dt) {
    if (document.hidden || this.input.free || this.paused) { this.slowT = 0; return; }
    this.fpsAvg = (this.fpsAvg || 60) * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05;
    this.resT = (this.resT || 0) + dt;
    if (this.resT > 1.2) {
      const prev = this.resScale || 1;
      let next = prev;
      if (this.fpsAvg < 50) next = Math.max(0.6, prev - 0.1);
      else if (this.fpsAvg > 58 && prev < 1) next = Math.min(1, prev + 0.05);
      if (next !== prev) { this.resScale = next; this.renderer.setPixelRatio(this.pixelRatio()); this.resize(); this.resT = 0; }
      else if (next === prev) this.resT = 0.6;
    }
    if (this.state !== 'match') { this.slowT = 0; return; }
    this.slowT = this.fpsAvg < 38 && (this.resScale || 1) <= 0.6 ? (this.slowT || 0) + dt : 0;
    if (this.slowT > 6 && this.quality !== 'low') {
      const s = this.profile.settings;
      s.quality = s.quality === 'high' ? 'medium' : 'low';
      saveProfile(this.profile); this.applyQuality(); this.slowT = 0; this.fpsAvg = 60;
      this.ui.toast(`Graphics set to ${s.quality.toUpperCase()} for smoother play`);
    }
  }

  step(dt) {
    if (this.state === 'title' && this.lobby) {
      this.lobby.update(dt, innerWidth / innerHeight);
    } else if (this.state === 'lobby' && this.lobby) {
      this.lobby.update(dt, innerWidth / innerHeight);
      this.ui.updateLobbyTags();
      this.ui.updateCineOverlay();
    } else if (this.state === 'wartable' && this.wartable) {
      this.wartable.update(dt, innerWidth / innerHeight);
    } else if (this.state === 'unbox' && this.unbox) {
      this.unbox.update(dt, innerWidth / innerHeight);
    } else if (this.state === 'gunsmith' && this.gunsmith) {
      this.gunsmith.update(dt, innerWidth / innerHeight);
    } else if (this.state === 'match' && this.match) {
      // pausa táctica: el tiempo se frena hasta congelarse y vuelve con rampa
      const target = this.ui.pauseOpen && this.match.phase === 'live' ? 0 : 1;
      this.timeScale += (target - this.timeScale) * Math.min(1, dt * 8);
      if (Math.abs(target - this.timeScale) < 0.01) this.timeScale = target;
      this.feel.update(dt);
      const gdt = dt * this.timeScale * this.feel.timeScale * (this.match.arena ? this.match.arena.timeScale : 1);
      // subpasos para física estable
      const n = Math.ceil(gdt / 0.017);
      for (let i = 0; i < n; i++) {
        this.match.update(gdt / n);
        if (i < n - 1) this.input.endFrame();
      }
      if (this.match && this.match.phase === 'live') this.ui.hud.update(dt);
    }
    this.input.endFrame();
  }

  draw(scene, camera) {
    if (this.composer) { this.renderPass.scene = scene; this.renderPass.camera = camera; this.composer.render(); }
    else this.renderer.render(scene, camera);
  }
  render() {
    const r = this.renderer;
    if (this.state !== 'match') r.shadowMap.autoUpdate = true;
    if ((this.state === 'lobby' || this.state === 'title') && this.lobby) {
      r.autoClear = true;
      this.draw(this.lobby.scene, this.lobby.camera);
    } else if (this.state === 'wartable' && this.wartable) {
      r.autoClear = true;
      this.draw(this.wartable.scene, this.wartable.camera);
    } else if (this.state === 'unbox' && this.unbox) {
      r.autoClear = true;
      this.draw(this.unbox.scene, this.unbox.camera);
    } else if (this.state === 'gunsmith' && this.gunsmith) {
      r.autoClear = true;
      this.draw(this.gunsmith.scene, this.gunsmith.camera);
    } else if (this.state === 'match' && this.match) {
      r.autoClear = true;
      const M = this.match;
      if ((M.phase === 'podium' || M.phase === 'rewards') && M.podium) { r.shadowMap.autoUpdate = true; this.draw(M.podium.scene, M.podium.camera); return; }
      // las sombras del mapa se recalculan a 30 Hz (el pase de sombras era la mitad de todas las llamadas de dibujo)
      r.shadowMap.autoUpdate = false;
      this.shadowTick = ((this.shadowTick || 0) + 1) % 2;
      if (this.shadowTick === 0) r.shadowMap.needsUpdate = true;
      this.draw(M.scene, this.camera);
      if (M.me.alive && !M.death && !M.me.brAir && (M.phase === 'live' || M.phase === 'ending')) { r.autoClear = false; M.vm.render(r, innerWidth / innerHeight); r.autoClear = true; }
      else if (M.death && M.death.kvm && !M.death.bc) { r.autoClear = false; M.death.kvm.render(r, innerWidth / innerHeight); r.autoClear = true; }
    }
  }
}

const app = new App();
window.game = app;
initCloud(app); // progreso en la nube (si está configurado; si no, sólo localStorage)
// Ayudas para pruebas automáticas (sin pointer lock): game.debug.free(), game.debug.step(segundos)
app.debug = {
  free() { app.input.free = true; app.input.enabled = true; document.getElementById('click-to-play').classList.add('hidden'); },
  step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { app.step(dt); } app.render(); },
  // Foto fija del canvas encima de todo (el panel oculto sólo pinta durante capturas)
  snap() {
    app.render();
    const url = app.canvas.toDataURL('image/jpeg', 0.9);
    let im = document.getElementById('snapimg');
    if (!im) { im = document.createElement('img'); im.id = 'snapimg'; im.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:7;pointer-events:none'; document.body.appendChild(im); }
    im.src = url; im.style.display = 'block';
  },
  unsnap() { const im = document.getElementById('snapimg'); if (im) im.style.display = 'none'; },
  freezeBots() { for (const a of app.match.actors) if (a.brain) { a.brain._u = a.brain._u || a.brain.update; a.brain.update = () => ({ fwd: 0, right: 0 }); } },
  unfreezeBots() { for (const a of app.match.actors) if (a.brain && a.brain._u) a.brain.update = a.brain._u; },
  // Pone un bot a `dist` metros delante del jugador, mirándolo
  placeBot(dist = 6, side = 0) {
    const M = app.match, me = M.me, b = M.actors.find(a => a.isBot && (!M.mode.teams || a.team !== me.team));
    if (!b.alive) M.spawn(b);
    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw);
    b.pos.x = me.pos.x + fx * dist + Math.cos(me.yaw) * side; b.pos.z = me.pos.z + fz * dist - Math.sin(me.yaw) * side; b.pos.y = me.pos.y;
    b.yaw = me.yaw + Math.PI; b.spawnShield = 0; b.vel.x = b.vel.z = 0;
    return b;
  },
  aimAt(a, part = 'body') {
    const me = app.match.me, dx = a.pos.x - me.pos.x, dz = a.pos.z - me.pos.z;
    const y = part === 'head' ? a.pos.y + a.height - 0.12 : a.pos.y + a.height * 0.65;
    me.yaw = Math.atan2(-dx, -dz); me.pitch = Math.atan2(y - (me.pos.y + me.eyeH), Math.hypot(dx, dz));
  },
  click(button = 0, hold = 0.05) { app.input.mouse[button] = true; app.input.mousePressed[button] = true; app.debug.step(hold); app.input.mouse[button] = false; },
  // Lleva la partida al final con una kill real del jugador (para probar killcam/podio/informe)
  quickEnd() {
    const M = app.match, me = M.me, D = app.debug;
    if (M.phase === 'intro') { M.intro.t = 7.25; D.step(0.1); }
    D.freezeBots(); me.spawnShield = 99; D.step(1.2);
    const b = D.placeBot(10, 1.5); b.yaw = me.yaw + Math.PI + 0.7;
    D.step(3.0);
    me.kills = M.mode.teams ? 12 : M.mode.target - 1; me.score = me.kills * 100; me.weapon.mag = me.wdef.mag;
    if (M.mode.teams) { M.teamScore[me.team] = M.mode.target - 1; M.teamScore[me.team === 'blue' ? 'red' : 'blue'] = Math.floor(M.mode.target * 0.7); }
    for (let i = 0; i < 20 && b.alive; i++) { D.aimAt(b, 'head'); app.input.mouse[0] = true; app.input.mousePressed[0] = true; D.step(0.05); app.input.mouse[0] = false; D.step(0.22); }
    return M.phase;
  },
  // Un bot enemigo aparece delante y te mata de verdad (para probar la secuencia de muerte / killcam)
  dieTo(dist = 9, maxSec = 10) {
    const M = app.match, me = M.me, D = app.debug;
    if (M.phase === 'intro') { M.intro.t = 7.25; D.step(0.1); }
    D.freezeBots(); me.spawnShield = 99; D.step(2.0);
    const b = D.placeBot(dist, 1.2); b.hp = 100;
    me.spawnShield = 0; me.hp = 60;
    // el bot da unos pasos, apunta y dispara con puntería perfecta (disparos reales, grabados para la killcam)
    for (let t = 0; t < maxSec && me.alive; t += 0.1) {
      D.aimAt(b); D.step(0.1);
      const dx = me.pos.x - b.pos.x, dz = me.pos.z - b.pos.z;
      b.yaw = Math.atan2(-dx, -dz); b.pitch = Math.atan2(me.pos.y + 1.2 - (b.pos.y + b.eyeH), Math.hypot(dx, dz));
      if (t > 0.6 && b.weapon && b.drawT <= 0) {
        if (b.wdef.melee) { const d = Math.hypot(dx, dz); if (d > 1.6) { b.pos.x += dx / d * 0.5; b.pos.z += dz / d * 0.5; } else if (b.fireCd <= 0) { M.melee(b, false); b.fireCd = 0.45; } }
        else { b.weapon.mag = Math.max(1, b.weapon.mag); M.fireOnce(b); }
      }
    }
    return { dead: !me.alive, killer: M.death && M.death.killer && M.death.killer.name, stage: M.death && M.death.stage, canKC: M.death && M.death.canKC };
  },
  bulletStyle: null, // forzar estilo de la bullet cam: 'freeze' | 'xray' | 'shatter' | 'comic'
  key(code, hold = 0.05) { app.input.keys.add(code); app.input.pressed.add(code); app.debug.step(hold); app.input.keys.delete(code); },
};
