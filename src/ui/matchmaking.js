// Secuencia 6 — MATCHMAKING: al pulsar PLAY el botón se convierte en un panel de búsqueda (radar, región, ping,
// cronómetro) → "MATCH FOUND" golpea la pantalla, la tarjeta del mapa gira → la lista se llena con los jugadores
// que de verdad estarán en la partida → despliegue (la cinemática de la puerta).
// ESC cancela mientras busca; clic / ESPACIO salta directo al despliegue cuando ya hay partida.
import { MODES, randomBotName } from '../data/modes.js';
import { mapThumb } from '../gfx/icons.js';
import { play } from '../game/audio.js';
import { EMBLEMS } from '../data/career.js';
import { emblemSVG } from '../gfx/identity.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const REGIONS = [['EU-WEST', 34], ['EU-CENTRAL', 41], ['NA-EAST', 88], ['SA-EAST', 112]];

export class Matchmaking {
  constructor(app, modeId, onDeploy, onCancel) {
    this.app = app; this.onDeploy = onDeploy; this.onCancel = onCancel;
    const P = app.profile, m = this.mode = MODES[modeId] || MODES.dm;
    this.modeId = modeId;
    this.timers = []; this.stage = 'search'; this.t0 = performance.now();
    // la lista real de la partida: tú, tu party y los bots que van a entrar
    const party = (P.party || []).slice(0, 2);
    this.players = [{ name: P.name, me: true }, ...party.map(p => ({ name: p.name, party: true }))];
    while (this.players.length < m.players) this.players.push({ name: randomBotName() });
    this.players.forEach((p, i) => { p.team = m.teams ? (i < m.players / 2 ? 'blue' : 'red') : null; p.ping = p.me ? 12 : 18 + Math.floor(Math.random() * 90); });
    const [reg, ping] = REGIONS[Math.floor(Math.random() * 2)];
    const el = this.el = document.createElement('div');
    el.id = 'mm';
    el.innerHTML = `
      <div class="mm-card">
        <div class="mm-top"><div class="mm-radar"><i class="mm-sweep"></i><i class="mm-blip" style="--a:40deg;--r:60%"></i><i class="mm-blip" style="--a:160deg;--r:35%"></i><i class="mm-blip" style="--a:260deg;--r:75%"></i></div>
          <div class="mm-status"><small id="mm-k">SEARCHING FOR MATCH</small><b id="mm-mode">${m.name}</b><span>${reg} · ${ping} ms · <em id="mm-time">0:00</em></span></div></div>
        <div class="mm-found"><div class="mm-map" style="background-image:url(${mapThumb(m.map)})"><b>${m.map.toUpperCase()}</b><small>${m.name}</small></div></div>
        <div class="mm-list" id="mm-list"></div>
        <div class="mm-foot"><span id="mm-count">1/${m.players}</span><span class="mm-hint" id="mm-hint"><kbd>ESC</kbd> CANCEL</span></div>
      </div>
      <div class="mm-slam">MATCH FOUND</div>`;
    document.body.appendChild(el);
    document.body.classList.add('mm-on');
    app.lobby.setShot('mm');
    this.tick = setInterval(() => {
      const s = Math.floor((performance.now() - this.t0) / 1000);
      const e = el.querySelector('#mm-time'); if (e) e.textContent = `0:${String(s).padStart(2, '0')}`;
    }, 200);
    this.onKey = (e) => {
      if (e.code === 'Escape' && this.stage === 'search') this.cancel();
      else if ((e.code === 'Space' || e.code === 'Enter') && this.stage !== 'search') this.deploy();
    };
    this.onClick = () => { if (this.stage !== 'search') this.deploy(); };
    addEventListener('keydown', this.onKey);
    el.addEventListener('click', this.onClick);
    play('mmSearch');
    this.at(1.1 + Math.random() * 0.7, () => this.found());
  }
  at(sec, fn) { this.timers.push(setTimeout(fn, sec * 1000)); }

  found() {
    this.stage = 'found';
    const el = this.el;
    el.classList.add('found');
    el.querySelector('#mm-k').textContent = 'MATCH FOUND';
    el.querySelector('#mm-hint').innerHTML = '<kbd>SPACE</kbd> DEPLOY NOW';
    play('mmFound');
    // los jugadores entran uno a uno
    const list = el.querySelector('#mm-list');
    let i = 0;
    const add = () => {
      const p = this.players[i];
      const row = document.createElement('div');
      row.className = 'mm-p' + (p.me ? ' me' : '') + (p.team ? ' ' + p.team : '');
      const em = p.me ? `<div class="mm-emb">${emblemSVG({ id: this.app.profile.emblem || 'e_basic', ...EMBLEMS[this.app.profile.emblem || 'e_basic'] }, 'mm')}</div>` : '';
      row.innerHTML = `<i></i>${em}<b>${esc(p.name)}</b>${p.party ? '<em>PARTY</em>' : ''}<span class="${p.ping > 80 ? 'hi' : ''}">${p.ping}ms</span>`;
      list.appendChild(row);
      list.scrollTop = list.scrollHeight;
      i++;
      el.querySelector('#mm-count').textContent = `${i}/${this.players.length}`;
      if (!p.me) play('mmJoin');
      if (i < this.players.length) this.at(0.06 + Math.random() * 0.09, add);
      else this.at(0.45, () => { el.querySelector('#mm-k').textContent = 'LOBBY FULL · DEPLOYING'; el.classList.add('full'); this.at(0.55, () => this.deploy()); });
    };
    this.at(0.55, add);
  }

  clear() {
    this.timers.forEach(clearTimeout); this.timers = [];
    clearInterval(this.tick);
    removeEventListener('keydown', this.onKey);
    document.body.classList.remove('mm-on');
  }
  cancel() {
    if (this.stage === 'done') return;
    this.stage = 'done';
    this.clear();
    play('ui');
    this.el.classList.add('out'); setTimeout(() => this.el.remove(), 350);
    this.app.lobby.setShot('home');
    this.onCancel();
  }
  deploy() {
    if (this.stage === 'done') return;
    this.stage = 'done';
    this.clear();
    this.el.classList.add('out'); setTimeout(() => this.el.remove(), 350);
    this.onDeploy(this.players.slice(1).map(p => p.name));
  }
}
