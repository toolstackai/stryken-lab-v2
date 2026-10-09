// EVENTOS DE FIN DE SEMANA y EXCLUSIVOS (V2). Los exclusivos NO se compran: sólo se ganan.
//  · Recompensas de rango (al ascender por primera vez).
//  · Pista de recompensas de cada evento (puntos por partida).
//  · Maestría de arma: 500 bajas con un arma desbloquean su camuflaje dorado.

// Eventos: sólo viernes, sábado y domingo; rota uno por semana. ?event=<id> lo fuerza (pruebas).
export const EVENTS = {
  evecon:  { name: 'DOUBLE ECONOMY', mode: 'evecon', tag: 'ARENA 3V3 · x2 MONEY', desc: 'Every dollar counts twice: kills, round wins and loss bonuses all pay double. Full buys from round two.' },
  evknife: { name: 'BLADE RUSH', mode: 'evknife', tag: 'KNIFE ONLY · SPEED STACKS', desc: 'Knives only. Every kill makes you faster (up to +35%) until you die. Keep the streak alive.' },
  evnight: { name: 'KORVA NIGHT', mode: 'evnight', tag: 'BATTLE ROYALE · NIGHT', desc: 'Korva Island after dark. Your flashlight is all you have — and everyone can see it.' },
};
const ORDER = ['evecon', 'evknife', 'evnight'];

export function activeEvent(now = Date.now()) {
  try { const q = new URLSearchParams(location.search).get('event'); if (q && EVENTS[q]) return { id: q, ...EVENTS[q], forced: true }; } catch (e) { /* sin location (tests) */ }
  const d = new Date(now), day = d.getDay(); // 0 domingo … 5 viernes, 6 sábado
  if (day !== 5 && day !== 6 && day !== 0) return null;
  const week = Math.floor((now / 864e5 + 3) / 7);
  const id = ORDER[week % ORDER.length];
  return { id, ...EVENTS[id] };
}
// Tiempo hasta el próximo evento (para el aviso del lobby)
export function nextEventIn(now = Date.now()) {
  const d = new Date(now); const day = d.getDay();
  const toFri = (5 - day + 7) % 7;
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + toFri);
  return Math.max(0, t.getTime() - now);
}

// Pista de recompensas: puntos por partida del evento (victoria 3, derrota 1)
export const TRACK = [
  { pts: 3, reward: { type: 'coins', n: 500 }, name: '500 COINS' },
  { pts: 6, reward: { type: 'shards', n: 40 }, name: '40 SHARDS' },
  { pts: 10, reward: { type: 'weaponSkin', id: 'nightfall' }, name: 'NIGHTFALL CAMO · EXCLUSIVE' },
];
export function eventProgress(P, ev) {
  const E = P.event || {};
  return E.id === ev.id && E.week === weekOf() ? E : { id: ev.id, week: weekOf(), pts: 0, claimed: [] };
}
const weekOf = (now = Date.now()) => Math.floor((now / 864e5 + 3) / 7);

// Aplica una partida de evento; devuelve las recompensas nuevas
export function applyEvent(P, ev, win) {
  const E = eventProgress(P, ev);
  const before = E.pts;
  E.pts += win ? 3 : 1;
  const got = [];
  TRACK.forEach((t, i) => { if (E.pts >= t.pts && !E.claimed.includes(i)) { E.claimed.push(i); got.push(t); grant(P, t.reward); } });
  P.event = E;
  return { before, after: E.pts, got };
}

// Recompensas de rango (primera vez que alcanzas el rango)
export const RANK_REWARDS = {
  gold: { type: 'coins', n: 1000, name: '1,000 COINS' },
  platinum: { type: 'shards', n: 80, name: '80 SHARDS' },
  diamond: { type: 'weaponSkin', id: 'diamondcut', name: 'DIAMOND CUT CAMO · EXCLUSIVE' },
  titanium: { type: 'weaponSkin', id: 'titanium', name: 'TITANIUM CAMO · EXCLUSIVE' },
};
export function applyRankReward(P, rankId) {
  const r = RANK_REWARDS[rankId];
  P.rankRewards = P.rankRewards || [];
  if (!r || P.rankRewards.includes(rankId)) return null;
  P.rankRewards.push(rankId); grant(P, r);
  return r;
}

// Maestría: bajas por arma. A las 500 se desbloquea "MASTERY GOLD" para ESA arma.
export const MASTERY_KILLS = 500;
export function addMastery(P, kills) {
  P.mastery = P.mastery || {}; P.masteryDone = P.masteryDone || [];
  const done = [];
  for (const [id, n] of Object.entries(kills)) {
    P.mastery[id] = (P.mastery[id] || 0) + n;
    if (P.mastery[id] >= MASTERY_KILLS && !P.masteryDone.includes(id)) {
      P.masteryDone.push(id);
      if (!P.ownedWeaponSkins.includes('mastery')) P.ownedWeaponSkins.push('mastery');
      done.push(id);
    }
  }
  return done;
}

function grant(P, r) {
  if (r.type === 'coins') P.coins += r.n;
  else if (r.type === 'shards') P.shards += r.n;
  else if (r.type === 'weaponSkin' && !P.ownedWeaponSkins.includes(r.id)) P.ownedWeaponSkins.push(r.id);
}
