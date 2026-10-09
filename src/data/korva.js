// ======================= KORVA ISLAND (Battle Royale) =======================
// Isla de ~300×300 m con zonas con nombre, carreteras, bosques y puntos de botín.
// Todo determinista (semilla fija): mismo mapa, misma navegación y mismos puntos de botín en cada partida.
import { maker, stack, crateCluster, room, CCOL } from './maps.js';

export const KORVA_HALF = 150;

function rng(seed) { let s = seed >>> 0; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

export function korva() {
  const m = maker();
  const H = KORVA_HALF;
  const loot = [];      // { p:[x,y,z], tier } — tier 0 normal · 1 bueno · 2 muy bueno
  const pois = [];      // { name, x, z, r }
  const L = (x, y, z, tier = 0) => loot.push({ p: [x, y, z], tier });
  const keep = []; // rectángulos [x0,z0,x1,z1] donde no pueden ir árboles ni rocas
  const K = (x, z, w, d, pad = 0) => keep.push([x - w / 2 - pad, z - d / 2 - pad, x + w / 2 + pad, z + d / 2 + pad]);
  const poi = (name, x, z, r) => pois.push({ name, x, z, r });

  // suelo + límites invisibles (las balas los atraviesan)
  m.box(0, -1, 0, H * 2 + 4, 1, H * 2 + 4, 'grass');
  for (const [x, z, w, d] of [[0, -H - 1, H * 2 + 4, 2], [0, H + 1, H * 2 + 4, 2], [-H - 1, 0, 2, H * 2 + 4], [H + 1, 0, 2, H * 2 + 4]]) m.box(x, -1, z, w, 40, d, 'none', { noBullet: true });
  m.any({ k: 'backdrop', kind: 'island', S: H });

  // ---------- carreteras ----------
  const road = (x, z, w, d) => { m.any({ k: 'paint', p: [x, 0, z], w, d, c: 0x4a4d52 }); K(x, z, w, d, 1.5); };
  const line = (x, z, w, d) => m.any({ k: 'paint', p: [x, 0.002, z], w, d, c: 0xe6c33a });
  road(0, 10, 272, 7); for (let x = -132; x < 132; x += 8) line(x + 2, 10, 4, 0.18);
  road(0, -2, 7, 268); for (let z = -128; z < 128; z += 8) if (Math.abs(z - 10) > 6) line(0, z + 2, 0.18, 4);
  road(-50, -88, 46, 7); road(-28, -48, 7, 80);
  road(92, -40, 7, 92);
  road(-84, 44, 7, 68); road(58, 92, 20, 7); road(48, 52, 7, 80);

  // ---------- PUEBLO (centro) ----------
  poi('TOWN', 0, 12, 40);
  const house = (cx, cz, w, d, wall, doorSide, tier = 0) => {
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const at = doorSide === 'n' || doorSide === 's' ? cx : cz;
    const win = doorSide === 'n' ? 's' : doorSide === 's' ? 'n' : doorSide === 'e' ? 'w' : 'e';
    room(m, x0, z0, x1, z1, 3.4, wall, [{ side: doorSide, at, w: 2.4 }, { side: win, at: at + 1.2, w: 1.8, y: 1.0, h: 1.2 },
      { side: doorSide === 'n' || doorSide === 's' ? 'e' : 'n', at: doorSide === 'n' || doorSide === 's' ? cz : cx, w: 1.6, y: 1.0, h: 1.2 }], { roofMat: 'roofGreen' });
    m.box(cx, 0, cz, w - 0.6, 0.08, d - 0.6, 'wood');
    m.any({ k: 'desk', p: [cx + w / 4, 0.08, cz - d / 4] });
    L(cx - w / 5, 0.08, cz + d / 5, tier); L(cx + w / 4, 0.08, cz + d / 5, tier);
  };
  const walls = ['plasterWhite', 'brickWall', 'plasterWhite', 'plasterRed'];
  let hi = 0;
  for (const sx of [-1, 1]) for (const [z, door] of [[-4, 'n'], [-20, 's'], [24, 's'], [40, 'n']]) {
    house(sx * 15, z, 11, 8, walls[hi++ % 4], door === 'n' && z < 10 ? 'n' : door === 's' && z > 10 ? 's' : door);
    if (Math.abs(z) < 30) house(sx * 30, z, 10, 8, walls[hi++ % 4], sx < 0 ? 'e' : 'w');
  }
  // ayuntamiento: tejado accesible por escaleras exteriores, con parapeto
  room(m, 22, 48, 38, 60, 3.4, 'brickWall', [{ side: 'n', at: 30, w: 2.4 }, { side: 'w', at: 54, w: 1.8, y: 1.0, h: 1.2 }], { roofMat: 'metalroof' });
  m.box(30, 0, 54, 15.4, 0.08, 11.4, 'wood');
  m.ramp(41.15, 0, 51, 6, 3.65, 3, '-x', 'stoneBlock');
  for (const [x, z, w, d] of [[30, 48.15, 16, 0.3], [30, 59.85, 16, 0.3], [22.15, 54, 0.3, 12]]) m.box(x, 3.65, z, w, 0.9, d, 'brickWall');
  m.box(37.85, 3.65, 57, 0.3, 0.9, 6, 'brickWall');
  L(30, 3.66, 56, 2); L(26, 3.66, 51, 1); L(30, 0.08, 54, 1);
  // plaza: fuente
  m.box(-9, 0, 2, 4, 0.7, 4, 'stoneBlock'); m.any({ k: 'tank', p: [-9, 0.7, 2], r: 0.6, h: 1.4 });
  m.any({ k: 'barrier', p: [8, 0, -12], o: 'x' }); m.any({ k: 'barrier', p: [-8, 0, 28], o: 'z' });
  m.any({ k: 'truck', p: [-6, 0, 50], o: 'z', c: 0x2c5f94 });
  L(-6, 0, -12); L(8, 0, 30); L(5, 0, 50);

  // ---------- MUELLES (NE) ----------
  poi('THE DOCKS', 104, -100, 32);
  stack(m, 80, -120, 'x', ['red', 'blue']); stack(m, 80, -112, 'x', ['green']);
  stack(m, 96, -128, 'z', ['orange', 'white']); m.cont(104, 0, -128, 'z', CCOL.teal, true, 1);
  m.cont(112, 0, -118, 'x', CCOL.blue, true, 2); stack(m, 124, -118, 'x', ['yellow', 'gray']);
  stack(m, 86, -94, 'z', ['white']); m.cont(94, 0, -94, 'z', CCOL.red, true, 3); stack(m, 102, -94, 'z', ['green', 'red']);
  m.cont(120, 0, -102, 'z', CCOL.orange, true, 4);
  room(m, 100, -84, 126, -70, 7, 'metalWall', [{ side: 's', at: 106, w: 4 }, { side: 'w', at: -77, w: 2.4 }, { side: 'n', at: 120, w: 2.4 }]);
  m.box(124, 3.2, -77, 3.4, 0.3, 13.4, 'metalFloor'); m.ramp(120.8, 0, -80, 3, 3.5, 3, '+x', 'metalFloor');
  crateCluster(m, 108, -78, [[0, 0], [1.25, 0], [0, 1.25], [0, 0, 1]]);
  m.any({ k: 'forklift', p: [90, 0, -104], rot: 0.4 });
  for (const [x, y, z, t] of [[104, 0.1, -128, 1], [112, 0.1, -118, 1], [94, 0.1, -94, 0], [120, 0.1, -102, 1], [116, 0, -76, 1], [124, 3.5, -74, 2], [108, 0, -82, 0], [88, -0.0, -106, 0], [100, 0, -108, 0], [128, 0, -94, 0]]) L(x, y, z, t);

  // ---------- FUNDICIÓN (NO) ----------
  poi('FOUNDRY WORKS', -96, -94, 34);
  room(m, -122, -112, -74, -80, 9, 'factoryWall', [{ side: 's', at: -90, w: 4 }, { side: 'n', at: -110, w: 4 }, { side: 'e', at: -96, w: 2.4 }, { side: 'w', at: -92, w: 2.4 }]);
  m.box(-98, 0, -96, 47.4, 0.05, 31.4, 'factoryFloor');
  m.any({ k: 'machine', p: [-112, 0, -104], w: 4, d: 3, h: 2.6 }); m.any({ k: 'machine', p: [-112, 0, -88], w: 4, d: 3, h: 2.6 });
  m.any({ k: 'conveyor', p: [-100, 0, -96], len: 12, o: 'x' });
  m.any({ k: 'machine', p: [-84, 0, -104], w: 5, d: 3, h: 3.2 });
  m.box(-80, 4, -100.5, 6, 0.3, 21, 'metalFloor'); m.ramp(-80, 0, -87, 3, 4.3, 6, '-z', 'metalFloor');
  m.any({ k: 'tank', p: [-128, 0, -84], r: 2.2, h: 7 }); m.any({ k: 'tank', p: [-128, 0, -100], r: 2.2, h: 7 });
  stack(m, -66, -104, 'z', ['gray', 'orange']); m.cont(-66, 0, -90, 'z', CCOL.gray, true, 0);
  for (const [x, y, z, t] of [[-116, 0.05, -96, 1], [-104, 0.05, -108, 0], [-92, 0.05, -86, 0], [-86, 0.05, -96, 1], [-80, 4.3, -106, 2], [-80, 4.3, -95, 1], [-66, 0.1, -90, 0], [-128, 0, -92, 0], [-98, 0.05, -100, 0]]) L(x, y, z, t);

  // ---------- SANTUARIO (SO) ----------
  poi('OLD SHRINE', -96, 98, 30);
  m.box(-96, 0, 98, 34, 1.6, 34, 'stoneBlock');
  for (const [x, z, w, d, dir] of [[-96, 79, 6, 4, '+z'], [-96, 117, 6, 4, '-z'], [-115, 98, 4, 6, '+x'], [-77, 98, 4, 6, '-x']]) m.ramp(x, 0, z, w, 1.6, d, dir, 'stoneBlock');
  m.box(-96, 1.6, 98, 14, 0.4, 12, 'stoneBlock');
  for (const [x, z] of [[-102, 93], [-90, 93], [-102, 103], [-90, 103]]) m.any({ k: 'pillar', p: [x, 2.0, z], h: 4.2 });
  m.box(-99.5, 2.0, 98, 0.25, 3.2, 6, 'plasterWhite'); m.box(-92.5, 2.0, 98, 0.25, 3.2, 6, 'plasterWhite');
  m.any({ k: 'pagodaRoof', p: [-96, 6.2, 98], w: 16, d: 14, tiers: 2 }); m.any({ k: 'altar', p: [-96, 2.0, 98] });
  for (const [x, z, r] of [[-96, 76, 0], [-96, 120, 0]]) m.any({ k: 'gate', p: [x, 0, z], rot: r });
  for (const [x, z] of [[-108, 86], [-84, 86], [-108, 110], [-84, 110]]) { m.any({ k: 'stoneLantern', p: [x, 1.6, z] }); }
  for (const [x, z] of [[-110, 80], [-82, 80], [-112, 116], [-80, 116], [-118, 92], [-74, 104]]) m.any({ k: 'tree', p: [x, x > -100 && x < -90 ? 1.6 : 0, z], s: 1.1 });
  for (const [x, y, z, t] of [[-96, 2.0, 95, 2], [-104, 1.6, 108, 1], [-88, 1.6, 88, 1], [-110, 0, 98, 0], [-82, 0, 98, 0], [-96, 0, 74, 0]]) L(x, y, z, t);

  // ---------- COLINA DEL RADAR (SE) ----------
  poi('RADAR HILL', 98, 100, 30);
  m.box(98, 0, 100, 44, 4, 44, 'concreteDock');
  m.ramp(98, 0, 74, 8, 4, 8, '+z', 'concreteDock', false); m.ramp(72, 0, 100, 8, 4, 8, '+x', 'concreteDock', false);
  m.box(104, 4, 106, 20, 4, 20, 'concreteDock'); m.ramp(104, 4, 91, 6, 4, 10, '+z', 'concreteDock', false);
  m.any({ k: 'tank', p: [106, 8, 108], r: 3, h: 3.5 }); m.any({ k: 'pillar', p: [99, 8, 112], h: 9, small: true });
  room(m, 80, 106, 90, 116, 3, 'concreteWall', [{ side: 'n', at: 85, w: 2.4 }], { floorY: 4, roofMat: 'concreteDock' });
  for (const [x, y, z, t] of [[100, 8, 100, 2], [110, 8, 112, 2], [85, 4, 111, 1], [116, 4, 86, 1], [84, 4, 90, 0], [98, 0, 70, 0]]) L(x, y, z, t);

  // ---------- GRANJA (O) ----------
  poi('FARMSTEAD', -104, 16, 28);
  for (const [cx, cz] of [[-112, 6], [-96, 30]]) {
    room(m, cx - 8, cz - 5, cx + 8, cz + 5, 5.5, 'wood', [{ side: 's', at: cx, w: 3.2 }, { side: 'n', at: cx + 3, w: 2.4 }, { side: 'e', at: cz, w: 1.6, y: 1.4, h: 1.2 }], { roofMat: 'plasterRed' });
    m.box(cx + 4, 2.8, cz, 7.4, 0.3, 9.4, 'wood'); m.ramp(cx - 1.2, 0, cz + 2.5, 3, 3.1, 3, '+x', 'wood');
    crateCluster(m, cx - 5, cz - 2, [[0, 0, 0, 1.2], [1.25, 0], [0, 1.25]]);
    L(cx - 2, 0, cz - 2, 0); L(cx + 5, 3.1, cz, 1);
  }
  m.any({ k: 'tank', p: [-120, 0, 24], r: 2.6, h: 10 });
  for (let i = 0; i < 9; i++) { m.box(-122 + i * 4.4, 0, -6, 4.2, 1.0, 0.2, 'wood', { noBullet: true }); m.box(-122 + i * 4.4, 0, 42, 4.2, 1.0, 0.2, 'wood', { noBullet: true }); }
  m.any({ k: 'truck', p: [-86, 0, 12], o: 'x', c: 0x7a4a26 });
  L(-86, 0, 4, 0); L(-118, 0, 34, 0);

  // ---------- PUESTO MILITAR (E) ----------
  poi('OUTPOST', 112, 14, 22);
  for (const [x, z, o] of [[100, 0, 'x'], [100, 28, 'x'], [124, 0, 'x'], [124, 28, 'x'], [96, 14, 'z']]) m.any({ k: 'barrier', p: [x, 0, z], o });
  stack(m, 112, 4, 'x', ['green', 'green']); m.cont(112, 0, 24, 'x', CCOL.green, true, 1);
  m.any({ k: 'truck', p: [124, 0, 14], o: 'z', c: 0x55663a });
  // torre de vigilancia
  for (const [x, z] of [[103, 20], [107, 20], [103, 24], [107, 24]]) m.box(x, 0, z, 0.4, 6, 0.4, 'darkMetal');
  m.box(105, 6, 22, 5, 0.3, 5, 'metalFloor'); m.ramp(105, 0, 14.5, 3, 6.3, 10, '+z', 'metalFloor');
  for (const [x, z, w, d] of [[103, 19.6, 1, 0.1], [107, 19.6, 1, 0.1], [105, 24.4, 5, 0.1], [102.6, 22, 0.1, 5], [107.4, 22, 0.1, 5]]) m.box(x, 6.3, z, w, 1.0, d, 'railing', { noBullet: true });
  for (const [x, y, z, t] of [[105, 6.3, 22, 2], [112, 0.1, 24, 1], [118, 0, 10, 0], [104, 0, 6, 0]]) L(x, y, z, t);

  // ---------- FARO (S... en el norte de la costa) ----------
  poi('LIGHTHOUSE', 4, -126, 16);
  m.any({ k: 'tank', p: [4, 0, -128], r: 3, h: 16 });
  room(m, -15, -134, -7, -124, 3.2, 'plasterWhite', [{ side: 'n', at: -11, w: 2.4 }], { roofMat: 'roofGreen' });
  L(-11, 0, -129, 1); L(10, 0, -120, 0);

  // ---------- refugios sueltos ----------
  for (const [cx, cz, door] of [[-52, -46, 's'], [38, 64, 'n'], [-46, 66, 'e'], [52, -50, 'w'], [-50, 132, 's'], [60, 132, 's'], [-132, -40, 'e'], [134, 60, 'w']]) {
    room(m, cx - 3.5, cz - 3, cx + 3.5, cz + 3, 3, 'concreteWall', [{ side: door, at: door === 'n' || door === 's' ? cx : cz, w: 2.4 }], { roofMat: 'concreteDock' });
    K(cx, cz, 7, 6, 4);
    L(cx, 0, cz, 1);
  }

  // ---------- botín de carretera ----------
  const g = rng(1337);
  for (let i = 0; i < 26; i++) {
    const onX = g() < 0.5, t = (g() * 2 - 1) * 128;
    const x = onX ? t : (g() < 0.5 ? -5 : 5), z = onX ? (g() < 0.5 ? 4.5 : 15.5) : t;
    if (Math.abs(x) < 40 && Math.abs(z - 12) < 46) continue; // el pueblo ya tiene
    crateCluster(m, x + (onX ? 0 : (x > 0 ? 1.5 : -1.5)), z, [[0, 0]]); K(x, z, 4, 4, 1);
    L(x + (onX ? 1.6 : 0), 0, z + (onX ? 0 : 1.6), 0);
  }

  // ---------- bosques y rocas (evitan zonas y carreteras) ----------
  const free = (x, z, pad) => {
    for (const p of pois) if (Math.hypot(x - p.x, z - p.z) < p.r + pad) return false;
    if (Math.abs(z - 10) < 6 + pad || Math.abs(x) < 6 + pad) return false;
    for (const [a, b, c, d] of keep) if (x > a - pad && x < c + pad && z > b - pad && z < d + pad) return false;
    return Math.abs(x) < H - 6 && Math.abs(z) < H - 6;
  };
  let trees = 0;
  for (let i = 0; i < 900 && trees < 190; i++) {
    // agrupar en bosquecillos
    const cx = (g() * 2 - 1) * (H - 10), cz = (g() * 2 - 1) * (H - 10);
    const n = 3 + Math.floor(g() * 5);
    for (let k = 0; k < n; k++) {
      const x = cx + (g() - 0.5) * 18, z = cz + (g() - 0.5) * 18;
      if (!free(x, z, 3)) continue;
      m.any({ k: 'tree', p: [x, 0, z], s: 0.9 + g() * 0.5, v: g() < 0.55 ? 'pine' : 'oak' }); trees++;
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = (g() * 2 - 1) * (H - 10), z = (g() * 2 - 1) * (H - 10);
    if (!free(x, z, 4)) continue;
    const w = 1.5 + g() * 3, d = 1.5 + g() * 3, h = 0.8 + g() * 1.6;
    m.box(x, 0, z, w, h, d, 'rock');
    if (g() < 0.4) m.box(x + w * 0.4, h * 0.5, z - d * 0.2, w * 0.6, h * 0.8, d * 0.6, 'rock');
  }

  // spawns (sólo para semillas de navegación y reapariciones de respaldo): centro de cada zona
  for (const [x, z] of [[-40, 10], [40, 10], [-80, 10], [80, 10], [-136, 10], [120, 18], [0, -40], [0, -80], [0, 70], [0, 110], [0, -110], [-28, -30], [92, -30], [48, 40], [-84, 40]]) m.spawn(x, 0, z, 0);

  return {
    id: 'korva', name: 'KORVA ISLAND', entities: m.E, spawns: m.spawns, bounds: { x: H, z: H }, navCell: 1.5,
    loot, pois, br: true,
    sky: { top: '#3a7fcf', mid: '#a6cfee', bottom: '#d6e8f2' }, fog: { color: 0xbfd7e6, near: 90, far: 300 },
    sun: { dir: [-0.5, 0.75, -0.3], color: 0xfff0d2, intensity: 2.7 }, hemi: { sky: 0xc2e0ff, ground: 0x5d6b45, i: 1.2 }, clouds: true,
  };
}
