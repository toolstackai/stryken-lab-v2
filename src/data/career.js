// Progresión (secuencia 7): emblemas, tarjetas de jugador, rangos y el CAREER TRACK (un premio por nivel).
import { levelOf } from '../game/profile.js';

export const EMBLEMS = {
  e_basic: { name: 'ROOKIE', shape: 'hex', glyph: 'star', hue: 200, hue2: 220, rarity: 'common' },
  e_bolt: { name: 'LIVE WIRE', shape: 'shield', glyph: 'bolt', hue: 48, hue2: 20, rarity: 'rare' },
  e_cross: { name: 'MARKSMAN', shape: 'circle', glyph: 'cross', hue: 0, hue2: 340, rarity: 'rare' },
  e_star: { name: 'VANGUARD', shape: 'diamond', glyph: 'star', hue: 140, hue2: 180, rarity: 'rare' },
  e_chev: { name: 'VETERAN', shape: 'shield', glyph: 'chev', hue: 215, hue2: 250, rarity: 'rare' },
  e_blade: { name: 'CUTTHROAT', shape: 'hex', glyph: 'blade', hue: 280, hue2: 320, rarity: 'epic' },
  e_skull: { name: 'REAPER', shape: 'burst', glyph: 'skull', hue: 355, hue2: 15, rarity: 'epic', metal: true },
  e_wings: { name: 'AIRBORNE', shape: 'circle', glyph: 'wings', hue: 190, hue2: 230, rarity: 'epic', metal: true },
  e_crown: { name: 'SOVEREIGN', shape: 'burst', glyph: 'crown', hue: 42, hue2: 28, rarity: 'legendary', metal: true },
};
export const CARDS = {
  c_basic: { name: 'STANDARD ISSUE', style: 'basic', hue: 215, rarity: 'common' },
  c_stripes: { name: 'HAZARD', style: 'stripes', hue: 190, rarity: 'common' },
  c_skyline: { name: 'CITY AT DUSK', style: 'skyline', hue: 18, rarity: 'rare' },
  c_hex: { name: 'HIVE', style: 'hex', hue: 160, rarity: 'rare' },
  c_topo: { name: 'RECON', style: 'topo', hue: 95, rarity: 'rare' },
  c_circuit: { name: 'MAINFRAME', style: 'circuit', hue: 280, rarity: 'epic' },
  c_burst: { name: 'SUPERNOVA', style: 'burst', hue: 330, rarity: 'epic' },
  c_legend: { name: 'HALL OF FAME', style: 'legend', hue: 42, rarity: 'legendary' },
};

const RANKS = [[30, 'COMMANDER'], [25, 'CAPTAIN'], [20, 'LIEUTENANT'], [15, 'STAFF SERGEANT'], [11, 'SERGEANT'], [8, 'CORPORAL'], [5, 'SPECIALIST'], [3, 'PRIVATE'], [1, 'RECRUIT']];
export const rankOf = (lv) => RANKS.find(([n]) => lv >= n)[1];

// Un premio por nivel (2..30)
export const TRACK = {
  2: { type: 'coins', amount: 150 }, 3: { type: 'emblem', id: 'e_bolt' }, 4: { type: 'card', id: 'c_stripes' },
  5: { type: 'weaponSkin', id: 'woodland' }, 6: { type: 'shards', amount: 15 }, 7: { type: 'emblem', id: 'e_cross' },
  8: { type: 'card', id: 'c_skyline' }, 9: { type: 'coins', amount: 300 }, 10: { type: 'charSkin', id: 'urban' },
  11: { type: 'emblem', id: 'e_star' }, 12: { type: 'card', id: 'c_hex' }, 13: { type: 'weaponSkin', id: 'tiger' },
  14: { type: 'shards', amount: 25 }, 15: { type: 'charSkin', id: 'jungle' }, 16: { type: 'emblem', id: 'e_chev' },
  17: { type: 'card', id: 'c_topo' }, 18: { type: 'coins', amount: 500 }, 19: { type: 'weaponSkin', id: 'digital' },
  20: { type: 'charSkin', id: 'desert' }, 21: { type: 'emblem', id: 'e_blade' }, 22: { type: 'card', id: 'c_circuit' },
  23: { type: 'emblem', id: 'e_skull' }, 24: { type: 'weaponSkin', id: 'ocean' }, 25: { type: 'charSkin', id: 'shadow' },
  26: { type: 'card', id: 'c_burst' }, 27: { type: 'emblem', id: 'e_wings' }, 28: { type: 'card', id: 'c_legend' },
  29: { type: 'weaponSkin', id: 'gold' }, 30: { type: 'charSkin', id: 'neon' },
};
export const TRACK_MAX = 30;
// Bonus por reclamar el último nivel
export const MAX_BONUS = { type: 'emblem', id: 'e_crown' };
// Nivel en el que se desbloquea un emblema/tarjeta (para los candados)
export function unlockLevel(type, id) {
  if (type === MAX_BONUS.type && id === MAX_BONUS.id) return TRACK_MAX;
  const e = Object.entries(TRACK).find(([, r]) => r.type === type && r.id === id);
  return e ? +e[0] : null;
}

export function careerOf(P) {
  if (!P.career) P.career = { claimed: [], seen: 1 };
  if (!P.ownedEmblems) P.ownedEmblems = ['e_basic'];
  if (!P.ownedCards) P.ownedCards = ['c_basic'];
  if (!P.emblem) P.emblem = 'e_basic';
  if (!P.card) P.card = 'c_basic';
  return P.career;
}
// Niveles alcanzados con premio sin reclamar
export function claimable(P) {
  const c = careerOf(P), lv = levelOf(P.xp).lv;
  const out = [];
  for (let n = 2; n <= Math.min(lv, TRACK_MAX); n++) if (!c.claimed.includes(n)) out.push(n);
  return out;
}
