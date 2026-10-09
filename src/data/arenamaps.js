// Mapas de ARENA (V2): pequeños y con SIMETRÍA CENTRAL (lo que hay en (x, z) se repite en (−x, −z)),
// así ningún equipo tiene ventaja. Azul sale por el oeste (x < 0) y rojo por el este (x > 0).
import { maker, stack, crateCluster, CCOL } from './maps.js';

// Coloca una mitad del mapa y su reflejo central
function mirrored(m, place) { place(1); place(-1); }

// ======================= PIER 9 (puerto, al aire libre) =======================
export function pier() {
  const m = maker();
  const X = 26, Z = 19;
  m.box(0, -1, 0, X * 2 + 40, 1, Z * 2 + 40, 'asphalt');
  m.box(0, 0, -Z - 0.5, X * 2 + 2, 6, 1, 'concreteWall'); m.box(0, 0, Z + 0.5, X * 2 + 2, 6, 1, 'concreteWall');
  m.box(-X - 0.5, 0, 0, 1, 6, Z * 2 + 2, 'concreteWall'); m.box(X + 0.5, 0, 0, 1, 6, Z * 2 + 2, 'concreteWall');
  m.any({ k: 'backdrop', kind: 'harbor', S: X + 4 });

  // Centro: contenedor abierto que conecta norte-sur + cajas de cobertura
  m.cont(0, 0, 0, 'z', CCOL.yellow, true, 5);
  crateCluster(m, 0, -7.5, [[0, 0], [1.25, 0], [0.6, 0, 1]]);
  crateCluster(m, 0, 7.5, [[0, 0], [-1.25, 0], [-0.6, 0, 1]]);

  mirrored(m, (s) => {
    const P = (x, z) => [s * x, s * z];
    const team = s > 0 ? 'red' : 'blue';
    const cols = s > 0 ? ['red', 'orange'] : ['blue', 'teal'];
    // Pila de 2 contenedores que corta la línea de visión media
    { const [x, z] = P(12, -6.5); stack(m, x, z, 'z', cols); }
    // Contenedor abierto (pasillo) en la calle norte
    { const [x, z] = P(12, 9); m.cont(x, 0, z, 'x', CCOL[cols[0]], true, s > 0 ? 2 : 3); }
    // Calle sur: contenedor bajo de cobertura + barrera
    { const [x, z] = P(5, -14); m.cont(x, 0, z, 'x', CCOL.white, false, 4); }
    { const [x, z] = P(17, -13.5); m.any({ k: 'barrier', p: [x, 0, z], o: 'x' }); }
    // Torre de cajas (subida en dos saltos) y cajas sueltas
    { const [x, z] = P(20, 13.5); crateCluster(m, x, z, [[0, 0], [s * 1.25, 0], [0, s * -1.25], [0, 0, 1]]); }
    { const [x, z] = P(7, 3); crateCluster(m, x, z, [[0, 0], [0, s * 1.25]]); }
    { const [x, z] = P(19.5, 0); m.any({ k: 'barrier', p: [x, 0, z], o: 'z' }); }
    { const [x, z] = P(17, 5); m.barrel(x, 0, z, s > 0 ? 0xb5382c : 0x2c5f94); m.barrel(x + s * 0.7, 0, z + s * 0.3, s > 0 ? 0xb5382c : 0x2c5f94); }
    { const [x, z] = P(8, -3.5); m.barrel(x, 0, z, 0x6b7480); }
    // Franja del equipo y spawns (5 por equipo: hasta 5v5)
    m.any({ k: 'teamStripe', p: [s * (X - 0.05), 3.4, 0], team, len: Z * 2 - 2 });
    for (const z of [-8, -4, 0, 4, 8]) m.spawn(s * (X - 3), 0, s * z, s > 0 ? Math.PI / 2 : -Math.PI / 2, team);
  });
  return {
    id: 'pier', name: 'PIER 9', arena: true, entities: m.E, spawns: m.spawns, bounds: { x: X, z: Z },
    sky: { top: '#3a78c9', mid: '#f2c48c', bottom: '#f6d9b0' }, fog: { color: 0xe6c9a6, near: 60, far: 170 },
    sun: { dir: [0.75, 0.42, 0.35], color: 0xffd2a0, intensity: 2.7 }, hemi: { sky: 0xd8e4ff, ground: 0x6b5f52, i: 1.2 }, clouds: true,
  };
}

