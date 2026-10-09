// Secuencia 7 — HOJA DE SERVICIO (perfil a pantalla completa) con tres pestañas:
//   SERVICE RECORD: tarjeta de jugador, rango, XP y estadísticas animadas (contadores y anillos)
//   CAREER TRACK:   un premio por nivel; al entrar, la línea de progreso avanza nodo a nodo desde la última visita
//   IDENTITY:       emblemas y tarjetas coleccionables (pasar el ratón = vista previa, clic = equipar)
import { levelOf, saveProfile } from '../game/profile.js';
import { randomUser } from '../data/modes.js';
import { RARITY, CHAR_SKINS, WEAPON_SKINS } from '../data/cosmetics.js';
import { EMBLEMS, CARDS, TRACK, TRACK_MAX, MAX_BONUS, rankOf, careerOf, claimable, unlockLevel } from '../data/career.js';
import { emblemSVG, cardSVG, rankSVG } from '../gfx/identity.js';
import { gunIcon, soldierIcon } from '../gfx/icons.js';
import { play } from '../game/audio.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const $ = (id) => document.getElementById(id);
const DUPE = { common: 60, rare: 120, epic: 250, legendary: 600 };

// Datos visibles de un premio del track
export function rewardInfo(r, P) {
  switch (r.type) {
    case 'coins': return { name: `${r.amount} COINS`, kind: 'CURRENCY', rarity: r.amount >= 500 ? 'rare' : 'common' };
    case 'shards': return { name: `${r.amount} SHARDS`, kind: 'CURRENCY', rarity: r.amount >= 40 ? 'rare' : 'common' };
    case 'emblem': return { name: EMBLEMS[r.id].name, kind: 'EMBLEM', rarity: EMBLEMS[r.id].rarity };
    case 'card': return { name: CARDS[r.id].name, kind: 'PLAYER CARD', rarity: CARDS[r.id].rarity };
    case 'weaponSkin': return { name: WEAPON_SKINS[r.id].name, kind: 'WEAPON SKIN', rarity: WEAPON_SKINS[r.id].rarity };
    case 'charSkin': return { name: CHAR_SKINS[r.id].name, kind: 'OPERATOR', rarity: CHAR_SKINS[r.id].rarity };
  }
  void P;
  return { name: '?', kind: '', rarity: 'common' };
}
export function rewardIcon(r, P, uid = '') {
  switch (r.type) {
    case 'coins': return '<i class="rw-coin"></i>';
    case 'shards': return '<i class="rw-shard"></i>';
    case 'emblem': return `<div class="rw-emb">${emblemSVG({ id: r.id, ...EMBLEMS[r.id] }, uid)}</div>`;
    case 'card': return `<div class="rw-card">${cardSVG({ id: r.id, ...CARDS[r.id] }, uid)}</div>`;
    case 'weaponSkin': { const L = P.loadouts[P.loadout] || P.loadouts[0]; return `<img class="rw-gun" src="${gunIcon(L.primary, r.id).color}">`; }
    case 'charSkin': return `<img class="rw-op" src="${soldierIcon(r.id)}">`;
  }
  return '';
}
// Tarjeta de jugador completa (fondo + emblema + nombre + rango)
export function playerCard(P, o = {}, uid = 'pc') {
  const lv = levelOf(P.xp).lv, e = o.emblem || P.emblem || 'e_basic', c = o.card || P.card || 'c_basic';
  return `<div class="pcard">${cardSVG({ id: c, ...CARDS[c] }, uid)}
    <div class="pc-emb">${emblemSVG({ id: e, ...EMBLEMS[e] }, uid)}</div>
    <div class="pc-txt"><b>${esc(P.name)}</b><span>${rankOf(lv)}</span></div>
    <div class="pc-rank">${rankSVG(lv)}<small>${lv}</small></div></div>`;
}

