// Ópticas reales para las armas que traen mira de serie.
//   reflex: punto rojo de marco abierto (cristal tintado + punto colimado)
//   holo:   holográfica de túnel (dos cristales + retícula de anillo y punto)
//   scope:  telescópica: la lente ocular muestra el mundo AUMENTADO (picture-in-picture con una segunda cámara)
// La retícula de reflex/holo es COLIMADA: se dibuja en el cristal justo delante del ojo siguiendo el eje de la mira,
// así que sólo se ve cuando el ojo está alineado (como en una mira de verdad) y "flota" sobre el blanco.
import * as THREE from 'three';
import { WEAPONS } from '../data/weapons.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// carcasa anodizada negra (la óptica no se pinta con la skin, salvo los paneles 'body')
const ANOD = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.36, metalness: 0.6, flatShading: true });

// Los materiales creados para una mira concreta se marcan como suyos para liberarlos junto con el arma
function markOwn(g, mats) {
  const shared = new Set(Object.values(mats));
  g.traverse(o => { if (o.isMesh && o.material !== ANOD && !shared.has(o.material)) o.material.userData.own = true; });
}

// ---------- texturas de retícula ----------
const rcache = new Map();
function reticleTex(kind) {
  if (rcache.has(kind)) return rcache.get(kind);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), m = 128;
  const glow = (r, a) => { const gr = g.createRadialGradient(m, m, 0, m, m, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); g.fillStyle = '#fff'; };
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  if (kind === 'dot') {
    glow(46, 0.35); g.beginPath(); g.arc(m, m, 11, 0, 7); g.fill();
  } else if (kind === 'ringdot') {
    glow(30, 0.4); g.beginPath(); g.arc(m, m, 9, 0, 7); g.fill();
    g.lineWidth = 5; g.shadowColor = '#fff'; g.shadowBlur = 8;
    g.beginPath(); g.arc(m, m, 70, 0, 7); g.stroke();
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { g.beginPath(); g.moveTo(m + dx * 70, m + dy * 70); g.lineTo(m + dx * 84, m + dy * 84); g.stroke(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  rcache.set(kind, t); return t;
}

// Escalera balística REAL del lanzagranadas: cada marca está a la caída exacta del proyectil a esa distancia.
// Plano de LW × LH unidades con el punto a DOT_TOP del borde superior; D = distancia ojo→cristal al apuntar.
const LW = 0.016, LH = 0.03, DOT_TOP = 0.0045, PX = 8000;
function ladderTex(weaponId, D) {
  const pr = WEAPONS[weaponId].projectile;
  const c = document.createElement('canvas'); c.width = LW * PX; c.height = LH * PX;
  const g = c.getContext('2d'), cx = c.width / 2, dy = DOT_TOP * PX;
  const gr = g.createRadialGradient(cx, dy, 0, cx, dy, 30); gr.addColorStop(0, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, c.width, 70);
  g.fillStyle = '#fff'; g.strokeStyle = '#fff';
  g.beginPath(); g.arc(cx, dy, 7, 0, 7); g.fill();
  g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 20, dy + 20); g.lineTo(cx, dy + 9); g.lineTo(cx + 20, dy + 20); g.stroke();
  // línea vertical punteada
  g.globalAlpha = 0.55; for (let y = dy + 26; y < c.height - 6; y += 9) g.fillRect(cx - 1, y, 2, 4); g.globalAlpha = 1;
  g.font = 'bold 15px monospace'; g.textAlign = 'right'; g.textBaseline = 'middle';
  [10, 15, 20, 25].forEach((R, i) => {
    const th = 0.5 * Math.asin(Math.min(1, pr.gravity * R / (pr.speed * pr.speed)));
    const y = dy + Math.tan(th) * D * PX;
    if (y > c.height - 4) return;
    const w = 26 - i * 4;
    g.fillRect(cx - w, y - 1.5, w * 2, 3);
    g.fillText(String(R), cx - w - 6, y);
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------- lente telescópica (picture-in-picture) ----------
const LENS_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const LENS_FS = `
  uniform sampler2D uMap; uniform float uActive; uniform vec2 uEye; uniform vec3 uRet; uniform float uStyle; uniform float uTime;
  varying vec2 vUv;
  float line(float d, float w) { return 1.0 - smoothstep(w * 0.5, w * 0.5 + 0.004, abs(d)); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0; float r = length(p);
    if (r > 1.0) discard;
    // imagen aumentada con leve aberración cromática en el borde
    vec2 ca = p * 0.006 * r;
    vec3 col = vec3(texture2D(uMap, vUv + ca).r, texture2D(uMap, vUv).g, texture2D(uMap, vUv - ca).b);
    col *= 1.0 - 0.45 * pow(r, 5.0);
    // sombra del visor: si el ojo no está centrado, el borde se come la imagen
    float sh = smoothstep(0.62, 1.0, length(p + uEye * 1.7));
    col *= 1.0 - sh;
    // retícula grabada
    float k = 0.0; vec3 rc = vec3(0.0);
    if (uStyle < 0.5) {
      // duplex (francotirador): hilos finos al centro, postes gruesos fuera + punto iluminado
      float thin = max(line(p.x, 0.006) * step(abs(p.y), 0.42), line(p.y, 0.006) * step(abs(p.x), 0.42));
      float thick = max(line(p.x, 0.035) * step(0.42, abs(p.y)), line(p.y, 0.035) * step(0.42, abs(p.x)));
      k = max(thin, thick);
      for (int i = 1; i <= 4; i++) { float y = float(i) * 0.08; k = max(k, line(p.y + y, 0.005) * step(abs(p.x), 0.03 - float(i) * 0.004)); }
      float cdot = 1.0 - smoothstep(0.012, 0.02, r);
      col = mix(col, vec3(0.02), k * 0.95);
      col = mix(col, uRet * 2.2, cdot);
    } else {
      // chevron iluminado (tirador): ^ + línea de caída
      vec2 q = p; q.y += 0.02;
      float chev = line(q.y + abs(q.x) * 1.0, 0.018) * step(abs(q.x), 0.07) * step(-0.075, q.y) ;
      float stem = line(p.x, 0.008) * step(0.09, -p.y) * step(-p.y, 0.6);
      float hor = line(p.y, 0.006) * step(0.55, abs(p.x));
      for (int i = 1; i <= 3; i++) { float y = 0.12 + float(i) * 0.1; stem = max(stem, line(p.y + y, 0.006) * step(abs(p.x), 0.05 - float(i) * 0.008)); }
      col = mix(col, vec3(0.02), max(stem, hor) * 0.95);
      col = mix(col, uRet * 2.4, chev);
    }
    // cristal sin imagen (no apuntando): oscuro con reflejo de recubrimiento
    vec3 glassCol = mix(vec3(0.02, 0.03, 0.05), vec3(0.18, 0.12, 0.35), smoothstep(0.2, 1.0, p.x * 0.5 + p.y * 0.7 + 0.4)) + vec3(0.25) * smoothstep(0.08, 0.0, abs(p.x + p.y - 0.6)) * 0.6;
    col = mix(glassCol, col, uActive);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// Altura del eje óptico sobre la base de montaje
export function opticAxis(o) {
  if (o.type === 'reflex') return o.tall ? 0.034 : 0.0165;
  if (o.type === 'holo') return 0.03;
  return o.r + 0.014; // scope: radio del tubo + anillas
}

// Construye la óptica. mats: materiales del arma (metal, body, accent...)
export function buildOptic(o, mats) {
  const g = new THREE.Group();
  g.position.set(...o.at);
  const dark = ANOD, body = mats.body || ANOD, accent = mats.accent || ANOD;
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); g.add(m); return m; };
  const box = (w, h, d, mat, x, y, z, rx = 0) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx);
  const tint = o.type === 'holo' ? 0x9fe4ff : 0xffc488;
  const glassMat = new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: o.type === 'holo' ? 0.1 : 0.16, roughness: 0.04, metalness: 0.85, envMapIntensity: 1.6, depthWrite: false, side: THREE.DoubleSide });
  const out = { group: g, spec: o, type: o.type };
  const h = opticAxis(o);

  if (o.type === 'reflex') {
    // punto rojo compacto de marco abierto
    box(0.03, 0.007, 0.044, dark, 0, 0.0035, 0);                 // base
    box(0.007, 0.0025, 0.009, dark, 0, 0.0082, 0.015);           // emisor (detrás, por debajo de la ventana)
    box(0.0016, 0.001, 0.0016, new THREE.MeshBasicMaterial({ color: new THREE.Color(o.color || 0xff3030).multiplyScalar(0.7) }), 0, 0.0098, 0.0112); // LED
    const up = o.tall ? 0.009 : 0.0105, down = o.tall ? 0.026 : 0.0105, top = h + up + 0.002, bot = h - down;
    for (const x of [-0.0135, 0.0135]) box(0.004, top - 0.006, 0.01, dark, x, (top + 0.006) / 2, -0.012);   // postes
    box(0.031, 0.005, 0.012, dark, 0, top + 0.0005, -0.012);     // capucha
    box(0.004, 0.006, 0.026, body, 0.0135, 0.01, 0.006);         // laterales
    box(0.004, 0.006, 0.026, body, -0.0135, 0.01, 0.006);
    if (o.tall) for (const x of [-0.0135, 0.0135]) box(0.003, top - 0.012, 0.004, accent, x, (top + 0.012) / 2, -0.0055); // refuerzos
    const glass = box(0.023, up + down + 0.002, 0.0012, glassMat, 0, (h + up + bot) / 2, -0.012, -0.08);
    out.glassZ = -0.012; out.win = [0.0108, up, down]; out.rearZ = 0.022; out.relief = 0.15; out.glass = glass;
    out.reticle = o.ret || 'dot'; out.retSize = 0.014;
  } else if (o.type === 'holo') {
    // holográfica de túnel: cristal trasero y delantero, capucha, batería lateral
    box(0.05, 0.01, 0.074, dark, 0, 0.005, 0);
    box(0.006, 0.042, 0.064, body, -0.023, 0.03, -0.002);        // paredes
    box(0.006, 0.042, 0.064, body, 0.023, 0.03, -0.002);
    box(0.052, 0.007, 0.066, dark, 0, 0.0535, -0.002);           // techo
    box(0.044, 0.004, 0.004, accent, 0, 0.0495, -0.034);         // borde frontal
    box(0.018, 0.022, 0.05, dark, 0.034, 0.018, 0.004);          // batería
    for (let i = 0; i < 2; i++) box(0.006, 0.006, 0.006, accent, 0.044, 0.02 + i * 0.008, 0.016); // botones
    box(0.05, 0.01, 0.012, dark, 0, 0.012, 0.028);               // marco trasero inferior
    box(0.05, 0.009, 0.006, dark, 0, 0.0115, -0.034);            // marco delantero inferior
    const glass = box(0.04, 0.031, 0.0012, glassMat, 0, h, -0.032);
    const rearMat = glassMat.clone(); rearMat.opacity = 0.05;
    box(0.04, 0.031, 0.0012, rearMat, 0, h, 0.031);
    out.glassZ = -0.031; out.win = [0.018, 0.0135, 0.0135]; out.rearZ = 0.034; out.relief = 0.2; out.reticle = 'ringdot'; out.retSize = 0.0084; out.glass = glass;
  } else {
    // telescópica: tubo, campana del objetivo, ocular, torretas y anillas
    const r = o.r, L = o.len, cyl = (rad, len, mat, z, seg = 32, open = false) => add(new THREE.CylinderGeometry(rad, rad, len, seg, 1, open), mat, 0, h, z, Math.PI / 2);
    const sideMat = (m) => { const c = m.clone(); c.side = THREE.DoubleSide; return c; };
    cyl(r, L, dark, 0);
    const bellL = 0.05, ocL = 0.045;
    // campanas y goma abiertas (tubos huecos): por dentro se ve la lente, no una tapa
    const darkIn = sideMat(dark);
    add(new THREE.CylinderGeometry(o.objR, r, bellL, 32, 1, true), darkIn, 0, h, -L / 2 - bellL / 2, -Math.PI / 2);
    cyl(o.objR + 0.002, 0.012, sideMat(accent), -L / 2 - bellL + 0.004, 32, true);   // anillo del objetivo
    add(new THREE.CylinderGeometry(o.ocR, r, ocL, 32, 1, true), darkIn, 0, h, L / 2 + ocL / 2, Math.PI / 2);
    cyl(o.ocR + 0.0015, 0.016, sideMat(mats.grip || dark), L / 2 + ocL - 0.002, 32, true); // goma del ocular
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), dark, 0, h + r + 0.006, -0.005);       // torreta de elevación
    add(new THREE.CylinderGeometry(0.0095, 0.0095, 0.004, 12), accent, 0, h + r + 0.0145, -0.005);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.016, 12), dark, r + 0.006, h, -0.005, 0, 0, Math.PI / 2); // deriva
    for (const z of [-L * 0.32, L * 0.32]) {
      add(new THREE.TorusGeometry(r + 0.003, 0.004, 6, 18), dark, 0, h, z);
      box(0.018, h - r + 0.002, 0.014, dark, 0, (h - r) / 2, z);
    }
    // objetivo: cristal oscuro con recubrimiento violeta (se ve desde fuera)
    const objMat = new THREE.MeshStandardMaterial({ color: 0x3a2a6a, roughness: 0.05, metalness: 0.9, emissive: 0x120a2a, envMapIntensity: 2 });
    add(new THREE.CircleGeometry(o.objR - 0.001, 40), objMat, 0, h, -L / 2 - bellL - 0.001, 0, Math.PI, 0);
    // ocular: lente con la imagen aumentada
    const lensMat = new THREE.ShaderMaterial({
      vertexShader: LENS_VS, fragmentShader: LENS_FS,
      uniforms: { uMap: { value: null }, uActive: { value: 0 }, uEye: { value: new THREE.Vector2() }, uRet: { value: new THREE.Color(o.color || 0xff2a2a) }, uStyle: { value: o.reticle === 'chevron' ? 1 : 0 }, uTime: { value: 0 } },
    });
    const lens = add(new THREE.CircleGeometry(o.ocR - 0.001, 48), lensMat, 0, h, L / 2 + ocL - 0.004);
    lens.userData.keep = true;
    out.lens = lens; out.lensMat = lensMat; out.lensR = o.ocR - 0.001; out.rearZ = L / 2 + ocL + 0.006; out.mag = o.mag; out.relief = o.mag > 3 ? 0.072 : 0.085;
  }
  // retícula colimada (sólo la usa el arma en primera persona)
  if (out.reticle) {
    const ladder = out.reticle === 'ladder';
    const map = ladder ? ladderTex(o.weapon, out.relief + out.rearZ - out.glassZ) : reticleTex(out.reticle);
    const rm = new THREE.MeshBasicMaterial({ map, color: new THREE.Color(o.color || 0xff3030).multiplyScalar(1.25), transparent: true, depthWrite: false, depthTest: false, toneMapped: false });
    const geo = ladder ? new THREE.PlaneGeometry(LW, LH).translate(0, -LH / 2 + DOT_TOP, 0) : new THREE.PlaneGeometry(out.retSize, out.retSize);
    const ret = new THREE.Mesh(geo, rm);
    ret.renderOrder = 30; ret.visible = false; ret.userData.keep = true; g.add(ret);
    out.ret = ret; out.retMat = rm; out.axisY = h;
  }
  out.axisY = h;
  markOwn(g, mats);
  return out;
}

// Coloca la retícula colimada según la posición del ojo (origen de la cámara del arma) — llamar con matrices al día.
const _inv = new THREE.Matrix4(), _e = new THREE.Vector3();
export function updateReticle(op, eyeWorld) {
  if (!op.ret) return;
  _inv.copy(op.group.matrixWorld).invert();
  _e.copy(eyeWorld).applyMatrix4(_inv);
  const dx = _e.x, dy = _e.y - op.axisY;
  const inside = Math.abs(dx) < op.win[0] && dy < op.win[1] && dy > -op.win[2] && _e.z > op.glassZ + 0.01;
  op.ret.visible = inside;
  if (inside) {
    op.ret.position.set(_e.x, _e.y, op.glassZ + 0.0008);
    // se apaga suavemente al acercarse al borde de la ventana
    const edge = Math.min(1 - Math.abs(dx) / op.win[0], dy > 0 ? 1 - dy / op.win[1] : 1 + dy / op.win[2]);
    op.retMat.opacity = Math.min(1, edge * 4);
  }
  return _e;
}

// ======================= MIRAS DE HIERRO =======================
// La línea de mira (y) es la que usa el apuntado: la punta del poste delantero y el fondo de la muesca (o el
// centro de la dioptra) quedan EXACTAMENTE en y, así que lo que ves alineado es donde van las balas.
//   rear: { type: 'notch' | 'peep' | 'none', z, base }   front: { type: 'post' | 'bead', z, base }
//   dots: 'tritium' (punto verde en el poste) | '3dot' (pistolas) · relief: ojo → alza al apuntar
const GLOW = (c) => { const m = new THREE.MeshBasicMaterial({ color: c }); m.toneMapped = false; return m; };
export function buildIrons(s, mats) {
  const g = new THREE.Group();
  const y = s.y, k = s.scale || 1; // pistolas: piezas más finas
  const steel = ANOD, body = mats.body || ANOD;
  const box = (w, h, d, mat, x, yy, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, yy, z); g.add(m); return m; };
  const R = s.rear, F = s.front;
  // ---- alza ----
  if (R.type === 'notch') {
    // la parte de arriba de las orejas está EN la línea de mira; la muesca baja earH para que el poste se vea entero dentro
    const W = 0.03 * k, gap = 0.0075 * k, earW = (W - gap) / 2, earH = 0.0075 * k, d = 0.012 * k, nb = y - earH;
    if (nb - R.base > 0.0005) box(W, nb - R.base, d, steel, 0, (nb + R.base) / 2, R.z);      // cuerpo hasta el fondo de la muesca
    for (const sx of [-1, 1]) box(earW, earH, d, steel, sx * (gap / 2 + earW / 2), nb + earH / 2, R.z); // orejas
    if (s.dots === '3dot') for (const sx of [-1, 1]) box(0.0022 * k, 0.0022 * k, 0.0008, GLOW(0xf2f6ff), sx * (gap / 2 + earW / 2), y - earH * 0.5, R.z + d / 2 + 0.0004);
  } else if (R.type === 'peep') {
    const rad = 0.0062, tube = 0.0021;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, 24), steel); ring.position.set(0, y, R.z); g.add(ring);
    box(0.006, y - rad - R.base, 0.008, steel, 0, (y - rad + R.base) / 2, R.z);              // pie del anillo
    for (const sx of [-1, 1]) box(0.003, y + rad + 0.004 - R.base, 0.01, steel, sx * 0.0115, (y + rad + 0.004 + R.base) / 2, R.z); // protectores
    box(0.026, 0.004, 0.012, steel, 0, R.base + 0.002, R.z);
  }
  // ---- punto de mira ----
  if (F.type === 'post') {
    const pw = (k < 1 ? 0.0034 : 0.0046) * k, d = 0.006 * k; // rifles: poste algo más grueso (está lejos del ojo)
    box(pw, y - F.base, d, steel, 0, (y + F.base) / 2, F.z);                                 // poste: la punta en y
    box(0.012 * k, 0.005 * k, 0.012 * k, steel, 0, F.base + 0.0025 * k, F.z);              // base
    if (!s.noEars) for (const sx of [-1, 1]) box(0.0028 * k, y - F.base + 0.005 * k, d, steel, sx * 0.0105 * k, (y + F.base + 0.005 * k) / 2, F.z); // orejas protectoras
    // punto luminoso; en 3 puntos se coloca a la misma altura ANGULAR que los del alza (se ven en fila)
    let dy = pw * 0.75;
    if (s.dots === '3dot' && R.type === 'notch') { const dR = s.relief, dF = s.relief + (R.z - F.z); dy = 0.0075 * k * 0.5 * dF / dR; }
    if (s.dots) box(pw * 0.95, pw * 1.1, 0.0008, GLOW(s.dots === '3dot' ? 0xf2f6ff : 0x7dff9a), 0, y - dy, F.z + d / 2 + 0.0004);
  } else if (F.type === 'bead') {
    // banda ventilada + punto de fibra óptica + punto intermedio
    const zr = s.ribFrom ?? -0.12, len = Math.abs(F.z - zr);
    box(0.008, 0.003, len, body, 0, F.base + 0.0015, (F.z + zr) / 2);
    for (let i = 0; i < 8; i++) box(0.006, y - F.base - 0.003, 0.004, steel, 0, (y + F.base) / 2 - 0.0015, zr - (i + 0.5) * len / 8);
    const bead = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), GLOW(0xff4a22)); bead.position.set(0, y, F.z); g.add(bead);
    const mid = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 10, 6), GLOW(0xe8eef6)); mid.position.set(0, y - 0.0012, (F.z + zr) / 2); g.add(mid);
  }
  markOwn(g, mats);
  return { group: g, spec: s, y, rearZ: R.type === 'none' ? (s.ribFrom ?? 0) : R.z, relief: s.relief };
}
