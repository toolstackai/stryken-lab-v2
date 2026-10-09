// Botín del Battle Royale: rareza de cada arma, objetos (blindaje, curas, munición) y cómo se reparte.
import { WEAPONS } from './weapons.js';

// rareza de cada arma (usa los colores de rareza del juego)
export const WEAPON_RARITY = {
  viper: 'common', p9: 'common', brute: 'common',
  akr: 'rare', scout: 'rare', vecta: 'rare', rhino: 'rare',
  talon: 'epic', hammer: 'epic', aurum: 'epic',
  longbow: 'legendary', boomer: 'legendary',
};
export const RARITY_ORDER = ['common', 'rare', 'epic', 'legendary'];

export const ITEMS = {
  armor1: { name: 'LIGHT VEST', kind: 'armor', armor: 50, rarity: 'common' },
  armor2: { name: 'TACTICAL VEST', kind: 'armor', armor: 75, rarity: 'rare' },
  armor3: { name: 'HEAVY PLATES', kind: 'armor', armor: 100, rarity: 'epic' },
  bandage: { name: 'BANDAGE', kind: 'heal', heal: 20, cap: 75, time: 2.4, rarity: 'common', max: 6 },
  medkit: { name: 'MEDKIT', kind: 'heal', heal: 100, cap: 100, time: 5.5, rarity: 'rare', max: 3 },
  ammo: { name: 'AMMO BOX', kind: 'ammo', rarity: 'common' },
};

// probabilidad de rareza según la calidad del punto de botín (0 normal · 1 bueno · 2 muy bueno)
const TIER_W = [
  { common: 55, rare: 30, epic: 12, legendary: 3 },
  { common: 28, rare: 40, epic: 24, legendary: 8 },
  { common: 8, rare: 34, epic: 36, legendary: 22 },
];
function pickW(rng, w) { let t = 0; for (const v of Object.values(w)) t += v; let r = rng() * t; for (const [k, v] of Object.entries(w)) { if ((r -= v) <= 0) return k; } return Object.keys(w)[0]; }

// Un arma tirada lleva el cargador lleno y algo de reserva (más reserva cuanto más rara)
export function weaponDrop(id) {
  const d = WEAPONS[id], mags = { common: 1, rare: 1.5, epic: 2, legendary: 1.5 }[WEAPON_RARITY[id]] || 1;
  return { id, mag: d.mag, reserve: Math.round(d.mag * mags) };
}

// Genera el contenido de un punto de botín: 1 objeto principal y a veces uno extra
export function rollLoot(rng, tier) {
  const out = [];
  const rar = pickW(rng, TIER_W[tier] || TIER_W[0]);
  if (rng() < 0.58) {
    const pool = Object.keys(WEAPON_RARITY).filter(id => WEAPON_RARITY[id] === rar);
    const id = pool[Math.floor(rng() * pool.length)];
    out.push({ type: 'weapon', id, rarity: rar, w: weaponDrop(id) });
  } else out.push(gear(rng, rar));
  if (rng() < 0.55) out.push(rng() < 0.5 ? { type: 'item', id: 'ammo', rarity: 'common', n: 1 } : gear(rng, rng() < 0.7 ? 'common' : 'rare'));
  return out;
}
function gear(rng, rar) {
  const r = rng();
  if (r < 0.32) { const id = rar === 'common' ? 'armor1' : rar === 'rare' ? 'armor2' : 'armor3'; return { type: 'item', id, rarity: ITEMS[id].rarity, n: 1 }; }
  if (r < 0.75) { const id = rar === 'common' || rng() < 0.5 ? 'bandage' : 'medkit'; return { type: 'item', id, rarity: ITEMS[id].rarity, n: id === 'bandage' ? 2 + Math.floor(rng() * 2) : 1 }; }
  return { type: 'item', id: 'ammo', rarity: 'common', n: 1 };
}

// Zona: radio relativo al anterior, espera y cierre (s) y daño por segundo fuera
export const ZONE_PHASES = [
  { wait: 90, shrink: 40, scale: 0.6, dps: 2 },
  { wait: 50, shrink: 35, scale: 0.55, dps: 3 },
  { wait: 40, shrink: 30, scale: 0.5, dps: 5 },
  { wait: 30, shrink: 25, scale: 0.45, dps: 8 },
  { wait: 25, shrink: 25, scale: 0.4, dps: 11 },
  { wait: 20, shrink: 30, scale: 0, dps: 16 },
];
