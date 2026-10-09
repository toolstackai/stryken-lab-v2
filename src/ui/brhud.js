// HUD del Battle Royale: minimapa y mapa completo (M), zona y su temporizador, blindaje y curas,
// interfaz del salto (avión / caída / paracaídas), números de daño y avisos.
import * as THREE from 'three';
import { ITEMS, ZONE_PHASES } from '../data/loot.js';
import { WEAPONS } from '../data/weapons.js';
import { RARITY } from '../data/cosmetics.js';
import { gunIcon } from '../gfx/icons.js';
import { play } from '../game/audio.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (t) => { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const SPAN = 190; // el mapa cubre de -190 a 190 m (isla + playa + algo de mar)

const MAT_COL = {
  plasterWhite: '#d9d3c5', roofGreen: '#55805f', wood: '#8f6c4a', brickWall: '#9b5c46', plasterRed: '#b9634e', metalroof: '#7d838b',
  stoneBlock: '#aaa496', metalWall: '#7c868e', metalFloor: '#6b7179', factoryWall: '#8c8479', factoryFloor: '#78746d', concreteDock: '#9c9a92',
  concreteWall: '#aba89f', darkMetal: '#45494f', rock: '#8b8b86',
};
const ICON = {
  armor: '<svg viewBox="0 0 24 24"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor"/></svg>',
  bandage: '<svg viewBox="0 0 24 24"><rect x="2" y="8" width="20" height="8" rx="4" transform="rotate(-35 12 12)" fill="currentColor"/><g fill="#0007"><circle cx="10.5" cy="12.6" r=".9"/><circle cx="13.4" cy="11.4" r=".9"/><circle cx="12" cy="10" r=".9"/><circle cx="12" cy="14" r=".9"/></g></svg>',
  medkit: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="14" rx="2.5" fill="currentColor"/><path d="M9 6V4h6v2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M10.5 9h3v3h3v3h-3v3h-3v-3h-3v-3h3z" fill="#fff"/></svg>',
  ammo: '<svg viewBox="0 0 24 24"><path d="M5 9h3v11H5zM10.5 9h3v11h-3zM16 9h3v11h-3zM5 9l1.5-5L8 9zm5.5 0L12 4l1.5 5zM16 9l1.5-5L19 9z" fill="currentColor"/></svg>',
  storm: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-dasharray="4 3"/><circle cx="12" cy="12" r="3.5" fill="currentColor"/></svg>',
};