export class ServiceRecord {
  constructor(app, tab = 'record') {
    this.app = app; this.P = app.profile;
    careerOf(this.P);
    const el = this.el = document.createElement('div');
    el.id = 'sr';
    const ready = claimable(this.P).length;
    el.innerHTML = `
      <div class="sr-bg"></div>
      <div class="sr-head"><div class="sr-title"><small>OPERATOR</small><b>SERVICE RECORD</b></div>
        <div class="sr-tabs"><button data-t="record">SERVICE RECORD</button><button data-t="career">CAREER TRACK${ready ? `<i class="sr-badge">${ready}</i>` : ''}</button><button data-t="identity">IDENTITY</button></div>
        <button class="sr-x" id="sr-x">✕ <kbd>ESC</kbd></button></div>
      <div class="sr-body" id="sr-body"></div>`;
    document.body.appendChild(el);
    document.body.classList.add('sr-open');
    app.lobby.setShot('record');
    el.querySelectorAll('.sr-tabs button').forEach(b => b.addEventListener('click', () => { play('ui'); this.go(b.dataset.t); }));
    el.querySelectorAll('.sr-tabs button').forEach(b => b.addEventListener('mouseenter', () => play('uiHover')));
    el.querySelector('#sr-x').addEventListener('click', () => this.close());
    this.onKey = (e) => { if (e.code === 'Escape' && !this.hidden) this.close(); };
    addEventListener('keydown', this.onKey);
    play('whoosh');
    this.go(tab);
  }
  save() { saveProfile(this.P); }
  go(t) {
    this.tab = t;
    clearTimeout(this.seqTO); cancelAnimationFrame(this.raf);
    this.el.querySelectorAll('.sr-tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
    const body = this.el.querySelector('#sr-body');
    body.className = 'sr-body sr-' + t;
    if (t === 'record') this.record(body); else if (t === 'career') this.career(body); else this.identity(body);
  }

  // ---------- SERVICE RECORD ----------
  record(body) {
    const P = this.P, s = P.stats, L = levelOf(P.xp);
    const kd = s.kills / Math.max(1, s.deaths), acc = s.shots ? s.hits / s.shots : 0, hs = s.kills ? s.headshots / s.kills : 0, wr = s.matches ? s.wins / s.matches : 0;
    const ring = (k, label, val, frac, col) => `<div class="sr-gauge" style="--c:${col}"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" class="g-bg"/><circle cx="50" cy="50" r="42" class="g-fg" data-f="${Math.max(0, Math.min(1, frac)).toFixed(3)}"/></svg><b data-n="${val}" data-d="${k === 'kd' ? 2 : 0}">0</b><small>${label}</small></div>`;
    const cnt = (label, v, suf = '') => `<div class="sr-stat"><b data-n="${v}" data-suf="${suf}">0</b><small>${label}</small></div>`;
    body.innerHTML = `
      <div class="sr-hero">${playerCard(P, {}, 'rec')}
        <div class="sr-xp"><div class="sr-xpl"><span>LEVEL <b>${L.lv}</b></span><span class="sr-rank">${rankOf(L.lv)}</span><span class="sr-next">${L.cur.toLocaleString('en-US')} / ${L.need.toLocaleString('en-US')} XP</span></div>
          <div class="sr-bar"><i data-f="${(L.cur / L.need).toFixed(3)}"></i></div>
          <div class="sr-xpn">${(L.need - L.cur).toLocaleString('en-US')} XP TO <b>LEVEL ${L.lv + 1}</b>${TRACK[L.lv + 1] ? ` · NEXT REWARD: <b>${esc(rewardInfo(TRACK[L.lv + 1], P).name)}</b>` : ''}</div></div>
        <div class="sr-name"><input id="sr-name" value="${esc(P.name)}" maxlength="20" spellcheck="false"><button id="sr-save">SAVE</button><button id="sr-rand" title="Random">🎲</button></div>
      </div>
      <div class="sr-gauges">
        ${ring('kd', 'K/D RATIO', kd, kd / 3, '#3fe0ff')}${ring('acc', 'ACCURACY %', Math.round(acc * 100), acc, '#7dff9a')}
        ${ring('hs', 'HEADSHOT %', Math.round(hs * 100), hs, '#ffb321')}${ring('wr', 'WIN RATE %', Math.round(wr * 100), wr, '#ff5a7a')}
      </div>
      <div class="sr-grid">${cnt('MATCHES', s.matches)}${cnt('WINS', s.wins)}${cnt('TOP 3', s.top3)}${cnt('KILLS', s.kills)}${cnt('DEATHS', s.deaths)}${cnt('HEADSHOTS', s.headshots)}${cnt('BEST STREAK', s.bestStreak)}${cnt('PLAY TIME', Math.round(s.playTime / 60), ' MIN')}</div>`;
    // animaciones: barra, anillos y contadores
    requestAnimationFrame(() => {
      body.querySelector('.sr-bar i').style.width = (+body.querySelector('.sr-bar i').dataset.f * 100) + '%';
      body.querySelectorAll('.g-fg').forEach(c => { const C = 2 * Math.PI * 42; c.style.strokeDasharray = C; c.style.strokeDashoffset = C * (1 - +c.dataset.f); });
    });
    const nums = [...body.querySelectorAll('[data-n]')], t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
      for (const n of nums) { const v = +n.dataset.n * e, d = +(n.dataset.d || 0); n.textContent = (d ? v.toFixed(d) : Math.round(v).toLocaleString('en-US')) + (n.dataset.suf || ''); }
      if (k < 1) this.raf = requestAnimationFrame(tick);
    };
    tick();
    const inp = body.querySelector('#sr-name');
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    body.querySelector('#sr-save').addEventListener('click', () => {
      const v = inp.value.trim().slice(0, 20);
      if (v.length >= 3) { P.name = v; this.save(); this.app.ui.toast('Name saved'); this.app.ui.refreshLobby(); play('buy'); body.querySelector('.pc-txt b').textContent = v; }
    });
    body.querySelector('#sr-rand').addEventListener('click', () => { inp.value = randomUser(); play('ui'); });
  }

