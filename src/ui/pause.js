// Secuencia 8 — PAUSA TÁCTICA y AJUSTES.
// Pausa: el tiempo se frena hasta congelarse (App.timeScale), el mundo se desenfoca y el sonido se amortigua;
// menú táctico con datos de la partida, tu tarjeta y el marcador. LEAVE MATCH se mantiene pulsado.
// Ajustes: categorías, descripción de cada opción y vista previa EN VIVO (al arrastrar el FOV en partida el menú
// se aparta y ves el juego); mira, diagrama de FOV y cm/360°.
import { play, setMuffle, setVolume, initAudio } from '../game/audio.js';
import { playerCard } from './record.js';
import { MODES } from '../data/modes.js';
import { cloud, signInGoogle, signOutCloud } from '../net/cloud.js';
import { loadProfile, saveLocal } from '../game/profile.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TIPS = [
  'Sprinting lowers your weapon — stop a moment before peeking a corner.',
  'Headshots deal bonus damage with every weapon, even the knife.',
  'Spawn protection ends the moment you fire.',
  'Press B after dying to change your loadout before redeploying.',
  'Hold your breath? No — just crouch: it tightens your spread.',
  'Weapons dropped by enemies refill your reserve ammo.',
];

// ---------------- AJUSTES ----------------
const CATS = [['controls', 'CONTROLS'], ['video', 'VIDEO'], ['audio', 'AUDIO'], ['hud', 'HUD & GAMEPLAY'], ['access', 'ACCESSIBILITY'], ['account', 'ACCOUNT']];
const DEFS = [
  { cat: 'controls', key: 'sens', label: 'MOUSE SENSITIVITY', type: 'range', min: 0.1, max: 4, step: 0.05, fmt: v => (+v).toFixed(2), desc: 'How fast the camera turns when you move the mouse.', pv: 'sens' },
  { cat: 'controls', key: 'adsSens', label: 'ADS SENSITIVITY', type: 'range', min: 0.2, max: 2, step: 0.05, fmt: v => (+v).toFixed(2) + '×', desc: 'Multiplier applied while aiming down sights. Scoped weapons scale it further.', pv: 'sens' },
  { cat: 'controls', key: 'invertY', label: 'INVERT MOUSE Y', type: 'seg', opts: [[false, 'OFF'], [true, 'ON']], desc: 'Flip vertical look: moving the mouse up looks down.' },
  { cat: 'video', key: 'fov', label: 'FIELD OF VIEW', type: 'range', min: 60, max: 100, step: 1, fmt: v => v + '°', desc: 'How much of the world you see. Higher shows more around you, lower makes targets look bigger. Drag it in a match to preview live.', pv: 'fov', live: true },
  { cat: 'video', key: 'quality', label: 'GRAPHICS QUALITY', type: 'seg', opts: [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']], desc: 'HIGH adds bloom and sharper shadows. LOW renders at reduced resolution for older PCs.', pv: 'quality' },
  { cat: 'video', key: 'showFps', label: 'SHOW FPS', type: 'seg', opts: [[false, 'OFF'], [true, 'ON']], desc: 'Shows frames per second and quality in the corner of the HUD.' },
  { cat: 'audio', key: 'volume', label: 'MASTER VOLUME', type: 'range', min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + '%', desc: 'Overall game volume: weapons, footsteps, interface and ambience.', pv: 'audio' },
  { cat: 'hud', key: 'crossStyle', label: 'CROSSHAIR', type: 'seg', opts: [['cross', 'CROSS'], ['dot', 'CROSS + DOT'], ['dotonly', 'DOT']], desc: 'Shape of your hip-fire crosshair.', pv: 'cross', live: true },
  { cat: 'hud', key: 'crosshair', label: 'CROSSHAIR COLOR', type: 'color', opts: ['#ffffff', '#4dff7a', '#2fe6ff', '#ffd23a', '#ff4be0'], desc: 'Pick a color that stands out on every map.', pv: 'cross', live: true },
  { cat: 'hud', key: 'killcam', label: 'KILLCAM ON DEATH', type: 'seg', opts: [[true, 'ON'], [false, 'OFF']], desc: 'Watch the replay from your killer\'s eyes after dying. Turn off to redeploy faster.' },
  { cat: 'hud', key: 'uiScale', label: 'HUD SCALE', type: 'range', min: 0.8, max: 1.3, step: 0.05, fmt: v => Math.round(v * 100) + '%', desc: 'Size of health, ammo, score and kill feed. Corners scale toward the screen edges so the center stays clear.', pv: 'hud', live: true },
  { cat: 'hud', key: 'dmgNumbers', label: 'DAMAGE NUMBERS', type: 'seg', opts: [[true, 'ON'], [false, 'OFF']], desc: 'Floating numbers over the enemy you hit. Rapid hits on the same target add up into one total. Yellow means headshot.', pv: 'dmg' },
  { cat: 'access', key: 'enemyColor', label: 'ENEMY COLOR', type: 'color', opts: ['#ff4b4b', '#ff4be0', '#ffd23a', '#ff8a1e'], desc: 'Color of enemy names, health bars and kill feed. Magenta and yellow are easier to tell apart with red-green color blindness. Enemies also keep a ✕ marker, so color is never the only cue.', pv: 'enemy' },
  { cat: 'access', key: 'reduceShake', label: 'REDUCE SCREEN SHAKE', type: 'seg', opts: [[false, 'OFF'], [true, 'ON']], desc: 'Cuts camera shake to 30% and disables hit-stop (the tiny freeze on kills). Recommended if fast motion makes you dizzy.' },
  { cat: 'access', key: 'reduceFlash', label: 'REDUCE FLASHING', type: 'seg', opts: [[false, 'OFF'], [true, 'ON']], desc: 'Disables the screen-edge flash on kills and headshots.' },
  { cat: 'account', key: 'cloud', label: 'CLOUD SAVE', type: 'cloud', desc: 'Your progress (coins, level, rank, skins, loadouts and settings) is saved online automatically. Sign in with Google to keep the same progress on every device and browser.' },
  { cat: 'hud', key: 'spray', label: 'SPRAY TAG', type: 'spray', desc: 'Text and color of your spray (press T in a match).' },
];

export class SettingsPanel {
  // ctx: { inMatch, onBack }
  constructor(app, ctx = {}) {
    this.app = app; this.ctx = ctx; this.s = app.profile.settings; this.cat = ctx.cat || 'controls';
    const el = this.el = document.createElement('div');
    el.className = 'st' + (ctx.inMatch ? ' in-match' : '');
    el.innerHTML = `
      <div class="st-top">${ctx.onBack ? '<button class="st-back">‹ BACK</button>' : ''}<div class="st-cats">${CATS.map(([id, n]) => `<button data-c="${id}">${n}</button>`).join('')}</div></div>
      <div class="st-main"><div class="st-list"></div><div class="st-side"><div class="st-pv"></div><h4></h4><p></p></div></div>
      ${ctx.inMatch ? '' : '<div class="st-reset"><button class="st-hold" id="st-reset"><i></i><span>HOLD TO RESET PROGRESS</span></button></div>'}`;
    el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => { play('ui'); this.go(b.dataset.c); }));
    if (ctx.onBack) el.querySelector('.st-back').addEventListener('click', () => { play('ui'); ctx.onBack(); });
    const rs = el.querySelector('#st-reset');
    if (rs) holdButton(rs, 1.4, () => { try { localStorage.clear(); saveLocal({ ...loadProfile(), updatedAt: Date.now() }); } catch (e) { /* bloqueado */ } location.reload(); });
    this.go(this.cat);
  }
  save() { this.app.ui.save(); }
  go(cat) {
    this.cat = cat;
    this.el.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === cat));
    const s = this.s, list = this.el.querySelector('.st-list');
    const defs = DEFS.filter(d => d.cat === cat);
    list.innerHTML = defs.map((d, i) => {
      let ctl = '';
      if (d.type === 'range') ctl = `<div class="st-range"><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${s[d.key]}"><b>${d.fmt(s[d.key])}</b></div>`;
      else if (d.type === 'seg') ctl = `<div class="st-seg">${d.opts.map(([v, n]) => `<button data-v="${v}" class="${String(s[d.key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
      else if (d.type === 'color') ctl = `<div class="st-colors">${d.opts.map(c => `<button data-v="${c}" class="${s[d.key] === c ? 'on' : ''}" style="--sw:${c}"></button>`).join('')}</div>`;
      else if (d.type === 'cloud') ctl = `<div class="st-cloud">${cloudHTML()}</div>`;
      else if (d.type === 'spray') ctl = `<div class="st-spray"><input maxlength="6" value="${esc(s.sprayText)}" spellcheck="false"><input type="color" value="${s.sprayColor}"></div>`;
      return `<div class="st-row" data-k="${d.key}" style="animation-delay:${i * 0.04}s"><label>${d.label}</label>${ctl}</div>`;
    }).join('');
    list.querySelectorAll('.st-row').forEach(row => {
      const d = DEFS.find(x => x.key === row.dataset.k);
      row.addEventListener('mouseenter', () => this.focus(d));
      if (d.type === 'range') {
        const r = row.querySelector('input'), out = row.querySelector('b');
        r.addEventListener('input', () => { s[d.key] = +r.value; out.textContent = d.fmt(s[d.key]); this.apply(d); this.save(); this.preview(d); });
        // vista previa en vivo: el menú se aparta mientras arrastras
        r.addEventListener('pointerdown', () => { if (d.live && this.ctx.inMatch) document.body.classList.add('st-live'); });
        r.addEventListener('pointerup', () => document.body.classList.remove('st-live'));
        r.addEventListener('change', () => { document.body.classList.remove('st-live'); if (d.key === 'volume') play('ui'); });
      } else if (d.type === 'seg' || d.type === 'color') {
        row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
          let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false;
          s[d.key] = v; this.save(); play('ui');
          row.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
          this.apply(d); this.preview(d);
          if (d.live && this.ctx.inMatch) { document.body.classList.add('st-live'); clearTimeout(this.liveTO); this.liveTO = setTimeout(() => document.body.classList.remove('st-live'), 900); }
        }));
      } else if (d.type === 'cloud') {
        const box = row.querySelector('.st-cloud');
        const bind = () => {
          box.innerHTML = cloudHTML();
          const g = box.querySelector('[data-cl="google"]'), o = box.querySelector('[data-cl="out"]');
          if (g) g.addEventListener('click', async () => { play('ui'); g.disabled = true; g.textContent = 'OPENING…'; const r = await signInGoogle(); if (r !== 'ok') this.app.ui.toast(r === 'auth/popup-blocked' ? 'Allow pop-ups to sign in' : 'Sign-in cancelled'); bind(); });
          if (o) o.addEventListener('click', async () => { play('ui'); await signOutCloud(); bind(); });
        };
        bind();
        const off = cloud.onChange(() => { if (document.body.contains(box)) bind(); else off(); });
      } else if (d.type === 'spray') {
        const [t, c] = row.querySelectorAll('input');
        t.addEventListener('keydown', (e) => e.stopPropagation());
        t.addEventListener('input', () => { s.sprayText = t.value.toUpperCase() || 'GG'; this.save(); this.preview(d); });
        c.addEventListener('input', () => { s.sprayColor = c.value; this.save(); this.preview(d); });
      }
    });
    this.focus(defs[0]);
  }
  apply(d) {
    const app = this.app, s = this.s;
    if (d.key === 'quality') app.applyQuality();
    if (d.key === 'volume') { initAudio(); setVolume(s.volume); }
    if (['crosshair', 'crossStyle', 'showFps', 'uiScale', 'enemyColor'].includes(d.key)) app.ui.hud.applyCrosshair();
    // FOV en vivo aunque la partida esté congelada
    if (d.key === 'fov' && app.state === 'match' && app.match && app.match.me.alive) { app.camera.fov = s.fov; app.camera.updateProjectionMatrix(); }
  }
  focus(d) {
    if (!d) return;
    const side = this.el.querySelector('.st-side');
    side.querySelector('h4').textContent = d.label;
    side.querySelector('p').textContent = d.desc;
    this.el.querySelectorAll('.st-row').forEach(r => r.classList.toggle('focus', r.dataset.k === d.key));
    this.preview(d);
  }
  // Vistas previas del panel lateral
  preview(d) {
    const pv = this.el.querySelector('.st-pv'), s = this.s;
    pv.className = 'st-pv pv-' + (d.pv || 'none');
    if (d.pv === 'fov') {
      const a = s.fov * Math.PI / 180, L = 90, x = Math.sin(a / 2) * L, y = Math.cos(a / 2) * L;
      pv.innerHTML = `<svg viewBox="0 0 200 110"><path d="M100 104 L${100 - x} ${104 - y} A${L} ${L} 0 0 1 ${100 + x} ${104 - y} Z" fill="rgba(63,224,255,.16)" stroke="#3fe0ff" stroke-width="2"/><circle cx="100" cy="104" r="5" fill="#fff"/><text x="100" y="62" text-anchor="middle">${s.fov}°</text></svg>`;
    } else if (d.pv === 'sens') {
      const cm = (2 * Math.PI / (0.0021 * s.sens)) / 800 * 2.54 / (d.key === 'adsSens' ? s.adsSens : 1);
      const turns = Math.min(1, 12 / cm);
      pv.innerHTML = `<svg viewBox="0 0 200 110"><circle cx="100" cy="55" r="40" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="8"/><circle cx="100" cy="55" r="40" fill="none" stroke="#3fe0ff" stroke-width="8" stroke-dasharray="${(251 * turns).toFixed(0)} 251" transform="rotate(-90 100 55)"/><text x="100" y="52" text-anchor="middle">${cm.toFixed(1)}</text><text x="100" y="70" text-anchor="middle" class="sm">CM / 360°</text></svg><small>@ 800 DPI${d.key === 'adsSens' ? ' · AIMING' : ''}</small>`;
    } else if (d.pv === 'cross') {
      pv.innerHTML = `<div class="pv-scene"><div class="crosshair ${s.crossStyle === 'dot' ? 'dot' : s.crossStyle === 'dotonly' ? 'dotonly' : ''}" style="--c:${s.crosshair}"><i class="ch-t"></i><i class="ch-b"></i><i class="ch-l"></i><i class="ch-r"></i><i class="ch-dot"></i></div></div>`;
    } else if (d.pv === 'audio') {
      pv.innerHTML = `<div class="pv-eq">${Array.from({ length: 14 }, (_, i) => `<i style="--h:${(0.25 + Math.abs(Math.sin(i * 1.7)) * 0.75) * s.volume};animation-delay:${i * 0.07}s"></i>`).join('')}</div>`;
    } else if (d.pv === 'quality') {
      const q = { low: [1, 'REDUCED RESOLUTION · BASIC SHADOWS'], medium: [2, 'NATIVE RESOLUTION · SOFT SHADOWS'], high: [3, 'BLOOM · 4K SHADOW MAPS'] }[s.quality];
      pv.innerHTML = `<div class="pv-q">${[1, 2, 3].map(i => `<i class="${i <= q[0] ? 'on' : ''}"></i>`).join('')}</div><small>${q[1]}</small>`;
    } else if (d.pv === 'hud') {
      pv.innerHTML = `<div class="pv-hud" style="--ui:${s.uiScale}"><i class="pv-hp"><b>100</b></i><i class="pv-am"><b>30</b>/90</i><i class="pv-ch"></i></div>`;
    } else if (d.pv === 'dmg') {
      pv.innerHTML = s.dmgNumbers ? `<div class="pv-dmg"><b>34</b><b class="head">87</b><b class="sm">21</b></div>` : '<div class="pv-dmg off">OFF</div>';
    } else if (d.pv === 'enemy') {
      pv.innerHTML = `<div class="pv-enemy" style="--enemy:${s.enemyColor}"><span class="tag3d enemy"><span>user#K4RV0</span><div class="tb"><i style="width:64%"></i></div></span><div class="kf"><span class="mine-n">YOU</span><span class="en">user#K4RV0</span></div></div>`;
    } else if (d.key === 'spray') {
      pv.innerHTML = `<div class="pv-spray" style="color:${s.sprayColor}">${esc(s.sprayText)}</div>`;
    } else pv.innerHTML = '';
  }
}

