import { korva } from './korva.js';
import { pier, kiln } from './arenamaps.js';
// Mapas como listas de entidades (sin Three.js). world.js las convierte en mallas y collisionOf() en cajas.
// Coordenadas: x/z en metros, y = base del objeto. Contenedor estándar: 6.1 x 2.6 x 2.44.
export const CONT = { L: 6.1, H: 2.6, W: 2.44 };
export const CCOL = { red: 0xb5382c, blue: 0x2c5f94, green: 0x3d7a46, orange: 0xd27a28, white: 0xc9cdd2, teal: 0x2a8a8a, yellow: 0xd6a72a, gray: 0x6b7480 };

export function maker() {
  const E = [], spawns = [];
  const api = {
    E, spawns,
    box: (cx, y, cz, w, h, d, m, o = {}) => (E.push({ k: 'box', p: [cx, y, cz], s: [w, h, d], m, ...o }), api),
    deco: (cx, y, cz, w, h, d, m, o = {}) => (E.push({ k: 'box', p: [cx, y, cz], s: [w, h, d], m, col: false, ...o }), api),
    ramp: (cx, y, cz, w, h, d, dir, m, stairs = true) => (E.push({ k: 'ramp', p: [cx, y, cz], s: [w, h, d], dir, m, stairs }), api),
    cont: (cx, y, cz, o, c, open = false, v = 0) => (E.push({ k: 'cont', p: [cx, y, cz], o, c: CCOL[c] ?? c, open, v }), api),
    crate: (cx, y, cz, size = 1.2, rot = 0) => (E.push({ k: 'crate', p: [cx, y, cz], size, rot }), api),
    barrel: (cx, y, cz, c = 0x2c5f94) => (E.push({ k: 'barrel', p: [cx, y, cz], c }), api),
    any: (o) => (E.push(o), api),
    spawn: (x, y, z, yaw = 0, team = null) => (spawns.push({ p: [x, y, z], yaw, team }), api),
  };
  return api;
}

// Contenedores apilados: n niveles.
export function stack(m, x, z, o, colors, open = []) {
  colors.forEach((c, i) => m.cont(x, i * CONT.H, z, o, c, open.includes(i), (x * 7 + z * 3 + i) & 7));
}
// Muro con huecos: segmentos a lo largo de x o z.
export function crateCluster(m, x, z, pattern) {
  // pattern: lista de [dx, dz, nivel]
  for (const [dx, dz, lv = 0, s = 1.2] of pattern) m.crate(x + dx, lv * s, z + dz, s, ((dx * 13 + dz * 7) % 3) * 0.08);
}
// Habitación con paredes de grosor t y huecos (puertas/ventanas). doors: [{side:'n'|'s'|'e'|'w', at, w, h?}]
export function room(m, x0, z0, x1, z1, h, mat, doors = [], { t = 0.3, roof = true, roofMat = 'metalroof', floorY = 0 } = {}) {
  const sides = {
    s: { a: x0, b: x1, fixed: z0, axis: 'x' }, n: { a: x0, b: x1, fixed: z1, axis: 'x' },
    w: { a: z0, b: z1, fixed: x0, axis: 'z' }, e: { a: z0, b: z1, fixed: x1, axis: 'z' },
  };
  for (const [name, sd] of Object.entries(sides)) {
    const holes = doors.filter(d => d.side === name).map(d => ({ a: d.at - d.w / 2, b: d.at + d.w / 2, h: d.h ?? 2.3, y: d.y ?? 0 })).sort((p, q) => p.a - q.a);
    let cur = sd.a;
    const seg = (a, b, y, hh) => {
      if (b - a < 0.01 || hh < 0.01) return;
      const c = (a + b) / 2, L = b - a;
      if (sd.axis === 'x') m.box(c, floorY + y, sd.fixed, L + (name === 's' || name === 'n' ? 0 : 0), hh, t, mat);
      else m.box(sd.fixed, floorY + y, c, t, hh, L, mat);
    };
    for (const hl of holes) {
      seg(cur, hl.a, 0, h);
      seg(hl.a, hl.b, hl.y + hl.h, h - hl.y - hl.h); // dintel
      if (hl.y > 0) seg(hl.a, hl.b, 0, hl.y);         // antepecho (ventana)
      cur = hl.b;
    }
    seg(cur, sd.b, 0, h);
  }
  if (roof) m.box((x0 + x1) / 2, floorY + h, (z0 + z1) / 2, x1 - x0 + t, 0.25, z1 - z0 + t, roofMat);
}

