// Texturas procedurales pintadas en canvas: todo el arte es original y se genera al cargar.
import * as THREE from 'three';
import { WEAPON_SKINS } from '../data/cosmetics.js';

let seed = 1337;
export const rand = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const setSeed = (s) => { seed = s; };
const R = (a, b) => a + rand() * (b - a);

export let maxAniso = 4;
export const setAniso = (a) => { maxAniso = a; };

const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export function shade(c, f) {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return (m(r) << 16) | (m(g) << 8) | m(b);
}
const css = (c, f = 0, a = 1) => { const s = shade(c, f); return `rgba(${(s >> 16) & 255},${(s >> 8) & 255},${s & 255},${a})`; };

function cv(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }

function toTex(c, { repeat = true, srgb = true, nearest = false } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

// Ruido fino (moteado) por píxel.
function speckle(g, w, h, amt, alpha = 1) {
  const d = g.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const n = (rand() - 0.5) * amt * alpha;
    p[i] += n; p[i + 1] += n; p[i + 2] += n;
  }
  g.putImageData(d, 0, 0);
}
// Manchas suaves (suciedad / desgaste).
function blotches(g, w, h, n, color, aMin, aMax, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = rand() * h, r = R(rMin, rMax);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, color.replace('A', R(aMin, aMax).toFixed(3)));
    gr.addColorStop(1, color.replace('A', '0'));
    // dibujar también desplazada para que la textura sea continua al repetirse
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      if (x + ox - r > w || x + ox + r < 0 || y + oy - r > h || y + oy + r < 0) continue;
      g.save(); g.translate(ox, oy); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
    }
  }
}
function streaks(g, w, h, n, color, len) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w, y = R(0, h * 0.3), l = R(len * 0.4, len), ww = R(1, 4);
    const gr = g.createLinearGradient(0, y, 0, y + l);
    gr.addColorStop(0, color.replace('A', R(0.15, 0.4).toFixed(2)));
    gr.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = gr; g.fillRect(x, y, ww, l);
  }
}

const cache = new Map();
const memo = (key, fn) => { if (!cache.has(key)) cache.set(key, fn()); return cache.get(key); };

// ---------- Superficies que se repiten (1 textura = `size` metros) ----------
export const TEX_SIZE = {};

export const asphalt = () => memo('asphalt', () => {
  const [c, g] = cv(512); g.fillStyle = '#55585d'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 30, 'rgba(30,32,36,A)', 0.05, 0.18, 30, 110);
  blotches(g, 512, 512, 20, 'rgba(120,122,126,A)', 0.04, 0.1, 20, 80);
  speckle(g, 512, 512, 34);
  g.strokeStyle = 'rgba(25,26,28,0.5)'; g.lineWidth = 1.2;
  for (let i = 0; i < 7; i++) { g.beginPath(); let x = rand() * 512, y = rand() * 512; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += R(-25, 25); y += R(-25, 25); g.lineTo(x, y); } g.stroke(); }
  return toTex(c);
});
TEX_SIZE.asphalt = 6;

export const concrete = (tint = 0x9c9a94, key = 'concrete') => memo(key + tint, () => {
  const [c, g] = cv(512); g.fillStyle = hex(tint); g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 40, 'rgba(60,58,54,A)', 0.04, 0.14, 20, 90);
  blotches(g, 512, 512, 25, 'rgba(255,255,250,A)', 0.03, 0.08, 20, 70);
  speckle(g, 512, 512, 22);
  g.fillStyle = 'rgba(40,40,40,0.35)'; g.fillRect(0, 0, 512, 2); g.fillRect(0, 0, 2, 512);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, 2, 512, 1); g.fillRect(2, 0, 1, 512);
  return toTex(c);
});
TEX_SIZE.concrete = 4;

