// RANGOS (V2): sólo la Arena clasificatoria da o quita RP.
// Contra bots el elo no mide nada real, así que la dificultad de los bots SUBE con tu rango
// (bronce = fácil, platino = normal, rubí/titanio = difícil).
import { DIFFICULTY } from './modes.js';

export const RANKS = [
  { id: 'bronze', name: 'BRONZE', rp: 0, c: ['#f0b48a', '#b0683a', '#4a230e'] },
  { id: 'silver', name: 'SILVER', rp: 300, c: ['#f4f7fb', '#a9b4c4', '#3c4656'] },
  { id: 'gold', name: 'GOLD', rp: 700, c: ['#fff1a8', '#e8b026', '#6a4304'] },
  { id: 'platinum', name: 'PLATINUM', rp: 1200, c: ['#d9fff6', '#46d3b6', '#0b4a45'] },
  { id: 'diamond', name: 'DIAMOND', rp: 1800, c: ['#e1f2ff', '#4aa6ff', '#0c2c6a'] },
  { id: 'obsidian', name: 'OBSIDIAN', rp: 2500, c: ['#c9b6ff', '#5b3fa8', '#120a26'] },
  { id: 'ruby', name: 'RUBY', rp: 3300, c: ['#ffc2cc', '#e2264a', '#4a0614'] },
  { id: 'titanium', name: 'TITANIUM', rp: 4200, c: ['#ffffff', '#9fe8ff', '#2a3a52'] },
];
const ROMAN = ['I', 'II', 'III'];

// Rango, división (0..2) y progreso dentro de la división
export function rankOf(rp) {
  rp = Math.max(0, rp || 0);
  let i = 0;
  while (i < RANKS.length - 1 && rp >= RANKS[i + 1].rp) i++;
  const lo = RANKS[i].rp, hi = i < RANKS.length - 1 ? RANKS[i + 1].rp : RANKS[i].rp + 900;
  const step = (hi - lo) / 3;
  const div = Math.min(2, Math.floor((rp - lo) / step));
  const dLo = lo + div * step;
  return { i, rank: RANKS[i], div, label: `${RANKS[i].name} ${ROMAN[div]}`, prog: Math.min(1, (rp - dLo) / step), next: Math.round(dLo + step), floor: Math.round(dLo) };
}

// Cambio de RP. perf: 0..1 (cuota de bajas/daño del equipo y K/D).
export function rpDelta(win, perf) {
  perf = Math.max(0, Math.min(1, perf));
  return win ? Math.round(20 + 10 * perf) : -Math.round(20 - 5 * perf);
}

// Aplica el resultado al perfil (con protección: 3 derrotas sin bajar justo después de subir de rango)
export function applyRanked(P, win, perf) {
  const R = P.ranked || (P.ranked = { rp: 0, shield: 0, wins: 0, losses: 0, peak: 0, history: [] });
  const before = rankOf(R.rp);
  let d = rpDelta(win, perf);
  let protectedLoss = false;
  if (!win && R.shield > 0) {
    R.shield--;
    const floor = before.rank.rp; // no se baja de RANGO (sí de división)
    if (R.rp + d < floor) { d = floor - R.rp; protectedLoss = true; }
  }
  R.rp = Math.max(0, R.rp + d);
  if (win) R.wins++; else R.losses++;
  const after = rankOf(R.rp);
  const promoted = after.i > before.i;
  if (promoted) R.shield = 3;
  R.peak = Math.max(R.peak || 0, R.rp);
  R.history = [...(R.history || []), win ? 1 : 0].slice(-10);
  return { before, after, delta: d, promoted, divUp: !promoted && (after.i > before.i || after.div > before.div), demoted: after.i < before.i, protectedLoss, rp: R.rp };
}

// Dificultad de bots según el rango: mezcla continua fácil → normal (platino) → difícil (rubí)
export function diffForRank(rp) {
  const { i, div } = rankOf(rp);
  const x = i + div / 3;              // 0 (bronce I) … 7.67 (titanio III)
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (A, B, t) => {
    const o = { name: B.name };
    for (const k of Object.keys(A)) {
      if (Array.isArray(A[k])) o[k] = A[k].map((v, j) => lerp(v, B[k][j], t));
      else if (typeof A[k] === 'number') o[k] = lerp(A[k], B[k], t);
    }
    return o;
  };
  const E = DIFFICULTY.easy, N = DIFFICULTY.normal, H = DIFFICULTY.hard;
  const d = x <= 3 ? mix(E, N, x / 3) : mix(N, H, Math.min(1, (x - 3) / 3));
  d.name = x < 1.5 ? 'EASY' : x < 3.5 ? 'NORMAL' : x < 5.5 ? 'HARD' : 'ELITE';
  d.coord = x >= 6; // rubí/titanio: bots coordinados (se agrupan y empujan juntos)
  return d;
}

// ---------- Insignias SVG propias: la FORMA cambia con el rango (no sólo el color) ----------
const SHAPES = [
  'M50 6l36 14v28c0 22-15 36-36 46C29 84 14 70 14 48V20z',                                   // bronce: escudo
  'M50 4l38 15v29c0 23-16 37-38 48C28 85 12 71 12 48V19z M50 4',                              // plata: escudo
  'M50 4l12 8 26 6v30c0 23-16 37-38 48C28 86 12 71 12 48V18l26-6z',                          // oro: escudo con corona
  'M50 4l40 23v46L50 96 10 73V27z',                                                           // platino: hexágono
  'M50 3l40 40-40 54-40-54z',                                                                 // diamante: rombo
  'M50 2l13 16 22-2-4 22 15 12-15 12 4 22-22-2-13 16-13-16-22 2 4-22L3 50l15-12-4-22 22 2z', // obsidiana: estrella dentada
  'M50 3l22 12 18 22-6 30-34 30-34-30-6-30 18-22z',                                            // rubí: gema tallada
  'M50 2l10 26 28-8-14 24 22 18-28 4-4 30-14-22-14 22-4-30-28-4 22-18-14-24 28 8z',             // titanio: estrella alada
];
let gid = 0;
export function rankBadge(rp, { size = 64, anim = true } = {}) {
  const { i, div, rank } = rankOf(rp);
  const [a, b, c] = rank.c, id = 'rb' + (gid++);
  const chev = Array.from({ length: div + 1 }, (_, k) => `<path d="M34 ${58 + k * 9}l16-8 16 8v5l-16-8-16 8z" fill="#fff" fill-opacity=".92"/>`).join('');
  const titan = i === 7;
  return `<svg class="rank-badge r-${rank.id}${titan && anim ? ' anim' : ''}" viewBox="0 0 100 100" width="${size}" height="${size}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>
    ${titan ? `<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><clipPath id="${id}c"><path d="${SHAPES[i]}"/></clipPath>` : ''}</defs>
    <path d="${SHAPES[i]}" fill="url(#${id})" stroke="${a}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="${SHAPES[i]}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1" transform="translate(50 50) scale(.8) translate(-50 -50)"/>
    <circle cx="50" cy="38" r="11" fill="#0b0f18" fill-opacity=".55"/><path d="M50 30l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="#fff"/>
    ${chev}
    ${titan ? `<g clip-path="url(#${id}c)"><rect class="rb-shine" x="-60" y="0" width="40" height="100" fill="url(#${id}s)" transform="skewX(-20)"/></g>` : ''}
  </svg>`;
}