// ======================= HARBOR (Deathmatch) =======================
function harbor() {
  const m = maker();
  const S = 42;
  m.box(0, -1, 0, S * 2 + 30, 1, S * 2 + 30, 'asphalt');
  // Perímetro
  m.box(0, 0, -S - 0.5, S * 2 + 2, 7, 1, 'concreteWall'); m.box(0, 0, S + 0.5, S * 2 + 2, 7, 1, 'concreteWall');
  m.box(-S - 0.5, 0, 0, 1, 7, S * 2 + 2, 'concreteWall'); m.box(S + 0.5, 0, 0, 1, 7, S * 2 + 2, 'concreteWall');
  m.any({ k: 'backdrop', kind: 'harbor', S });

  // Divisor oeste (x = -14)
  stack(m, -14, -35, 'z', ['red', 'blue']);
  m.cont(-14, 0, -24, 'x', CCOL.blue, true, 1);
  stack(m, -14, -12.2, 'z', ['green']); stack(m, -14, -6.1, 'z', ['orange']);
  stack(m, -14, 6, 'z', ['white', 'teal']);
  m.cont(-14, 0, 17, 'x', CCOL.red, true, 2);
  stack(m, -14, 29, 'z', ['teal']); stack(m, -14, 35.1, 'z', ['blue', 'orange']);
  // Divisor este (x = 14)
  stack(m, 14, -34, 'z', ['orange']); stack(m, 14, -27.9, 'z', ['green', 'red']);
  m.cont(14, 0, -16, 'x', CCOL.teal, true, 3);
  stack(m, 14, -4, 'z', ['red', 'white']);
  stack(m, 14, 8, 'z', ['blue']);
  m.cont(14, 0, 19, 'x', CCOL.white, true, 4);
  stack(m, 14, 31, 'z', ['green', 'yellow']); stack(m, 14, 37.1, 'z', ['gray']);

  // Centro: dos contenedores lado a lado + uno encima, escalera de cajas al techo
  m.cont(0, 0, -1.22, 'x', CCOL.blue, false, 5); m.cont(0, 0, 1.22, 'x', CCOL.red, false, 6);
  m.cont(-0.8, CONT.H, 1.22, 'x', CCOL.green, false, 7);
  m.ramp(5.6, 0, -1.22, 5, CONT.H, 2.4, '-x', 'metal');
  m.box(5.6, 0, -2.64, 5, 1.0, 0.12, 'hazard', { col: false });
  crateCluster(m, -4.5, 4.5, [[0, 0], [1.25, 0], [0, 0, 1]]);
  crateCluster(m, 4.2, 4.2, [[0, 0], [0, 1.25]]);
  crateCluster(m, -4.6, -4.8, [[0, 0], [1.25, 0]]);

  // Carril central norte/sur: túneles
  m.cont(0, 0, -21, 'z', CCOL.green, true, 0);
  m.cont(0, 0, 21, 'z', CCOL.orange, true, 2);
  crateCluster(m, -4, -14, [[0, 0], [0, 1.25], [0, 0, 1]]);
  crateCluster(m, 4.5, 14, [[0, 0], [-1.25, 0], [0, 0, 1]]);
  m.any({ k: 'barrier', p: [5, 0, -28], o: 'x' }); m.any({ k: 'barrier', p: [-5, 0, 28], o: 'x' });
  crateCluster(m, -3.5, -33, [[0, 0], [1.25, 0]]); crateCluster(m, 3.5, 33, [[0, 0], [-1.25, 0]]);

  // Carril oeste
  m.cont(-29, 0, -14, 'x', CCOL.red, false, 1);
  stack(m, -26, 8, 'z', ['blue', 'green']);
  m.any({ k: 'truck', p: [-31, 0, 1], o: 'z', c: 0xd6a72a });
  crateCluster(m, -36, -24, [[0, 0], [1.25, 0], [0, 1.25], [0, 0, 1]]);
  crateCluster(m, -22, -26, [[0, 0], [0, 1.25]]);
  m.any({ k: 'barrier', p: [-30, 0, -32], o: 'x' }); m.any({ k: 'barrier', p: [-22, 0, 20], o: 'z' });
  for (const z of [-6, -4.8]) m.barrel(-36, 0, z, 0x2c5f94);
  m.barrel(-35, 0, -5.4, 0xc8302a);
  // Muelle de carga NO (plataforma elevada con rampa y escaleras)
  m.box(-35, 0, 33, 13, 1.2, 17, 'concreteDock');
  m.ramp(-26.5, 0, 28, 4, 1.2, 4, '-x', 'concreteDock', false);
  m.ramp(-35, 0, 23, 4, 1.2, 3, '+z', 'concreteDock');
  crateCluster(m, -38, 37, [[0, 0, 0, 1.2], [1.25, 0], [0, -1.25], [0, 0, 1]].map(([a, b, c = 0]) => [a, b, c]));
  m.any({ k: 'roofShelter', x0: -41.5, z0: 26, x1: -28.5, z1: 41.5, y: 5.5 });
  for (const z of [27, 34, 41]) m.box(-29, 1.2, z, 0.3, 4.3, 0.3, 'steelYellow');

  // Carril este
  m.cont(28, 0, 12, 'x', CCOL.teal, false, 2);
  m.cont(32, 0, -10, 'z', CCOL.red, false, 3);
  m.cont(26, 0, -28, 'x', CCOL.white, true, 4);
  m.any({ k: 'forklift', p: [24, 0, -2], rot: 0.6 });
  crateCluster(m, 35, 2, [[0, 0], [0, 1.25], [1.25, 0], [0, 0, 1]]);
  crateCluster(m, 22, 26, [[0, 0], [1.25, 0]]);
  m.any({ k: 'barrier', p: [30, 0, -38], o: 'x' }); m.any({ k: 'barrier', p: [22, 0, 6], o: 'z' });
  // Oficina SE (interior para CQB)
  room(m, 28, 28, 41.8, 41.8, 3.4, 'brickWall', [
    { side: 's', at: 31, w: 1.6 }, { side: 'w', at: 36.5, w: 1.6 }, { side: 's', at: 37.5, w: 2.2, y: 1.0, h: 1.2 }, { side: 'w', at: 31, w: 2.4, y: 1.0, h: 1.2 },
  ]);
  m.box(34, 0, 34, 0.25, 3.4, 6, 'brickWall'); // tabique interior
  m.box(34, 0, 40.65, 0.25, 3.4, 2.3, 'brickWall');
  m.any({ k: 'desk', p: [31, 0, 38] }); m.any({ k: 'desk', p: [38, 0, 31.5] });
  m.any({ k: 'light', p: [34, 3.1, 34], c: 0xfff0d0, i: 6, d: 9 });

  // Marcas en el asfalto y charcos
  for (const x of [-7, 7, -28, 28]) for (let z = -39; z < 39; z += 4) m.any({ k: 'paint', p: [x, 0, z + 1], w: 0.15, d: 2, c: 0xe6c33a });
  for (const [x, z, w, d] of [[0, -40.2, 82, 0.2], [0, 40.2, 82, 0.2], [-40.2, 0, 0.2, 82], [40.2, 0, 0.2, 82]]) m.any({ k: 'paint', p: [x, 0, z], w, d, c: 0xe6c33a });
  for (const [x, z, w, d] of [[-21, 30, 3.2, 7], [21, -10, 3.2, 7], [-24, -30, 3.2, 7]]) {
    m.any({ k: 'paint', p: [x - w / 2, 0, z], w: 0.12, d, c: 0xf2f2f2 }); m.any({ k: 'paint', p: [x + w / 2, 0, z], w: 0.12, d, c: 0xf2f2f2 }); m.any({ k: 'paint', p: [x, 0, z - d / 2], w, d: 0.12, c: 0xf2f2f2 });
  }
  for (const [x, z, r] of [[-9, -18, 1.6], [9, 26, 2.2], [-31, 12, 1.4], [26, 2, 1.8], [-4, 35, 1.3], [33, -22, 1.6]]) m.any({ k: 'puddle', p: [x, 0, z], r });

  // Spawns repartidos
  for (const [x, z, yaw] of [[-38, -38, 0.8], [-24, -38, 0], [0, -38, 0], [24, -38, 0], [38, -38, -0.8], [-38, -20, 1.5], [38, -20, -1.5],
    [-22, 0, 1.5], [22, 0, -1.5], [-38, 14, 1.5], [38, 16, -1.5], [-20, 38, 3.1], [0, 38, 3.1], [20, 38, 3.1], [-35, 33, 2.4], [31, 35, 2.4],
    [-7, -10, 0], [7, 10, 3.1], [-24, -20, 0.5], [24, 22, 3.6]]) {
    const y = (x === -35 && z === 33) ? 1.2 : 0;
    m.spawn(x, y, z, yaw);
  }
  return {
    id: 'harbor', name: 'HARBOR', entities: m.E, spawns: m.spawns, bounds: { x: S, z: S },
    sky: { top: '#3d86d8', mid: '#a9d4f5', bottom: '#cfe3ef' }, fog: { color: 0xbcd8ec, near: 70, far: 200 },
    sun: { dir: [-0.45, 0.8, -0.35], color: 0xfff1d6, intensity: 2.6 }, hemi: { sky: 0xbfe0ff, ground: 0x6b6a5f, i: 1.25 }, clouds: true,
  };
}

