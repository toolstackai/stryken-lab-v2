// Mundo de colisión: cajas alineadas a ejes + rampas (cuñas). Sin Three.js, se puede probar en Node.
export const BODY = { r: 0.34, h: 1.8, crouchH: 1.3, eye: 1.64, crouchEye: 1.18, step: 0.45 };

const CELL = 4;

// Construye el colisionador a partir de las cajas del mapa: { p:[cx, yBase, cz], s:[w,h,d], ramp? }
export function makeCollider(boxes) {
  const out = { boxes: [], ramps: [], grid: new Map(), stamp: 0 };
  for (const b of boxes) {
    if (b.noCollide) continue;
    const [cx, by, cz] = b.p, [w, h, d] = b.s;
    const o = { minX: cx - w / 2, maxX: cx + w / 2, minY: by, maxY: by + h, minZ: cz - d / 2, maxZ: cz + d / 2, mark: 0, bullet: !b.noBullet };
    if (b.ramp) { o.dir = b.ramp; o.ramp = true; out.ramps.push(o); } else out.boxes.push(o);
  }
  for (const o of [...out.boxes, ...out.ramps]) {
    for (let ix = Math.floor(o.minX / CELL); ix <= Math.floor(o.maxX / CELL); ix++)
      for (let iz = Math.floor(o.minZ / CELL); iz <= Math.floor(o.maxZ / CELL); iz++) {
        const k = ix * 4099 + iz;
        let l = out.grid.get(k); if (!l) out.grid.set(k, l = []);
        l.push(o);
      }
  }
  out.tmp = [];
  return out;
}

// Objetos cuyo AABB en planta toca el rectángulo dado (sin duplicados).
export function query(col, x0, z0, x1, z1) {
  const res = col.tmp; res.length = 0;
  const s = ++col.stamp;
  for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++)
    for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
      const l = col.grid.get(ix * 4099 + iz);
      if (!l) continue;
      for (let i = 0; i < l.length; i++) { const o = l[i]; if (o.mark !== s) { o.mark = s; res.push(o); } }
    }
  return res;
}

function rampT(r, x, z) {
  switch (r.dir) {
    case '+x': return (x - r.minX) / (r.maxX - r.minX);
    case '-x': return (r.maxX - x) / (r.maxX - r.minX);
    case '+z': return (z - r.minZ) / (r.maxZ - r.minZ);
    default:   return (r.maxZ - z) / (r.maxZ - r.minZ);
  }
}
export function rampHeightAt(r, x, z) {
  const t = Math.min(1, Math.max(0, rampT(r, x, z)));
  return r.minY + (r.maxY - r.minY) * t;
}
function rampMaxUnder(r, x0, x1, z0, z1) {
  const cx0 = Math.max(x0, r.minX), cx1 = Math.min(x1, r.maxX);
  const cz0 = Math.max(z0, r.minZ), cz1 = Math.min(z1, r.maxZ);
  const ux = r.dir === '+x' ? cx1 : r.dir === '-x' ? cx0 : (cx0 + cx1) / 2;
  const uz = r.dir === '+z' ? cz1 : r.dir === '-z' ? cz0 : (cz0 + cz1) / 2;
  return rampHeightAt(r, ux, uz);
}

// Altura superior máxima de lo que se cruza con el cuerpo, o -Infinity si está libre.
export function hitTop(col, x, y, z, h = BODY.h, r = BODY.r) {
  const x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r, y1 = y + h;
  let top = -Infinity;
  const list = query(col, x0, z0, x1, z1);
  for (let i = 0; i < list.length; i++) {
    const b = list[i];
    if (!(x1 > b.minX && x0 < b.maxX && z1 > b.minZ && z0 < b.maxZ && y1 > b.minY)) continue;
    if (b.ramp) {
      const s = rampMaxUnder(b, x0, x1, z0, z1);
      if (y < s - 0.001 && s > top) top = s;
    } else if (y < b.maxY && b.maxY > top) top = b.maxY;
  }
  return top;
}
export const blocked = (col, x, y, z, h, r) => hitTop(col, x, y, z, h, r) !== -Infinity;

function ceilingBottom(col, x, y, z, h) {
  const r = BODY.r, x0 = x - r, x1 = x + r, z0 = z - r, z1 = z + r, y1 = y + h;
  let bottom = Infinity;
  const list = query(col, x0, z0, x1, z1);
  for (const b of list) {
    if (b.ramp) continue;
    if (x1 > b.minX && x0 < b.maxX && z1 > b.minZ && z0 < b.maxZ && y1 > b.minY && y < b.maxY && b.minY < bottom) bottom = b.minY;
  }
  return bottom;
}

function tryStep(col, body, nx, nz, h) {
  const top = hitTop(col, nx, body.pos.y, nz, h);
  if (top - body.pos.y <= BODY.step && !blocked(col, nx, top + 0.001, nz, h)) {
    body.pos.x = nx; body.pos.z = nz; body.pos.y = top;
    return true;
  }
  return false;
}