// Hierba: base verde con manchas de tonos y briznas cortas
export const grass = () => memo('grass', () => {
  const [c, g] = cv(512); g.fillStyle = '#5f8a3c'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 40, 'rgba(70,110,40,A)', 0.15, 0.35, 30, 120);
  blotches(g, 512, 512, 30, 'rgba(140,160,70,A)', 0.08, 0.2, 20, 90);
  blotches(g, 512, 512, 14, 'rgba(110,95,60,A)', 0.06, 0.14, 15, 50);
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 512, y = rand() * 512, l = 3 + rand() * 5;
    g.strokeStyle = rand() < 0.5 ? 'rgba(40,80,25,0.5)' : 'rgba(150,190,90,0.35)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + R(-1.5, 1.5), y - l); g.stroke();
  }
  return toTex(c);
});
TEX_SIZE.grass = 5;
export const sand = () => memo('sand', () => {
  const [c, g] = cv(512); g.fillStyle = '#d9c49a'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 30, 'rgba(190,165,120,A)', 0.1, 0.25, 20, 100);
  blotches(g, 512, 512, 20, 'rgba(240,228,200,A)', 0.08, 0.2, 20, 80);
  speckle(g, 512, 512, 40);
  return toTex(c);
});
TEX_SIZE.sand = 5;
export const rock = () => memo('rock', () => {
  const [c, g] = cv(512); g.fillStyle = '#8a8a86'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 40, 'rgba(60,62,60,A)', 0.1, 0.3, 20, 100);
  blotches(g, 512, 512, 25, 'rgba(180,180,170,A)', 0.06, 0.16, 15, 70);
  blotches(g, 512, 512, 12, 'rgba(90,110,60,A)', 0.1, 0.25, 15, 60);
  streaks(g, 512, 512, 20, 'rgba(40,40,40,A)', 180);
  speckle(g, 512, 512, 30);
  return toTex(c);
});
TEX_SIZE.rock = 3;

export const paintedWall = (color, key = 'pw') => memo(key + color, () => {
  const [c, g] = cv(512); g.fillStyle = hex(color); g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 30, `rgba(0,0,0,A)`, 0.03, 0.1, 20, 90);
  streaks(g, 512, 512, 18, 'rgba(40,36,30,A)', 220);
  speckle(g, 512, 512, 14);
  return toTex(c);
});

export const brick = (color = 0x8c4a3a) => memo('brick' + color, () => {
  const [c, g] = cv(512); g.fillStyle = '#6d6a64'; g.fillRect(0, 0, 512, 512);
  const bw = 64, bh = 28;
  for (let row = 0; row < 512 / bh + 1; row++) {
    const off = (row % 2) * bw / 2;
    for (let x = -bw; x < 512 + bw; x += bw) {
      g.fillStyle = css(color, R(-0.18, 0.12)); g.fillRect(x + off + 2, row * bh + 2, bw - 4, bh - 4);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + off + 2, row * bh + 2, bw - 4, 3);
    }
  }
  blotches(g, 512, 512, 20, 'rgba(20,18,16,A)', 0.05, 0.15, 30, 90);
  speckle(g, 512, 512, 18);
  return toTex(c);
});
TEX_SIZE.brick = 3;

export const metalPanel = (color = 0x5b6573) => memo('mp' + color, () => {
  const [c, g] = cv(256); g.fillStyle = hex(color); g.fillRect(0, 0, 256, 256);
  const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, 'rgba(0,0,0,0.1)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, 0, 256, 3); g.fillRect(0, 0, 3, 256);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(3, 3, 250, 2); g.fillRect(3, 3, 2, 250);
  for (const [x, y] of [[12, 12], [244, 12], [12, 244], [244, 244], [128, 12], [128, 244]]) {
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x + 1, y + 1, 4, 0, 7); g.fill();
    g.fillStyle = css(color, 0.25); g.beginPath(); g.arc(x, y, 3.5, 0, 7); g.fill();
  }
  blotches(g, 256, 256, 8, 'rgba(0,0,0,A)', 0.04, 0.12, 20, 60);
  speckle(g, 256, 256, 10);
  return toTex(c);
});
TEX_SIZE.metal = 2;

