// HUD de ARENA (V2): marcador de rondas con "pips" de vivos, dinero, blindaje, fase de compra,
// tienda (armería), marcador gigante de fin de ronda y espectador.
// Sigue las skills de UI: la UI lee el estado de la Arena y sólo envía intenciones (buy/sell), nunca toca la simulación;
// números de ancho fijo; el centro de la pantalla queda libre durante la ronda.
import { WEAPONS } from '../data/weapons.js';
import { GEAR, SHOP, ECON, fmtMoney } from '../data/arena.js';
import { gunIcon, propIcon } from '../gfx/icons.js';
import { play } from '../game/audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const ICON = {
  vest: '<svg viewBox="0 0 48 48"><path d="M16 6h6l2 4 2-4h6l8 6-3 8v22H11V20l-3-8z" fill="currentColor"/><path d="M18 22h12v10H18z" fill="#000" fill-opacity=".25"/></svg>',
  heavy: '<svg viewBox="0 0 48 48"><path d="M24 3l17 7v12c0 11-7 19-17 23C14 41 7 33 7 22V10z" fill="currentColor"/><path d="M24 10l11 5v8c0 7-5 12-11 15-6-3-11-8-11-15v-8z" fill="#000" fill-opacity=".25"/></svg>',
  bandage: '<svg viewBox="0 0 48 48"><rect x="6" y="16" width="36" height="16" rx="8" fill="currentColor" transform="rotate(-35 24 24)"/><path d="M20 18h8v12h-8z" fill="#e8343b" transform="rotate(-35 24 24)"/></svg>',
  shield: '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l8 3v6c0 5.3-3.4 9.4-8 11-4.6-1.6-8-5.7-8-11V5z"/></svg>',
};
// Barras de estadísticas (0..1) para comparar armas de un vistazo
const stat = (w) => ({
  dmg: Math.min(1, (w.damage * w.pellets) / 120),
  rate: Math.min(1, w.rpm / 1050),
  mob: Math.min(1, (w.moveMul - 0.8) / 0.32),
});

export class ArenaUI {
  constructor(arena) {
    this.A = arena; this.m = arena.m;
    const hud = $('hud');
    this.root = document.createElement('div');
    this.root.className = 'ar-root';
    this.root.innerHTML = `
      <div class="ar-pips"><div class="ar-team blue" id="ar-pb"></div><div class="ar-team red" id="ar-pr"></div></div>
      <div class="ar-hist" id="ar-hist"></div>
      <div class="ar-buy" id="ar-buy"></div>
      <div class="ar-wallet"><b id="ar-money">$0</b><span class="ar-armor" id="ar-armor">${ICON.shield}<i>0</i></span><span class="ar-band" id="ar-band">${ICON.bandage}<kbd>4</kbd></span></div>
      <div class="ar-pops" id="ar-pops"></div>
      <div class="ar-spec" id="ar-spec"></div>`;
    hud.appendChild(this.root);
    document.body.classList.add('arena-on');
    this.shopOpen = false;
  }
  get me() { return this.m.me; }

  // ---------- Marcador superior ----------
  topBar() {
    const A = this.A, m = this.m;
    $('ts-left').textContent = m.teamScore.blue; $('ts-left-l').textContent = 'BLUE';
    $('ts-right').textContent = m.teamScore.red; $('ts-right-l').textContent = 'RED';
    $('ts-left').parentElement.classList.add('blue'); $('ts-right').parentElement.classList.add('red');
    const t = A.phase === 'buy' ? A.t : A.phase === 'live' ? A.t : 0;
    $('ts-time').textContent = A.phase === 'post' || A.phase === 'over' ? `R${A.round}` : mmss(t);
    $('ts-time').parentElement.classList.toggle('low', A.phase === 'live' && t <= 10);
    $('ts-time').parentElement.classList.toggle('ar-buying', A.phase === 'buy');
  }

