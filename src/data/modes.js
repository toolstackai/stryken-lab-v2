// Modos de juego. "map" es el mapa por defecto; en CUSTOM se puede combinar cualquier mapa y modo.
import { activeEvent } from './events.js';
// list: 'ranked' (sólo estas dan rango) · 'casual' · 'rotating' (cambia cada semana). maps: mapas posibles (al azar / votación)
export const MODES = {
  arena1: { name: 'ARENA 1V1', map: 'pier', maps: ['pier', 'kiln'], teams: true, target: 5, time: 0, players: 2, knifeOnly: false, arena: 1, list: 'ranked' },
  arena3: { name: 'ARENA 3V3', map: 'kiln', maps: ['pier', 'kiln', 'foundry'], teams: true, target: 6, time: 0, players: 6, knifeOnly: false, arena: 3, list: 'ranked' },
  arena5: { name: 'ARENA 5V5', map: 'foundry', maps: ['pier', 'kiln', 'foundry'], teams: true, target: 7, time: 0, players: 10, knifeOnly: false, arena: 5, list: 'ranked' },
  tdm:   { name: 'TEAM DEATHMATCH', map: 'foundry', maps: ['foundry', 'pier', 'kiln'], teams: true, target: 60, time: 300, players: 12, knifeOnly: false, list: 'casual' },
  dm:    { name: 'DEATHMATCH', map: 'harbor', maps: ['harbor', 'shrine', 'pier'], teams: false, target: 30, time: 300, players: 8, knifeOnly: false, list: 'casual' },
  knife: { name: 'KNIFE ONLY', map: 'shrine', maps: ['shrine', 'kiln'], teams: false, target: 20, time: 240, players: 8, knifeOnly: true, list: 'casual' },
  br:    { name: 'BATTLE ROYALE', map: 'korva', teams: false, target: 0, time: 1800, players: 24, knifeOnly: false, br: true, list: 'casual' },
  arena2: { name: 'ARENA 2V2', map: 'pier', maps: ['pier', 'kiln'], teams: true, target: 6, time: 0, players: 4, knifeOnly: false, arena: 2, list: 'rotating' },
  arena4: { name: 'ARENA 4V4', map: 'kiln', maps: ['pier', 'kiln', 'foundry'], teams: true, target: 7, time: 0, players: 8, knifeOnly: false, arena: 4, list: 'rotating' },
  snipers: { name: 'SNIPERS ONLY', map: 'harbor', maps: ['harbor', 'pier'], teams: false, target: 20, time: 300, players: 8, knifeOnly: false, force: { primary: 'longbow', secondary: 'rhino' }, list: 'rotating' },
  lowgrav: { name: 'LOW GRAVITY', map: 'foundry', maps: ['foundry', 'harbor'], teams: false, target: 25, time: 300, players: 8, knifeOnly: false, gravity: 0.45, list: 'rotating' },
  // eventos de fin de semana (ver data/events.js)
  evecon: { name: 'DOUBLE ECONOMY', map: 'pier', maps: ['pier', 'kiln', 'foundry'], teams: true, target: 6, time: 0, players: 6, knifeOnly: false, arena: 3, econMul: 2, list: 'event' },
  evknife: { name: 'BLADE RUSH', map: 'shrine', maps: ['shrine', 'kiln'], teams: false, target: 20, time: 240, players: 8, knifeOnly: true, rush: true, list: 'event' },
  evnight: { name: 'KORVA NIGHT', map: 'korva', teams: false, target: 0, time: 1800, players: 24, knifeOnly: false, br: true, night: true, list: 'event' },
  blades: { name: 'LONGBOW VS KNIFE', map: 'shrine', maps: ['shrine', 'pier'], teams: true, target: 30, time: 300, players: 10, knifeOnly: false, split: { blue: { primary: 'longbow', secondary: null }, red: { knife: true } }, list: 'rotating' },
};
export const LISTS = [['event', 'WEEKEND EVENT'], ['ranked', 'RANKED'], ['casual', 'CASUAL'], ['rotating', 'WEEKLY ROTATION']];
// Rotación semanal: 2 modos raros activos por semana (misma semana = mismos modos para todos)
const ROT = ['arena2', 'snipers', 'arena4', 'lowgrav', 'blades'];
export function rotating(now = Date.now()) {
  const w = Math.floor((now / 864e5 + 3) / 7); // semanas desde 1970 empezando en lunes
  return [ROT[w % ROT.length], ROT[(w + 1) % ROT.length]];
}
export function modeAvailable(id) {
  const m = MODES[id]; if (!m) return false;
  if (m.list === 'rotating') return rotating().includes(id);
  if (m.list === 'event') { const e = activeEvent(); return !!e && e.mode === id; }
  return true;
}
export function weekEndsIn(now = Date.now()) { const d = now / 864e5 + 3; return (7 - (d % 7)) * 864e5; }

export const DIFFICULTY = {
  // aimErr: error inicial al ver a alguien · settle: lo rápido que corrige · wobble: temblor que nunca desaparece (rad)
  // spreadMul: dispersión extra de sus disparos · head: probabilidad de apuntar a la cabeza · flinch: error al recibir un impacto
  easy:   { name: 'EASY', react: [0.75, 1.15], aimErr: 0.18, settle: 0.7, wobble: 0.06, spreadMul: 2.1, head: 0.05, flinch: 0.14, aimSpeed: 4, burstCtrl: 0.35 },
  normal: { name: 'NORMAL', react: [0.45, 0.75], aimErr: 0.11, settle: 1.1, wobble: 0.026, spreadMul: 1.35, head: 0.12, flinch: 0.08, aimSpeed: 6, burstCtrl: 0.6 },
  hard:   { name: 'HARD', react: [0.26, 0.42], aimErr: 0.06, settle: 1.8, wobble: 0.012, spreadMul: 1.05, head: 0.2, flinch: 0.06, aimSpeed: 9, burstCtrl: 0.8 },
};

const CLANS = ['RAGE', 'GG', 'NOVA', 'KRYO', 'ZEN', 'ACE', 'WOLF', 'TTV', 'PRO', 'BOSS', 'YT', 'MX'];
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
export function randomUser(rng = Math.random) {
  let s = '';
  for (let i = 0; i < 6; i++) s += CHARS[Math.floor(rng() * CHARS.length)];
  return 'user#' + s;
}
export function randomBotName() {
  const n = randomUser();
  return Math.random() < 0.3 ? `[${CLANS[Math.floor(Math.random() * CLANS.length)]}] ${n}` : n;
}

export const BOT_CHAT = ['gg', 'nice shot', 'lol', 'ez', 'who is camping', 'wow', 'bruh', 'no way', 'lag', 'gg wp', 'sniper is op', 'xd', 'hi', 'one more', 'close one'];
