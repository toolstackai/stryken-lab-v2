// Verifica cada mapa: spawns libres y con suelo, navegación conectada, y que un bot físico pueda recorrer rutas.
// Uso: node tests/maps.test.js
import { buildMapData, MAPS } from '../src/data/maps.js';
import { makeCollider, blocked, hitTop, moveBody, BODY } from '../src/core/physics.js';
import { buildNav, nearestNode, findPath } from '../src/core/nav.js';

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.log('  FAIL', msg); } };

for (const id of Object.keys(MAPS)) {
  const t0 = Date.now();
  const map = buildMapData(id);
  const col = makeCollider(map.collision);
  const nav = buildNav(col, map.bounds, map.spawns.map(s => s.p), map.navCell || 1);
  console.log(`${id}: ${map.collision.length} cajas, ${nav.nodes.length} nodos, ${nav.mainNodes.length} conectados (${Date.now() - t0} ms)`);

  for (const s of map.spawns) {
    const [x, y, z] = s.p;
    check(!blocked(col, x, y + 0.02, z), `${id} spawn bloqueado ${s.p}`);
    check(blocked(col, x, y - 0.05, z, 0.04), `${id} spawn sin suelo ${s.p}`);
    const n = nearestNode(nav, x, y, z);
    check(n >= 0, `${id} spawn fuera de la navegación ${s.p}`);
  }
  // Porcentaje del área caminable conectada
  const ratio = nav.mainNodes.length / nav.nodes.length;
  check(ratio > 0.7, `${id} sólo ${(ratio * 100).toFixed(0)}% de nodos conectados`);

  // Rutas entre spawns y simulación física siguiendo el camino
  let simOk = 0, simTot = 0;
  for (let i = 0; i < map.spawns.length; i++) {
    const a = map.spawns[i], b = map.spawns[(i * 7 + 3) % map.spawns.length];
    if (a === b) continue;
    const na = nearestNode(nav, ...a.p), nb = nearestNode(nav, ...b.p);
    const path = findPath(nav, na, nb);
    check(!!path, `${id} sin ruta ${a.p} -> ${b.p}`);
    if (!path) continue;
    simTot++;
    const body = { pos: { x: a.p[0], y: a.p[1], z: a.p[2] }, vel: { x: 0, y: 0, z: 0 }, onGround: true, height: BODY.h };
    let k = 0, stuck = 0, lastD = 1e9;
    for (let step = 0; step < 60 * 90 && k < path.length; step++) {
      const n = nav.nodes[path[k]];
      const dx = n.x - body.pos.x, dz = n.z - body.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.45 && Math.abs(n.y - body.pos.y) < 1.4) { k++; stuck = 0; lastD = 1e9; continue; }
      const sp = 5;
      body.vel.x = dx / (d || 1) * sp; body.vel.z = dz / (d || 1) * sp;
      if (body.onGround && (n.y - body.pos.y > BODY.step || body.hitWall)) { body.vel.y = 7.4; body.jumped = true; }
      body.vel.y -= 21 * (1 / 60);
      moveBody(col, body, 1 / 60);
      if (d > lastD - 0.001) stuck++; else stuck = 0;
      lastD = Math.min(lastD, d);
      if (stuck > 240) break;
    }
    if (k >= path.length) simOk++;
    else console.log(`  bot atascado en ${id}: ${a.p} -> ${b.p} en nodo ${k}/${path.length} pos ${body.pos.x.toFixed(1)},${body.pos.y.toFixed(1)},${body.pos.z.toFixed(1)}`);
  }
  check(simOk >= simTot * 0.9, `${id} sólo ${simOk}/${simTot} rutas simuladas completas`);
  console.log(`  rutas simuladas: ${simOk}/${simTot}`);
}
console.log(fail ? `\n${fail} FALLOS` : '\nTodo OK');
process.exit(fail ? 1 : 0);