// Imagen cenital del mapa (una vez por mapa)
const mapCache = {};
function mapImage(map) {
  if (mapCache[map.id]) return mapCache[map.id];
  const S = 1024, k = S / (SPAN * 2);
  const X = (x) => (x + SPAN) * k, Z = (z) => (z + SPAN) * k;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const sea = g.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75); sea.addColorStop(0, '#3a8db8'); sea.addColorStop(1, '#1f5a82');
  g.fillStyle = sea; g.fillRect(0, 0, S, S);
  // olas
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
  for (let i = 0; i < 60; i++) { const y = (i * 37) % S, x = (i * 151) % S; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 20, y - 6, x + 40, y); g.stroke(); }
  const H = 152;
  g.fillStyle = '#e8d6a8'; g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 18;
  g.fillRect(X(-H - 26), Z(-H - 26), (H + 26) * 2 * k, (H + 26) * 2 * k); g.shadowBlur = 0;
  g.fillStyle = '#d9c494'; g.fillRect(X(-H - 6), Z(-H - 6), (H + 6) * 2 * k, (H + 6) * 2 * k);
  g.fillStyle = '#6a9446'; g.fillRect(X(-H), Z(-H), H * 2 * k, H * 2 * k);
  // manchas de hierba (deterministas)
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 160; i++) { g.fillStyle = rnd() < 0.5 ? 'rgba(60,100,40,.35)' : 'rgba(150,170,80,.18)'; g.beginPath(); g.arc(X(-H + rnd() * H * 2), Z(-H + rnd() * H * 2), 6 + rnd() * 26, 0, 7); g.fill(); }
  const ents = map.entities;
  for (const e of ents) if (e.k === 'paint' && e.w > 1 && e.d > 1) {
    const [x, , z] = e.p;
    g.fillStyle = '#54575c'; g.fillRect(X(x - e.w / 2), Z(z - e.d / 2), e.w * k, e.d * k);
    g.fillStyle = 'rgba(230,195,58,.5)';
    if (e.w > e.d) g.fillRect(X(x - e.w / 2), Z(z) - 0.6, e.w * k, 1.2); else g.fillRect(X(x) - 0.6, Z(z - e.d / 2), 1.2, e.d * k);
  }
  // estructuras de abajo arriba (los tejados tapan las paredes)
  const boxes = ents.filter(e => (e.k === 'box' && e.m !== 'none' && e.m !== 'grass' && e.m !== 'railing') || e.k === 'ramp' || e.k === 'cont' || e.k === 'crate' || e.k === 'truck' || e.k === 'tank' || e.k === 'machine');
  boxes.sort((a, b) => (a.p[1] + (a.s ? a.s[1] : 1)) - (b.p[1] + (b.s ? b.s[1] : 1)));
  for (const e of boxes) {
    const [x, y, z] = e.p;
    let w, d, col;
    if (e.k === 'cont') { const L = 6.1, W = 2.45; w = e.o === 'x' ? L : W; d = e.o === 'x' ? W : L; col = '#' + (e.c || 0x888888).toString(16).padStart(6, '0'); }
    else if (e.k === 'crate') { w = d = e.size; col = '#a07a4a'; }
    else if (e.k === 'truck') { w = e.o === 'z' ? 2.5 : 12; d = e.o === 'z' ? 12 : 2.5; col = '#' + (e.c || 0x555555).toString(16).padStart(6, '0'); }
    else if (e.k === 'tank') { w = d = (e.r || 0.6) * 2; col = '#8a9096'; }
    else if (e.k === 'machine') { w = e.w; d = e.d; col = '#5c6168'; }
    else { [w, , d] = e.s; col = MAT_COL[e.m] || '#a29d92'; }
    if (w < 0.3 && d < 0.3) continue;
    const top = y + (e.s ? e.s[1] : 1);
    g.fillStyle = col; g.fillRect(X(x - w / 2), Z(z - d / 2), Math.max(1, w * k), Math.max(1, d * k));
    if (top > 2.2 && w * k > 3 && d * k > 3) { g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.strokeRect(X(x - w / 2) + 0.5, Z(z - d / 2) + 0.5, w * k - 1, d * k - 1); }
  }
  for (const e of ents) if (e.k === 'tree') {
    const [x, , z] = e.p, r = 2.1 * (e.s || 1) * k;
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(X(x) + 2, Z(z) + 2, r, 0, 7); g.fill();
    g.fillStyle = e.v === 'pine' ? '#2f5a2e' : '#3b6e33'; g.beginPath(); g.arc(X(x), Z(z), r, 0, 7); g.fill();
    g.fillStyle = 'rgba(160,200,100,.25)'; g.beginPath(); g.arc(X(x) - r * 0.3, Z(z) - r * 0.3, r * 0.45, 0, 7); g.fill();
  }
  if (map.pois) for (const e of ents) if (e.k === 'pagodaRoof') { g.fillStyle = '#7a3a30'; g.fillRect(X(e.p[0] - e.w / 2), Z(e.p[2] - e.d / 2), e.w * k, e.d * k); }
  mapCache[map.id] = c;
  return c;
}

