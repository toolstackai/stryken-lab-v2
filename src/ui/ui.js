// Menús del lobby, modales y overlays de partida (loadout, pausa, resultados, chat).
import { HUD } from './hud.js';
import { Matchmaking } from './matchmaking.js';
import { ServiceRecord } from './record.js';
import { PauseMenu, SettingsPanel } from './pause.js';
import { claimable } from '../data/career.js';
import { aarExtras } from './aarx.js';
import { rankOf, rankBadge } from '../data/ranks.js';
import { activeEvent, eventProgress, TRACK, nextEventIn } from '../data/events.js';
import { MODES, DIFFICULTY, randomUser, randomBotName, modeAvailable } from '../data/modes.js';
import { WEAPONS, PRIMARIES, SECONDARIES } from '../data/weapons.js';
import { CHAR_SKINS, WEAPON_SKINS, RARITY } from '../data/cosmetics.js';
import { MAP_NAMES } from '../data/maps.js';
import { gunIcon, mapThumb, soldierIcon } from '../gfx/icons.js';
import { levelOf, saveProfile } from '../game/profile.js';
import { medalSVG } from './hud.js';
const MEDAL_ICON = (n) => `<i class="mi">${medalSVG(n)}</i>`;
import { play, initAudio, setVolume } from '../game/audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const today = () => new Date().toISOString().slice(0, 10);

const DAILY = [
  { label: 'COINS', ic: 'coin', n: 100, kind: 'coins', bg: '#4a5568' },
  { label: 'RANDOM SKIN', ic: 'skin', kind: 'skin', bg: 'linear-gradient(135deg,#2aa35a,#3d8bff)' },
  { label: 'SHARDS', ic: 'shard', n: 20, kind: 'shards', bg: '#8a4b2a' },
  { label: 'RANDOM SKIN', ic: 'skin', kind: 'skin', bg: 'linear-gradient(135deg,#6a3bd6,#3d8bff)' },
  { label: 'COINS', ic: 'coin', n: 250, kind: 'coins', bg: '#a0306a' },
  { label: 'SHARDS', ic: 'shard', n: 50, kind: 'shards', bg: '#4a5568' },
  { label: 'EPIC SKIN', ic: 'skin', kind: 'epic', bg: 'linear-gradient(135deg,#c9b52a,#a24dff)' },
];
const rewardIcon = (ic) => ic === 'skin' ? `<span class="ric skin"><img src="${gunIcon('akr').white}"><b>?</b></span>` : `<span class="ric ${ic}"></span>`;

export class UI {
  constructor(app) {
    this.app = app;
    this.hud = new HUD(app);
    this.chatOpen = false; this.loadoutOpen = false; this.pauseOpen = false;
    this.bindLobby();
    this.bindMatchKeys();
  }
  get P() { return this.app.profile; }
  save() { saveProfile(this.P); }

  toast(msg) { const d = document.createElement('div'); d.textContent = msg; $('toast').appendChild(d); setTimeout(() => d.remove(), 2600); }

  // ================= LOBBY =================
  bindLobby() {
    const click = (el, fn) => el.addEventListener('click', (e) => { initAudio(); play('ui'); fn(e); });
    document.querySelectorAll('.topnav button').forEach(b => {
      click(b, () => {
        const n = b.dataset.nav;
        if (n === 'play') return this.closeModal();
        ({ inventory: () => this.openInventory(), store: () => this.openStore(), profile: () => this.openProfile(), center: () => this.openCenter() })[n]();
      });
      b.addEventListener('mouseenter', () => play('uiHover'));
    });
    click($('btn-settings'), () => this.openSettings());
    click($('btn-mode'), () => this.app.openWarTable());
    click($('btn-custom'), () => this.openModes('custom'));
    click($('btn-play'), () => this.play());
    click($('btn-skin'), () => this.openInventory('chars'));
    click($('dailybox'), () => this.openDailyBox());
    click($('btn-controls'), () => this.openCenter('controls'));
    // V2: tarjeta de rango (lleva a la clasificatoria) y cartel del evento de fin de semana
    click($('rank-card'), () => { if (!MODES[this.P.mode] || MODES[this.P.mode].list !== 'ranked') this.P.mode = 'arena3'; this.save(); this.app.openWarTable(); });
    click($('event-card'), () => { const ev = activeEvent(); if (ev) { this.P.mode = ev.mode; this.save(); this.refreshLobby(); this.toast(`${ev.name} SELECTED — PRESS PLAY`); } });
    document.querySelectorAll('.friend-slot').forEach(fs => click(fs, () => this.friendSlot(+fs.dataset.slot)));
    ['btn-play', 'btn-mode', 'btn-custom', 'dailybox'].forEach(id => $(id).addEventListener('mouseenter', () => play('uiHover')));
    const skip = (e) => {
      const L = this.app.lobby;
      if (this.app.state !== 'lobby' || !L || !L.cine || L.cine.finished) return;
      if (e.type === 'keydown' && !['Escape', 'Space', 'Enter'].includes(e.code)) return;
      L.skipCine();
    };
    addEventListener('keydown', skip); addEventListener('mousedown', skip);
    // girar personaje arrastrando
    let drag = null;
    addEventListener('mousedown', (e) => { if (this.app.state === 'lobby' && e.target === this.app.canvas) drag = e.clientX; });
    addEventListener('mousemove', (e) => { if (drag != null && this.app.lobby) { this.app.lobby.spinV += (e.clientX - drag) * 0.6; drag = e.clientX; } });
    addEventListener('mouseup', () => { drag = null; });
  }

  showLobby() {
    $('lobby').classList.remove('hidden');
    this.refreshLobby();
  }
  hideLobby() { $('lobby').classList.add('hidden'); this.closeModal(); }

  refreshLobby() {
    const P = this.P, lv = levelOf(P.xp);
    $('w-coins').textContent = P.coins.toLocaleString('en-US'); $('w-shards').textContent = P.shards; $('w-level').textContent = lv.lv;
    const m = MODES[P.mode];
    $('mode-sub').textContent = m ? m.name : 'ALL MODES';
    $('party-id').textContent = 'r_' + P.name.replace('user#', '').toLowerCase() + ':local';
    // premios del career track pendientes: punto en PROFILE + aviso cuando aparecen nuevos
    const ready = claimable(P).length, pb = document.querySelector('.topnav [data-nav="profile"]');
    if (pb) { let d = pb.querySelector('.dot'); if (ready && !d) { d = document.createElement('i'); d.className = 'dot'; pb.appendChild(d); } else if (!ready && d) d.remove(); }
    if (ready > (this.lastReady ?? ready)) setTimeout(() => this.toast(`🎖 ${ready} CAREER REWARD${ready > 1 ? 'S' : ''} READY — open PROFILE`), 900);
    this.lastReady = ready;
    const claimed = P.dailyBox === today();
    $('dailybox').classList.toggle('claimed', claimed);
    $('db-free').textContent = claimed ? 'TOMORROW' : 'FREE X1';
    document.querySelectorAll('.friend-slot').forEach(fs => {
      const pm = P.party[+fs.dataset.slot - 1];
      fs.classList.toggle('filled', !!pm);
      fs.querySelector('span').textContent = pm ? 'KICK' : 'ADD FRIEND';
    });
    // rango
    const rp = (P.ranked || {}).rp || 0, rk = rankOf(rp);
    $('rank-card').innerHTML = `${rankBadge(rp, { size: 40 })}<span><small>RANKED</small><b>${rk.label}</b><i><em style="width:${(rk.prog * 100).toFixed(0)}%"></em></i><small>${rp} RP</small></span>`;
    // evento
    const ev = activeEvent(), ec = $('event-card');
    if (ev) {
      const E = eventProgress(P, ev), max = TRACK[TRACK.length - 1].pts;
      ec.className = 'event-card on' + (P.mode === ev.mode ? ' sel' : '');
      ec.innerHTML = `<small>WEEKEND EVENT · LIVE</small><b>${ev.name}</b><span>${ev.tag}</span><i><em style="width:${Math.min(100, E.pts / max * 100)}%"></em></i><small>${Math.min(E.pts, max)}/${max} PTS · EXCLUSIVE CAMO</small>`;
    } else {
      const d = Math.ceil(nextEventIn() / 864e5);
      ec.className = 'event-card';
      ec.innerHTML = `<small>WEEKEND EVENT</small><b>NEXT IN ${d}D</b><span>EVERY FRI–SUN · EXCLUSIVE REWARDS</span>`;
    }
    this.app.refreshLobbyScene();
  }