export const treadPlate = () => memo('tread', () => {
  const [c, g] = cv(256); g.fillStyle = '#6d737b'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) for (let x = 0; x < 256; x += 32) {
    const o = (y / 32) % 2 ? 16 : 0;
    g.save(); g.translate(x + o + 8, y + 8); g.rotate((y / 32) % 2 ? 0.8 : -0.8);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-9, -2, 18, 5); g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-9, -3, 18, 4); g.restore();
  }
  blotches(g, 256, 256, 10, 'rgba(30,25,20,A)', 0.05, 0.2, 20, 70);
  speckle(g, 256, 256, 12);
  return toTex(c);
});
TEX_SIZE.tread = 1.6;

export const hazard = () => memo('hazard', () => {
  const [c, g] = cv(128); g.fillStyle = '#f2c230'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1d1d1d';
  for (let i = -128; i < 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 0); g.lineTo(i + 160, 128); g.lineTo(i + 128, 128); g.fill(); }
  speckle(g, 128, 128, 16);
  return toTex(c);
});
TEX_SIZE.hazard = 1;

export const wood = (color = 0xa8743f, key = 'wood') => memo(key + color, () => {
  const [c, g] = cv(256); g.fillStyle = hex(color); g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    g.fillStyle = css(color, R(-0.12, 0.1)); g.fillRect(0, y, 256, 32);
    g.strokeStyle = css(color, -0.25, 0.35);
    for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(0, y + R(3, 29)); g.bezierCurveTo(80, y + R(3, 29), 170, y + R(3, 29), 256, y + R(3, 29)); g.stroke(); }
    g.fillStyle = css(color, -0.45, 0.8); g.fillRect(0, y, 256, 2);
  }
  speckle(g, 256, 256, 12);
  return toTex(c);
});
TEX_SIZE.wood = 2;

// Caja de madera: textura completa por cara (UV 0..1).
export const crate = (color = 0xb07a3e) => memo('crate' + color, () => {
  const [c, g] = cv(256); g.fillStyle = hex(color); g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 42) {
    g.fillStyle = css(color, R(-0.1, 0.08)); g.fillRect(x, 0, 42, 256);
    g.fillStyle = css(color, -0.4, 0.7); g.fillRect(x, 0, 2, 256);
    g.strokeStyle = css(color, -0.25, 0.3);
    for (let k = 0; k < 3; k++) { g.beginPath(); const xx = x + R(6, 36); g.moveTo(xx, 0); g.bezierCurveTo(xx + R(-6, 6), 90, xx + R(-6, 6), 170, xx, 256); g.stroke(); }
  }
  const frame = css(color, -0.2), dark = css(color, -0.55, 0.8);
  g.fillStyle = dark; g.fillRect(0, 0, 256, 30); g.fillRect(0, 226, 256, 30); g.fillRect(0, 0, 30, 256); g.fillRect(226, 0, 30, 256);
  g.fillStyle = frame; g.fillRect(2, 2, 252, 25); g.fillRect(2, 229, 252, 25); g.fillRect(2, 2, 25, 252); g.fillRect(229, 2, 25, 252);
  g.save(); g.translate(128, 128); g.rotate(Math.PI / 4); g.fillStyle = dark; g.fillRect(-170, -15, 340, 30); g.fillStyle = frame; g.fillRect(-170, -12, 340, 24); g.restore();
  g.fillStyle = 'rgba(30,20,10,0.8)';
  for (const [x, y] of [[14, 14], [242, 14], [14, 242], [242, 242]]) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  blotches(g, 256, 256, 8, 'rgba(40,25,10,A)', 0.05, 0.15, 20, 60);
  speckle(g, 256, 256, 14);
  return toTex(c, { repeat: false });
});