// Estado del guardado en la nube (pestaña ACCOUNT)
function cloudHTML() {
  const S = {
    local: ['LOCAL ONLY', 'Cloud save is not configured in this build. Progress stays in this browser.'],
    connecting: ['CONNECTING…', 'Reaching the cloud save service.'],
    guest: ['SAVED · GUEST', 'Saved online for this browser. Sign in with Google to use it on other devices.'],
    google: ['SAVED · GOOGLE', `Synced to ${esc(cloud.email || 'your Google account')} on every device.`],
    offline: ['OFFLINE', 'Could not reach the cloud. Progress is kept in this browser and syncs when you reconnect.'],
  }[cloud.status] || ['—', ''];
  const btn = cloud.status === 'guest' || cloud.status === 'offline' ? '<button class="btn cyan" data-cl="google">SIGN IN WITH GOOGLE</button>'
    : cloud.status === 'google' ? '<button class="btn dark" data-cl="out">SIGN OUT</button>' : '';
  return `<div class="cl-state cl-${cloud.status}"><i></i><b>${S[0]}</b></div><p>${S[1]}</p>${btn}`;
}

// Botón "mantener pulsado" con anillo que se llena
export function holdButton(btn, sec, onDone) {
  let k = 0, iv = null;
  const fill = btn.querySelector('i');
  const stop = () => { clearInterval(iv); iv = null; if (k < 1) { k = 0; btn.style.setProperty('--k', 0); btn.classList.remove('holding'); } };
  btn.addEventListener('pointerdown', () => {
    if (iv || k >= 1) return;
    btn.classList.add('holding'); play('uiHover');
    iv = setInterval(() => {
      k = Math.min(1, k + 0.016 / sec); btn.style.setProperty('--k', k);
      if (k >= 1) { clearInterval(iv); iv = null; play('buy'); onDone(); }
    }, 16);
  });
  btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop);
  void fill;
}

