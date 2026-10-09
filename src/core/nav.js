// Malla de navegación automática: una rejilla de nodos caminables generada desde el colisionador.
// Cualquier mapa nuevo funciona con los bots sin configurar nada.
import { BODY, hitTop, blocked, rampHeightAt, query } from './physics.js';

let CELL = 1; // tamaño de celda de la última malla construida (los mapas grandes usan 1.5 m)
const JUMP_UP = 1.28;  // altura que un bot puede superar saltando
const MAX_DROP = 6;

export function buildNav(col, bounds, seeds, cell = 1) {
  CELL = cell;
  const nodes = [];
  const columns = new Map();
  const key = (ix, iz) => ix * 10007 + iz;
  const nxCells = Math.floor(bounds.x / CELL), nzCells = Math.floor(bounds.z / CELL);
  const r = BODY.r;

  for (let ix = -nxCells; ix <= nxCells; ix++) {
    for (let iz = -nzCells; iz <= nzCells; iz++) {
      const x = ix * CELL, z = iz * CELL;
      const cands = new Set();
      const near = query(col, x - r, z - r, x + r, z + r);
      for (const b of near) {
        if (b.ramp) continue;
        if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) cands.add(+b.maxY.toFixed(3));
      }
      for (const q of near) {
        if (!q.ramp) continue;
        if (x + r > q.minX && x - r < q.maxX && z + r > q.minZ && z - r < q.maxZ) {
          // altura real donde reposaría el cuerpo
          const y = hitTop(col, x, Math.max(q.minY, rampHeightAt(q, x, z) - 0.6), z, 0.6 + BODY.h);
          if (y !== -Infinity) cands.add(+y.toFixed(3));
        }
      }
      const list = [];
      for (const y of cands) {
        if (blocked(col, x, y + 0.01, z)) continue;
        if (!blocked(col, x, y - 0.08, z, 0.07)) continue; // necesita suelo
        list.push(nodes.length);
        nodes.push({ x, y, z, ix, iz, edges: [] });
      }
      if (list.length) columns.set(key(ix, iz), list);
    }
  }

  const clearPath = (a, b, y) => {
    for (const t of [0.25, 0.5, 0.75]) {
      if (blocked(col, a.x + (b.x - a.x) * t, y, a.z + (b.z - a.z) * t)) return false;
    }
    return true;
  };
  // Hay suelo bajo el centro a lo largo del tramo (evita cortar esquinas sobre el vacío).
  const groundPath = (a, b) => {
    const lo = Math.min(a.y, b.y), hi = Math.max(a.y, b.y);
    for (const t of [0.25, 0.5, 0.75]) {
      if (!blocked(col, a.x + (b.x - a.x) * t, lo - 0.5, a.z + (b.z - a.z) * t, hi - lo + 0.52, 0.12)) return false;
    }
    return true;
  };

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const list = columns.get(key(n.ix + dx, n.iz + dz));
      if (!list) continue;
      for (const j of list) {
        const m = nodes[j];
        const dy = m.y - n.y;
        const dist = Math.hypot(dx, dz) * CELL;
        if (dy <= BODY.step + 0.35 && dy >= -BODY.step - 0.35) {
          if (clearPath(n, m, Math.max(n.y, m.y) + 0.05) && groundPath(n, m)) n.edges.push({ to: j, cost: dist, jump: dy > BODY.step });
        } else if (dy > 0 && dy <= JUMP_UP) {
          if (!dx || !dz) if (clearPath(n, m, m.y + 0.05) && !blocked(col, n.x, n.y + 1.3, n.z)) n.edges.push({ to: j, cost: dist + 1.5, jump: true });
        } else if (dy < 0 && dy >= -MAX_DROP) {
          if (clearPath(n, m, n.y + 0.05)) n.edges.push({ to: j, cost: dist + 0.5, drop: true });
        }
      }
    }
  }

  // Solo valen los nodos de ida y vuelta desde un spawn (componente fuertemente conexo):
  // descarta topes de paredes, copas de árboles y otros sitios a los que solo se llega cayendo.
  const rev = nodes.map(() => []);
  nodes.forEach((n, i) => n.edges.forEach(e => rev[e.to].push(i)));
  const reach = (start, adj) => {
    const seen = new Uint8Array(nodes.length);
    const stack = [start]; seen[start] = 1;
    while (stack.length) for (const j of adj(stack.pop())) if (!seen[j]) { seen[j] = 1; stack.push(j); }
    return seen;
  };
  const tmp = { nodes, columns, key, cell: CELL };
  let seed = -1;
  for (const [x, y, z] of seeds) { nodes.forEach(n => { n.main = true; }); seed = nearestNode(tmp, x, y, z); if (seed >= 0) break; }
  const fwd = reach(seed, k => nodes[k].edges.map(e => e.to));
  const bwd = reach(seed, k => rev[k]);
  nodes.forEach((n, i) => { n.main = !!(fwd[i] && bwd[i]); });
  // Las aristas hacia nodos no válidos se eliminan.
  nodes.forEach(n => { n.edges = n.edges.filter(e => nodes[e.to].main); });

  return { nodes, columns, key, cell: CELL, maxIter: nodes.length > 15000 ? 150000 : 20000, mainNodes: nodes.map((n, i) => i).filter(i => nodes[i].main) };
}

