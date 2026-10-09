// ARENA (V2): partidas por rondas con economía, al estilo Rivals pero sin bomba.
// Gana la ronda el equipo que queda con alguien vivo. Diseño completo en docs/ARENA_PLAN.md.

export const FORMATS = {
  1: { win: 5, round: 60 },
  2: { win: 6, round: 75 },
  3: { win: 6, round: 75 },
  4: { win: 7, round: 90 },
  5: { win: 7, round: 90 },
};

export const ECON = {
  start: 800,          // dinero de la primera ronda (sólo da para pistola + algo)
  max: 9000,
  win: 3000,
  lose: 1900, loseStep: 500, loseMax: 2900, // bono por derrotas seguidas: sin él, perder la 1ª ronda decide la partida
  kill: 200, killClose: 400,               // escopeta o cuchillo pagan doble
  buyTime: 12, postTime: 4.2,
};

// Tienda: precio por arma. P9 + cuchillo siempre gratis.
export const PRICES = {
  p9: 0, rhino: 500,
  viper: 1200, vecta: 1400, brute: 1600,
  akr: 2700, scout: 2700,
  talon: 3100, hammer: 3100,
  longbow: 4500, aurum: 4500,
  boomer: 5000,
};

// Equipo (reutiliza las ideas del Battle Royale: blindaje y vendas)
export const GEAR = {
  vest:   { name: 'LIGHT VEST', price: 400, armor: 50, desc: 'Absorbs half of incoming damage until 50 armor is gone.' },
  heavy:  { name: 'HEAVY ARMOR', price: 1000, armor: 100, desc: 'Absorbs half of incoming damage until 100 armor is gone.' },
  bandage: { name: 'BANDAGE', price: 300, heal: 40, use: 1.6, desc: 'Press 4 to heal 40 HP over 1.6 s. One per round.' },
};

// Categorías del menú de compra (orden y tecla rápida)
export const SHOP = [
  { id: 'pistols', name: 'PISTOLS', items: ['rhino'] },
  { id: 'smgs', name: 'SMGs & SHOTGUN', items: ['viper', 'vecta', 'brute'] },
  { id: 'rifles', name: 'RIFLES', items: ['akr', 'scout', 'talon', 'hammer'] },
  { id: 'power', name: 'POWER', items: ['longbow', 'aurum', 'boomer'] },
  { id: 'gear', name: 'GEAR', items: ['vest', 'heavy', 'bandage'] },
];

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');