// ---------------- PAUSA ----------------
export class PauseMenu {
  constructor(app) {
    this.app = app;
    const ui = app.ui, m = app.match, me = m.me, P = app.profile;
    const st = m.standings(), place = st.indexOf(me) + 1;
    const tl = Math.max(0, Math.ceil(m.timeLeft)), mm = Math.floor(tl / 60), ss = String(tl % 60).padStart(2, '0');
    const score = m.mode.teams ? `BLUE ${m.teamScore.blue} — ${m.teamScore.red} RED` : `#${place} OF ${st.length}`;
    const board = st.slice(0, 6).map((a, i) => `<div class="pz-row ${a === me ? 'me' : ''} ${a.team || ''}"><span>${i + 1}</span><b>${esc(a.name)}</b><em>${a.kills}</em><small>${a.deaths}</small></div>`).join('');
    const el = this.el = document.getElementById('pause');
    el.className = 'overlay pz-on';
    el.innerHTML = `
      <div class="pz-blur"></div>
      <div class="pz-left">
        <div class="pz-head"><small>${MODES[m.modeId] ? MODES[m.modeId].name : m.mode.name} · ${m.map.name}</small><b>PAUSED</b><span><i class="pz-clock"></i>${mm}:${ss} · ${score}</span></div>
        <nav class="pz-menu">
          <button data-a="resume"><i>01</i><b>RESUME</b><small>Back to the fight</small></button>
          <button data-a="loadout"><i>02</i><b>LOADOUT</b><small>Switch weapons</small></button>
          <button data-a="settings"><i>03</i><b>SETTINGS</b><small>Controls · video · audio · HUD</small></button>
          <button data-a="leave" class="danger st-hold"><i>04</i><b>LEAVE MATCH</b><small>Hold to confirm</small><u></u></button>
        </nav>
        <div class="pz-set"></div>
      </div>
      <div class="pz-right">
        ${playerCard(P, {}, 'pz')}
        <div class="pz-stats"><div><b>${me.kills}</b><small>KILLS</small></div><div><b>${me.deaths}</b><small>DEATHS</small></div><div><b>${me.streak}</b><small>STREAK</small></div><div><b>${me.score}</b><small>SCORE</small></div></div>
        <div class="pz-board"><div class="pz-row hd"><span>#</span><b>PLAYER</b><em>K</em><small>D</small></div>${board}</div>
      </div>
      <div class="pz-tip"><b>TIP</b>${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>`;
    const btns = el.querySelectorAll('.pz-menu button');
    btns.forEach((b, i) => { b.style.animationDelay = (0.08 + i * 0.05) + 's'; b.addEventListener('mouseenter', () => play('uiHover')); });
    el.querySelector('[data-a="resume"]').addEventListener('click', () => { play('ui'); initAudio(); app.input.lock(); });
    el.querySelector('[data-a="loadout"]').addEventListener('click', () => { play('ui'); ui.hidePause(); ui.openLoadout(); });
    el.querySelector('[data-a="settings"]').addEventListener('click', () => { play('ui'); this.settings(); });
    const leave = el.querySelector('[data-a="leave"]');
    holdButton(leave, 1.0, () => { ui.hidePause(); app.leaveMatch(); });
    // ESC: en ajustes vuelve atrás; si no, reanuda (pide de nuevo el puntero)
    this.onKey = (e) => {
      if (e.code !== 'Escape') return;
      if (this.panel) { this.panel.ctx.onBack(); return; }
      initAudio(); app.input.lock();
    };
    addEventListener('keydown', this.onKey);
    document.body.classList.add('pz-active');
    setMuffle(1);
    play('pauseIn');
  }
  settings() {
    const box = this.el.querySelector('.pz-set');
    this.el.classList.add('pz-settings');
    this.panel = new SettingsPanel(this.app, { inMatch: true, onBack: () => { this.el.classList.remove('pz-settings'); box.innerHTML = ''; this.panel = null; } });
    box.innerHTML = ''; box.appendChild(this.panel.el);
  }
  close() {
    removeEventListener('keydown', this.onKey);
    document.body.classList.remove('pz-active', 'st-live');
    setMuffle(0);
    play('pauseOut');
    this.el.className = 'overlay hidden';
    this.el.innerHTML = '';
  }
}
