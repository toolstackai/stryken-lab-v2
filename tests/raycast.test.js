// Compara el raycast por recorrido de celdas (DDA) con una versión de fuerza bruta: deben dar el mismo impacto.
// Uso: node tests/raycast.test.js
import { buildMapData, MAPS } from '../src/data/maps.js';
import { makeCollider, raycastWorld } from '../src/core/physics.js';

let uniq = 0;
function brute(col, ox, oy, oz, dx, dy, dz, maxT) {
  let best = maxT, hit = false;
  for (const b of [...col.boxes, ...col.ramps]) {
    if (!b.bullet) continue;
    // envolver la caja sola en un colisionador mínimo para reutilizar el test exacto
    const c = { boxes: b.ramp ? [] : [b], ramps: b.ramp ? [b] : [], grid: new Map(), stamp: -1e9 - (++uniq) }; // marca única: no chocar con la del colisionador real
    for (let ix = Math.floor(b.minX / 4); ix <= Math.floor(b.maxX / 4); ix++) for (let iz = Math.floor(b.minZ / 4); iz <= Math.floor(b.maxZ / 4); iz++) { const k = ix * 4099 + iz; if (!c.grid.has(k)) c.grid.set(k, []); c.grid.get(k).push(b); }
    const r = raycastWorld(c, ox, oy, oz, dx, dy, dz, best);
    if (r && r.t < best) { best = r.t; hit = true; }
  }
  return hit ? best : null;
}
let fail = 0, n = 0;
for (const id of Object.keys(MAPS)) {
  const map = buildMapData(id), col = makeCollider(map.collision), B = map.bounds;
  for (let i = 0; i < 1500; i++) {
    const ox = (Math.random() * 2 - 1) * B.x, oz = (Math.random() * 2 - 1) * B.z, oy = 0.5 + Math.random() * 6;
    let dx = Math.random() * 2 - 1, dy = (Math.random() * 2 - 1) * 0.3, dz = Math.random() * 2 - 1; const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
    const maxT = 5 + Math.random() * 200;
    const a = raycastWorld(col, ox, oy, oz, dx, dy, dz, maxT), b = brute(col, ox, oy, oz, dx, dy, dz, maxT);
    n++;
    const ta = a ? a.t : null;
    if ((ta === null) !== (b === null) || (ta !== null && Math.abs(ta - b) > 1e-6)) { fail++; if (fail < 5) console.log('  FAIL', id, ta, b); }
  }
}
console.log(`${n} rayos, ${fail} diferencias`);
process.exit(fail ? 1 : 0);