export class BRHud {
  constructor(m, br) {
    this.m = m; this.br = br; this.t = 0; this.nums = []; this.mapOpen = false;
    const el = this.el = document.createElement('div'); el.id = 'br-hud';
    el.innerHTML = `
      <div class="br-storm"></div><div class="br-speed"></div>
      <div class="br-mm"><canvas width="200" height="200"></canvas><b class="br-mm-n">N</b><div class="br-mm-poi" id="br-poi"></div></div>
      <div class="br-zone"><i>${ICON.storm}</i><div><small id="brz-l">STORM MOVES IN</small><b id="brz-t">1:30</b></div><div class="br-zbar"><i id="brz-bar"></i></div></div>
      <div class="br-safe" id="br-safe"></div>
      <div class="br-armor" id="br-armor"><i>${ICON.armor}</i><div class="br-ab"><i></i></div><b>0</b></div>
      <div class="br-heals"><div class="bh" id="bh-bandage"><kbd>4</kbd><i>${ICON.bandage}</i><b>0</b></div><div class="bh medkit" id="bh-medkit"><kbd>5</kbd><i>${ICON.medkit}</i><b>0</b></div></div>
      <div class="br-chan" id="br-chan"><svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" class="bg"/><circle cx="40" cy="40" r="34" class="fg" id="br-chan-r"/></svg><i id="br-chan-i"></i><b id="br-chan-n"></b><small id="br-chan-t"></small></div>
      <div class="br-airui">
        <div class="br-route" id="br-route"><div class="br-rt-bar"><i class="br-rt-win" id="br-rt-win"></i><i class="br-rt-plane" id="br-rt-plane"></i></div><span id="br-rt-l">DOORS OPEN IN</span></div>
        <div class="br-jump" id="br-jump"><kbd>SPACE</kbd><b>JUMP</b></div>
        <div class="br-alt" id="br-alt"><small>ALTITUDE</small><b id="br-alt-v">130</b><i>m</i><div class="br-alt-bar"><i id="br-alt-bar"></i><em id="br-alt-chute"></em></div><span id="br-alt-s">0 m/s</span></div>
        <div class="br-hints" id="br-hints"></div>
      </div>
      <div class="br-nums" id="br-nums"></div>
      <div class="br-alert" id="br-alert"></div>
      <div class="br-got" id="br-got"></div>
      <div class="br-map" id="br-map"><div class="br-map-in"><canvas width="760" height="760"></canvas><div class="br-map-labels" id="br-map-labels"></div>
        <div class="br-map-side"><small>KORVA ISLAND</small><b id="brm-alive">24</b><span>OPERATORS ALIVE</span><hr><div id="brm-zone"></div><div class="brm-key"><i class="k-you"></i>YOU <i class="k-safe"></i>NEXT ZONE <i class="k-storm"></i>STORM <i class="k-plane"></i>FLIGHT PATH</div><p><kbd>M</kbd> CLOSE</p></div></div></div>`;
    document.body.appendChild(el);
    this.mm = el.querySelector('.br-mm canvas').getContext('2d');
    this.fm = el.querySelector('.br-map canvas').getContext('2d');
    this.img = mapImage(m.map);
    // nombres de zonas en el mapa grande
    const lab = $('br-map-labels');
    lab.innerHTML = m.map.pois.map(p => `<span style="left:${(p.x + SPAN) / (SPAN * 2) * 100}%;top:${(p.z + SPAN) / (SPAN * 2) * 100}%">${esc(p.name)}</span>`).join('');
    this.onKey = (e) => {
      if (e.code !== 'KeyM' || this.m.app.ui.chatOpen || this.m.app.state !== 'match') return;
      this.mapOpen = !this.mapOpen; el.classList.toggle('map-on', this.mapOpen); play('ui');
    };
    addEventListener('keydown', this.onKey);
  }

