// Todas las armas. Para añadir una: copia una entrada, cambia los números y crea su modelo en GUN_PARTS (src/gfx/models.js).
// Unidades: daño en HP, ángulos de dispersión en radianes, tiempos en segundos, distancias en metros.
const base = {
  slot: 1, auto: true, burst: 0, burstGap: 0, pellets: 1,
  headMul: 2.2, legMul: 0.8, range: 25, falloffEnd: 60, minMul: 0.7,
  spreadHip: 0.032, spreadAds: 0.003, spreadMove: 0.055, spreadAir: 0.12, spreadCrouch: 0.7,
  bloom: 0.006, bloomMax: 0.04, bloomRecover: 0.12,
  recoilV: 0.02, recoilH: 0.007, recoilRecover: 7,
  adsZoom: 1.3, adsTime: 0.2, scope: false, reload: 2.3, perShell: 0, draw: 0.55, moveMul: 0.92,
  sound: 'rifle', tracer: 0xffe9a8, projectile: null,
};
const W = (o) => ({ ...base, ...o });

export const WEAPONS = {
  akr:     W({ name: 'AKR-47', kind: 'RIFLE', mag: 30, reserve: 120, rpm: 600, damage: 30, headMul: 2.4, recoilV: 0.024, recoilH: 0.009 }),
  brute:   W({ name: 'BRUTE-12', kind: 'SHOTGUN', mag: 6, reserve: 30, rpm: 72, auto: false, pellets: 9, damage: 14, headMul: 1.5,
             range: 6, falloffEnd: 22, minMul: 0.2, spreadHip: 0.075, spreadAds: 0.06, spreadMove: 0.015, spreadAir: 0.03,
             bloom: 0, recoilV: 0.07, recoilH: 0.015, recoilRecover: 5, perShell: 0.48, reload: 0.6, sound: 'shotgun', moveMul: 0.95 }),
  longbow: W({ name: 'LONGBOW', kind: 'SNIPER', mag: 5, reserve: 25, rpm: 44, auto: false, damage: 105, headMul: 2.0, legMul: 0.85,
             range: 200, falloffEnd: 300, spreadHip: 0.09, spreadAds: 0, spreadMove: 0.14, spreadAir: 0.25, bloom: 0,
             recoilV: 0.09, recoilH: 0.01, recoilRecover: 4, adsZoom: 1.25, scopeMag: 4.5, adsTime: 0.3, reload: 3.0, moveMul: 0.86,
             sound: 'sniper', bolt: true }),
  talon:   W({ name: 'TALON B3', kind: 'BURST', mag: 30, reserve: 120, rpm: 900, auto: false, burst: 3, burstGap: 0.3, damage: 33,
             headMul: 2.3, spreadHip: 0.028, bloom: 0.004, recoilV: 0.018, recoilH: 0.006, adsZoom: 1.5 }),
  viper:   W({ name: 'VIPER-5', kind: 'SMG', mag: 30, reserve: 150, rpm: 800, damage: 21, headMul: 1.8, range: 12, falloffEnd: 35,
             minMul: 0.6, spreadHip: 0.03, spreadMove: 0.022, spreadAir: 0.07, bloom: 0.004, bloomMax: 0.03, recoilV: 0.013,
             recoilH: 0.007, moveMul: 1.0, reload: 2.0, draw: 0.4, sound: 'smg' }),
  scout:   W({ name: 'SCARAB-17', kind: 'RIFLE', mag: 20, reserve: 100, rpm: 500, damage: 37, headMul: 2.3, recoilV: 0.03,
             recoilH: 0.01, bloom: 0.008, moveMul: 0.9, reload: 2.5, sound: 'heavy' }),
  vecta:   W({ name: 'VECTA', kind: 'SMG', mag: 25, reserve: 125, rpm: 1050, damage: 18, headMul: 1.8, range: 10, falloffEnd: 30,
             minMul: 0.6, spreadHip: 0.033, spreadMove: 0.02, spreadAir: 0.07, bloom: 0.0035, bloomMax: 0.03, recoilV: 0.011,
             recoilH: 0.008, moveMul: 1.0, reload: 1.9, draw: 0.4, adsZoom: 1.4, sound: 'smg', reddot: true }),
  aurum:   W({ name: 'AURUM DMR', kind: 'MARKSMAN', mag: 10, reserve: 50, rpm: 300, auto: false, damage: 52, headMul: 2.3,
             range: 60, falloffEnd: 120, spreadHip: 0.045, spreadAds: 0.001, spreadMove: 0.07, bloom: 0, recoilV: 0.045,
             recoilH: 0.008, recoilRecover: 6, adsZoom: 1.15, scopeMag: 2.5, adsTime: 0.25, reload: 2.6, moveMul: 0.9, sound: 'heavy', reddot: true }),
  boomer:  W({ name: 'BOOMER M6', kind: 'LAUNCHER', mag: 6, reserve: 12, rpm: 95, auto: false, damage: 115, headMul: 1, legMul: 1,
             spreadHip: 0.01, spreadAds: 0.004, spreadMove: 0.02, bloom: 0, recoilV: 0.06, recoilH: 0.01, recoilRecover: 5,
             reload: 3.4, moveMul: 0.88, sound: 'launcher', projectile: { speed: 34, gravity: 12, radius: 4.6 } }),
  hammer:  W({ name: 'HAMMER LMG', kind: 'LMG', mag: 100, reserve: 200, rpm: 680, damage: 27, headMul: 2.0, spreadHip: 0.045,
             spreadMove: 0.08, bloom: 0.005, bloomMax: 0.045, recoilV: 0.017, recoilH: 0.011, adsTime: 0.35, reload: 4.6,
             draw: 0.8, moveMul: 0.82, sound: 'heavy' }),
  p9:      W({ name: 'P9', kind: 'PISTOL', slot: 2, mag: 12, reserve: 48, rpm: 420, auto: false, damage: 26, headMul: 2.5,
             range: 15, falloffEnd: 40, minMul: 0.6, spreadHip: 0.022, spreadAds: 0.006, spreadMove: 0.035, bloom: 0.01,
             bloomMax: 0.035, recoilV: 0.03, recoilH: 0.008, adsZoom: 1.2, adsTime: 0.15, reload: 1.6, draw: 0.35, moveMul: 1.0, sound: 'pistol' }),
  rhino:   W({ name: 'RHINO .50', kind: 'PISTOL', slot: 2, mag: 7, reserve: 35, rpm: 190, auto: false, damage: 54, headMul: 2.2,
             range: 20, falloffEnd: 50, minMul: 0.6, spreadHip: 0.03, spreadAds: 0.004, spreadMove: 0.05, bloom: 0.02,
             bloomMax: 0.05, recoilV: 0.075, recoilH: 0.015, recoilRecover: 5, adsZoom: 1.25, adsTime: 0.18, reload: 2.1, draw: 0.45,
             moveMul: 0.98, sound: 'magnum' }),
  knife:   W({ name: 'KNIFE', kind: 'MELEE', slot: 3, mag: Infinity, reserve: 0, rpm: 130, auto: true, damage: 55, heavyDamage: 110,
             headMul: 1, legMul: 1, melee: 2.4, draw: 0.3, moveMul: 1.12, sound: 'knife', spreadHip: 0 }),
};
for (const [id, w] of Object.entries(WEAPONS)) w.id = id;

// Los 10 loadouts del menú. Los 3 primeros son "personalizados": se cambian desde el Inventario.
export const DEFAULT_LOADOUTS = [
  { primary: 'akr', secondary: 'p9' },
  { primary: 'brute', secondary: 'p9' },
  { primary: 'longbow', secondary: 'rhino' },
  { primary: 'scout', secondary: 'p9' },
  { primary: 'viper', secondary: 'p9' },
  { primary: 'talon', secondary: 'p9' },
  { primary: 'vecta', secondary: 'p9' },
  { primary: 'aurum', secondary: 'rhino' },
  { primary: 'boomer', secondary: 'p9' },
  { primary: 'hammer', secondary: 'p9' },
];
export const PRIMARIES = ['akr', 'brute', 'longbow', 'scout', 'viper', 'talon', 'vecta', 'aurum', 'boomer', 'hammer'];
export const SECONDARIES = ['p9', 'rhino'];

// Daño con caída por distancia.
export function damageAt(w, dist) {
  if (dist <= w.range) return w.damage;
  const t = Math.min(1, (dist - w.range) / Math.max(1, w.falloffEnd - w.range));
  return w.damage * (1 - (1 - w.minMul) * t);
}