  update() {
    const A = this.A, me = this.me;
    // pips: un rombo por operador; los caídos se apagan (forma + color: no depende sólo del color)
    for (const [team, id] of [['blue', 'ar-pb'], ['red', 'ar-pr']]) {
      const list = this.m.actors.filter(a => a.team === team);
      const key = list.map(a => (a.alive ? 1 : 0) + (a === me ? 'm' : '')).join('');
      if (this['pk' + team] === key) continue;
      this['pk' + team] = key;
      $(id).innerHTML = list.map(a => `<i class="${a.alive ? '' : 'dead'} ${a === me ? 'me' : ''}"></i>`).join('');
    }
    // historial de rondas (pequeños bloques bajo el marcador)
    const hk = A.history.join(',');
    if (hk !== this.hk) {
      this.hk = hk;
      const n = A.fmt.win * 2 - 1;
      $('ar-hist').innerHTML = Array.from({ length: n }, (_, i) => `<i class="${A.history[i] || ''}"></i>`).join('');
    }
    // cartera
    const money = Math.round(me.ar.money);
    if (money !== this.lastMoney) { this.lastMoney = money; $('ar-money').textContent = fmtMoney(money); }
    const arm = Math.ceil(me.ar.armor);
    $('ar-armor').classList.toggle('on', arm > 0); $('ar-armor').lastChild.textContent = arm;
    $('ar-band').classList.toggle('on', me.ar.bandage > 0);
    $('ar-band').classList.toggle('healing', me.ar.healT > 0);
    // barra de fase de compra
    const buy = $('ar-buy');
    if (A.phase === 'buy') {
      buy.classList.add('on');
      const s = Math.ceil(A.t);
      if (s !== this.lastBuyS) { this.lastBuyS = s; buy.innerHTML = `<b>BUY PHASE</b><span class="ar-t">${s}</span><span><kbd>B</kbd> SHOP</span><span><kbd>F</kbd> QUICK BUY</span>`; }
    } else { buy.classList.remove('on'); this.lastBuyS = null; }
    if (this.shopOpen) this.refreshShop();
  }