// Contenedor marítimo: lado corrugado con letras y número propios.
const LINES = ['NORVAK', 'KAIJO', 'ORBIS', 'TRANSMAR', 'HELIX', 'AZURA'];
export const containerSide = (color, variant = 0) => memo('cs' + color + '_' + variant, () => {
  const W = 1024, H = 448; const [c, g] = cv(W, H);
  g.fillStyle = hex(color); g.fillRect(0, 0, W, H);
  for (let x = 0; x < W; x += 28) {
    const gr = g.createLinearGradient(x, 0, x + 28, 0);
    gr.addColorStop(0, css(color, -0.22)); gr.addColorStop(0.25, css(color, 0.1)); gr.addColorStop(0.5, css(color, 0.04));
    gr.addColorStop(0.75, css(color, -0.12)); gr.addColorStop(1, css(color, -0.25));
    g.fillStyle = gr; g.fillRect(x, 24, 28, H - 48);
  }
  g.fillStyle = css(color, -0.35); g.fillRect(0, 0, W, 24); g.fillRect(0, H - 24, W, 24);
  g.fillStyle = css(color, 0.12); g.fillRect(0, 22, W, 3); g.fillRect(0, H - 26, W, 2);
  g.fillStyle = css(color, -0.45); g.fillRect(0, 0, 18, H); g.fillRect(W - 18, 0, 18, H);
  streaks(g, W, H, 50, 'rgba(110,50,20,A)', 200);
  blotches(g, W, H, 30, 'rgba(0,0,0,A)', 0.04, 0.14, 30, 120);
  blotches(g, W, H, 14, 'rgba(120,60,30,A)', 0.06, 0.2, 10, 40);
  // letras
  g.font = 'bold 110px "Barlow Condensed", Impact, Arial Narrow, sans-serif'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(245,245,240,0.78)';
  const name = LINES[(variant + (color & 7)) % LINES.length];
  if (variant % 3 !== 2) g.fillText(name, 120, H / 2 + 10);
  g.font = 'bold 30px "Barlow Condensed", Arial Narrow, sans-serif'; g.fillStyle = 'rgba(245,245,240,0.65)';
  g.fillText(`${name.slice(0, 2)}U ${100000 + ((color * 7 + variant * 131) % 899999)} 4`, W - 300, 60);
  speckle(g, W, H, 14);
  return toTex(c, { repeat: false });
});
export const containerDoor = (color, variant = 0) => memo('cd' + color + '_' + variant, () => {
  const W = 512, H = 448; const [c, g] = cv(W, H);
  g.fillStyle = css(color, -0.05); g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2; i++) {
    const x0 = 20 + i * 240;
    for (let y = 40; y < H - 40; y += 64) {
      const gr = g.createLinearGradient(0, y, 0, y + 64);
      gr.addColorStop(0, css(color, 0.08)); gr.addColorStop(0.5, css(color, -0.08)); gr.addColorStop(1, css(color, -0.2));
      g.fillStyle = gr; g.fillRect(x0, y, 232, 60);
    }
    g.fillStyle = css(color, -0.45); g.fillRect(x0 + 60, 24, 10, H - 48); g.fillRect(x0 + 160, 24, 10, H - 48);
    g.fillStyle = css(0x888888, 0.1); g.fillRect(x0 + 52, H / 2 - 10, 26, 28); g.fillRect(x0 + 152, H / 2 - 10, 26, 28);
  }
  g.fillStyle = css(color, -0.5); g.fillRect(0, 0, W, 24); g.fillRect(0, H - 24, W, 24); g.fillRect(0, 0, 20, H); g.fillRect(W - 20, 0, 20, H); g.fillRect(W / 2 - 3, 0, 6, H);
  g.font = 'bold 120px "Barlow Condensed", Impact, sans-serif'; g.fillStyle = 'rgba(240,240,235,0.7)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const code = ['NV', 'KJ', 'OB', 'TM', 'HX', 'AZ'][variant % 6] + '\n' + (10 + ((color + variant * 17) % 89));
  const [a, b] = code.split('\n');
  g.fillText(a, 380, 160); g.fillText(b, 380, 280);
  g.font = 'bold 26px "Barlow Condensed", sans-serif'; g.textAlign = 'left'; g.fillText('MAX GROSS 30480 KG', 40, 70); g.fillText('TARE 2200 KG', 40, 100);
  streaks(g, W, H, 25, 'rgba(110,50,20,A)', 180);
  speckle(g, W, H, 14);
  return toTex(c, { repeat: false });
});
export const containerInside = () => memo('cin', () => {
  const [c, g] = cv(256); g.fillStyle = '#3a4250'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = x % 32 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.18)'; g.fillRect(x, 0, 8, 256); }
  blotches(g, 256, 256, 10, 'rgba(0,0,0,A)', 0.05, 0.2, 20, 60);
  speckle(g, 256, 256, 10);
  return toTex(c);
});
TEX_SIZE.cin = 2;
export const plywood = () => memo('ply', () => {
  const [c, g] = cv(256); g.fillStyle = '#8a6a44'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 21) { g.fillStyle = css(0x8a6a44, R(-0.12, 0.08)); g.fillRect(0, y, 256, 20); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y + 20, 256, 1); }
  speckle(g, 256, 256, 14);
  return toTex(c);
});
TEX_SIZE.ply = 2;