// ======================= FOUNDRY (Team Deathmatch) =======================
function foundry() {
  const m = maker();
  const X = 36, Z = 23, H = 12;
  m.box(0, -1, 0, X * 2 + 4, 1, Z * 2 + 4, 'factoryFloor');
  m.box(0, 0, -Z - 0.5, X * 2 + 2, H, 1, 'factoryWall'); m.box(0, 0, Z + 0.5, X * 2 + 2, H, 1, 'factoryWall');
  m.box(-X - 0.5, 0, 0, 1, H, Z * 2 + 2, 'factoryWall'); m.box(X + 0.5, 0, 0, 1, H, Z * 2 + 2, 'factoryWall');
  m.any({ k: 'factoryRoof', X, Z, H });

  for (const s of [-1, 1]) {
    const team = s < 0 ? 'blue' : 'red';
    // Sala de spawn con tres salidas
    const x0 = s < 0 ? -X : X - 9, x1 = s < 0 ? -X + 9 : X;
    const wx = s < 0 ? x1 : x0;
    m.box(wx, 0, -14.75, 0.4, 4.5, 16.5, 'metalWall'); m.box(wx, 0, 14.75, 0.4, 4.5, 16.5, 'metalWall');
    m.box(wx, 0, 0, 0.4, 4.5, 6, 'metalWall');
    m.box(wx, 3, -5, 0.4, 1.5, 4, 'metalWall'); m.box(wx, 3, 5, 0.4, 1.5, 4, 'metalWall');
    m.any({ k: 'teamStripe', p: [wx + 0.25 * s, 3.6, 0], team, len: 46 });
    m.box((x0 + x1) / 2, 4.5, 0, 9.4, 0.3, Z * 2, 'metalFloor');
    m.any({ k: 'light', p: [(x0 + x1) / 2, 4.1, -8], c: team === 'blue' ? 0x7fb6ff : 0xff8a7a, i: 10, d: 14 });
    m.any({ k: 'light', p: [(x0 + x1) / 2, 4.1, 8], c: team === 'blue' ? 0x7fb6ff : 0xff8a7a, i: 10, d: 14 });
    crateCluster(m, s * (X - 3), -18, [[0, 0], [0, 1.25]]); crateCluster(m, s * (X - 3), 18, [[0, 0], [0, -1.25]]);
    for (const z of [-15, -9, -3, 3, 9, 15]) m.spawn(s * (X - 4.5), 0, z, s < 0 ? -Math.PI / 2 : Math.PI / 2, team);
    for (const z of [-12, 0, 12]) m.spawn(s * (X - 7), 0, z, s < 0 ? -Math.PI / 2 : Math.PI / 2, team);

    // Pasarela elevada (y=4) junto a las paredes norte/sur + escaleras que suben hacia la pared
    for (const sz of [-1, 1]) {
      m.box(s * 17, 4, sz * (Z - 1.5), 20, 0.3, 3, 'metalFloor');
      m.ramp(s * 22, 0, sz * (Z - 6), 3, 4, 6, sz < 0 ? '-z' : '+z', 'metalFloor');
      m.box(s * 13.75, 4.3, sz * (Z - 3), 13.5, 1.0, 0.1, 'railing', { noBullet: true });
      m.box(s * 25.25, 4.3, sz * (Z - 3), 3.5, 1.0, 0.1, 'railing', { noBullet: true });
    }
    // Maquinaria del carril
    m.any({ k: 'machine', p: [s * 13, 0, -9], w: 4, d: 3, h: 2.6 });
    m.any({ k: 'machine', p: [s * 13, 0, 9], w: 4, d: 3, h: 2.6 });
    m.any({ k: 'conveyor', p: [s * 21, 0, 0], len: 8, o: 'z' });
    crateCluster(m, s * 8, 0, [[0, -0.7], [0, 0.6], [0, 0, 1]]);
    m.any({ k: 'tank', p: [s * 25, 0, -12], r: 1.6, h: 5.5 }); m.any({ k: 'tank', p: [s * 25, 0, 12], r: 1.6, h: 5.5 });
    crateCluster(m, s * 18, -15.5, [[0, 0], [1.25, 0]]); crateCluster(m, s * 18, 15.5, [[0, 0], [-1.25, 0]]);
    m.any({ k: 'barrier', p: [s * 29, 0, -5.5], o: 'z' }); m.any({ k: 'barrier', p: [s * 29, 0, 5.5], o: 'z' });
    for (const zz of [-6, 6]) m.box(s * 17, 0, zz, 0.7, H, 0.7, 'steelYellow');
    m.box(s * 8, 0, -16, 0.7, H, 0.7, 'steelYellow'); m.box(s * 8, 0, 16, 0.7, H, 0.7, 'steelYellow');
  }
  // Centro: horno con plataforma y puente norte-sur a y=4
  m.any({ k: 'furnace', p: [0, 0, 0], w: 6, d: 6, h: 4.3 });
  m.box(0, 4, -12.25, 3, 0.3, 18.5, 'metalFloor'); m.box(0, 4, 12.25, 3, 0.3, 18.5, 'metalFloor');
  m.box(0, 4, -Z + 1.5, 14, 0.3, 3, 'metalFloor'); m.box(0, 4, Z - 1.5, 14, 0.3, 3, 'metalFloor');
  for (const sx of [-1.45, 1.45]) { m.box(sx, 4.3, -11, 0.1, 1.0, 15, 'railing', { noBullet: true }); m.box(sx, 4.3, 11, 0.1, 1.0, 15, 'railing', { noBullet: true }); }
  crateCluster(m, -3.5, -14, [[0, 0], [0, 1.25]]); crateCluster(m, 3.5, 14, [[0, 0], [0, -1.25]]);
  m.box(-4, 0, 17.5, 0.7, H, 0.7, 'steelYellow'); m.box(4, 0, -17.5, 0.7, H, 0.7, 'steelYellow');
  for (const [x, z] of [[-24, 0], [24, 0], [-10, -16], [10, 16], [-10, 16], [10, -16], [0, -8], [0, 8]]) m.any({ k: 'light', p: [x, 9.5, z], c: 0xffd9a0, i: 22, d: 22, lamp: true });
  return {
    id: 'foundry', name: 'FOUNDRY', entities: m.E, spawns: m.spawns, bounds: { x: X, z: Z }, indoor: true,
    sky: { top: '#24314a', mid: '#3a4a66', bottom: '#2a3448' }, fog: { color: 0x283246, near: 35, far: 110 },
    sun: { dir: [0.3, 1, 0.2], color: 0xc8d6ff, intensity: 1.5 }, hemi: { sky: 0xa8bce0, ground: 0x4a4238, i: 1.9 },
  };
}