  moneyPop(n, why) {
    const d = document.createElement('div'); d.className = 'ar-pop';
    d.innerHTML = `<b>+${fmtMoney(n)}</b><small>${esc(why)}</small>`;
    $('ar-pops').appendChild(d); setTimeout(() => d.remove(), 1900);
    const w = $('ar-money'); if (w.animate) w.animate([{ transform: 'scale(1.25)', color: '#7dffa8' }, { transform: 'scale(1)', color: '#fff' }], { duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  }

  // ---------- Momentos de ronda ----------
  roundStart() {
    const A = this.A, m = this.m;
    this.hideResult();
    this.spectate(null);
    const el = document.createElement('div'); el.className = 'ar-round';
    const mp = A.matchPoint();
    el.innerHTML = `<small>${m.mode.name} · ${m.map.name}</small><b>ROUND ${A.round}</b><span>${mp ? 'MATCH POINT' : `FIRST TO ${A.fmt.win}`}</span>`;
    $('hud').appendChild(el); setTimeout(() => el.remove(), 2600);
  }
  goLive() { if (this.shopOpen) this.closeShop(); }

  roundEnd(winner, reason, decided) {
    const m = this.m, won = winner === this.me.team;
    const why = reason === 'time' ? 'TIME — MORE OPERATORS STANDING' : won ? 'ENEMY TEAM ELIMINATED' : 'YOUR TEAM WAS ELIMINATED';
    const el = document.createElement('div'); el.className = 'ar-result ' + (won ? 'win' : 'lose');
    const b = m.teamScore.blue, r = m.teamScore.red;
    el.innerHTML = `<div class="ar-res-k">${won ? 'ROUND WON' : 'ROUND LOST'}</div>
      <div class="ar-res-s"><b class="blue ${winner === 'blue' ? 'up' : ''}">${b}</b><i></i><b class="red ${winner === 'red' ? 'up' : ''}">${r}</b></div>
      <div class="ar-res-w">${decided ? (won ? 'MATCH WON' : 'MATCH LOST') : why}</div>`;
    $('hud').appendChild(el); this.resEl = el;
  }
  hideResult() { if (this.resEl) { this.resEl.remove(); this.resEl = null; } }

  spectate(a) {
    const el = $('ar-spec');
    if (!a) { el.classList.remove('on'); el.innerHTML = ''; document.body.classList.remove('ar-spectating'); return; }
    el.classList.add('on'); document.body.classList.add('ar-spectating');
    el.innerHTML = `<small>SPECTATING</small><b>${esc(a.name)}</b><span><kbd>SPACE</kbd> NEXT TEAMMATE</span>`;
  }

  // ---------- Tienda ----------
  toggleShop() { this.shopOpen ? this.closeShop() : this.openShop(); }
  openShop() {
    const A = this.A, app = this.m.app;
    if (!A.canBuy(this.me)) { app.ui.hud.toast(A.phase === 'live' ? 'BUY PHASE IS OVER' : 'YOU CAN BUY NEXT ROUND'); play('empty'); return; }
    this.shopOpen = true; app.ui.shopOpen = true;
    app.input.enabled = false; app.input.reset(); app.input.unlock();
    $('click-to-play').classList.add('hidden');
    this.cat = this.cat || (this.me.slots[0] ? 'gear' : 'rifles');
    const el = this.shopEl = document.createElement('div');
    el.id = 'ar-shop';
    el.innerHTML = `<div class="sh-in">
      <div class="sh-top"><div class="sh-title"><small>ARENA ARMORY</small><b>BUY</b></div><div class="sh-money"><small>FUNDS</small><b id="sh-money"></b></div><div class="sh-time"><small>CLOSES IN</small><b id="sh-time"></b></div></div>
      <div class="sh-body"><nav class="sh-cats">${SHOP.map((c, i) => `<button data-cat="${c.id}"><kbd>${i + 1}</kbd>${c.name}</button>`).join('')}</nav><div class="sh-grid" id="sh-grid"></div></div>
      <div class="sh-team" id="sh-team"></div>
      <div class="sh-foot"><span>Click an item you bought this round to refund it</span><button class="btn cyan" id="sh-done">READY <kbd>B</kbd></button></div></div>`;
    document.body.appendChild(el); document.body.classList.add('ar-shop-open');
    el.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => { this.cat = b.dataset.cat; play('ui'); this.renderShop(); }));
    el.querySelector('#sh-done').addEventListener('click', () => this.closeShop());
    el.addEventListener('mousedown', (e) => e.stopPropagation());
    this.renderShop();
    play('pauseIn');
  }
  renderShop() {
    const el = this.shopEl; if (!el) return;
    el.querySelectorAll('[data-cat]').forEach(b => b.classList.toggle('on', b.dataset.cat === this.cat));
    const cat = SHOP.find(c => c.id === this.cat);
    $('sh-grid').innerHTML = cat.items.map(id => {
      const g = GEAR[id], w = WEAPONS[id];
      const pic = g && propIcon(id === 'bandage' ? 'bandage' : 'vest', id === 'heavy' ? { cloth: 0x4a6fa8 } : id === 'vest' ? { cloth: 0x7d8a5e } : null);
      const art = g ? (pic ? `<img class="sh-prop" src="${pic}">` : `<div class="sh-gear">${ICON[id]}</div>`) : `<img src="${gunIcon(id, this.me.weaponSkins[id]).white}">`;
      const info = g ? `<p>${g.desc}</p>` : (() => { const s = stat(w); return `<div class="sh-stats">${[['DMG', s.dmg], ['RATE', s.rate], ['MOBILITY', s.mob]].map(([k, v]) => `<div><span>${k}</span><i><b style="width:${Math.round(v * 100)}%"></b></i></div>`).join('')}</div>`; })();
      return `<button class="sh-item" data-id="${id}">${art}<div class="sh-name">${g ? g.name : w.name}<small>${g ? 'EQUIPMENT' : w.kind}</small></div>${info}<div class="sh-price" data-p></div><div class="sh-tag" data-t></div></button>`;
    }).join('');
    $('sh-grid').querySelectorAll('.sh-item').forEach(b => {
      b.addEventListener('click', () => this.buy(b.dataset.id, b));
      b.addEventListener('mouseenter', () => play('uiHover'));
    });
    this.refreshShop(true);
  }
  buy(id, btn) {
    const res = this.A.buy(this.me, id);
    if (res === 'money' || res === 'owned' || res === 'phase') {
      play('empty');
      if (btn && btn.animate) btn.animate([{ transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'none' }], { duration: 180 });
    }
    this.refreshShop(true);
  }
  refreshShop(force) {
    const el = this.shopEl; if (!el) return;
    const A = this.A, me = this.me;
    const key = [Math.round(me.ar.money), Math.ceil(A.t), me.ar.armor, me.ar.bandage, me.slots.map(w => w && w.id).join(), me.ar.bought.length].join('|');
    if (!force && key === this.shopSig) return;
    this.shopSig = key;
    $('sh-money').textContent = fmtMoney(me.ar.money);
    $('sh-time').textContent = mmss(A.t);
    el.querySelectorAll('.sh-item').forEach(b => {
      const id = b.dataset.id, price = A.price(id);
      const bought = me.ar.bought.some(x => x.id === id), owned = A.owns(me, id);
      b.classList.toggle('owned', owned); b.classList.toggle('bought', bought);
      b.classList.toggle('poor', !owned && me.ar.money < price);
      b.querySelector('[data-p]').textContent = price ? fmtMoney(price) : 'FREE';
      b.querySelector('[data-t]').textContent = bought ? 'REFUND' : owned ? 'EQUIPPED' : me.ar.money < price ? `NEED ${fmtMoney(price - me.ar.money)}` : '';
    });
    // economía del equipo (para coordinar compras)
    const team = this.m.actors.filter(a => a.team === me.team);
    $('sh-team').innerHTML = team.map(a => `<div class="${a === me ? 'me' : ''}"><span>${esc(a === me ? 'YOU' : a.name)}</span><b>${fmtMoney(a.ar.money)}</b>${a.slots[0] ? `<img src="${gunIcon(a.slots[0].id).white}">` : '<em>PISTOL</em>'}${a.ar.armor > 0 ? `<i class="sh-a">${ICON.shield}</i>` : ''}</div>`).join('');
  }
  closeShop() {
    if (!this.shopOpen) return;
    this.shopOpen = false; const app = this.m.app; app.ui.shopOpen = false;
    if (this.shopEl) { this.shopEl.remove(); this.shopEl = null; }
    document.body.classList.remove('ar-shop-open');
    play('pauseOut');
    if (app.state === 'match' && !app.ui.resultsOpen) {
      app.input.enabled = true; app.input.lock();
      if (!app.input.locked && !app.input.free) setTimeout(() => { if (!app.input.locked && !this.shopOpen && !app.input.free && app.state === 'match') $('click-to-play').classList.remove('hidden'); }, 300);
    }
  }
  // Tecla de la tienda: 1–5 cambian de categoría
  shopKey(code) {
    const n = code.startsWith('Digit') ? +code.slice(5) : NaN;
    if (n >= 1 && n <= SHOP.length) { this.cat = SHOP[n - 1].id; play('ui'); this.renderShop(); return true; }
    return false;
  }
  // Compra rápida (sin abrir la tienda): la misma lógica que usan los bots
  quickBuy() {
    const A = this.A, me = this.me;
    if (!A.canBuy(me)) return;
    const before = me.ar.money;
    A.botBuy(me);
    if (me.ar.money === before) { this.m.app.ui.hud.toast('NOTHING TO BUY'); play('empty'); }
    else this.m.app.ui.hud.toast('QUICK BUY · ' + fmtMoney(before - me.ar.money));
  }

  dispose() {
    this.closeShop();
    this.root.remove(); this.hideResult();
    document.body.classList.remove('arena-on', 'ar-spectating');
    $('ts-time').parentElement.classList.remove('ar-buying');
  }
}
export { ECON };