  // Etiquetas de nombre sobre los soldados del lobby
  updateLobbyTags() {
    const L = this.app.lobby; if (!L) return;
    const box = $('nametags');
    const names = [this.P.name, ...this.P.party.map(p => p.name)];
    if (box.children.length !== names.length) box.innerHTML = names.map(() => '<div class="nametag"></div>').join('');
    names.forEach((n, i) => {
      const p = L.headScreen(i, innerWidth, innerHeight), el = box.children[i];
      if (!p) return;
      el.innerHTML = `${esc(n)}${i === 0 ? `<small>Lv.${levelOf(this.P.xp).lv}</small>` : ''}`;
      el.style.left = p.x + 'px'; el.style.top = p.y + 'px';
    });
  }

  friendSlot(i) {
    const P = this.P;
    if (P.party[i - 1]) { P.party.splice(i - 1, 1); this.save(); this.refreshLobby(); return; }
    const cands = [0, 1, 2].map(() => ({ name: randomBotName(), skin: Object.keys(CHAR_SKINS)[Math.floor(Math.random() * 8)] }));
    const body = `<p style="font-family:var(--body);color:var(--muted);margin-bottom:14px">Invite a squadmate. Friends join your team in Team Deathmatch and play every match with you.</p>
      <div class="inv">${cands.map((c, k) => `<div class="item" data-k="${k}" style="--rc:${RARITY[CHAR_SKINS[c.skin].rarity].color}"><div class="it-name" style="font-size:15px">${esc(c.name)}</div><div class="it-img"><img src="${soldierIcon(c.skin)}" style="max-height:110px"></div><div class="it-foot"><span>${CHAR_SKINS[c.skin].name}</span><span class="tag">INVITE</span></div></div>`).join('')}</div>`;
    const m = this.modal('ADD FRIEND', body, { width: 620 });
    m.querySelectorAll('.item').forEach(it => it.addEventListener('click', () => {
      P.party.push(cands[+it.dataset.k]); P.party = P.party.slice(0, 2); this.save();
      play('buy'); this.toast(`${cands[+it.dataset.k].name} joined your party`);
      this.closeModal(); this.refreshLobby();
    }));
  }

  // PLAY → matchmaking (secuencia 6) → cinemática de la puerta → partida
  play() {
    if (this.joining || !this.app.lobby) return;
    if (!modeAvailable(this.P.mode)) { this.P.mode = 'dm'; this.save(); }
    this.joining = true;
    this.closeModal();
    this.mm = new Matchmaking(this.app, this.P.mode, (names) => { this.mm = null; this.deploy(names); }, () => { this.mm = null; this.joining = false; });
  }
  deploy(names = null) {
    const b = $('btn-play'); b.classList.add('joining'); b.firstChild.textContent = 'DEPLOYING...';
    $('lobby').classList.add('cine-hide'); document.body.classList.add('letterbox-on');
    play('draw');
    this.app.lobby.spin = 0; this.app.lobby.spinV = 0;
    this.app.lobby.playCine('deploy', 1, () => {
      this.joining = false; b.classList.remove('joining'); b.firstChild.textContent = 'PLAY';
      document.body.classList.remove('letterbox-on');
      this.app.startMatch({ mode: this.P.mode, difficulty: this.P.difficulty, names });
    });
  }

  // Fundidos de las cinemáticas (se llama cada frame en el lobby)
  updateCineOverlay() {
    const L = this.app.lobby, f = $('cine-fade');
    let sk = $('cine-skip'); if (!sk) { sk = document.createElement('div'); sk.id = 'cine-skip'; sk.innerHTML = '<kbd>ESC</kbd> SKIP'; document.body.appendChild(sk); }
    sk.classList.toggle('on', !!(L && L.cine && !L.cine.finished));
    if (f.style.transition) return;
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    let o = 0;
    if (L && L.cine && !L.cine.finished) {
      const k = L.cineK || 0;
      if (L.cine.name === 'bag') { f.classList.remove('white'); o = ss(0.82, 1, k); }
      else if (L.cine.name === 'return') { f.classList.remove('white'); o = 1 - ss(0, 0.2, k); }
      else { f.classList.add('white'); o = ss(0.72, 1, k); }
    } else if (L && L.cine && L.cine.finished && L.cine.name === 'deploy') { f.classList.add('white'); o = 1; }
    f.style.opacity = o;
  }