// ======================= SHRINE (Knife Only) =======================
function shrine() {
  const m = maker();
  const S = 26;
  m.box(0, -1, 0, S * 2 + 30, 1, S * 2 + 30, 'stone');
  for (const [x, z, w, d] of [[0, -S - 0.5, S * 2 + 2, 1], [0, S + 0.5, S * 2 + 2, 1], [-S - 0.5, 0, 1, S * 2 + 2], [S + 0.5, 0, 1, S * 2 + 2]]) {
    m.box(x, 0, z, w, 4, d, 'plasterRed'); m.box(x, 4, z, w + 0.6, 0.5, d + 0.8, 'roofGreen', { col: false });
  }
  m.any({ k: 'backdrop', kind: 'shrine', S });
  // Templo central elevado
  m.box(0, 0, 0, 14, 1.0, 12, 'stoneBlock');
  m.ramp(0, 0, -7.5, 5, 1.0, 3, '+z', 'stoneBlock'); m.ramp(0, 0, 7.5, 5, 1.0, 3, '-z', 'stoneBlock');
  m.ramp(-8.5, 0, 0, 3, 1.0, 4, '+x', 'stoneBlock'); m.ramp(8.5, 0, 0, 3, 1.0, 4, '-x', 'stoneBlock');
  for (const [x, z] of [[-6, -5], [6, -5], [-6, 5], [6, 5], [-2.4, -5], [2.4, -5], [-2.4, 5], [2.4, 5]]) m.any({ k: 'pillar', p: [x, 1, z], h: 4.2 });
  m.box(-3.5, 1, 0, 0.25, 3.2, 6, 'plasterWhite'); m.box(3.5, 1, 0, 0.25, 3.2, 6, 'plasterWhite');
  m.any({ k: 'pagodaRoof', p: [0, 5.2, 0], w: 16, d: 14, tiers: 2 });
  m.any({ k: 'altar', p: [0, 1, 0] });
  // Puertas (gates)
  for (const [x, z, r] of [[0, -17, 0], [0, 17, 0], [-17, 0, 1], [17, 0, 1]]) m.any({ k: 'gate', p: [x, 0, z], rot: r });
  // Colinas de pasillos cubiertos en esquinas
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const cx = sx * 18, cz = sz * 18;
    m.box(cx, 0, cz + sz * 4.5, 10, 3.2, 0.3, 'plasterWhite');
    m.box(cx + sx * 4.5, 0, cz - sz * 1, 0.3, 3.2, 8, 'plasterWhite');
    m.box(cx + sx * 0.5, 3.2, cz + sz * 0.5, 11, 0.3, 10, 'roofGreen', { col: true });
    for (const [px, pz] of [[-4.5, -3.5], [0, -3.5], [4.5, -3.5], [-4.5, 0.5]]) m.any({ k: 'pillar', p: [cx + px * sx, 0, cz + pz * sz], h: 3.2, small: true });
    m.any({ k: 'lantern', p: [cx - sx * 3, 2.4, cz - sz * 3.4] });
    m.any({ k: 'tree', p: [sx * 9, 0, sz * 22], s: 1.1 });
    m.any({ k: 'tree', p: [sx * 22, 0, sz * 9], s: 0.95 });
  }
  // Muros bajos y linternas de piedra como cobertura
  for (const [x, z, w, d] of [[-10, -11, 5, 0.8], [10, 11, 5, 0.8], [-11, 10, 0.8, 5], [11, -10, 0.8, 5]]) m.box(x, 0, z, w, 1.1, d, 'stoneBlock');
  for (const [x, z] of [[-6, -13], [6, -13], [-6, 13], [6, 13], [-13, -6], [-13, 6], [13, -6], [13, 6]]) m.any({ k: 'stoneLantern', p: [x, 0, z] });
  for (const [x, z] of [[-22, -22], [22, 22], [-22, 22], [22, -22]]) crateCluster(m, x, z, [[0, 0, 0, 1.0]]);
  for (const [x, z, yaw] of [[0, -23, 0], [0, 23, Math.PI], [-23, 0, -Math.PI / 2], [23, 0, Math.PI / 2], [-14, -22, 0], [14, 22, Math.PI],
    [-24, 10, -1.5], [24, -10, 1.5], [-12, -4, -1], [12, 4, 2], [0, 1, 0], [-22, -6, -1.5], [22, 6, 1.5]]) m.spawn(x, x === 0 && z === 1 ? 1 : 0, z, yaw);
  return {
    id: 'shrine', name: 'SHRINE', entities: m.E, spawns: m.spawns, bounds: { x: S, z: S },
    sky: { top: '#3a4f8f', mid: '#f0a46a', bottom: '#f6c890' }, fog: { color: 0xe9b688, near: 50, far: 160 },
    sun: { dir: [0.7, 0.45, -0.4], color: 0xffc58a, intensity: 2.4 }, hemi: { sky: 0xffd2a8, ground: 0x6a5040, i: 1.1 }, clouds: true, petals: true,
  };
}

