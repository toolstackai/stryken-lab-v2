// Perfil local guardado en localStorage: monedas, nivel, estadísticas, skins, loadouts y ajustes.
import { randomUser } from '../data/modes.js';
import { DEFAULT_LOADOUTS } from '../data/weapons.js';

const KEY = 'stryken.profile.v1';
const defaults = () => ({
  name: randomUser(), coins: 500, shards: 20, xp: 0,
  stats: { matches: 0, wins: 0, kills: 0, deaths: 0, headshots: 0, shots: 0, hits: 0, bestStreak: 0, playTime: 0, top3: 0 },
  ownedChars: ['recruit'], ownedWeaponSkins: ['factory'],
  charSkin: 'recruit', weaponSkins: {}, // por arma
  loadouts: DEFAULT_LOADOUTS.map(l => ({ ...l })), loadout: 0,
  mode: 'dm', difficulty: 'normal', custom: { map: 'harbor', mode: 'dm', bots: 7 },
  daily: { last: null, streak: 0 }, dailyBox: null, seenNews: false, party: [],
  emblem: 'e_basic', card: 'c_basic', ownedEmblems: ['e_basic'], ownedCards: ['c_basic'], career: { claimed: [], seen: 1 },
  settings: { sens: 1.0, adsSens: 0.85, fov: 78, volume: 0.7, quality: 'high', showFps: false, crosshair: '#ffffff', crossStyle: 'cross', invertY: false, killcam: true, sprayText: 'GG', sprayColor: '#3fe0ff',
    uiScale: 1, dmgNumbers: true, enemyColor: '#ff4b4b', reduceShake: false, reduceFlash: false },
});

export function loadProfile() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(KEY)); } catch { p = null; }
  if (!p) return defaults();
  return normalizeProfile(p);
}
// fusionar con valores por defecto (por si se añadieron campos nuevos); también para perfiles que llegan de la nube
export function normalizeProfile(p) {
  const d = defaults();
  return { ...d, ...p, stats: { ...d.stats, ...p.stats }, settings: { ...d.settings, ...p.settings }, custom: { ...d.custom, ...p.custom },
    loadouts: (p.loadouts && p.loadouts.length === 10) ? p.loadouts : d.loadouts };
}
// V2: cada guardado lleva marca de tiempo y avisa a la nube (src/net/cloud.js), si está activa
let saveHook = null;
export function setSaveHook(f) { saveHook = f; }
export function saveLocal(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* almacenamiento bloqueado */ } }
export function saveProfile(p) {
  p.updatedAt = Date.now();
  saveLocal(p);
  if (saveHook) saveHook(p);
}

export const levelOf = (xp) => { let lv = 1, need = 500, x = xp; while (x >= need) { x -= need; lv++; need = Math.round(need * 1.15); } return { lv, cur: x, need }; };
