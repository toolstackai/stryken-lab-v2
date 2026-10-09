// Secuencia 5 — pantalla de título: el búnker a oscuras con la baliza girando y tu operador a contraluz,
// el logo entra golpeando letra a letra y "PRESS ANY KEY". Al pulsar: golpe, las luces se encienden una a una,
// la cámara sube al plano del lobby y el menú entra pieza a pieza.
// (La tecla también desbloquea el audio del navegador: por eso el título es mudo hasta que pulsas.)
import { play } from '../game/audio.js';
import { levelOf } from '../game/profile.js';
import { EMBLEMS, rankOf } from '../data/career.js';
import { emblemSVG } from '../gfx/identity.js';

const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Title {
  constructor(app, onEnter) {
    this.app = app; this.onEnter = onEnter; this.going = false;
    let seen = false; try { seen = sessionStorage.getItem('stryken-title') === '1'; sessionStorage.setItem('stryken-title', '1'); } catch (e) { /* sin almacenamiento */ }
    const k = seen ? 0.35 : 1; // la segunda vez en la sesión todo entra más rápido
    const P = app.profile, lv = levelOf(P.xp).lv;
    const letters = 'TRYKEN'.split('').map((c, i) => `<span class="tt-l" style="animation-delay:${(0.55 + i * 0.07) * k}s">${c}</span>`).join('');
    const el = this.el = document.createElement('div');
    el.id = 'title';
    el.style.setProperty('--k', k);
    el.innerHTML = `
      <div class="tt-vig"></div><div class="tt-scan"></div>
      <div class="tt-logo">
        <div class="logo big tt-mark">
          <span class="logo-s tt-l" style="animation-delay:${0.4 * k}s">S</span>${letters}<svg class="logo-bullet tt-bullet" viewBox="0 0 40 20"><path d="M2 6h22c8 0 14 2 14 4s-6 4-14 4H2z" fill="#fff"/><rect x="0" y="5" width="7" height="10" rx="1" fill="#c9d3e6"/></svg>
          <i class="tt-shine"></i>
        </div>
        <div class="tt-sub">TACTICAL ARENA SHOOTER</div>
      </div>
      <div class="tt-press"><span class="tt-key"><i></i></span><b>PRESS ANY KEY</b></div>
      <div class="tt-prof"><i class="tt-emb">${emblemSVG({ id: P.emblem || 'e_basic', ...EMBLEMS[P.emblem || 'e_basic'] }, 'tt')}</i><small>${rankOf(lv)}</small><b>${esc(P.name)}</b><span>LV ${lv}</span></div>
      <div class="tt-ver">v1.0.0 · LAB BUILD</div>`;
    document.body.appendChild(el);
    this.onKey = (e) => {
      if (e.type === 'keydown' && (e.repeat || ['Tab', 'F5', 'F11', 'F12', 'MetaLeft', 'MetaRight'].includes(e.code))) return;
      this.go();
    };
    addEventListener('keydown', this.onKey); addEventListener('pointerdown', this.onKey);
  }

  go() {
    if (this.going) return;
    this.going = true;
    removeEventListener('keydown', this.onKey); removeEventListener('pointerdown', this.onKey);
    const app = this.app, lobby = app.lobby;
    play('titleHit');
    this.el.classList.add('tt-out');
    lobby.powerOn();
    // los relés de cada luz suenan cuando parpadea (ver Lobby.applyPower: lámpara 0.35 s, foco 0.8 s)
    setTimeout(() => { play('clunk'); play('hum'); }, 350);
    setTimeout(() => play('clunk'), 800);
    setTimeout(() => { lobby.shot = 'home'; play('whoosh'); }, 650);
    setTimeout(() => { this.onEnter(); }, 1250);
    setTimeout(() => this.el.remove(), 1700);
  }
}