  // ================= MOCHILA (inventario cinemático) =================
  openBag(tab = 'loadouts') {
    const L = this.app.lobby;
    if (this.bagBusy || !L) return;
    this.bagBusy = true;
    this.closeModal(); this.navActive('inventory');
    $('lobby').classList.add('cine-hide'); document.body.classList.add('letterbox-on');
    L.spin = 0; L.spinV = 0;
    play('draw');
    setTimeout(() => play('magOut'), 1150); // la tapa se abre
    L.playCine('bag', 1, () => {
      document.body.classList.remove('letterbox-on'); this.bagBusy = false;
      const f = $('cine-fade'); f.style.transition = 'opacity 0.7s'; f.style.opacity = 0;
      setTimeout(() => { f.style.transition = ''; }, 750);
      this.app.openBench(() => this.leaveBench(), (t) => { if (t !== 'loadouts') this.showBag(t, true); });
      if (tab === 'chars' || tab === 'skins') this.showBag(tab, true);
    });
  }
  showBag(tab, overBench = false) {
    if (this.bagEl) this.bagEl.remove();
    const el = h(`<div id="bag" class="${overBench ? 'over' : ''}"><div class="zip"><i></i></div><div class="stitch"></div>
      <div class="bag-head"><h1><small>INVENTORY</small>BACKPACK</h1><button class="bag-close">${overBench ? '‹ BACK TO BENCH' : 'CLOSE BAG ✕'}</button></div>
      <div class="bag-tabs"><button data-t="loadouts">LOADOUTS</button><button data-t="chars">OPERATORS</button><button data-t="skins">WEAPON SKINS</button></div>
      <div class="bag-body"></div></div>`);
    document.body.appendChild(el); this.bagEl = el;
    const body = el.querySelector('.bag-body');
    const go = (t) => {
      el.querySelectorAll('.bag-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
      this.bagTab = t;
      if (t === 'loadouts') this.bagLoadouts(body); else this.renderInv(t, body, false);
      body.querySelectorAll('.item, .bl-card').forEach((c, i) => { c.style.animationDelay = (i * 45) + 'ms'; });
    };
    el.querySelectorAll('.bag-tabs button').forEach(b => b.addEventListener('click', () => { play('ui'); go(b.dataset.t); }));
    el.querySelector('.bag-close').addEventListener('click', () => { play('ui'); if (overBench) { el.classList.add('out'); setTimeout(() => el.remove(), 450); this.bagEl = null; } else this.closeBag(); });
    this.bagGo = go;
    go(tab === 'chars' || tab === 'skins' ? tab : 'loadouts');
  }
  bagLoadouts(body) {
    const P = this.P;
    body.innerHTML = `<div class="bag-loadouts">${P.loadouts.map((L, i) => `
      <div class="bl-card ${P.loadout === i ? 'on' : ''}">
        <h3>${i < 3 ? 'CUSTOM LOADOUT ' + (i + 1) : 'LOADOUT ' + (i + 1)}<button data-eq="${i}">${P.loadout === i ? 'EQUIPPED' : 'EQUIP'}</button></h3>
        ${['primary', 'secondary'].map(k => `<div class="bl-slot" data-i="${i}" data-k="${k}"><img src="${gunIcon(L[k], P.weaponSkins[L[k]]).color}"><div><small>${k.toUpperCase()} · ${WEAPONS[L[k]].kind}</small><b>${WEAPONS[L[k]].name}</b></div><span class="edit">GUNSMITH ›</span></div>`).join('')}
      </div>`).join('')}</div>`;
    body.querySelectorAll('[data-eq]').forEach(b => b.addEventListener('click', () => { P.loadout = +b.dataset.eq; this.save(); play('buy'); this.refreshLobby(); this.bagLoadouts(body); }));
    body.querySelectorAll('.bl-slot').forEach(s => s.addEventListener('click', () => {
      play('ui');
      this.bagEl.style.display = 'none';
      this.app.openGunsmith(+s.dataset.i, s.dataset.k, () => { this.bagEl.style.display = ''; this.refreshLobby(); this.bagGo('loadouts'); });
    }));
  }
  // Salir de la mesa de equipo: subir fuera de la mochila (cinemática en reversa)
  leaveBench() {
    const L = this.app.lobby;
    if (this.bagEl) { this.bagEl.remove(); this.bagEl = null; }
    $('cine-fade').classList.remove('white'); $('cine-fade').style.opacity = 1;
    document.body.classList.add('letterbox-on');
    setTimeout(() => play('magIn'), 700);
    L.playCine('bag', -1, () => {
      document.body.classList.remove('letterbox-on');
      $('lobby').classList.remove('cine-hide'); L.resetCine(); this.navActive('play');
    });
  }
  closeBag() {
    const L = this.app.lobby, el = this.bagEl;
    if (!el || this.bagBusy) return;
    this.bagBusy = true;
    el.classList.add('out'); setTimeout(() => el.remove(), 450); this.bagEl = null;
    document.body.classList.add('letterbox-on');
    setTimeout(() => play('magIn'), 700); // la tapa se cierra
    L.playCine('bag', -1, () => {
      document.body.classList.remove('letterbox-on');
      $('lobby').classList.remove('cine-hide'); L.resetCine(); this.navActive('play'); this.bagBusy = false;
    });
  }

  // ================= MODALES =================
  modal(title, body, { width = 860, tabs = null, onTab = null, tab = null, cls = '', nav = 'play', docked = false, shot = null } = {}) {
    this.closeModal();
    this.navActive(nav);
    if (shot && this.app.lobby && this.app.state === 'lobby') this.app.lobby.setShot(shot);
    const tabsHtml = tabs ? `<div class="tabs">${tabs.map(([id, n]) => `<button data-tab="${id}" class="${id === tab ? 'on' : ''}">${n}</button>`).join('')}</div>` : '';
    const el = h(`<div class="backdrop ${docked ? 'docked' : ''}"><div class="panel ${cls}" style="width:min(${width}px,94vw)"><i class="c3"></i><i class="c4"></i>
      <div class="panel-head"><h2>${title}</h2><button class="x-btn">✕</button></div>${tabsHtml}<div class="panel-body"></div></div></div>`);
    const bodyEl = el.querySelector('.panel-body');
    if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    el.querySelector('.x-btn').addEventListener('click', () => { play('ui'); this.closeModal(); });
    el.addEventListener('mousedown', (e) => { if (e.target === el) this.closeModal(); });
    if (tabs) el.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => {
      play('ui'); el.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b)); onTab(b.dataset.tab, bodyEl);
    }));
    $('modal-root').appendChild(el);
    this.modalEl = el;
    if (tabs && onTab) onTab(tab, bodyEl);
    return el;
  }
  closeModal() {
    if (this.modalEl) { this.modalEl.remove(); this.modalEl = null; }
    $('modal-root').innerHTML = '';
    if (this.onModalClose) { const f = this.onModalClose; this.onModalClose = null; f(); }
    if (this.app.lobby && !this.app.lobby.cine) this.app.lobby.setShot('home');
    if (this.trying) { this.trying = null; this.app.refreshLobbyScene(); }
    document.querySelectorAll('.topnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === 'play'));
  }
  navActive(n) { document.querySelectorAll('.topnav button').forEach(b => b.classList.toggle('active', b.dataset.nav === n)); }

  // ---------- Selector de modo ----------
  openModes(tab = 'modes') {
    const P = this.P;
    const render = (t, body) => {
      if (t === 'modes') {
        const cards = Object.entries(MODES).filter(([id]) => modeAvailable(id)).map(([id, m]) => `<div class="mode-card ${P.mode === id ? 'on' : ''}" data-mode="${id}" style="background-image:url(${mapThumb(m.map)})"><div class="mc-label"><span>${m.name}</span></div></div>`).join('');
        const locked = ['harbor', 'foundry', 'shrine'].map((mp, i) => `<div class="mode-card locked" style="background-image:url(${mapThumb(mp)});background-position:${30 + i * 20}% 40%;background-size:180%"><div class="mc-label"><span>${['GUN GAME', 'CAPTURE THE FLAG', 'SNIPERS ONLY'][i]}</span><small>COMING SOON</small></div></div>`).join('');
        body.innerHTML = `<div class="mode-grid">${cards}${locked}</div>
          <div class="field" style="margin-top:18px"><label>BOT DIFFICULTY</label><div class="seg" id="diff-seg">${Object.entries(DIFFICULTY).map(([id, d]) => `<button data-d="${id}" class="${P.difficulty === id ? 'on' : ''}">${d.name}</button>`).join('')}</div></div>`;
        body.querySelectorAll('[data-mode]').forEach(c => c.addEventListener('click', () => {
          P.mode = c.dataset.mode; this.save(); play('ui');
          body.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('on', x === c));
          this.refreshLobby();
        }));
        body.querySelectorAll('[data-d]').forEach(c => c.addEventListener('click', () => { P.difficulty = c.dataset.d; this.save(); play('ui'); body.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === c)); }));
      } else {
        const C = P.custom;
        C.difficulty = C.difficulty || P.difficulty; C.time = C.time || 300; C.target = C.target || 0;
        const seg = (key, opts) => `<div class="seg" data-key="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(C[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div>`;
        body.innerHTML = `<div class="custom-grid">
          <div class="field"><label>MAP</label>${seg('map', Object.entries(MAP_NAMES))}</div>
          <div class="field"><label>MODE</label>${seg('mode', Object.entries(MODES).map(([id, m]) => [id, m.name]))}</div>
          <div class="field"><label>BOTS</label><div class="range-row"><input type="range" min="1" max="11" value="${C.bots}" id="c-bots"><b id="c-bots-v">${C.bots}</b></div></div>
          <div class="field"><label>DIFFICULTY</label>${seg('difficulty', Object.entries(DIFFICULTY).map(([id, d]) => [id, d.name]))}</div>
          <div class="field"><label>TIME LIMIT</label>${seg('time', [[180, '3 MIN'], [300, '5 MIN'], [600, '10 MIN']])}</div>
          <div class="field"><label>KILL TARGET</label>${seg('target', [[0, 'DEFAULT'], [15, '15'], [30, '30'], [50, '50'], [100, '100']])}</div>
        </div><div style="text-align:center;margin-top:22px"><button class="btn cyan" id="c-go" style="font-size:26px;padding:10px 60px">PLAY CUSTOM</button></div>`;
        body.querySelectorAll('.seg').forEach(s => s.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
          const v = b.dataset.v; C[s.dataset.key] = isNaN(+v) ? v : +v; this.save(); play('ui');
          s.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
        })));
        const r = body.querySelector('#c-bots'); r.addEventListener('input', () => { C.bots = +r.value; body.querySelector('#c-bots-v').textContent = r.value; this.save(); });
        body.querySelector('#c-go').addEventListener('click', () => {
          play('ui'); this.closeModal();
          this.app.startMatch({ mode: C.mode, map: C.map, bots: C.bots, difficulty: C.difficulty, overrides: { time: C.time, ...(C.target ? { target: C.target } : {}) } });
        });
      }
    };
    this.modal('MODE SELECTOR', null, { tabs: [['modes', 'GAME SETTINGS'], ['custom', 'CUSTOM MATCH']], tab, onTab: render, width: 900 });
  }

  // ---------- Inventario ----------
  openInventory(tab = 'loadouts') { this.openBag(tab); }
  openStore(tab = 'chars') {
    this.modal('STORE', null, { nav: 'store', docked: true, shot: 'store', tabs: [['chars', 'CHARACTERS'], ['skins', 'WEAPON SKINS'], ['boxes', 'BOXES']], tab, width: 960, onTab: (t, body) => this.renderInv(t, body, true) });
  }
  renderInv(t, body, store) {
    const P = this.P;
    const price = (n) => `<span class="price"><i></i>${n.toLocaleString('en-US')}</span>`;
    if (t === 'chars') {
      const ids = Object.keys(CHAR_SKINS).filter(id => store ? !P.ownedChars.includes(id) : P.ownedChars.includes(id));
      if (!ids.length) { body.innerHTML = `<p style="font-family:var(--body);color:var(--muted)">${store ? 'You own every character. Legend!' : 'Nothing here yet.'}</p>`; return; }
      body.innerHTML = `<div class="inv">${ids.map(id => { const s = CHAR_SKINS[id]; const rc = RARITY[s.rarity].color; const eq = P.charSkin === id;
        return `<div class="item ${eq ? 'equipped' : ''}" data-id="${id}" style="--rc:${rc}"><div class="it-name">${s.name}</div><div class="it-rar">${RARITY[s.rarity].name}</div><div class="it-img"><img src="${soldierIcon(id)}" style="max-height:120px"></div><div class="it-foot">${store ? price(s.price) : eq ? '<span class="tag eq">EQUIPPED</span>' : '<span class="tag">EQUIP</span>'}</div></div>`; }).join('')}</div>`;
      body.querySelectorAll('.item').forEach(it => it.addEventListener('click', () => {
        const id = it.dataset.id, s = CHAR_SKINS[id];
        if (store) this.buy(s.price, () => { P.ownedChars.push(id); }, s.name, () => this.renderInv(t, body, store), { rarity: s.rarity, img: soldierIcon(id), equip: () => { P.charSkin = id; this.save(); this.trying = null; this.refreshLobby(); this.app.lobby.swapFx(RARITY[s.rarity].color); } });
        else { P.charSkin = id; this.save(); play('ui'); this.refreshLobby(); this.app.lobby.swapFx(RARITY[s.rarity].color); this.renderInv(t, body, store); }
      }));
      body.querySelectorAll('.item').forEach(it => {
        it.addEventListener('mouseenter', () => this.tryOn({ skin: it.dataset.id, color: RARITY[CHAR_SKINS[it.dataset.id].rarity].color }));
        it.addEventListener('mouseleave', () => this.tryOn(null));
      });
    } else if (t === 'skins') {
      const wid = this.invWeapon || 'akr';
      const filter = `<div class="weapon-filter">${[...PRIMARIES, ...SECONDARIES, 'knife'].map(id => `<button data-w="${id}" class="${id === wid ? 'on' : ''}">${WEAPONS[id].name}</button>`).join('')}</div>`;
      // V2: los exclusivos no se venden; MASTERY GOLD sólo aparece en las armas dominadas
      const ids = Object.keys(WEAPON_SKINS).filter(id => store ? !P.ownedWeaponSkins.includes(id) && !WEAPON_SKINS[id].exclusive : P.ownedWeaponSkins.includes(id) && (id !== 'mastery' || (P.masteryDone || []).includes(wid)));
      const eqId = P.weaponSkins[wid] || 'factory';
      body.innerHTML = filter + (ids.length ? `<div class="inv">${ids.map(id => { const s = WEAPON_SKINS[id]; const rc = RARITY[s.rarity].color; const eq = eqId === id;
        return `<div class="item ${!store && eq ? 'equipped' : ''}" data-id="${id}" style="--rc:${rc}"><div class="it-name">${s.name}</div><div class="it-rar">${RARITY[s.rarity].name}</div><div class="it-img"><img src="${gunIcon(wid, id).color}"></div><div class="it-foot">${store ? price(s.price) : eq ? '<span class="tag eq">EQUIPPED</span>' : '<span class="tag">EQUIP</span>'}</div></div>`; }).join('')}</div>` : `<p style="font-family:var(--body);color:var(--muted)">${store ? 'You own every skin!' : 'Buy skins in the STORE.'}</p>`);
      if (store) body.insertAdjacentHTML('afterbegin', '<p style="font-family:var(--body);color:var(--muted);margin-bottom:8px">Weapon skins unlock for <b style="color:#fff">every</b> weapon. Preview:</p>');
      body.querySelectorAll('[data-w]').forEach(b => b.addEventListener('click', () => { this.invWeapon = b.dataset.w; play('ui'); this.renderInv(t, body, store); }));
      body.querySelectorAll('.item').forEach(it => it.addEventListener('click', () => {
        const id = it.dataset.id, s = WEAPON_SKINS[id];
        if (store) this.buy(s.price, () => { P.ownedWeaponSkins.push(id); }, s.name, () => this.renderInv(t, body, store), { rarity: s.rarity, img: gunIcon(wid, id).color, equip: () => { P.weaponSkins[wid] = id; this.save(); this.trying = null; this.refreshLobby(); this.app.lobby.swapFx(RARITY[s.rarity].color); } });
        else { P.weaponSkins[wid] = id; this.save(); play('ui'); this.refreshLobby(); this.app.lobby.swapFx(RARITY[s.rarity].color); this.renderInv(t, body, store); }
      }));
      body.querySelectorAll('.item').forEach(it => {
        it.addEventListener('mouseenter', () => this.tryOn({ weapon: wid, weaponSkin: it.dataset.id, color: RARITY[WEAPON_SKINS[it.dataset.id].rarity].color }));
        it.addEventListener('mouseleave', () => this.tryOn(null));
      });
    } else if (t === 'loadouts') {
      const opt = (list, sel) => list.map(id => `<option value="${id}" ${id === sel ? 'selected' : ''}>${WEAPONS[id].name}</option>`).join('');
      body.innerHTML = `<p style="font-family:var(--body);color:var(--muted);margin-bottom:12px">Customize your three CUSTOM LOADOUTS. Press <kbd>B</kbd> in a match to switch loadout.</p><div class="loadout-edit">${[0, 1, 2].map(i => { const L = P.loadouts[i];
        return `<div class="lo-card"><h4>CUSTOM LOADOUT ${i + 1}</h4><img src="${gunIcon(L.primary, P.weaponSkins[L.primary]).color}" style="width:100%;height:80px;object-fit:contain"><select data-i="${i}" data-k="primary">${opt(PRIMARIES, L.primary)}</select><select data-i="${i}" data-k="secondary">${opt(SECONDARIES, L.secondary)}</select></div>`; }).join('')}</div>`;
      body.querySelectorAll('select').forEach(s => s.addEventListener('change', () => { P.loadouts[+s.dataset.i][s.dataset.k] = s.value; this.save(); play('ui'); this.renderInv(t, body, store); }));
    } else if (t === 'boxes') {
      body.innerHTML = `<div class="inv">
        <div class="item" data-box="daily" style="--rc:#3d8bff"><div class="it-name">DAILY BOX</div><div class="it-rar">FREE EVERY DAY</div><div class="it-img"><div class="db-art" style="position:relative;left:0;top:0"></div></div><div class="it-foot"><span class="tag">${P.dailyBox === today() ? 'TOMORROW' : 'OPEN'}</span></div></div>
        <div class="item" data-box="legend" style="--rc:#ffb321"><div class="it-name">LEGENDARY BOX</div><div class="it-rar">RARE+ GUARANTEED</div><div class="it-img"><div class="db-art" style="position:relative;left:0;top:0;filter:hue-rotate(170deg) saturate(2)"></div></div><div class="it-foot"><span class="price" style="color:#c9d6e8"><i style="background:linear-gradient(135deg,#c9d6e8,#6f7f98)"></i>60</span></div></div>
      </div>`;
      body.querySelector('[data-box="daily"]').addEventListener('click', () => this.openDailyBox());
      body.querySelector('[data-box="legend"]').addEventListener('click', () => {
        if (P.shards < 60) { this.toast('Not enough shards'); play('empty'); return; }
        P.shards -= 60; this.save(); this.openBox(true);
      });
    }
  }
  buy(price, give, name, after, meta = {}) {
    const P = this.P;
    this.confirmBuy({ name, price, rarity: meta.rarity || 'common', img: meta.img || '', onBuy: () => { P.coins -= price; give(); this.save(); after(); }, onEquip: meta.equip || (() => {}) });
  }

  // ---------- Perfil ----------
  // Perfil = hoja de servicio a pantalla completa (secuencia 7)
  openProfile(tab = 'record') {
    if (this.record) return;
    this.closeModal(); this.navActive('profile');
    this.record = new ServiceRecord(this.app, tab);
  }
  openProfileOld() {
    const P = this.P, s = P.stats, lv = levelOf(P.xp);
    const kd = (s.kills / Math.max(1, s.deaths)).toFixed(2), acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0, hs = s.kills ? Math.round(s.headshots / s.kills * 100) : 0;
    const mins = Math.round(s.playTime / 60);
    const body = `<div class="profile-top"><div class="avatar">${esc(P.name.slice(5, 6))}</div><div>
      <div class="name-edit"><input id="pf-name" value="${esc(P.name)}" maxlength="20"><button class="btn dark" id="pf-save" style="font-size:16px;padding:6px 14px">SAVE</button><button class="btn dark" id="pf-rand" style="font-size:16px;padding:6px 14px">🎲</button></div>
      <div style="margin-top:8px;font-size:22px;font-weight:800">LEVEL ${lv.lv} <small style="color:var(--muted);font-size:15px">${lv.cur} / ${lv.need} XP</small></div><div class="xpbar"><i style="width:${lv.cur / lv.need * 100}%"></i></div></div></div>
      <div class="stats-grid">${[['MATCHES', s.matches], ['WINS', s.wins], ['WIN RATE', (s.matches ? Math.round(s.wins / s.matches * 100) : 0) + '%'], ['TOP 3', s.top3],
        ['KILLS', s.kills], ['DEATHS', s.deaths], ['K/D', kd], ['BEST STREAK', s.bestStreak], ['HEADSHOTS', s.headshots], ['HEADSHOT %', hs + '%'], ['ACCURACY', acc + '%'], ['PLAY TIME', mins + ' min']]
        .map(([k, v]) => `<div class="stat"><small>${k}</small><b>${v}</b></div>`).join('')}</div>`;
    const m = this.modal('PROFILE', body, { width: 820, nav: 'profile', docked: true, shot: 'profile' });
    m.querySelector('#pf-save').addEventListener('click', () => {
      const v = m.querySelector('#pf-name').value.trim().slice(0, 20);
      if (v.length >= 3) { P.name = v; this.save(); this.toast('Name saved'); this.refreshLobby(); play('buy'); }
    });
    m.querySelector('#pf-rand').addEventListener('click', () => { m.querySelector('#pf-name').value = randomUser(); play('ui'); });
    m.querySelector('#pf-name').addEventListener('keydown', (e) => e.stopPropagation());
  }

  // ---------- Centro: noticias + controles ----------
  openCenter(tab = 'news') {
    const render = (t, body) => {
      if (t === 'news') {
        body.innerHTML = `<div class="news"><div class="news-hero" style="--hero:url(${mapThumb('harbor')})"><span class="date">${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span></div>
          <h3>HARBOR STRIKE <small>v1.0</small></h3>
          <ul><li>3 MAPS: HARBOR, FOUNDRY, SHRINE</li><li>3 MODES: DEATHMATCH, TEAM DEATHMATCH, KNIFE ONLY + CUSTOM MATCHES</li><li>12 WEAPONS AND 10 LOADOUTS</li><li>8 CHARACTER SKINS AND 10 WEAPON SKINS</li><li>DAILY REWARDS AND DAILY BOX</li><li>WEAPON DROPPING SYSTEM, SPRAYS AND WEAPON INSPECT</li></ul>
          <h4>GAMEPLAY</h4><ul><li>Counter-strafe: stop moving for a split second before you shoot for perfect accuracy.</li><li>Headshots deal massive damage. Knife backstabs are instant kills.</li><li>Look at an enemy for a moment to reveal their name and health.</li><li>Pick up weapons dropped by eliminated players with <kbd>E</kbd>.</li></ul></div>`;
      } else if (t === 'controls') {
        const k = [['Move', 'W A S D'], ['Jump', 'SPACE'], ['Sprint', 'SHIFT'], ['Crouch', 'CTRL / C'], ['Shoot', 'LEFT CLICK'], ['Aim (ADS) / heavy knife', 'RIGHT CLICK'], ['Reload', 'R'], ['Weapons', '1 2 3 / WHEEL / Q'],
          ['Drop weapon', 'G'], ['Pick up weapon', 'E'], ['Spray', 'T'], ['Inspect', 'V'], ['Change loadout', 'B'], ['Scoreboard', 'TAB'], ['Chat', 'ENTER'], ['Menu', 'ESC']];
        body.innerHTML = `<div class="keys">${k.map(([a, b]) => `<div><span>${a}</span><span>${b.split(' / ').map(x => `<kbd>${x}</kbd>`).join(' ')}</span></div>`).join('')}</div>`;
      } else {
        body.innerHTML = `<div class="news"><h4>CREDITS</h4><ul><li>Game, code, 3D models, textures, sounds and maps: made from scratch, procedurally generated in the browser.</li><li>Rendering: three.js (MIT). Fonts: Barlow (OFL).</li><li>Inspired by the feel of fast arena browser shooters.</li></ul></div>`;
      }
    };
    this.modal('CENTER', null, { nav: 'center', docked: true, shot: 'center', tabs: [['news', 'NEWS'], ['controls', 'CONTROLS'], ['credits', 'CREDITS']], tab, onTab: render, width: 760 });
  }

  // ---------- Ajustes ----------
  // Ajustes con categorías y vista previa (secuencia 8)
  openSettings() {
    const panel = new SettingsPanel(this.app, {});
    return this.modal('SETTINGS', panel.el, { width: 940, docked: true, shot: 'settings', cls: 'st-modal' });
  }
  openSettingsOld(inMatch = false) {
    const s = this.P.settings;
    const range = (key, min, max, step, fmt = (v) => v) => `<div class="field"><label>${key.toUpperCase()}</label><div class="range-row"><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}"><b data-v="${key}">${fmt(s[key])}</b></div></div>`;
    const seg = (key, label, opts) => `<div class="field"><label>${label}</label><div class="seg" data-key="${key}">${opts.map(([v, n]) => `<button data-v="${v}" class="${String(s[key]) === String(v) ? 'on' : ''}">${n}</button>`).join('')}</div></div>`;
    const body = `<div class="custom-grid">
      ${range('sens', 0.1, 4, 0.05, v => (+v).toFixed(2)).replace('SENS', 'SENSITIVITY')}
      ${range('adsSens', 0.2, 2, 0.05, v => (+v).toFixed(2)).replace('ADSSENS', 'ADS SENSITIVITY')}
      ${range('fov', 60, 100, 1)}
      ${range('volume', 0, 1, 0.05, v => Math.round(v * 100) + '%')}
      ${seg('quality', 'GRAPHICS', [['low', 'LOW'], ['medium', 'MEDIUM'], ['high', 'HIGH']])}
      ${seg('crossStyle', 'CROSSHAIR', [['cross', 'CROSS'], ['dot', 'CROSS + DOT'], ['dotonly', 'DOT']])}
      ${seg('crosshair', 'CROSSHAIR COLOR', [['#ffffff', '⬜'], ['#4dff7a', '🟩'], ['#2fe6ff', '🟦'], ['#ffd23a', '🟨'], ['#ff4be0', '🟪']])}
      ${seg('showFps', 'SHOW FPS', [['false', 'OFF'], ['true', 'ON']])}
      ${seg('invertY', 'INVERT MOUSE Y', [['false', 'OFF'], ['true', 'ON']])}
      ${seg('killcam', 'KILLCAM ON DEATH', [['true', 'ON'], ['false', 'OFF']])}
      <div class="field"><label>SPRAY</label><div class="range-row"><input id="spray-t" maxlength="6" value="${esc(s.sprayText)}" style="background:#1b2130;border:1px solid var(--line2);color:#fff;padding:6px 10px;font-weight:700;width:120px"><input type="color" id="spray-c" value="${s.sprayColor}" style="width:50px;height:34px;background:none;border:0"></div></div>
    </div>${inMatch ? '' : '<div style="margin-top:20px;text-align:right"><button class="btn dark" id="reset-prof" style="font-size:14px">RESET PROGRESS</button></div>'}`;
    const m = this.modal('SETTINGS', body, { width: 800, docked: !inMatch, shot: inMatch ? null : 'settings' });
    m.querySelectorAll('input[type=range]').forEach(r => r.addEventListener('input', () => {
      const k = r.dataset.k; s[k] = +r.value;
      m.querySelector(`[data-v="${k}"]`).textContent = k === 'volume' ? Math.round(s[k] * 100) + '%' : k === 'fov' ? s[k] : (+s[k]).toFixed(2);
      if (k === 'volume') setVolume(s.volume);
      this.save();
    }));
    m.querySelectorAll('.seg').forEach(sg => sg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      let v = b.dataset.v; if (v === 'true') v = true; else if (v === 'false') v = false;
      s[sg.dataset.key] = v; this.save(); play('ui');
      sg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
      if (sg.dataset.key === 'quality') this.app.applyQuality();
      this.hud.applyCrosshair();
    })));
    const st = m.querySelector('#spray-t'), sc = m.querySelector('#spray-c');
    st.addEventListener('keydown', (e) => e.stopPropagation());
    st.addEventListener('input', () => { s.sprayText = st.value.toUpperCase() || 'GG'; this.save(); });
    sc.addEventListener('input', () => { s.sprayColor = sc.value; this.save(); });
    const rp = m.querySelector('#reset-prof');
    if (rp) rp.addEventListener('click', () => { if (confirm('Reset all progress, coins and skins?')) { localStorage.clear(); location.reload(); } });
    return m;
  }

  // ---------- Recompensas diarias ----------
  maybeDaily() {
    const P = this.P, d = P.daily;
    if (d.last === today()) return false;
    // racha: si saltó un día, reinicia
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    if (d.last !== y) d.streak = 0;
    const idx = d.streak % 7;
    const el = h(`<div class="backdrop"><div class="daily"><button class="x-btn" style="position:absolute;right:14px;top:14px;border-color:#fff">✕</button><h2>DAILY REWARDS</h2><div class="sub">GET FREE REWARDS EVERY DAY</div>
      <div class="days">${DAILY.map((r, i) => `<div class="day ${i === idx ? 'today' : i < idx ? 'done' : ''}"><b>DAY ${i + 1}</b><div class="card" style="background:${r.bg}"><span>${r.kind === 'skin' || r.kind === 'epic' ? '' : r.label}</span>${rewardIcon(r.ic)}<span>${r.n ? r.n + ' x' : r.label}</span></div><div class="arrow"></div></div>`).join('')}</div>
      <div class="row"><button class="btn red" id="claim" style="font-size:24px;padding:12px 48px">GET <span style="color:var(--yellow)">REWARD</span></button><button class="btn ghost" id="later" style="font-size:18px">LATER</button></div></div></div>`);
    $('modal-root').appendChild(el); this.modalEl = el;
    const close = () => this.closeModal();
    el.querySelector('.x-btn').addEventListener('click', close); el.querySelector('#later').addEventListener('click', close);
    el.querySelector('#claim').addEventListener('click', () => {
      initAudio();
      const r = DAILY[idx];
      let msg = '';
      if (r.kind === 'coins') { P.coins += r.n; msg = `+${r.n} COINS`; }
      else if (r.kind === 'shards') { P.shards += r.n; msg = `+${r.n} SHARDS`; }
      else msg = 'NEW SKIN: ' + this.grantRandomSkin(r.kind === 'epic');
      d.last = today(); d.streak++; this.save(); play('reward'); this.toast(msg);
      this.closeModal(); this.refreshLobby();
    });
    return true;
  }
  grantRandomSkin(epic = false) {
    const P = this.P;
    const pool = Object.entries(WEAPON_SKINS).filter(([id, s]) => !s.exclusive && !P.ownedWeaponSkins.includes(id) && (!epic || s.rarity === 'epic' || s.rarity === 'legendary'));
    const cpool = Object.entries(CHAR_SKINS).filter(([id, s]) => !P.ownedChars.includes(id) && (!epic || s.rarity !== 'common'));
    if (cpool.length && (Math.random() < 0.35 || !pool.length)) { const [id, s] = cpool[Math.floor(Math.random() * cpool.length)]; P.ownedChars.push(id); return s.name; }
    if (pool.length) { const [id, s] = pool[Math.floor(Math.random() * pool.length)]; P.ownedWeaponSkins.push(id); return s.name; }
    P.coins += 300; return '300 COINS';
  }
  openDailyBox() {
    if (this.P.dailyBox === today()) { this.toast('Come back tomorrow for another free box!'); return; }
    this.P.dailyBox = today(); this.save(); this.openBox(false);
  }
  // Sorteo del premio por rareza (las cajas legendarias garantizan RARE o mejor)
  rollReward(legend) {
    const P = this.P;
    if (!legend && Math.random() < 0.45) { const n = [50, 75, 100, 150, 200][Math.floor(Math.random() * 5)]; return { type: 'coins', id: 'coins', name: `${n} COINS`, rarity: n >= 150 ? 'rare' : 'common', amount: n }; }
    const W = legend ? { common: 0, rare: 50, epic: 35, legendary: 15 } : { common: 50, rare: 32, epic: 13, legendary: 5 };
    const pool = [
      ...Object.entries(WEAPON_SKINS).filter(([id, s]) => id !== 'factory' && !s.exclusive).map(([id, s]) => ({ type: 'weaponSkin', id, name: s.name, rarity: s.rarity, owned: P.ownedWeaponSkins.includes(id) })),
      ...Object.entries(CHAR_SKINS).filter(([id]) => id !== 'recruit').map(([id, s]) => ({ type: 'charSkin', id, name: s.name, rarity: s.rarity, owned: P.ownedChars.includes(id) })),
    ].filter(x => W[x.rarity] > 0);
    // primero se elige la rareza, luego un objeto de esa rareza (preferentemente no repetido)
    const tot = Object.values(W).reduce((a, b) => a + b, 0);
    let roll = Math.random() * tot, rar = 'rare';
    for (const [k, w] of Object.entries(W)) { if ((roll -= w) <= 0) { rar = k; break; } }
    let cands = pool.filter(x => x.rarity === rar && !x.owned);
    if (!cands.length) cands = pool.filter(x => !x.owned);
    if (!cands.length) cands = pool.filter(x => x.rarity === rar);
    const r = { ...cands[Math.floor(Math.random() * cands.length)] };
    if (r.owned) r.dupe = { common: 60, rare: 120, epic: 250, legendary: 600 }[r.rarity];
    const L = P.loadouts[P.loadout] || P.loadouts[0];
    r.weapon = L.primary;
    return r;
  }
  grantReward(r) {
    const P = this.P;
    if (r.type === 'coins') P.coins += r.amount;
    else if (r.dupe) P.coins += r.dupe;
    else if (r.type === 'weaponSkin') P.ownedWeaponSkins.push(r.id);
    else P.ownedChars.push(r.id);
    this.save();
  }
  openBox(legend) {
    this.closeModal();
    const r = this.rollReward(legend);
    this.grantReward(r);
    this.app.openUnbox({ title: legend ? 'LEGENDARY BOX' : 'DAILY BOX', legend, reward: r }, (equip) => {
      const P = this.P;
      if (equip && r.type === 'charSkin') P.charSkin = r.id;
      if (equip && r.type === 'weaponSkin') { const L = P.loadouts[P.loadout]; P.weaponSkins[L.primary] = r.id; }
      this.save(); this.refreshLobby();
      if (equip) { this.app.lobby.swapFx(RARITY[r.rarity].color); play('ui'); }
    });
  }

  // ---------- Probador: la skin bajo el ratón se la pone tu soldado ----------
  tryOn(o) {
    clearTimeout(this.tryTO);
    if (!o) { this.tryTO = setTimeout(() => { if (this.trying) { this.trying = null; this.app.refreshLobbyScene(); } }, 140); return; }
    const key = JSON.stringify(o);
    if (this.trying === key) return;
    this.trying = key;
    this.app.refreshLobbyScene(o);
    this.app.lobby.swapFx(o.color);
    play('uiHover');
  }

  // ---------- Compra: mantener pulsado para confirmar ----------
  confirmBuy({ name, price, rarity, img, onBuy, onEquip }) {
    const P = this.P, R = RARITY[rarity];
    const el = h(`<div id="buy" class="${rarity}"><div class="buy-card" style="--rc:${R.color}">
      <div class="buy-rar">${R.name}</div><div class="buy-img"><img src="${img}"></div><div class="buy-name">${esc(name)}</div>
      <div class="buy-price"><i></i>${price.toLocaleString('en-US')} <small>· BALANCE ${P.coins.toLocaleString('en-US')}</small></div>
      <div class="buy-stamp">UNLOCKED</div>
      <button class="buy-hold" id="buy-hold"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="bg"/><circle cx="22" cy="22" r="19" class="fg" id="buy-ring"/></svg><span>HOLD TO PURCHASE</span></button>
      <div class="buy-after"><button class="btn cyan" id="buy-equip">EQUIP</button><button class="btn dark" id="buy-close">CLOSE</button></div>
      <button class="buy-x" id="buy-x">✕</button></div></div>`);
    document.body.appendChild(el);
    // al cerrar, el soldado vuelve a su skin equipada (la tarjeta probada puede haber desaparecido sin mouseleave)
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 300); this.tryOn(null); };
    el.querySelector('#buy-x').addEventListener('click', () => { play('ui'); close(); });
    el.querySelector('#buy-close').addEventListener('click', () => { play('ui'); close(); });
    el.querySelector('#buy-equip').addEventListener('click', () => { play('ui'); onEquip(); close(); });
    const ring = el.querySelector('#buy-ring'), C = 2 * Math.PI * 19; ring.style.strokeDasharray = C; ring.style.strokeDashoffset = C;
    const btn = el.querySelector('#buy-hold');
    if (P.coins < price) { btn.classList.add('poor'); btn.querySelector('span').textContent = `NEED ${(price - P.coins).toLocaleString('en-US')} MORE COINS`; return; }
    let k = 0, iv = null;
    const stop = () => { clearInterval(iv); iv = null; if (k < 1) { k = 0; ring.style.strokeDashoffset = C; btn.classList.remove('holding'); } };
    btn.addEventListener('pointerdown', () => {
      if (iv || k >= 1) return; btn.classList.add('holding'); play('uiHover');
      iv = setInterval(() => {
        k = Math.min(1, k + 0.016 / 0.85); ring.style.strokeDashoffset = C * (1 - k);
        if (Math.random() < 0.3) play('count');
        if (k >= 1) {
          clearInterval(iv); iv = null; onBuy(); play('buy'); setTimeout(() => play('reveal_' + rarity), 120);
          el.classList.add('bought'); this.refreshLobby();
          el.querySelector('.buy-price small').textContent = '· BALANCE ' + this.P.coins.toLocaleString('en-US');
        }
      }, 16);
    });
    btn.addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop);
  }

  maybeNews() {
    if (this.P.seenNews) return false;
    this.P.seenNews = true; this.save();
    this.openCenter('news');
    return true;
  }

  // ================= PARTIDA =================
  bindMatchKeys() {
    const ci = $('chat-input');
    addEventListener('keydown', (e) => {
      const app = this.app;
      if (app.state !== 'match') return;
      if (this.chatOpen) {
        if (e.code === 'Enter') { const t = ci.value.trim(); if (t) this.hud.chat(this.P.name, t); this.closeChat(); }
        else if (e.code === 'Escape') this.closeChat();
        return;
      }
      if (e.code === 'Tab') { e.preventDefault(); this.hud.scoreboard(true); }
      if (this.resultsOpen) return;
      if (e.code === 'Enter' && !this.loadoutOpen && !this.pauseOpen) { e.preventDefault(); this.openChat(); }
      const ar = app.match && app.match.arena;
      if (ar) {
        // Arena: B abre la armería (sólo en fase de compra); ESPACIO cambia de compañero al espectar
        if (e.code === 'KeyB' && !this.pauseOpen) { ar.ui.toggleShop(); return; }
        if (this.shopOpen) { if (e.code === 'Escape') ar.ui.closeShop(); else ar.ui.shopKey(e.code); return; }
        if (e.code === 'Space' && !app.match.me.alive && !app.match.death) ar.spectate(1);
        return;
      }
      if (e.code === 'KeyB' && !this.pauseOpen) { this.loadoutOpen ? this.closeLoadout() : this.openLoadout(); }
      if (this.loadoutOpen) {
        const n = e.code.startsWith('Digit') ? +e.code.slice(5) : NaN;
        if (!isNaN(n)) this.pickLoadout(n === 0 ? 9 : n - 1);
        if (e.code === 'Escape') this.closeLoadout();
      }
    });
    addEventListener('keyup', (e) => { if (e.code === 'Tab' && this.app.state === 'match') this.hud.scoreboard(false); });
    document.addEventListener('pointerlockchange', () => {
      const app = this.app;
      if (app.state !== 'match' || this.resultsOpen) return;
      if (app.input.locked) { this.hidePause(); $('click-to-play').classList.add('hidden'); app.input.enabled = true; }
      else if (!this.loadoutOpen && !this.shopOpen && !this.chatOpen && !app.input.free) { app.input.enabled = false; app.input.reset(); this.openPause(); }
    });
    $('click-to-play').addEventListener('click', () => { initAudio(); this.app.input.lock(); });
  }
  openChat() {
    this.chatOpen = true; $('chat').classList.add('open');
    const ci = $('chat-input'); ci.value = ''; this.app.input.textFocus = true; this.app.input.reset();
    setTimeout(() => ci.focus(), 0);
  }
  closeChat() { this.chatOpen = false; $('chat').classList.remove('open'); const ci = $('chat-input'); ci.blur(); this.app.input.textFocus = false; }

  openLoadout() {
    const P = this.P, app = this.app, m = app.match;
    if (!m || m.ended || m.br || m.arena) return;
    this.loadoutOpen = true; app.input.enabled = false; app.input.reset(); app.input.unlock();
    $('click-to-play').classList.add('hidden');
    const ko = m.mode.knifeOnly;
    const el = $('loadout'); el.classList.remove('hidden');
    el.innerHTML = `<div class="lo-wrap"><h1>LOADOUT</h1><div class="lo-sub">${ko ? 'KNIFE ONLY — ALL LOADOUTS USE THE KNIFE' : 'SELECT OR PRESS KEY TO CHANGE WEAPONS'}</div><div class="lo-grid">${P.loadouts.map((L, i) => `
      <div class="lo ${P.loadout === i ? 'on' : ''}" data-i="${i}"><div class="lo-t">${i < 3 ? 'CUSTOM LOADOUT ' + (i + 1) : WEAPONS[L.primary].kind}</div><span class="lo-k">${(i + 1) % 10}</span>
      <img class="lo-p" src="${gunIcon(L.primary, P.weaponSkins[L.primary]).color}"><img class="lo-s" src="${gunIcon(L.secondary, P.weaponSkins[L.secondary]).color}"><img class="lo-kn" src="${gunIcon('knife', P.weaponSkins.knife).color}">
      ${i < 3 ? '<div class="lo-u"></div>' : ''}<div class="lo-n">${WEAPONS[L.primary].name}</div></div>`).join('')}</div>
      <button class="btn red lo-close" id="lo-close">CLOSE</button></div>`;
    el.querySelectorAll('.lo').forEach(c => c.addEventListener('click', () => this.pickLoadout(+c.dataset.i)));
    el.querySelector('#lo-close').addEventListener('click', () => this.closeLoadout());
  }
  pickLoadout(i) {
    const P = this.P, m = this.app.match;
    if (m && !m.introShown) { m.introShown = true; this.hud.matchIntro(m); }
    P.loadout = i; this.save(); play('ui');
    // si acaba de aparecer (o está muerto), cambia ya; si no, en el próximo spawn
    if (m && m.br) { this.closeLoadout(); return; }
    if (m && m.me.alive && m.time - (m.me.spawnTime || 0) < 6 && !m.mode.knifeOnly) {
      const L = P.loadouts[i]; m.me.giveLoadout(L.primary, L.secondary, false); m.onSwitch(m.me);
    } else if (m && m.me.alive) this.hud.toast('LOADOUT CHANGES ON NEXT SPAWN');
    this.closeLoadout();
  }
  closeLoadout() {
    this.loadoutOpen = false; $('loadout').classList.add('hidden');
    if (this.app.state === 'match' && !this.resultsOpen) { this.app.input.enabled = true; this.app.input.lock(); if (!this.app.input.locked && !this.app.input.free) setTimeout(() => { if (!this.app.input.locked && !this.loadoutOpen && !this.app.input.free && this.app.state === 'match') $('click-to-play').classList.remove('hidden'); }, 300); }
  }

  // Pausa táctica (secuencia 8): el tiempo se congela, el mundo se desenfoca y se amortigua
  openPause() {
    if (this.pauseMenu || !this.app.match || this.app.match.ended) return;
    this.pauseOpen = true;
    this.pauseMenu = new PauseMenu(this.app);
  }
  openPauseOld() {
    this.pauseOpen = true;
    const el = $('pause'); el.classList.remove('hidden');
    el.innerHTML = `<div class="pause-box"><h1>MENU</h1><button class="btn cyan" id="p-resume">RESUME</button><button class="btn dark" id="p-load">LOADOUT</button><button class="btn dark" id="p-set">SETTINGS</button><button class="btn red" id="p-leave">LEAVE MATCH</button></div>`;
    el.querySelector('#p-resume').addEventListener('click', () => { initAudio(); this.app.input.lock(); });
    el.querySelector('#p-load').addEventListener('click', () => { this.hidePause(); this.openLoadout(); });
    el.querySelector('#p-set').addEventListener('click', () => { const m = this.openSettings(true); this.onModalClose = () => { if (this.app.state === 'match') this.openPause(); }; el.classList.add('hidden'); });
    el.querySelector('#p-leave').addEventListener('click', () => { this.hidePause(); this.app.leaveMatch(); });
  }
  hidePause() {
    this.pauseOpen = false;
    if (this.pauseMenu) { this.pauseMenu.close(); this.pauseMenu = null; } else $('pause').classList.add('hidden');
  }

  showResults(r) {
    this.resultsOpen = true; this.hidePause(); this.closeLoadout(); this.closeChat(); this.hud.scoreboard(false);
    $('click-to-play').classList.add('hidden');
    const m = this.app.match, me = m.me;
    const el = $('results'); el.classList.remove('hidden');
    const st = r.standings;
    const rows = st.slice(0, 10).map((a, i) => `<tr class="${a === me ? 'me' : ''}"><td>${i + 1}</td><td>${esc(a.name)}</td>${m.mode.teams ? `<td style="color:${a.team === 'blue' ? '#7fb6ff' : '#ff8a8a'}">${a.team.toUpperCase()}</td>` : ''}<td class="num">${a.score}</td><td class="num">${a.kills}</td><td class="num">${a.deaths}</td></tr>`).join('');
    el.innerHTML = `<div class="results"><div class="res-title ${r.win ? 'win' : 'lose'}">${r.win ? 'VICTORY' : 'DEFEAT'}</div>
      <div class="res-sub">${m.mode.teams ? `BLUE ${r.teamScore.blue} — ${r.teamScore.red} RED` : `#${r.place} OF ${st.length}`} · ${m.map.name}</div>
      <div class="res-rewards"><div><small>KILLS</small><b>${r.kills}</b></div><div><small>DEATHS</small><b>${r.deaths}</b></div><div><small>ACCURACY</small><b>${r.stats.shots ? Math.round(r.stats.hits / r.stats.shots * 100) : 0}%</b></div><div><small>COINS</small><b style="color:var(--yellow)">+${r.coins}</b></div><div><small>XP</small><b style="color:var(--cyan)">+${r.xp}</b></div></div>
      ${r.levelUp ? `<div style="text-align:center;font-size:30px;font-weight:900;font-style:italic;color:var(--cyan)">LEVEL UP! ${r.levelUp}</div>` : ''}
      <div class="scoreboard" style="position:static;transform:none;width:100%;margin-top:8px"><table class="sb-table"><tr><th>#</th><th>PLAYER</th>${m.mode.teams ? '<th>TEAM</th>' : ''}<th class="num">SCORE</th><th class="num">K</th><th class="num">D</th></tr>${rows}</table></div>
      <div class="res-btns"><button class="btn cyan" id="r-again" style="font-size:24px;padding:10px 40px">PLAY AGAIN</button><button class="btn dark" id="r-lobby" style="font-size:24px;padding:10px 40px">LOBBY</button></div></div>`;
    el.querySelector('#r-again').addEventListener('click', () => { play('ui'); this.hideResults(); this.app.startMatch(this.app.lastMatchOpts); });
    el.querySelector('#r-lobby').addEventListener('click', () => { play('ui'); this.hideResults(); this.app.leaveMatch(); });
  }
  // Tras la infiltración: si no hay pointer lock, pedir un clic para entrar
  afterIntro() {
    const inp = this.app.input;
    if (inp.free || inp.locked) { inp.enabled = true; return; }
    const c = $('click-to-play'); c.firstElementChild.textContent = 'CLICK TO ENGAGE'; c.classList.remove('hidden');
    const mm = this.app.match;
    if (c.lastElementChild) c.lastElementChild.innerHTML = mm && mm.br ? 'ESC · menu &nbsp; M · map &nbsp; TAB · scoreboard' : mm && mm.arena ? 'ESC · menu &nbsp; B · shop &nbsp; F · quick buy &nbsp; 4 · bandage' : 'ESC · menu &nbsp; B · loadout &nbsp; TAB · scoreboard';
  }

  // ===== INFORME POST-PARTIDA (After Action Report) con contadores animados =====
  showAfterAction(r, match) {
    this.resultsOpen = true; this.hidePause(); this.closeChat();
    const P = this.P, m = match;
    const acc = r.stats.shots ? Math.round(r.stats.hits / r.stats.shots * 100) : 0;
    const kd = (r.kills / Math.max(1, r.deaths)).toFixed(2);
    const rows = [['SCORE', r.score], ['KILLS', r.kills], ['DEATHS', r.deaths], ['K/D RATIO', kd], ['ASSISTS', r.assists || 0], ['ACCURACY', acc + '%'], ['HEADSHOTS', r.headshots], ['BEST STREAK', r.stats.bestStreak]];
    const medals = Object.entries(r.medals || {});
    const lines = [['MATCH SCORE', r.score], [r.win ? 'VICTORY BONUS' : 'COMPLETION BONUS', r.xp - r.score]];
    const el = h(`<div id="aar"><div class="aar-in">
      <div class="aar-head"><small>AFTER ACTION REPORT</small><b class="${r.win ? 'win' : 'lose'}">${r.win ? 'VICTORY' : m.br ? 'ELIMINATED' : 'DEFEAT'}</b><span>${m.mode.name} · ${m.map.name}${m.mode.teams ? ` · BLUE ${r.teamScore.blue} — ${r.teamScore.red} RED` : ` · #${r.place} OF ${r.standings.length}`}</span></div>
      <div class="aar-cols">
        <div class="aar-col"><h4>COMBAT RECORD</h4>${rows.map(([k, v], i) => `<div class="aar-row" style="animation-delay:${0.3 + i * 0.08}s"><span>${k}</span><b data-v="${v}">0</b></div>`).join('')}</div>
        <div class="aar-col aar-prog"><h4>PROGRESSION</h4>
          <div class="aar-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="bg"/><circle cx="60" cy="60" r="52" class="fg" id="aar-ring"/></svg><div class="aar-lv"><small>LEVEL</small><b id="aar-lv">1</b></div></div>
          <div class="aar-xp" id="aar-xp">0 / 0 XP</div>
          ${lines.map(([k, v], i) => `<div class="aar-line" style="animation-delay:${0.9 + i * 0.25}s"><span>${k}</span><b>+${v} XP</b></div>`).join('')}
          <div class="aar-line total" style="animation-delay:1.5s"><span>TOTAL</span><b>+${r.xp} XP</b></div>
          <div class="aar-levelup" id="aar-levelup">LEVEL UP!<small>+10 SHARDS</small></div>
        </div>
        <div class="aar-col"><h4>REWARDS</h4>
          <div class="aar-coins"><i></i><b id="aar-coins">+0</b><small>COINS</small></div>
          <div class="aar-bal">BALANCE <b>${(P.coins).toLocaleString('en-US')}</b></div>
          <h4 style="margin-top:18px">MEDALS</h4>
          <div class="aar-medals">${medals.length ? medals.map(([n, c], i) => `<div class="aar-medal" style="animation-delay:${1.2 + i * 0.1}s">${MEDAL_ICON(n)}<span>${n}</span><b>x${c}</b></div>`).join('') : '<p class="aar-none">No medals this match</p>'}</div>
        </div>
      </div>
      <div class="aar-btns"><button class="btn cyan" id="aar-again">PLAY AGAIN</button><button class="btn dark" id="aar-lobby">BACK TO LOBBY</button></div>
    </div></div>`);
    document.body.appendChild(el); this.aarEl = el;
    this.aarStop = aarExtras(this, el, r, m); // V2: rango + votación de mapa
    // estado de la animación (lo avanza aarTick desde el bucle del juego)
    this.aar = { t: 0, r, xp0: r.xpBefore ?? Math.max(0, P.xp - r.xp), lvShown: null, done: false, lastTick: 0 };
    el.querySelector('#aar-again').addEventListener('click', () => { play('ui'); if (this.voteFinish) this.voteFinish(); this.closeAAR(); const f = $('cine-fade'); f.classList.remove('white'); f.style.opacity = 1; this.app.startMatch(this.app.lastMatchOpts); });
    el.querySelector('#aar-lobby').addEventListener('click', () => { play('ui'); this.closeAAR(); this.app.returnToLobby(); });
    el.addEventListener('mousedown', (e) => { if (!e.target.closest('button') && this.aar && !this.aar.done) this.aar.t = 9; });
    this.aarTick(0);
  }
  aarTick(dt) {
    const A = this.aar; if (!A || !this.aarEl) return;
    A.t += dt;
    const el = this.aarEl, r = A.r;
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    // contadores de la columna de combate
    const k1 = ss(0.4, 1.6, A.t);
    el.querySelectorAll('.aar-row b').forEach(b => {
      const raw = b.dataset.v, num = parseFloat(raw);
      if (isNaN(num)) { b.textContent = raw; return; }
      const v = num * k1, dec = raw.includes('.') ? 2 : 0;
      b.textContent = v.toFixed(dec) + (raw.endsWith('%') ? '%' : '');
    });
    // XP: el anillo se llena (con subida de nivel si toca)
    const kx = ss(1.6, 3.6, A.t);
    const xpNow = A.xp0 + r.xp * kx;
    const L = levelOf(Math.floor(xpNow));
    const ring = el.querySelector('#aar-ring'), C = 2 * Math.PI * 52;
    ring.style.strokeDasharray = C; ring.style.strokeDashoffset = C * (1 - L.cur / L.need);
    el.querySelector('#aar-xp').textContent = `${L.cur.toLocaleString('en-US')} / ${L.need.toLocaleString('en-US')} XP`;
    if (A.lvShown !== null && L.lv > A.lvShown) { play('levelup'); el.querySelector('#aar-levelup').classList.add('on'); el.querySelector('.aar-ring').classList.remove('burst'); void el.offsetWidth; el.querySelector('.aar-ring').classList.add('burst'); }
    A.lvShown = L.lv; el.querySelector('#aar-lv').textContent = L.lv;
    // monedas
    const kc = ss(2.2, 3.4, A.t);
    el.querySelector('#aar-coins').textContent = '+' + Math.round(r.coins * kc);
    if ((k1 > 0 && k1 < 1) || (kx > 0 && kx < 1) || (kc > 0 && kc < 1)) { A.lastTick += dt; if (A.lastTick > 0.06) { A.lastTick = 0; play('count'); } }
    if (A.t > 3.7 && !A.done) { A.done = true; el.classList.add('done'); play('reward'); }
  }
  closeAAR() { if (this.aarStop) { this.aarStop(); this.aarStop = null; } if (this.aarEl) { this.aarEl.remove(); this.aarEl = null; } this.aar = null; this.resultsOpen = false; }

  hideResults() { this.resultsOpen = false; $('results').classList.add('hidden'); }
}