// ======================= KILN (fundición, interior) =======================
export function kiln() {
  const m = maker();
  const X = 24, Z = 16, H = 9;
  m.box(0, -1, 0, X * 2 + 4, 1, Z * 2 + 4, 'factoryFloor');
  m.box(0, 0, -Z - 0.5, X * 2 + 2, H, 1, 'factoryWall'); m.box(0, 0, Z + 0.5, X * 2 + 2, H, 1, 'factoryWall');
  m.box(-X - 0.5, 0, 0, 1, H, Z * 2 + 2, 'factoryWall'); m.box(X + 0.5, 0, 0, 1, H, Z * 2 + 2, 'factoryWall');
  m.any({ k: 'factoryRoof', X, Z, H });

  // Centro: horno (bloquea la línea larga) y cajas a sus lados
  m.any({ k: 'furnace', p: [0, 0, 0], w: 4.5, d: 4.5, h: 4.3 });
  crateCluster(m, 0, -10.5, [[0, 0], [1.25, 0]]);
  crateCluster(m, 0, 10.5, [[0, 0], [-1.25, 0]]);

  mirrored(m, (s) => {
    const P = (x, z) => [s * x, s * z];
    const team = s > 0 ? 'red' : 'blue';
    { const [x, z] = P(9, -6); m.any({ k: 'machine', p: [x, 0, z], w: 3.6, d: 2.8, h: 2.4 }); }
    { const [x, z] = P(10, 7); m.any({ k: 'conveyor', p: [x, 0, z], len: 6.5, o: 'x' }); }
    { const [x, z] = P(15.5, 0); crateCluster(m, x, z, [[0, -0.7], [0, 0.6], [0, 0, 1]]); }
    { const [x, z] = P(18, -11.5); m.any({ k: 'tank', p: [x, 0, z], r: 1.4, h: 5 }); }
    { const [x, z] = P(17, 11); m.any({ k: 'barrier', p: [x, 0, z], o: 'x' }); }
    { const [x, z] = P(5.5, 12); crateCluster(m, x, z, [[0, 0], [0, 0, 1]]); }
    { const [x, z] = P(5, -2.5); m.box(x, 0, z, 0.7, H, 0.7, 'steelYellow'); }
    { const [x, z] = P(12, 13.2); m.box(x, 0, z, 0.7, H, 0.7, 'steelYellow'); }
    { const [x, z] = P(18.5, -6); m.any({ k: 'barrier', p: [x, 0, z], o: 'z' }); }
    m.any({ k: 'teamStripe', p: [s * (X - 0.05), 3.2, 0], team, len: Z * 2 - 2 });
    m.any({ k: 'light', p: [s * 20, 4.5, 0], c: team === 'blue' ? 0x7fb6ff : 0xff8a7a, i: 12, d: 14 });
    for (const z of [-8, -4, 0, 4, 8]) m.spawn(s * (X - 2.5), 0, s * z, s > 0 ? Math.PI / 2 : -Math.PI / 2, team);
  });
  for (const [x, z] of [[-11, 0], [11, 0], [0, -9], [0, 9]]) m.any({ k: 'light', p: [x, H - 1.5, z], c: 0xffd9a0, i: 20, d: 20, lamp: true });
  return {
    id: 'kiln', name: 'KILN', arena: true, entities: m.E, spawns: m.spawns, bounds: { x: X, z: Z }, indoor: true,
    sky: { top: '#2a2420', mid: '#4a3426', bottom: '#2a2018' }, fog: { color: 0x2e2620, near: 30, far: 90 },
    sun: { dir: [0.2, 1, 0.3], color: 0xffd0a0, intensity: 1.4 }, hemi: { sky: 0xe0c0a0, ground: 0x4a3828, i: 1.8 },
  };
}