// ---------- Santuario ----------
export const stoneTiles = (color = 0xb9b2a4) => memo('stone' + color, () => {
  const [c, g] = cv(512); g.fillStyle = '#5c5850'; g.fillRect(0, 0, 512, 512);
  const s = 128;
  for (let y = 0; y < 512; y += s) for (let x = 0; x < 512; x += s) {
    g.fillStyle = css(color, R(-0.12, 0.08)); g.fillRect(x + 3, y + 3, s - 6, s - 6);
    g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 3, y + 3, s - 6, 3);
  }
  blotches(g, 512, 512, 30, 'rgba(40,40,30,A)', 0.04, 0.12, 20, 80);
  speckle(g, 512, 512, 20);
  return toTex(c);
});
TEX_SIZE.stone = 4;
export const roofTiles = (color = 0x2f7d6b) => memo('roof' + color, () => {
  const [c, g] = cv(256); g.fillStyle = css(color, -0.4); g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 32) {
    const gr = g.createLinearGradient(x, 0, x + 32, 0);
    gr.addColorStop(0, css(color, -0.35)); gr.addColorStop(0.5, css(color, 0.15)); gr.addColorStop(1, css(color, -0.35));
    g.fillStyle = gr; g.fillRect(x + 1, 0, 30, 256);
  }
  for (let y = 0; y < 256; y += 32) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, y, 256, 3); }
  speckle(g, 256, 256, 10);
  return toTex(c);
});
TEX_SIZE.roof = 2;
export const plaster = (color = 0xe8dcc4) => memo('plaster' + color, () => {
  const [c, g] = cv(256); g.fillStyle = hex(color); g.fillRect(0, 0, 256, 256);
  blotches(g, 256, 256, 18, 'rgba(120,100,70,A)', 0.04, 0.12, 20, 70);
  streaks(g, 256, 256, 10, 'rgba(90,80,60,A)', 120);
  speckle(g, 256, 256, 10);
  return toTex(c);
});
TEX_SIZE.plaster = 3;

// ---------- Interior / fábrica ----------
export const factoryFloor = () => memo('ffloor', () => {
  const [c, g] = cv(512); g.fillStyle = '#6b727b'; g.fillRect(0, 0, 512, 512);
  blotches(g, 512, 512, 40, 'rgba(20,22,26,A)', 0.05, 0.2, 20, 100);
  blotches(g, 512, 512, 10, 'rgba(90,70,40,A)', 0.05, 0.12, 30, 80);
  speckle(g, 512, 512, 18);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 512, 2); g.fillRect(0, 0, 2, 512); g.fillRect(256, 0, 1, 512); g.fillRect(0, 256, 512, 1);
  return toTex(c);
});
TEX_SIZE.ffloor = 6;