export const MAPS = { harbor, foundry, shrine, korva, pier, kiln };
export const MAP_NAMES = { harbor: 'HARBOR', foundry: 'FOUNDRY', shrine: 'SHRINE', korva: 'KORVA ISLAND', pier: 'PIER 9', kiln: 'KILN' };

// ---------------- Colisiones a partir de entidades ----------------
export function collisionOf(entities) {
  const out = [];
  const B = (cx, y, cz, w, h, d, o = {}) => out.push({ p: [cx, y, cz], s: [w, h, d], ...o });
  for (const e of entities) {
    const [x, y, z] = e.p || [0, 0, 0];
    switch (e.k) {
      case 'box': if (e.col !== false) B(x, y, z, e.s[0], e.s[1], e.s[2], { noBullet: e.noBullet }); break;
      case 'ramp': B(x, y, z, e.s[0], e.s[1], e.s[2], { ramp: e.dir }); break;
      case 'cont': {
        const { L, H, W } = CONT;
        const lx = e.o === 'x' ? L : W, lz = e.o === 'x' ? W : L;
        if (!e.open) { B(x, y, z, lx, H, lz); break; }
        const t = 0.12;
        B(x, y, z, lx, 0.1, lz); // piso
        B(x, y + H - t, z, lx, t, lz); // techo
        if (e.o === 'x') { B(x, y, z - W / 2 + t / 2, L, H, t); B(x, y, z + W / 2 - t / 2, L, H, t); }
        else { B(x - W / 2 + t / 2, y, z, t, H, L); B(x + W / 2 - t / 2, y, z, t, H, L); }
        break;
      }
      case 'crate': B(x, y, z, e.size, e.size, e.size); break;
      case 'barrel': B(x, y, z, 0.62, 0.95, 0.62); break;
      case 'barrier': if (e.o === 'x') B(x, y, z, 3, 0.95, 0.7); else B(x, y, z, 0.7, 0.95, 3); break;
      case 'truck': {
        const along = e.o === 'z';
        // cabina + remolque
        if (along) { B(x, y, z - 4.2, 2.4, 2.9, 2.2); B(x, y + 0.2, z + 1.2, 2.5, 3.3, 8.2); }
        else { B(x - 4.2, y, z, 2.2, 2.9, 2.4); B(x + 1.2, y + 0.2, z, 8.2, 3.3, 2.5); }
        if (along) B(x, y, z + 1.2, 2.2, 0.2, 8.2); else B(x + 1.2, y, z, 8.2, 0.2, 2.2);
        break;
      }
      case 'forklift': B(x, y, z, 1.4, 2.2, 2.4); break;
      case 'desk': B(x, y, z, 1.6, 0.78, 0.8); break;
      case 'machine': B(x, y, z, e.w, e.h, e.d); break;
      case 'furnace': B(x, y, z, e.w, e.h, e.d); break;
      case 'conveyor': if (e.o === 'z') B(x, y, z, 1.4, 0.9, e.len); else B(x, y, z, e.len, 0.9, 1.4); break;
      case 'tank': B(x, y, z, e.r * 2, e.h, e.r * 2); break;
      case 'pillar': B(x, y, z, e.small ? 0.36 : 0.5, e.h, e.small ? 0.36 : 0.5); break;
      case 'gate': {
        const dx = e.rot ? 0 : 2.6, dz = e.rot ? 2.6 : 0;
        B(x - dx, y, z - dz, 0.5, 4.6, 0.5); B(x + dx, y, z + dz, 0.5, 4.6, 0.5);
        break;
      }
      case 'stoneLantern': B(x, y, z, 0.7, 1.7, 0.7); break;
      case 'tree': B(x, y, z, 0.5 * (e.s || 1), 3, 0.5 * (e.s || 1)); break;
      case 'altar': B(x, y, z, 2, 1.0, 1.2); break;
    }
  }
  return out;
}

export function buildMapData(id) {
  const map = MAPS[id]();
  map.collision = collisionOf(map.entities);
  return map;
}