// Nodo más cercano a una posición (busca en columnas vecinas).
export function nearestNode(nav, x, y, z) {
  const C = nav.cell || 1, ix0 = Math.round(x / C), iz0 = Math.round(z / C);
  let best = -1, bd = Infinity;
  for (let rad = 0; rad <= 3 && best < 0; rad++) {
    for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== rad) continue;
      const list = nav.columns.get(nav.key(ix0 + dx, iz0 + dz));
      if (!list) continue;
      for (const i of list) {
        const n = nav.nodes[i];
        if (!n.main) continue;
        const dyPen = n.y > y + 0.7 ? (n.y - y) * 4 : Math.abs(n.y - y) * 1.5;
        const d = Math.hypot(n.x - x, n.z - z) + dyPen;
        if (d < bd) { bd = d; best = i; }
      }
    }
  }
  return best;
}

// A* con montículo binario.
export function findPath(nav, start, goal, iterCap = Infinity) {
  if (start < 0 || goal < 0) return null;
  if (start === goal) return [goal];
  const nodes = nav.nodes, N = nodes.length;
  // búferes reutilizados con sello de generación (antes: ~400 KB nuevos por búsqueda en la isla)
  let B = nav.buf;
  if (!B || B.N !== N) B = nav.buf = { N, g: new Float32Array(N), came: new Int32Array(N), seen: new Uint32Array(N), closed: new Uint32Array(N), gen: 0 };
  const gen = ++B.gen, G0 = B.g, came = B.came, seen = B.seen, closedA = B.closed;
  const g = { get: (i) => seen[i] === gen ? G0[i] : Infinity };
  const heap = [];
  const G = nodes[goal];
  const h = i => Math.hypot(nodes[i].x - G.x, nodes[i].z - G.z, (nodes[i].y - G.y) * 0.5);
  const push = (i, f) => {
    heap.push([f, i]); let k = heap.length - 1;
    while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last; let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1; let m = k;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m;
      }
    }
    return top[1];
  };
  G0[start] = 0; came[start] = -1; seen[start] = gen; push(start, h(start));
  let iter = 0;
  const maxIter = Math.min(nav.maxIter || 20000, iterCap);
  while (heap.length && iter++ < maxIter) {
    const cur = pop();
    if (cur === goal) {
      const path = [cur];
      let k = cur; while (came[k] !== -1) { k = came[k]; path.push(k); }
      return path.reverse();
    }
    if (closedA[cur] === gen) continue;
    closedA[cur] = gen;
    const gc = G0[cur];
    for (const e of nodes[cur].edges) {
      const ng = gc + e.cost;
      if (ng < g.get(e.to)) { G0[e.to] = ng; seen[e.to] = gen; came[e.to] = cur; push(e.to, ng + h(e.to)); }
    }
  }
  return null;
}