// ---------- Letreros ----------
export function signTexture(text, { bg = '#1f3b2a', fg = '#7dffa0', w = 512, h = 192, border = '#c9d1c9', glow = true, font = 'bold 130px "Barlow Condensed", Impact, sans-serif' } = {}) {
  return memo('sign' + text + bg + fg + w + h, () => {
    const [c, g] = cv(w, h);
    g.fillStyle = border; g.fillRect(0, 0, w, h);
    g.fillStyle = bg; g.fillRect(10, 10, w - 20, h - 20);
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (glow) { g.shadowColor = fg; g.shadowBlur = 24; }
    g.fillStyle = fg; g.fillText(text, w / 2, h / 2 + 6);
    return toTex(c, { repeat: false });
  });
}
export function paperTexture(lines, tint = '#efe6cf') {
  return memo('paper' + lines.join() + tint, () => {
    const [c, g] = cv(128, 160); g.fillStyle = tint; g.fillRect(0, 0, 128, 160);
    g.fillStyle = '#5a4a3a'; g.font = 'bold 18px Arial'; g.textAlign = 'center';
    lines.forEach((l, i) => g.fillText(l, 64, 28 + i * 22));
    g.fillStyle = 'rgba(60,40,20,0.35)';
    for (let i = 0; i < 4; i++) g.fillRect(16, 100 + i * 12, R(60, 96), 4);
    speckle(g, 128, 160, 16);
    return toTex(c, { repeat: false });
  });
}

// Graffiti / spray del jugador.
export function sprayTexture(text = 'GG', color = '#3fe0ff') {
  return memo('spray' + text + color, () => {
    const [c, g] = cv(256); g.clearRect(0, 0, 256, 256);
    g.translate(128, 128); g.rotate(-0.15);
    g.font = 'italic 900 100px "Barlow Condensed", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 18;
    g.lineWidth = 12; g.strokeStyle = 'rgba(10,10,20,0.9)'; g.strokeText(text, 0, 0);
    g.fillStyle = color; g.fillText(text, 0, 0);
    g.shadowBlur = 0;
    for (let i = 0; i < 40; i++) { g.fillStyle = color; g.globalAlpha = 0.5; g.beginPath(); g.arc(R(-110, 110), R(-70, 70), R(0.5, 2.5), 0, 7); g.fill(); }
    for (let i = 0; i < 6; i++) { g.globalAlpha = 0.6; g.fillRect(R(-80, 80), R(20, 40), 3, R(10, 50)); }
    return toTex(c, { repeat: false });
  });
}

// Camuflaje de arma.
export function camoTexture(id) {
  const s = WEAPON_SKINS[id] || WEAPON_SKINS.factory;
  return memo('camo' + id, () => {
    const [c, g] = cv(256); const col = s.colors;
    g.fillStyle = hex(col[0]); g.fillRect(0, 0, 256, 256);
    if (s.pattern === 'blobs') {
      for (let k = 1; k < col.length; k++) for (let i = 0; i < 26; i++) {
        g.fillStyle = hex(col[k]); g.beginPath();
        const x = rand() * 256, y = rand() * 256, r = R(10, 30);
        for (let a = 0; a < 7; a += 0.7) { const rr = r * R(0.6, 1.3); g.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr); }
        g.fill();
      }
    } else if (s.pattern === 'stripes') {
      g.fillStyle = hex(col[1]);
      for (let i = 0; i < 18; i++) { const y = rand() * 256; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(80, y + R(-30, 30), 160, y + R(-30, 30), R(120, 256), y + R(-10, 10)); g.lineTo(R(80, 200), y + R(4, 12)); g.closePath(); g.fill(); }
    } else if (s.pattern === 'pixels') {
      for (let y = 0; y < 256; y += 16) for (let x = 0; x < 256; x += 16) { g.fillStyle = hex(col[Math.floor(rand() * col.length)]); g.fillRect(x, y, 16, 16); }
    } else if (s.pattern === 'waves') {
      for (let y = -20; y < 280; y += 22) { g.strokeStyle = hex(col[1 + (y / 22 & 1)]); g.lineWidth = 9; g.beginPath(); for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x / 20 + y) * 8); g.stroke(); }
    } else if (s.pattern === 'web') {
      g.strokeStyle = hex(col[1]); g.lineWidth = 3;
      for (let a = 0; a < 6.28; a += 0.5) { g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 200, 128 + Math.sin(a) * 200); g.stroke(); }
      for (let r = 20; r < 200; r += 26) { g.beginPath(); for (let a = 0; a <= 6.3; a += 0.5) g.lineTo(128 + Math.cos(a) * r, 128 + Math.sin(a) * r); g.stroke(); }
    } else if (s.pattern === 'gold') {
      const gr = g.createLinearGradient(0, 0, 256, 256);
      gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.35, hex(col[0])); gr.addColorStop(0.7, hex(col[1])); gr.addColorStop(1, '#fff0a0');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(120,80,0,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(rand() * 256, rand() * 256, R(10, 40), 0, 7); g.stroke(); }
    } else if (s.pattern === 'grid') {
      g.lineWidth = 3;
      for (let i = 0; i <= 256; i += 32) { g.strokeStyle = hex(col[1]); g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.strokeStyle = hex(col[2]); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    }
    if (s.pattern !== 'solid') speckle(g, 256, 256, 10);
    else { blotches(g, 256, 256, 10, 'rgba(255,255,255,A)', 0.02, 0.05, 10, 40); speckle(g, 256, 256, 8); }
    return toTex(c);
  });
}