// body: { pos, vel, onGround, height }. Mueve por ejes con auto-escalón y pegado al suelo.
export function moveBody(col, body, dt) {
  const p = body.pos, v = body.vel, h = body.height || BODY.h;
  const wasGround = body.onGround;
  body.hitWall = false;
  const nx = p.x + v.x * dt;
  if (blocked(col, nx, p.y, p.z, h)) { if (!(wasGround && tryStep(col, body, nx, p.z, h))) { v.x = 0; body.hitWall = true; } }
  else p.x = nx;
  const nz = p.z + v.z * dt;
  if (blocked(col, p.x, p.y, nz, h)) { if (!(wasGround && tryStep(col, body, p.x, nz, h))) { v.z = 0; body.hitWall = true; } }
  else p.z = nz;

  const ny = p.y + v.y * dt;
  if (v.y > 0) {
    const ceil = ceilingBottom(col, p.x, ny, p.z, h);
    if (ceil < Infinity) { p.y = Math.max(p.y, Math.min(ny, ceil - h - 0.001)); v.y = 0; }
    else p.y = ny;
    body.onGround = false;
    return;
  }
  const top = hitTop(col, p.x, ny, p.z, h);
  if (top !== -Infinity) {
    p.y = top; if (!wasGround) body.landSpeed = -v.y; v.y = 0; body.onGround = true;
  } else if (wasGround && !body.jumped) {
    const snap = hitTop(col, p.x, ny - BODY.step, p.z, BODY.step + 0.01);
    if (snap !== -Infinity && snap <= p.y + 0.001) { p.y = snap; v.y = 0; body.onGround = true; }
    else { p.y = ny; body.onGround = false; }
  } else { p.y = ny; body.onGround = false; }
  body.jumped = false;
}

// ¿Puede levantarse (hay espacio para la altura completa)?
export const canStand = (col, p) => !blocked(col, p.x, p.y + 0.01, p.z, BODY.h - 0.01);

// Raycast analítico contra cajas y rampas. Devuelve { t, nx, ny, nz } o null.
// Recorre SÓLO las celdas de la rejilla que cruza el rayo (DDA), de cerca a lejos, y para en cuanto la
// siguiente celda empieza más lejos que el mejor impacto. Antes se miraba todo el rectángulo que envuelve
// el rayo: en un mapa grande, un disparo diagonal largo revisaba miles de celdas.
export function raycastWorld(col, ox, oy, oz, dx, dy, dz, maxT, forBullet = true) {
  const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
  const st = { best: maxT, bn: null };
  const s = ++col.stamp;
  let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
  const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const tdx = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tdz = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
  let tmx = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx)) : Infinity;
  let tmz = dz !== 0 ? ((dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz)) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    const l = col.grid.get(cx * 4099 + cz);
    if (l) for (let k = 0; k < l.length; k++) { const b = l[k]; if (b.mark === s) continue; b.mark = s; rayBoxTest(b, ox, oy, oz, dx, dy, dz, ix, iy, iz, forBullet, st); }
    const tNext = Math.min(tmx, tmz);
    if (tNext > st.best || tNext > maxT) break;
    if (tmx < tmz) { tmx += tdx; cx += sx; } else { tmz += tdz; cz += sz; }
  }
  return st.bn ? { t: st.best, nx: st.bn[0], ny: st.bn[1], nz: st.bn[2] } : null;
}
function rayBoxTest(b, ox, oy, oz, dx, dy, dz, ix, iy, iz, forBullet, st) {
  {
    if (forBullet && !b.bullet) return;
    let t1 = (b.minX - ox) * ix, t2 = (b.maxX - ox) * ix;
    let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2), axis = 0;
    t1 = (b.minY - oy) * iy; t2 = (b.maxY - oy) * iy;
    let a = Math.min(t1, t2); if (a > tmin) { tmin = a; axis = 1; } tmax = Math.min(tmax, Math.max(t1, t2));
    t1 = (b.minZ - oz) * iz; t2 = (b.maxZ - oz) * iz;
    a = Math.min(t1, t2); if (a > tmin) { tmin = a; axis = 2; } tmax = Math.min(tmax, Math.max(t1, t2));
    if (tmax < Math.max(tmin, 0)) return;
    let n = axis === 0 ? [-Math.sign(dx), 0, 0] : axis === 1 ? [0, -Math.sign(dy), 0] : [0, 0, -Math.sign(dz)];
    if (b.ramp) {
      const q = b;
      const L = q.dir[1] === 'x' ? q.maxX - q.minX : q.maxZ - q.minZ, H = q.maxY - q.minY;
      let nx = 0, nz = 0;
      if (q.dir === '+x') nx = -H; else if (q.dir === '-x') nx = H; else if (q.dir === '+z') nz = -H; else nz = H;
      const ny = L;
      const px = q.dir === '-x' ? q.maxX : q.minX, pz = q.dir === '-z' ? q.maxZ : q.minZ;
      const c = nx * px + ny * q.minY + nz * pz;
      const dn = nx * dx + ny * dy + nz * dz, on = nx * ox + ny * oy + nz * oz;
      if (Math.abs(dn) < 1e-9) { if (on > c) return; }
      else {
        const tp = (c - on) / dn;
        if (dn < 0) { if (tp > tmin) { tmin = tp; const l = Math.hypot(nx, ny, nz); n = [nx / l, ny / l, nz / l]; } }
        else tmax = Math.min(tmax, tp);
      }
      if (tmax < tmin) return;
    }
    if (tmin >= 0 && tmin < st.best) { st.best = tmin; st.bn = n; }
  }
}

// Rayo contra caja (hitboxes de jugadores). Devuelve t o -1.
export function rayBox(ox, oy, oz, dx, dy, dz, minX, minY, minZ, maxX, maxY, maxZ) {
  let t1 = (minX - ox) / dx, t2 = (maxX - ox) / dx;
  let tmin = Math.min(t1, t2), tmax = Math.max(t1, t2);
  t1 = (minY - oy) / dy; t2 = (maxY - oy) / dy;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  t1 = (minZ - oz) / dz; t2 = (maxZ - oz) / dz;
  tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2));
  return tmax >= Math.max(tmin, 0) ? Math.max(tmin, 0) : -1;
}

// Línea de visión libre entre dos puntos.
export function clearLine(col, ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  if (L < 1e-4) return true;
  return !raycastWorld(col, ax, ay, az, dx / L, dy / L, dz / L, L);
}
