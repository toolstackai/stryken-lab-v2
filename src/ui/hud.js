// HUD dentro de la partida.
import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';
import { gunIcon } from '../gfx/icons.js';
import { play as playSfx } from '../game/audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HS_SVG = '<svg class="hs" viewBox="0 0 24 24"><path fill="#ffd23a" d="M12 2a8 8 0 0 0-8 8c0 3 1.6 5.4 4 6.7V20h8v-3.3c2.4-1.3 4-3.7 4-6.7a8 8 0 0 0-8-8zm-3 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z"/></svg>';

// ---------- Medallas: emblemas SVG propios ----------
const MEDAL_TIER = { 'FIRST BLOOD': 'gold', STREAK: 'gold', 'FURY KILL': 'gold', 'FRENZY KILL': 'gold', HEADSHOT: 'blue', LONGSHOT: 'blue', 'POINT BLANK': 'blue',
  'DOUBLE KILL': 'purple', 'TRIPLE KILL': 'purple', REVENGE: 'red', BUZZKILL: 'red', BOOM: 'red', BLADE: 'green' };
const TIER_COL = { gold: ['#ffe58a', '#e0a21c', '#7a4a06'], blue: ['#9fe6ff', '#2a9fd8', '#0c3c66'], purple: ['#e2b6ff', '#9a4dff', '#3a1470'], red: ['#ffb0a8', '#e0353b', '#5a0c10'], green: ['#b8ffc8', '#2fbf6a', '#0b4a24'] };
function medalGlyph(name) {
  if (name === 'HEADSHOT') return '<circle cx="36" cy="33" r="11" fill="#fff"/><rect x="29" y="40" width="14" height="8" rx="2" fill="#fff"/><circle cx="31.5" cy="33" r="3.2" fill="#000a"/><circle cx="40.5" cy="33" r="3.2" fill="#000a"/>';
  if (name === 'LONGSHOT') return '<circle cx="36" cy="36" r="12" fill="none" stroke="#fff" stroke-width="3"/><path d="M36 18v10M36 44v10M18 36h10M44 36h10" stroke="#fff" stroke-width="3"/><circle cx="36" cy="36" r="2.5" fill="#fff"/>';
  if (name === 'POINT BLANK') return '<path d="M36 22l3 9 10-3-7 8 7 8-10-3-3 9-3-9-10 3 7-8-7-8 10 3z" fill="#fff"/>';
  if (name === 'FIRST BLOOD') return '<path d="M36 20c6 9 11 15 11 21a11 11 0 0 1-22 0c0-6 5-12 11-21z" fill="#fff"/>';
  if (name.startsWith('STREAK') || name === 'FURY KILL' || name === 'FRENZY KILL') return '<path d="M38 18c2 8-6 10-4 18 1-4 5-6 5-6 1 6 8 7 8 15a11 11 0 0 1-22 0c0-8 7-12 7-18 3 3 3 6 3 6 3-5-1-11 3-15z" fill="#fff"/>';
  if (name === 'DOUBLE KILL' || name === 'TRIPLE KILL') return '<path d="M39 17L25 39h10l-4 16 16-24H37z" fill="#fff"/>';
  if (name === 'REVENGE') return '<path d="M24 36a12 12 0 1 1 4 9" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M20 42l8 4 2-9z" fill="#fff"/>';
  if (name === 'BUZZKILL') return '<path d="M26 26l20 20M46 26L26 46" stroke="#fff" stroke-width="5" stroke-linecap="round"/>';
  if (name === 'BOOM') return '<path d="M36 18l4 10 10-4-5 10 9 6-11 1 2 11-9-7-9 7 2-11-11-1 9-6-5-10 10 4z" fill="#fff"/>';
  if (name === 'BLADE') return '<path d="M44 18L30 40l4 4 14-24zM28 42l-6 8 4 2 6-8z" fill="#fff"/>';
  return '<circle cx="36" cy="36" r="8" fill="#fff"/>';
}
export const medalTier = (name) => MEDAL_TIER[name.startsWith('STREAK') ? 'STREAK' : name] || 'blue';
export function medalSVG(name, tier = medalTier(name)) {
  const [a, b, c] = TIER_COL[tier];
  const id = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 72 72"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs>
    <path d="M36 3l29 12v22c0 17-12 27-29 32C19 64 7 54 7 37V15z" fill="url(#${id})" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
    <path d="M36 11l21 9v17c0 12-8 20-21 24-13-4-21-12-21-24V20z" fill="#0b0f18" fill-opacity=".72"/>
    ${medalGlyph(name)}</svg>`;
}

export class HUD {
  constructor(app) {
    this.app = app;
    this.el = $('hud');
    this.hpBar = $('hp-bar');
    this.hpBar.innerHTML = '<i><s></s><b></b></i>'.repeat(7); // <s> = rastro del daño (se vacía con retraso)
    this.nums = []; // números de daño flotantes (V2)
    this.tags = $('tags'); this.tagEls = new Map();
    this.fpsT = 0; this.frames = 0;
    this.chatLines = [];
    this.hitT = 0;
  }
  get match() { return this.app.match; }

  show() { this.nums.forEach(n => n.el.remove()); this.nums = []; this.warnT = null; this.lastHp = null; this.el.classList.remove('hidden'); $('killfeed').innerHTML = ''; $('chat-log').innerHTML = ''; $('killbanner').innerHTML = ''; this.tagEls.forEach(e => e.remove()); this.tagEls.clear(); this.applyCrosshair(); }
  hide() { this.el.querySelectorAll('.end-banner').forEach(b => b.remove()); this.el.classList.remove('hud-ending'); this.el.classList.add('hidden'); $('scoreboard').classList.add('hidden'); $('death').classList.add('hidden'); }

  applyCrosshair() {
    const s = this.app.profile.settings, ch = $('crosshair');
    ch.style.setProperty('--c', s.crosshair);
    ch.className = 'crosshair' + (s.crossStyle === 'dot' ? ' dot' : s.crossStyle === 'dotonly' ? ' dotonly' : '');
    // V2: escala del HUD (cada esquina crece hacia su borde) y color de enemigo para daltonismo
    this.el.style.setProperty('--ui', s.uiScale || 1);
    document.documentElement.style.setProperty('--enemy', s.enemyColor || '#ff4b4b');
  }

  onSpawn(m = this.match) {
    if (!m) return;
    this.setHealth(m.me); this.setSlots(m.me); this.setAmmo(m.me);
    $('death').classList.add('hidden');
    $('hurt').style.opacity = 0;
  }

  setHealth(a) {
    const hp = Math.max(0, Math.ceil(a.hp));
    $('hp').textContent = hp;
    $('hp').parentElement.classList.toggle('low', hp <= 30);
    const segs = this.hpBar.children, per = 100 / segs.length;
    for (let i = 0; i < segs.length; i++) {
      const w = Math.max(0, Math.min(1, (hp - i * per) / per)) * 100 + '%';
      segs[i].lastChild.style.width = w;
      // el rastro sólo baja con retraso; al curarse sube a la vez
      const g = segs[i].firstChild, gw = parseFloat(g.style.width || '100');
      if (parseFloat(w) >= gw) { g.style.transition = 'none'; g.style.width = w; }
      else { g.style.transition = ''; g.style.width = w; }
    }
    const row = $('hp').parentElement;
    if (this.lastHp != null && hp < this.lastHp && row.animate) row.animate([{ transform: 'translateX(-3px)' }, { transform: 'translateX(3px)' }, { transform: 'none' }], { duration: 160 });
    this.lastHp = hp;
  }

  setSlots(a) {
    const order = [2, 1, 0];
    $('slots').innerHTML = order.map(i => {
      const w = a.slots[i];
      const id = w ? w.id : (i === 2 ? 'knife' : i === 1 ? 'p9' : 'akr');
      return `<div class="slot ${a.slot === i ? 'on' : ''} ${w ? '' : 'empty'}"><img src="${gunIcon(id).white}"><div class="sn">${i + 1}</div></div>`;
    }).join('');
    this.setAmmo(a);
  }

  setAmmo(a) {
    const w = a.weapon, d = a.wdef;
    $('ammo-name').textContent = d.name;
    const cnt = $('ammo-mag').parentElement;
    if (!w || d.slot === 3) { cnt.classList.add('inf'); $('ammo-mag').textContent = '∞'; $('ammo-res').textContent = ''; cnt.children[1].style.display = 'none'; return; }
    cnt.classList.remove('inf'); cnt.children[1].style.display = '';
    $('ammo-mag').textContent = w.mag; $('ammo-res').textContent = w.reserve;
    cnt.classList.toggle('low', w.mag <= Math.ceil(d.mag * 0.25));
    this.ammoWarn(a);
  }
  // Aviso bajo la mira: RELOAD / LOW AMMO / NO AMMO (sólo cuando importa)
  ammoWarn(a) {
    const w = a.weapon, d = a.wdef, el = $('ammo-warn');
    let t = '';
    if (w && d.slot !== 3 && a.alive && !(a.reloadT > 0)) {
      if (w.mag === 0) t = w.reserve > 0 ? 'RELOAD' : 'NO AMMO';
      else if (w.mag <= Math.ceil(d.mag * 0.25) && d.mag > 2) t = w.reserve > 0 ? 'RELOAD' : 'LOW AMMO';
    }
    if (t === this.warnT) return;
    this.warnT = t;
    el.innerHTML = t ? `<span class="${t === 'NO AMMO' ? 'bad' : ''}">${t === 'RELOAD' ? '<kbd>R</kbd>' : ''}${t}</span>` : '';
  }

  // ---------- Números de daño (V2 · game-ui-design) ----------
  // Golpes rápidos al mismo objetivo se suman en un único número que "late"; cabeza = amarillo y más grande.
  dmgNum(v, amount, head, kill) {
    if (!this.app.profile.settings.dmgNumbers || amount <= 0) return;
    const now = performance.now();
    let n = this.nums.find(o => o.v === v && now - o.last < 650 && !o.dead);
    if (!n) {
      const el = document.createElement('div'); el.className = 'v2n';
      $('v2-nums').appendChild(el);
      n = { v, el, total: 0, t: 0, last: now, dx: (Math.random() - 0.5) * 50, head: false, pos: { x: v.pos.x, y: v.pos.y + v.height + 0.3, z: v.pos.z } };
      this.nums.push(n);
      if (this.nums.length > 6) { const o = this.nums.shift(); o.el.remove(); }
    }
    n.total += Math.round(amount); n.last = now; n.t = 0; n.head = n.head || head;
    n.pos = { x: v.pos.x, y: v.pos.y + v.height + 0.3, z: v.pos.z };
    n.el.textContent = n.total;
    n.el.className = 'v2n' + (n.head ? ' head' : '') + (kill ? ' kill' : '') + (n.total >= 100 ? ' big' : '');
    if (n.el.animate) n.el.animate([{ transform: 'translate(-50%,-50%) scale(1.55)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 180, easing: 'cubic-bezier(.2,1.6,.4,1)' });
    if (kill) n.dead = true;
  }
  updateNums(dt) {
    if (!this.nums.length) return;
    const cam = this.app.camera, v = this.v3 || (this.v3 = new THREE.Vector3());
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += dt;
      if (n.t > 0.95) { n.el.remove(); this.nums.splice(i, 1); continue; }
      v.set(n.pos.x, n.pos.y + n.t * 0.55, n.pos.z).project(cam);
      if (v.z > 1) { n.el.style.opacity = 0; continue; }
      n.el.style.left = ((v.x * 0.5 + 0.5) * innerWidth + n.dx * Math.min(1, n.t * 3)) + 'px';
      n.el.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + 'px';
      n.el.style.opacity = n.t < 0.6 ? 1 : 1 - (n.t - 0.6) / 0.35;
    }
  }

  hitmarker(kind) {
    const h = $('hitmarker');
    h.className = 'hitmarker'; void h.offsetWidth;
    h.className = 'hitmarker show ' + kind;
  }

  damage(angle, amount) {
    const hurt = $('hurt');
    hurt.style.opacity = Math.min(1, 0.35 + amount / 60);
    clearTimeout(this.hurtTO); this.hurtTO = setTimeout(() => { hurt.style.opacity = this.match && this.match.me.hp < 30 && this.match.me.alive ? 0.35 : 0; }, 260);
    if (angle == null) return;
    const d = document.createElement('div'); d.className = 'dmg';
    d.style.transform = `rotate(${-angle}rad)`;
    $('dmg-layer').appendChild(d);
    setTimeout(() => d.classList.add('fade'), 500);
    setTimeout(() => d.remove(), 1400);
  }

  killfeed(k, v, weaponId, head) {
    const me = this.match.me;
    const kf = $('killfeed');
    const cls = (a) => (a && a.team ? a.team : '') + (a && a !== me && (!a.team || a.team !== me.team) ? ' en' : a === me ? ' mine-n' : '');
    const row = document.createElement('div');
    row.className = 'kf' + (v === me ? ' me' : '') + (k === me ? ' mine' : '');
    const icon = WEAPONS[weaponId] ? `<img src="${gunIcon(weaponId).white}">` : '<span style="color:#ffb">☠</span>';
    row.innerHTML = (k && k !== v ? `<span class="${cls(k)}">${esc(k.name)}</span>` : '') + icon + (head ? HS_SVG : '') + `<span class="${cls(v)}">${esc(v.name)}</span>`;
    kf.prepend(row);
    while (kf.children.length > 4) kf.lastChild.remove();
    setTimeout(() => { row.style.opacity = 0; }, 5500);
    setTimeout(() => row.remove(), 6000);
  }

  killBanner(name, head, streak, n) {
    const kb = $('killbanner');
    // el número de baja múltiple crece con cada baja seguida (×2, ×3…) y entra de golpe
    kb.innerHTML = `<div class="kb">${streak ? `<div class="kb-streak v2-combo" style="font-size:${Math.min(84, 36 + n * 10)}px">${streak}</div>` : ''}<div class="kb-main">ELIMINATED <span>${esc(name)}</span></div>${head ? '<div class="kb-hs">HEADSHOT +25</div>' : ''}</div>`;
    clearTimeout(this.kbTO); this.kbTO = setTimeout(() => { kb.innerHTML = ''; }, 2200);
  }

  announce(text, color = 'white') {
    this.el.querySelectorAll('.announce').forEach(o => o.remove()); // nunca dos anuncios encimados: el nuevo sustituye al anterior
    const el = document.createElement('div'); el.className = 'announce ' + color; el.textContent = text;
    this.el.appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  matchIntro(m) {
    const el = document.createElement('div'); el.className = 'intro';
    el.innerHTML = `<small>${m.map.name}</small><b>${m.mode.name}</b><span>${m.arena ? `FIRST TO ${m.arena.fmt.win} ROUNDS` : m.mode.teams ? 'FIRST TEAM TO ' + m.mode.target + ' KILLS' : 'FIRST TO ' + m.mode.target + ' KILLS'}</span>`;
    this.el.appendChild(el); setTimeout(() => el.remove(), 3600);
  }

  // El HUD se "arma" pieza a pieza al terminar la infiltración
  buildIn() {
    const el = this.el;
    el.classList.remove('hud-intro'); el.classList.remove('hud-build'); void el.offsetWidth; el.classList.add('hud-build');
    clearTimeout(this.buildTO); this.buildTO = setTimeout(() => el.classList.remove('hud-build'), 2500);
  }

  // Medallas animadas (se apilan en fila bajo la mira)
  medals(list) {
    let row = document.getElementById('medals');
    if (!row) { row = document.createElement('div'); row.id = 'medals'; this.el.appendChild(row); }
    list.slice(0, 4).forEach((name, i) => {
      const m = document.createElement('div');
      const tier = MEDAL_TIER[name.startsWith('STREAK') ? 'STREAK' : name] || 'blue';
      m.className = 'medal ' + tier;
      m.style.animationDelay = (i * 0.14) + 's, ' + (2.3 + i * 0.14) + 's';
      m.innerHTML = medalSVG(name, tier) + `<span>${name}</span>`;
      row.appendChild(m);
      setTimeout(() => playSfx('medal'), i * 140);
      setTimeout(() => m.remove(), 3000 + i * 140);
    });
  }

  // Gran letrero de fin de partida
  endBanner(win, sub, title) {
    const b = document.createElement('div');
    b.className = 'end-banner ' + (win ? 'win' : 'lose');
    b.innerHTML = `<i></i><b>${title || (win ? 'VICTORY' : 'DEFEAT')}</b><span>${sub}</span>`;
    this.el.appendChild(b);
    this.el.classList.add('hud-ending');
  }

  scorePop(text, head) {
    const d = document.createElement('div'); d.className = 'score-pop' + (head ? ' head' : ''); d.textContent = text;
    this.el.appendChild(d); setTimeout(() => d.remove(), 900);
  }

  toast(text) {
    const t = $('toast-hud'); const d = document.createElement('div'); d.textContent = text; t.appendChild(d);
    setTimeout(() => d.remove(), 1200);
  }

  chat(name, text, color) {
    const log = $('chat-log');
    const d = document.createElement('div');
    if (name) d.innerHTML = `<b>${esc(name)}:</b> ${esc(text)}`;
    else { d.textContent = text; d.style.color = color || '#f2c230'; }
    log.appendChild(d);
    while (log.children.length > 8) log.firstChild.remove();
    setTimeout(() => d.classList.add('old'), 9000);
  }

  pickupPrompt(name) {
    const p = $('pickup');
    if (name) { p.innerHTML = `<kbd>E</kbd> PICK UP ${esc(name)}`; p.classList.add('on'); } else p.classList.remove('on');
  }

  showDeath(killer, weaponId, head) {
    const d = $('death'); d.classList.remove('hidden');
    $('scope').classList.remove('on');
    if (killer) {
      d.innerHTML = `<div class="killed-by">KILLED BY</div><div class="kcard"><img src="${gunIcon(weaponId in WEAPONS ? weaponId : 'akr').white}"><div style="text-align:left"><div class="kname">${esc(killer.name)}</div><div class="khp">${Math.max(0, Math.ceil(killer.hp))} HP LEFT${head ? ' · HEADSHOT' : ''}</div></div></div><div class="resp">RESPAWN IN <b id="resp-t">4</b></div><div class="hint"><kbd>B</kbd> change loadout</div>`;
    } else d.innerHTML = `<div class="killed-by">YOU DIED</div><div class="resp">RESPAWN IN <b id="resp-t">4</b></div><div class="hint"><kbd>B</kbd> change loadout</div>`;
  }
  deathTimer(t) { const e = $('resp-t'); if (e) e.textContent = Math.ceil(t); }

  scoreboard(show) {
    const sb = $('scoreboard');
    if (!show) { sb.classList.add('hidden'); return; }
    sb.classList.remove('hidden');
    const m = this.match, st = m.standings();
    const row = (a, i) => `<tr class="${a === m.me ? 'me' : ''} ${a.alive ? '' : 'dead'}"><td>${i + 1}</td><td>${esc(a.name)}</td><td class="num">${a.score}</td><td class="num">${a.kills}</td><td class="num">${a.deaths}</td><td class="num">${a.assists}</td><td class="num">${a.isLocal ? 12 : a.ping}</td></tr>`;
    const head = '<tr><th>#</th><th>PLAYER</th><th class="num">SCORE</th><th class="num">K</th><th class="num">D</th><th class="num">A</th><th class="num">PING</th></tr>';
    let body;
    if (m.mode.teams) {
      body = ['blue', 'red'].map(t => `<div class="sb-team ${t}">${t.toUpperCase()} · ${m.teamScore[t]}</div><table class="sb-table">${head}${st.filter(a => a.team === t).map(row).join('')}</table>`).join('');
    } else body = `<table class="sb-table">${head}${st.map(row).join('')}</table>`;
    sb.innerHTML = `<div class="sb-head"><h3>${m.mode.name}</h3><span>${m.map.name} · ${m.br ? m.br.aliveCount() + ' ALIVE' : m.arena ? `ROUND ${m.arena.round} · FIRST TO ${m.arena.fmt.win}` : 'FIRST TO ' + m.mode.target}</span></div>${body}`;
  }

  // Por frame
  update(dt) {
    const m = this.match; if (!m) return;
    const me = m.me;
    // marcador superior
    if (m.br) m.br.ui.topBar(); else if (m.arena) m.arena.ui.topBar(); else this.topScore(m, me);
    this.updateMain(m, me, dt);
  }
  topScore(m, me) {
    const t = Math.ceil(m.timeLeft), mm = String(Math.floor(t / 60)).padStart(2, '0'), ss = String(t % 60).padStart(2, '0');
    $('ts-time').textContent = `${mm}:${ss}`;
    $('ts-time').parentElement.classList.toggle('low', t <= 30);
    const L = $('ts-left').parentElement, Rr = $('ts-right').parentElement;
    if (m.mode.teams) {
      $('ts-left').textContent = m.teamScore.blue; $('ts-left-l').textContent = 'BLUE';
      $('ts-right').textContent = m.teamScore.red; $('ts-right-l').textContent = 'RED';
      L.classList.add('blue'); Rr.classList.add('red');
    } else {
      $('ts-left').textContent = me.kills; $('ts-left-l').textContent = 'KILLED';
      $('ts-right').textContent = m.mode.target; $('ts-right-l').textContent = 'TARGET';
      L.classList.remove('blue'); Rr.classList.remove('red');
    }
  }
  updateMain(m, me, dt) {
    // mira dinámica
    const ch = $('crosshair');
    if (me.alive) {
      const d = me.wdef;
      const sp = me.spread();
      const px = Math.atan(sp) / Math.tan(this.app.camera.fov * Math.PI / 360) * (innerHeight / 2);
      ch.style.setProperty('--gap', Math.max(4, Math.min(80, px)) + 'px');
      const hideCh = (d.scope && me.ads > 0.3) || (me.ads > 0.85 && !d.melee) || me.sprinting;
      ch.classList.toggle('hide', hideCh);
      $('scope').classList.toggle('on', d.scope && me.ads > 0.85);
      // recarga
      const rb = $('reload-bar');
      if (me.reloadT > 0 && !d.perShell) { rb.classList.add('on'); rb.firstChild.style.width = (1 - me.reloadT / d.reload) * 100 + '%'; }
      else rb.classList.remove('on');
      $('shield').classList.toggle('on', me.spawnShield > 0);
      if (me.hp < 30) $('hurt').style.opacity = Math.max(parseFloat($('hurt').style.opacity) || 0, 0.3 + Math.sin(m.time * 4) * 0.1);
    } else { ch.classList.add('hide'); $('scope').classList.remove('on'); $('shield').classList.remove('on'); }
    // etiquetas de nombre
    this.updateTags();
    this.updateNums(dt);
    this.ammoWarn(me);
    // FPS
    this.frames++; this.fpsT += dt;
    if (this.fpsT > 0.5) { $('fps').textContent = this.app.profile.settings.showFps ? `${Math.round(this.frames / this.fpsT)} FPS · ${this.app.quality}` : ''; this.frames = 0; this.fpsT = 0; }
    if (!$('scoreboard').classList.contains('hidden')) { this.sbT = (this.sbT || 0) + dt; if (this.sbT > 0.5) { this.sbT = 0; this.scoreboard(true); } }
  }

  updateTags() {
    const m = this.match, cam = this.app.camera, me = m.me;
    const seen = new Set();
    const v = new THREE.Vector3();
    for (const a of m.actors) {
      if (a.isLocal || !a.alive) continue;
      const ally = m.mode.teams && a.team === me.team;
      const looked = m.lookTarget === a && m.lookT > 0.35;
      const killer = !me.alive && m.controller.deathCam && m.controller.deathCam.killer === a;
      if (!ally && !looked && !killer) continue;
      v.set(a.pos.x, a.pos.y + a.height + 0.35, a.pos.z).project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      seen.add(a);
      let el = this.tagEls.get(a);
      if (!el) { el = document.createElement('div'); el.className = 'tag3d ' + (ally ? 'ally' : 'enemy'); el.innerHTML = `<span></span><div class="tb"><i></i></div>`; this.tags.appendChild(el); this.tagEls.set(a, el); }
      el.firstChild.textContent = killer ? '☠ ' + a.name : ally ? a.name : '✕ ' + a.name;
      el.classList.toggle('killer', !!killer);
      el.lastChild.firstChild.style.width = Math.max(0, a.hp) + '%';
      el.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; el.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
    }
    for (const [a, el] of this.tagEls) if (!seen.has(a)) { el.remove(); this.tagEls.delete(a); }
  }
}