// Cielo degradado vertical (para la esfera del cielo).
export function skyTexture(top, mid, bottom) {
  return memo('sky' + top + mid + bottom, () => {
    const [c, g] = cv(4, 512);
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, top); gr.addColorStop(0.48, mid); gr.addColorStop(0.53, bottom); gr.addColorStop(1, bottom);
    g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
    return toTex(c, { repeat: false });
  });
}

// Pequeño punto/brillo radial para chispas y fogonazos.
export const glowSprite = () => memo('glow', () => {
  const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,200,0.8)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
});
export const muzzleSprite = () => memo('muzzle', () => {
  const [c, g] = cv(128); g.translate(64, 64);
  for (let i = 0; i < 7; i++) {
    g.rotate(Math.PI * 2 / 7 + R(-0.2, 0.2));
    const gr = g.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, 'rgba(255,255,230,1)'); gr.addColorStop(0.4, 'rgba(255,200,80,0.9)'); gr.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(R(40, 62), 0); g.lineTo(0, 7); g.fill();
  }
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill();
  return toTex(c, { repeat: false });
});
export const smokeSprite = () => memo('smoke', () => {
  const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.8)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
});
export const bulletHoleTex = () => memo('hole', () => {
  const [c, g] = cv(64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.2, 'rgba(10,10,10,0.95)'); gr.addColorStop(0.35, 'rgba(40,35,30,0.6)'); gr.addColorStop(1, 'rgba(40,35,30,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return toTex(c, { repeat: false });
});
export const scorchTex = () => memo('scorch', () => {
  const [c, g] = cv(128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  gr.addColorStop(0, 'rgba(10,8,6,0.9)'); gr.addColorStop(0.6, 'rgba(20,16,12,0.5)'); gr.addColorStop(1, 'rgba(20,16,12,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return toTex(c, { repeat: false });
});

// Sombra de contacto (oclusión ambiental falsa) bajo objetos: rectángulo difuminado.
export const aoTexture = () => memo('ao', () => {
  const [c, g] = cv(128); g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 26; i++) {
    const inset = 2 + i * 1.9;
    g.fillStyle = 'rgba(0,0,0,0.055)';
    const r = Math.max(2, 26 - i);
    g.beginPath(); g.roundRect(inset, inset, 128 - inset * 2, 128 - inset * 2, r); g.fill();
  }
  return toTex(c, { repeat: false, srgb: false });
});
// Franja de sombra para muros largos (degradado sólo a lo ancho).
export const aoStripTexture = () => memo('aostrip', () => {
  const [c, g] = cv(4, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.32, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.9)'); gr.addColorStop(0.68, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  return toTex(c, { repeat: false, srgb: false });
});