  start() {
    this.el.classList.add('on', 'in-plane');
    this.alert('KORVA ISLAND', 'title', 'BATTLE ROYALE · 24 OPERATORS');
  }
  doorsOpen() { this.alert('DOORS OPEN', 'safe', 'JUMP WHENEVER YOU ARE READY'); }
  onJump() { this.el.classList.remove('in-plane'); this.el.classList.add('in-fall'); }
  landed(name) {
    this.el.classList.remove('in-plane', 'in-fall');
    if (name) this.alert(name, 'land', 'LANDED');
  }
  toastBig(t) { this.alert(t, 'storm'); }
  zoneAlert(text, kind) { this.alert(text, kind, kind === 'storm' ? 'MOVE TO THE SAFE ZONE' : 'CHECK YOUR MAP · M'); }
  alert(main, kind = 'safe', sub = '') {
    const a = $('br-alert');
    a.innerHTML = `<div class="bra ${kind}"><b>${esc(main)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    clearTimeout(this.aTO); this.aTO = setTimeout(() => { a.innerHTML = ''; }, 3600);
  }
  channel(id, time) {
    const c = $('br-chan');
    if (!id) { c.classList.remove('on'); this.chan = null; return; }
    this.chan = { id, time };
    $('br-chan-i').innerHTML = ICON[id]; $('br-chan-n').textContent = 'USING ' + ITEMS[id].name;
    c.classList.add('on');
  }
  healed(n) { this.num(null, '+' + n, 'heal'); }
  armorBreak() { this.m.app.ui.hud.toast('ARMOR BROKEN'); }
  got(e) {
    const g = $('br-got'), d = document.createElement('div');
    const col = RARITY[e.rarity] ? RARITY[e.rarity].color : '#fff';
    const icon = e.type === 'weapon' ? `<img src="${gunIcon(e.id).white}">` : `<i>${ICON[ITEMS[e.id].kind === 'armor' ? 'armor' : e.id] || ''}</i>`;
    d.style.setProperty('--rc', col);
    d.innerHTML = `${icon}<b>${esc(this.br.label(e))}</b><small>${RARITY[e.rarity] ? RARITY[e.rarity].name : ''}</small>`;
    g.prepend(d); while (g.children.length > 4) g.lastChild.remove();
    setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2700);
  }
  onElim(v, k) {
    const n = this.br.aliveCount();
    // latido del contador de vivos (Web Animations: sin forzar un recálculo de estilos de toda la página)
    const box = $('ts-left'); if (box && box.animate) box.animate([{ transform: 'scale(1.6)', color: '#ff6a6a' }, { transform: 'scale(1)', color: '#fff' }], { duration: 600, easing: 'ease-out' });
    if (v.isLocal) return;
    if (n <= 10 && n > 1 && this.m.me.alive && n !== this.lastN) { this.lastN = n; this.m.app.ui.hud.announce(`${n} OPERATORS LEFT`, n <= 3 ? 'red' : 'white'); }
  }
  // Número de daño flotante sobre el objetivo (blanco = vida, azul = blindaje, amarillo = cabeza)
  num(pos, text, kind) {
    const d = document.createElement('div'); d.className = 'brn ' + kind; d.textContent = text;
    $('br-nums').appendChild(d);
    this.nums.push({ el: d, pos: pos ? pos.clone() : null, t: 0, dx: (Math.random() - 0.5) * 40 });
    if (this.nums.length > 14) { const o = this.nums.shift(); o.el.remove(); }
  }

  // Marcador superior: vivos · zona · bajas
  topBar() {
    const br = this.br, m = this.m;
    $('ts-left').textContent = br.aliveCount(); $('ts-left-l').textContent = 'ALIVE';
    $('ts-right').textContent = m.me.kills; $('ts-right-l').textContent = 'KILLS';
    $('ts-time').textContent = br.zs === 'done' ? '—' : fmt(br.zt);
    $('ts-time').parentElement.classList.toggle('low', br.zs === 'shrink');
  }
  // Pista de recogida (con el color de la rareza)
  prompt() {
    const p = $('pickup'), me = this.m.me;
    const it = me.alive && !me.brAir ? this.br.nearTake(me) : null;
    if (!it) { p.classList.remove('on'); this.lastPrompt = null; return; }
    if (this.lastPrompt === it && it.e.n === this.lastN2) return;
    this.lastPrompt = it; this.lastN2 = it.e.n;
    const R = RARITY[it.e.rarity] || RARITY.common;
    const cur = it.e.type === 'weapon' ? me.slots[WEAPONS[it.e.id].slot - 1] : null;
    p.innerHTML = `<kbd>E</kbd> ${cur ? 'SWAP FOR' : 'PICK UP'} <span style="color:${R.color}">${esc(this.br.label(it.e))}</span> <small class="br-rar" style="background:${R.color}">${R.name}</small>`;
    p.classList.add('on');
  }

  update(dt) {
    this.t += dt;
    const m = this.m, br = this.br, me = m.me, cam = m.app.camera;
    // zona
    const P = ZONE_PHASES, ph = P[Math.min(br.zi, P.length - 1)];
    $('brz-l').textContent = br.zs === 'wait' ? (br.zi === 0 ? 'STORM FORMS IN' : 'STORM MOVES IN') : br.zs === 'shrink' ? 'STORM CLOSING' : 'FINAL STORM';
    $('brz-t').textContent = br.zs === 'done' ? '' : fmt(br.zt);
    $('brz-bar').style.width = (br.zs === 'done' ? 100 : (1 - br.zt / (br.zs === 'wait' ? ph.wait : ph.shrink)) * 100) + '%';
    this.el.classList.toggle('z-shrink', br.zs === 'shrink');
    // ¿fuera de la zona?
    const out = me.alive && !me.brAir && br.formed && !m.ended && br.outside(me);
    document.body.classList.toggle('br-out', out);
    const sf = $('br-safe');
    const tgt = br.next && me.alive && !me.brAir && br.outside(me, br.next) ? br.next : (out ? br.zone : null);
    if (tgt) {
      const d = Math.max(0, Math.hypot(tgt.x - me.pos.x, tgt.z - me.pos.z) - tgt.r);
      const ang = Math.atan2(tgt.x - me.pos.x, -(tgt.z - me.pos.z)) + me.yaw;
      sf.innerHTML = `<i style="transform:rotate(${ang}rad)">▲</i><b>${Math.round(d)}m</b><small>${out ? 'IN THE STORM · ' + br.dps() + ' DMG/S' : 'TO SAFE ZONE'}</small>`;
      sf.classList.add('on'); sf.classList.toggle('danger', out);
    } else sf.classList.remove('on');
    // blindaje y curas
    const ar = $('br-armor');
    ar.classList.toggle('none', !me.armor); ar.lastElementChild.textContent = Math.ceil(me.armor || 0);
    ar.querySelector('.br-ab i').style.width = Math.min(100, me.armor || 0) + '%';
    ar.style.setProperty('--ac', me.armorItem ? RARITY[ITEMS[me.armorItem].rarity].color : '#9aa4b5');
    for (const id of ['bandage', 'medkit']) { const b = $('bh-' + id); b.lastElementChild.textContent = me.heals[id]; b.classList.toggle('none', !me.heals[id]); }
    if (this.chan) {
      const k = 1 - Math.max(0, me.healT) / this.chan.time, C = 2 * Math.PI * 34;
      const r = $('br-chan-r'); r.style.strokeDasharray = C; r.style.strokeDashoffset = C * (1 - k);
      $('br-chan-t').textContent = Math.max(0, me.healT).toFixed(1) + 's';
    }
    // interfaz en el aire
    if (me.brAir === 'plane') {
      const win = $('br-rt-win'), L = br.pLen;
      win.style.left = (br.openS / L * 100) + '%'; win.style.width = ((br.exitS - br.openS) / L * 100) + '%';
      $('br-rt-plane').style.left = (br.ps / L * 100) + '%';
      $('br-rt-l').textContent = br.doorsOpen ? `AUTO-JUMP IN ${Math.max(0, Math.ceil((br.exitS - br.ps) / 16))}s` : `DOORS OPEN IN ${Math.max(0, Math.ceil((br.openS - br.ps) / 16))}s`;
      $('br-jump').classList.toggle('ready', !!br.doorsOpen);
      $('br-hints').innerHTML = '<span><kbd>MOUSE</kbd> LOOK</span><span><kbd>M</kbd> MAP</span>';
    } else if (me.brAir) {
      const agl = br.agl(me), sp = Math.round(Math.hypot(me.vel.x, me.vel.y, me.vel.z));
      $('br-alt-v').textContent = Math.round(agl); $('br-alt-s').textContent = sp + ' m/s';
      $('br-alt-bar').style.height = Math.min(100, agl / 130 * 100) + '%';
      $('br-alt-chute').style.bottom = (45 / 130 * 100) + '%';
      this.el.classList.toggle('chute', me.brAir === 'chute');
      $('br-hints').innerHTML = me.brAir === 'fall'
        ? `<span><kbd>W</kbd> DIVE</span><span><kbd>A</kbd><kbd>D</kbd> STEER</span>${agl < 110 && me.brFallT > 0.8 ? '<span class="hl"><kbd>SPACE</kbd> OPEN PARACHUTE</span>' : '<span class="dim">PARACHUTE OPENS AT 45m</span>'}`
        : '<span><kbd>W</kbd> DESCEND FASTER</span><span><kbd>WASD</kbd> STEER</span>';
    }
    // números de daño
    const v = new THREE.Vector3();
    for (let i = this.nums.length - 1; i >= 0; i--) {
      const n = this.nums[i]; n.t += dt;
      if (n.t > 0.9) { n.el.remove(); this.nums.splice(i, 1); continue; }
      let x = innerWidth / 2, y = innerHeight / 2 + 40;
      if (n.pos) { v.copy(n.pos).project(cam); if (v.z > 1) { n.el.style.opacity = 0; continue; } x = (v.x * 0.5 + 0.5) * innerWidth; y = (-v.y * 0.5 + 0.5) * innerHeight; }
      const k = n.t / 0.9;
      n.el.style.transform = `translate(${x + n.dx * k}px, ${y - 50 * Math.sqrt(k)}px) translate(-50%,-50%) scale(${n.t < 0.08 ? 1.6 - n.t * 7 : 1})`;
      n.el.style.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
    }
    // minimapa (a 30 Hz)
    this.mmT = (this.mmT || 0) + dt;
    if (this.mmT > 0.033) { this.mmT = 0; this.drawMini(); }
    if (this.mapOpen) this.drawFull();
    // zona del jugador
    const poi = me.alive ? br.poiAt(me.pos.x, me.pos.z) : null;
    const pn = poi ? poi.name : '';
    if (pn !== this.poiName) { this.poiName = pn; $('br-poi').textContent = pn; }
  }

  // Pinta zona, ruta del avión y jugador sobre un contexto ya transformado a coordenadas de mundo
  overlay(g, scale, full) {
    const br = this.br, me = this.m.me, z = br.zone;
    g.save();
    // tormenta: todo lo de fuera del círculo actual (cuando ya se ha formado)
    if (br.formed) {
    g.beginPath(); g.rect(-400, -400, 800, 800); g.arc(z.x, z.z, Math.max(0.1, z.r), 0, Math.PI * 2, true);
    g.fillStyle = 'rgba(120,40,200,.42)'; g.fill('evenodd');
    g.strokeStyle = '#c070ff'; g.lineWidth = 2.5 / scale; g.beginPath(); g.arc(z.x, z.z, Math.max(0.1, z.r), 0, Math.PI * 2); g.stroke();
    }
    if (br.next) {
      g.setLineDash([6 / scale, 4 / scale]); g.strokeStyle = '#fff'; g.lineWidth = 2 / scale;
      g.beginPath(); g.arc(br.next.x, br.next.z, Math.max(0.1, br.next.r), 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      // línea hasta la zona segura
      if (me.alive && br.outside(me, br.next)) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 1.5 / scale; g.beginPath(); g.moveTo(me.pos.x, me.pos.z); g.lineTo(br.next.x, br.next.z); g.stroke(); }
    }
    // ruta del avión
    if (br.plane) {
      const a = br.p0, d = br.pdir;
      g.strokeStyle = 'rgba(255,220,90,.85)'; g.lineWidth = 2 / scale; g.setLineDash([8 / scale, 6 / scale]);
      g.beginPath(); g.moveTo(a.x + d.x * br.openS, a.z + d.z * br.openS); g.lineTo(a.x + d.x * br.exitS, a.z + d.z * br.exitS); g.stroke(); g.setLineDash([]);
      if (br.plane) {
        g.save(); g.translate(br.planePos.x, br.planePos.z); g.rotate(Math.atan2(d.x, -d.z)); g.scale(1 / scale, 1 / scale);
        g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(0, -9); g.lineTo(3, 2); g.lineTo(10, 4); g.lineTo(3, 5); g.lineTo(2, 9); g.lineTo(-2, 9); g.lineTo(-3, 5); g.lineTo(-10, 4); g.lineTo(-3, 2); g.closePath(); g.fill(); g.restore();
      }
    }
    // jugador
    if (me.alive || full) {
      g.save(); g.translate(me.pos.x, me.pos.z); g.rotate(-me.yaw); g.scale(1 / scale, 1 / scale);
      if (full) { g.fillStyle = 'rgba(63,224,255,.25)'; g.beginPath(); g.arc(0, 0, 14 + Math.sin(this.t * 5) * 3, 0, 7); g.fill(); }
      g.fillStyle = '#3fe0ff'; g.strokeStyle = '#06222a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke();
      g.restore();
    }
    g.restore();
  }
  drawMini() {
    const g = this.mm, W = 200, me = this.m.me;
    const view = me.brAir ? 260 : 120; // metros visibles
    const scale = W / view;
    const cx = me.brAir === 'plane' ? this.br.planePos.x : me.pos.x, cz = me.brAir === 'plane' ? this.br.planePos.z : me.pos.z;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#1f5a82'; g.fillRect(0, 0, W, W);

    g.setTransform(scale, 0, 0, scale, W / 2 - cx * scale, W / 2 - cz * scale);
    g.drawImage(this.img, -SPAN, -SPAN, SPAN * 2, SPAN * 2);

    this.overlay(g, scale, false);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  drawFull() {
    const g = this.fm, W = 760, scale = W / (SPAN * 2);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.img, 0, 0, W, W);
    // rejilla A–H / 1–8
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.font = '700 12px Rajdhani, sans-serif'; g.fillStyle = 'rgba(255,255,255,.55)';
    for (let i = 0; i <= 8; i++) {
      const p = (i / 8) * W; g.beginPath(); g.moveTo(p, 0); g.lineTo(p, W); g.stroke(); g.beginPath(); g.moveTo(0, p); g.lineTo(W, p); g.stroke();
      if (i < 8) { g.fillText('ABCDEFGH'[i], p + 6, 14); g.fillText(String(i + 1), 4, p + 16); }
    }
    g.setTransform(scale, 0, 0, scale, W / 2, W / 2);
    this.overlay(g, scale, true);
    g.setTransform(1, 0, 0, 1, 0, 0);
    const br = this.br;
    $('brm-alive').textContent = br.aliveCount();
    $('brm-zone').innerHTML = br.zs === 'done' ? '<b>FINAL STORM</b>' : `<small>${br.zs === 'wait' ? 'STORM MOVES IN' : 'STORM CLOSING'}</small><b>${fmt(br.zt)}</b><small>PHASE ${Math.min(br.zi + 1, ZONE_PHASES.length)} / ${ZONE_PHASES.length} · ${br.dps()} DMG/S</small>`;
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
    clearTimeout(this.aTO);
    this.el.remove();
    const p = $('pickup'); if (p) p.classList.remove('on');
  }
}