  // ---------- CAREER TRACK ----------
  career(body) {
    const P = this.P, c = careerOf(P), lv = Math.min(levelOf(P.xp).lv, TRACK_MAX);
    const from = Math.min(c.seen || 1, lv);
    const nodes = [];
    for (let n = 2; n <= TRACK_MAX; n++) {
      const r = TRACK[n], info = rewardInfo(r, P);
      nodes.push(`<div class="ct-node ${n <= from ? 'reached' : ''} ${c.claimed.includes(n) ? 'claimed' : ''}" data-n="${n}" style="--rc:${RARITY[info.rarity].color}">
        <div class="ct-lv">LV ${n}</div><div class="ct-box"><div class="ct-ico">${rewardIcon(r, P, 'ct' + n)}</div><i class="ct-lock">🔒</i><i class="ct-ok">✓</i></div>
        <div class="ct-name">${esc(info.name)}</div><div class="ct-kind">${info.kind}</div><button class="ct-claim">CLAIM</button></div>`);
    }
    const ready = claimable(P).length;
    body.innerHTML = `
      <div class="ct-top"><div><small>CAREER TRACK</small><b>LEVEL ${lv} <span>/ ${TRACK_MAX}</span></b></div>
        <div class="ct-ready" id="ct-ready">${ready ? `<b>${ready}</b> REWARD${ready > 1 ? 'S' : ''} READY` : 'ALL REWARDS CLAIMED'}</div></div>
      <div class="ct-scroll" id="ct-scroll"><div class="ct-track"><div class="ct-line"><i id="ct-fill"></i></div>${nodes.join('')}</div></div>
      <div class="ct-detail" id="ct-detail"></div>`;
    const sc = body.querySelector('#ct-scroll'), fill = body.querySelector('#ct-fill');
    const nodeEl = (n) => body.querySelector(`.ct-node[data-n="${n}"]`);
    const fillTo = (n, instant) => {
      const el = nodeEl(Math.max(2, n)); if (!el) return;
      fill.style.transition = instant ? 'none' : 'width .22s ease-out';
      fill.style.width = (n < 2 ? 0 : el.offsetLeft + el.offsetWidth / 2 - 40) + 'px'; // la línea empieza a 40px
    };
    // scroll horizontal con la rueda
    sc.addEventListener('wheel', (e) => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { sc.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
    body.querySelectorAll('.ct-node').forEach(nd => {
      nd.addEventListener('mouseenter', () => this.detail(+nd.dataset.n));
      nd.querySelector('.ct-claim').addEventListener('click', (e) => { e.stopPropagation(); this.claim(+nd.dataset.n, nd); });
    });
    const focus = (n) => { const el = nodeEl(Math.max(2, n)); if (el) sc.scrollLeft = el.offsetLeft - sc.clientWidth * 0.4; };
    requestAnimationFrame(() => {
      fillTo(from, true); focus(from);
      // PROMOCIÓN: la línea avanza nodo a nodo desde la última visita
      let n = from;
      const step = () => {
        if (n >= lv) { c.seen = lv; this.save(); this.markReady(); this.detail(claimable(P)[0] || Math.min(lv + 1, TRACK_MAX)); return; }
        n++;
        fillTo(n); const el = nodeEl(n); if (el) { el.classList.add('reached', 'pop'); focus(n); }
        play('count');
        this.seqTO = setTimeout(step, 230);
      };
      this.seqTO = setTimeout(step, from < lv ? 500 : 0);
    });
  }
  markReady() {
    const P = this.P, ready = claimable(P);
    this.el.querySelectorAll('.ct-node').forEach(nd => nd.classList.toggle('ready', ready.includes(+nd.dataset.n)));
    const r = this.el.querySelector('#ct-ready'); if (r) r.innerHTML = ready.length ? `<b>${ready.length}</b> REWARD${ready.length > 1 ? 'S' : ''} READY` : 'ALL REWARDS CLAIMED';
    const badge = this.el.querySelector('.sr-badge');
    if (badge) { if (ready.length) badge.textContent = ready.length; else badge.remove(); }
  }
  detail(n) {
    const box = this.el.querySelector('#ct-detail'); if (!box || !TRACK[n]) return;
    const P = this.P, r = TRACK[n], info = rewardInfo(r, P), lv = levelOf(P.xp).lv, c = careerOf(P);
    const state = c.claimed.includes(n) ? 'CLAIMED' : lv >= n ? 'READY TO CLAIM' : `UNLOCKS AT LEVEL ${n}`;
    box.style.setProperty('--rc', RARITY[info.rarity].color);
    box.innerHTML = `<div class="ctd-ico">${rewardIcon(r, P, 'det' + n)}</div><div class="ctd-txt"><small style="color:var(--rc)">${RARITY[info.rarity].name} ${info.kind}</small><b>${esc(info.name)}</b><span>LEVEL ${n} · ${state}</span></div>`;
    box.classList.remove('swap'); void box.offsetWidth; box.classList.add('swap');
  }
  // Reclamar: monedas/fragmentos al momento, emblemas/tarjetas con sello, skins con la escena de apertura
  claim(n, nd) {
    const P = this.P, c = careerOf(P), r = TRACK[n];
    if (c.claimed.includes(n) || levelOf(P.xp).lv < n) { play('empty'); return; }
    const info = rewardInfo(r, P);
    c.claimed.push(n);
    if (n === TRACK_MAX && !P.ownedEmblems.includes(MAX_BONUS.id)) { P.ownedEmblems.push(MAX_BONUS.id); setTimeout(() => this.app.ui.toast('👑 MAX LEVEL BONUS: SOVEREIGN emblem unlocked'), 400); }
    const done = (txt) => { nd.classList.remove('ready'); nd.classList.add('claimed', 'flip'); if (txt) nd.querySelector('.ct-name').textContent = txt; this.save(); this.markReady(); this.detail(n); this.app.ui.refreshLobby(); };
    if (r.type === 'coins') { P.coins += r.amount; play('buy'); done(); this.pop(nd, `+${r.amount}`); return; }
    if (r.type === 'shards') { P.shards += r.amount; play('buy'); done(); this.pop(nd, `+${r.amount}`); return; }
    if (r.type === 'emblem' || r.type === 'card') {
      const list = r.type === 'emblem' ? P.ownedEmblems : P.ownedCards;
      if (!list.includes(r.id)) list.push(r.id);
      play('reveal_' + info.rarity); play('medal'); done(); this.pop(nd, 'UNLOCKED');
      return;
    }
    // skins: si ya la tienes, se convierte en monedas
    const owned = r.type === 'weaponSkin' ? P.ownedWeaponSkins.includes(r.id) : P.ownedChars.includes(r.id);
    if (owned) { P.coins += DUPE[info.rarity]; play('buy'); done(`+${DUPE[info.rarity]} COINS`); this.pop(nd, `+${DUPE[info.rarity]}`); return; }
    if (r.type === 'weaponSkin') P.ownedWeaponSkins.push(r.id); else P.ownedChars.push(r.id);
    done();
    const L = P.loadouts[P.loadout] || P.loadouts[0];
    this.hide(true);
    this.app.openUnbox({ title: 'CAREER REWARD', legend: info.rarity === 'legendary', reward: { type: r.type, id: r.id, name: info.name, rarity: info.rarity, weapon: L.primary } }, (equip) => {
      if (equip && r.type === 'charSkin') P.charSkin = r.id;
      if (equip && r.type === 'weaponSkin') P.weaponSkins[L.primary] = r.id;
      this.save(); this.app.ui.refreshLobby();
      if (equip) this.app.lobby.swapFx(RARITY[info.rarity].color);
      this.hide(false);
    });
  }
  pop(nd, txt) {
    const p = document.createElement('div'); p.className = 'ct-pop'; p.textContent = txt; nd.appendChild(p);
    setTimeout(() => p.remove(), 1200);
  }
  hide(on) {
    this.hidden = on;
    this.el.classList.toggle('sr-hidden', on);
    if (!on) this.app.lobby.setShot('record');
  }

  // ---------- IDENTITY ----------
  identity(body) {
    const P = this.P;
    const lockLv = unlockLevel;
    const em = Object.entries(EMBLEMS).map(([id, e]) => { const own = P.ownedEmblems.includes(id);
      return `<button class="id-emb ${own ? '' : 'locked'} ${P.emblem === id ? 'on' : ''}" data-e="${id}" style="--rc:${RARITY[e.rarity].color}">${emblemSVG({ id, ...e }, 'g')}<small>${own ? e.name : 'LV ' + lockLv('emblem', id)}</small></button>`; }).join('');
    const cd = Object.entries(CARDS).map(([id, c]) => { const own = P.ownedCards.includes(id);
      return `<button class="id-card ${own ? '' : 'locked'} ${P.card === id ? 'on' : ''}" data-c="${id}" style="--rc:${RARITY[c.rarity].color}">${cardSVG({ id, ...c }, 'g')}<small>${own ? c.name : 'LV ' + lockLv('card', id)}</small></button>`; }).join('');
    body.innerHTML = `<div class="id-preview" id="id-prev">${playerCard(P, {}, 'idp')}</div>
      <div class="id-cols"><div><h4>EMBLEMS <span>${P.ownedEmblems.length}/${Object.keys(EMBLEMS).length}</span></h4><div class="id-emblems">${em}</div></div>
      <div><h4>PLAYER CARDS <span>${P.ownedCards.length}/${Object.keys(CARDS).length}</span></h4><div class="id-cards">${cd}</div></div></div>`;
    const prev = body.querySelector('#id-prev');
    const show = (o) => { prev.innerHTML = playerCard(P, o, 'idp' + Math.random().toString(36).slice(2, 6)); };
    let leaveTO;
    body.querySelectorAll('[data-e],[data-c]').forEach(b => {
      const o = b.dataset.e ? { emblem: b.dataset.e } : { card: b.dataset.c };
      b.addEventListener('mouseenter', () => { clearTimeout(leaveTO); show(o); play('uiHover'); });
      b.addEventListener('mouseleave', () => { leaveTO = setTimeout(() => show({}), 140); });
      b.addEventListener('click', () => {
        if (b.classList.contains('locked')) { play('empty'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        if (b.dataset.e) P.emblem = b.dataset.e; else P.card = b.dataset.c;
        this.save(); play('medal');
        body.querySelectorAll(b.dataset.e ? '[data-e]' : '[data-c]').forEach(x => x.classList.toggle('on', x === b));
        show({}); prev.classList.remove('equip'); void prev.offsetWidth; prev.classList.add('equip');
      });
    });
  }

  close() {
    if (this.closing) return;
    this.closing = true;
    clearTimeout(this.seqTO); cancelAnimationFrame(this.raf);
    removeEventListener('keydown', this.onKey);
    play('ui');
    this.el.classList.add('sr-out');
    document.body.classList.remove('sr-open');
    setTimeout(() => this.el.remove(), 350);
    this.app.lobby.setShot('home');
    this.app.ui.navActive('play');
    this.app.ui.record = null;
    this.app.ui.refreshLobby();
  }
}
