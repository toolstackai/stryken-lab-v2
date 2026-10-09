// Identidad del jugador (secuencia 7): emblemas y tarjetas de jugador generados en SVG.
// Todo es procedural: cada spec ({ shape, glyph, hue, hue2 } / { style, hue }) produce siempre el mismo dibujo.

const SHAPES = {
  hex: 'M32 4 56 18v28L32 60 8 46V18z',
  shield: 'M32 4 56 12v20c0 14-10 24-24 28C18 56 8 46 8 32V12z',
  diamond: 'M32 2 62 32 32 62 2 32z',
  circle: 'M32 4a28 28 0 1 0 .1 0z',
  burst: 'M32 2l7 10 12-3-3 12 10 7-10 7 3 12-12-3-7 10-7-10-12 3 3-12-10-7 10-7-3-12 12 3z',
};
const GLYPHS = {
  skull: '<path d="M32 16a11 11 0 0 0-11 11c0 5 3 8 5 9v6h12v-6c2-1 5-4 5-9a11 11 0 0 0-11-11zm-5 10a3 3 0 1 1 0 6 3 3 0 0 1 0-6zm10 0a3 3 0 1 1 0 6 3 3 0 0 1 0-6z" fill="#fff"/><path d="M28 44h8v4h-8z" fill="#fff"/>',
  bolt: '<path d="M36 12 22 34h9l-3 18 14-22h-9z" fill="#fff"/>',
  cross: '<circle cx="32" cy="32" r="11" fill="none" stroke="#fff" stroke-width="3.5"/><path d="M32 14v10M32 40v10M14 32h10M40 32h10" stroke="#fff" stroke-width="3.5"/>',
  star: '<path d="M32 14l5 11 12 1-9 8 3 12-11-6-11 6 3-12-9-8 12-1z" fill="#fff"/>',
  chev: '<path d="M14 26l18 10 18-10v8L32 44 14 34zM14 16l18 10 18-10v8L32 34 14 24z" fill="#fff"/>',
  crown: '<path d="M16 42l-2-20 10 8 8-14 8 14 10-8-2 20z" fill="#fff"/><path d="M16 45h32v4H16z" fill="#fff"/>',
  wings: '<path d="M32 26c-6-8-16-10-22-8 4 2 6 4 7 6-3 0-6 1-8 3 4 0 7 1 9 3-2 1-4 3-5 5 6-1 13-3 19-9 6 6 13 8 19 9-1-2-3-4-5-5 2-2 5-3 9-3-2-2-5-3-8-3 1-2 3-4 7-6-6-2-16 0-22 8z" fill="#fff"/><circle cx="32" cy="34" r="4" fill="#fff"/>',
  blade: '<path d="M38 12 26 40l4 2-4 8 6-6 2 2 14-28z" fill="#fff"/>',
};

export function emblemSVG(e, uid = '') {
  const id = 'em' + (e.id || 'x') + uid;
  const shape = SHAPES[e.shape] || SHAPES.hex, glyph = GLYPHS[e.glyph] || GLYPHS.star;
  const metal = e.metal ? `<path d="${shape}" fill="url(#${id}m)" opacity=".55"/>` : '';
  return `<svg viewBox="0 0 64 64"><defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${e.hue} 75% 58%)"/><stop offset="1" stop-color="hsl(${e.hue2 ?? e.hue + 40} 70% 28%)"/></linearGradient>
    <linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".2"/></linearGradient>
  </defs><path d="${shape}" fill="url(#${id})" stroke="rgba(255,255,255,.9)" stroke-width="2.5"/>${metal}${glyph}</svg>`;
}

// Pseudoaleatorio estable a partir de un texto
function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }

// Tarjeta de jugador 360×90
export function cardSVG(c, uid = '') {
  const id = 'cd' + (c.id || 'x') + uid, h = c.hue, r = rng(c.id || 'card');
  const bg = `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${h} 55% 26%)"/><stop offset="1" stop-color="hsl(${(h + 30) % 360} 50% 9%)"/></linearGradient>`;
  let defs = bg, art = '';
  switch (c.style) {
    case 'stripes':
      for (let i = -2; i < 14; i++) art += `<path d="M${i * 34} 90 L${i * 34 + 60} 0 L${i * 34 + 74} 0 L${i * 34 + 14} 90z" fill="hsla(${h} 90% 60% / ${i % 3 ? 0.10 : 0.35})"/>`;
      break;
    case 'hex':
      defs += `<pattern id="${id}p" width="24" height="41.6" patternUnits="userSpaceOnUse"><path d="M12 0l12 6.9v13.9L12 27.7 0 20.8V6.9zM12 27.7v13.9" fill="none" stroke="hsla(${h} 90% 65% / .35)" stroke-width="1.2"/></pattern>`;
      art = `<rect width="360" height="90" fill="url(#${id}p)"/><circle cx="300" cy="45" r="70" fill="hsla(${h} 90% 60% / .18)"/>`;
      break;
    case 'skyline': {
      art = `<circle cx="270" cy="62" r="34" fill="hsl(${(h + 20) % 360} 90% 62%)" opacity=".85"/>`;
      let x = 0; while (x < 360) { const w = 10 + r() * 22, hh = 18 + r() * 48; art += `<rect x="${x.toFixed(1)}" y="${(90 - hh).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" fill="hsl(${h} 40% 8%)"/>`; if (r() < 0.5) art += `<rect x="${(x + w / 2 - 1).toFixed(1)}" y="${(90 - hh - 8).toFixed(1)}" width="2" height="8" fill="hsl(${h} 40% 8%)"/>`; x += w + 1; }
      break;
    }
    case 'topo':
      for (let i = 0; i < 9; i++) { let d = `M-10 ${10 + i * 10}`; for (let x = 0; x <= 380; x += 20) d += ` Q${x + 10} ${10 + i * 10 + Math.sin(x * 0.03 + i) * 9} ${x + 20} ${10 + i * 10 + Math.sin((x + 20) * 0.03 + i * 1.3) * 7}`; art += `<path d="${d}" fill="none" stroke="hsla(${h} 90% 65% / .32)" stroke-width="1.3"/>`; }
      break;
    case 'circuit':
      for (let i = 0; i < 22; i++) { const x = r() * 360, y = r() * 90, l = 20 + r() * 60; art += `<path d="M${x.toFixed(0)} ${y.toFixed(0)} h${l.toFixed(0)} l10 10 v${(10 + r() * 20).toFixed(0)}" fill="none" stroke="hsla(${h} 95% 60% / .5)" stroke-width="1.5"/><circle cx="${(x + l + 10).toFixed(0)}" cy="${(y + 30).toFixed(0)}" r="2.2" fill="hsl(${h} 95% 70%)"/>`; }
      break;
    case 'burst':
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; art += `<path d="M300 45 L${(300 + Math.cos(a) * 420).toFixed(0)} ${(45 + Math.sin(a) * 420).toFixed(0)} L${(300 + Math.cos(a + 0.12) * 420).toFixed(0)} ${(45 + Math.sin(a + 0.12) * 420).toFixed(0)}z" fill="hsla(${h} 95% 62% / ${i % 2 ? 0.08 : 0.26})"/>`; }
      art += `<circle cx="300" cy="45" r="16" fill="hsl(${h} 95% 75%)" opacity=".7"/>`;
      break;
    case 'legend':
      for (let i = 0; i < 30; i++) { const a = (i / 30) * Math.PI * 2; art += `<path d="M290 45 L${(290 + Math.cos(a) * 420).toFixed(0)} ${(45 + Math.sin(a) * 420).toFixed(0)} L${(290 + Math.cos(a + 0.09) * 420).toFixed(0)} ${(45 + Math.sin(a + 0.09) * 420).toFixed(0)}z" fill="rgba(255,205,90,${i % 2 ? 0.08 : 0.3})"/>`; }
      for (let i = 0; i < 26; i++) art += `<circle cx="${(r() * 360).toFixed(0)}" cy="${(r() * 90).toFixed(0)}" r="${(0.6 + r() * 1.6).toFixed(1)}" fill="#fff6d8"/>`;
      defs = `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a3108"/><stop offset=".6" stop-color="#1b1204"/><stop offset="1" stop-color="#0a0702"/></linearGradient>`;
      break;
    default: // basic
      for (let i = 0; i < 6; i++) art += `<path d="M0 ${15 + i * 14} H360" stroke="rgba(255,255,255,.04)"/>`;
  }
  return `<svg viewBox="0 0 360 90" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs><rect width="360" height="90" fill="url(#${id}g)"/>${art}<rect width="360" height="90" fill="url(#${id}g)" opacity=".0"/></svg>`;
}

// Insignia de rango: galones según el nivel
export function rankSVG(lv) {
  const n = lv >= 30 ? 0 : 1 + Math.floor((lv - 1) / 5) % 6;
  const stars = lv >= 20 ? Math.min(3, 1 + Math.floor((lv - 20) / 4)) : 0;
  let g = '';
  if (lv >= 30) g = '<path d="M32 10l6 13 14 1-11 9 4 14-13-8-13 8 4-14-11-9 14-1z" fill="#ffd26a" stroke="#fff" stroke-width="1.5"/>';
  else {
    for (let i = 0; i < Math.min(3, n); i++) g += `<path d="M14 ${30 + i * 8}l18 -9 18 9v5l-18-9-18 9z" fill="#fff"/>`;
    for (let i = 0; i < stars; i++) g += `<path d="M${22 + i * 10} 12l2 4 4 .5-3 3 1 4-4-2-4 2 1-4-3-3 4-.5z" fill="#ffd26a"/>`;
  }
  return `<svg viewBox="0 0 64 64"><path d="M32 3 58 16v26L32 61 6 42V16z" fill="rgba(15,22,34,.9)" stroke="${lv >= 30 ? '#ffd26a' : '#3fe0ff'}" stroke-width="2.5"/>${g}</svg>`;
}
