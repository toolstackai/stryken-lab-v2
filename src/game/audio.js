// Sonido 100% sintetizado con WebAudio (sin archivos): disparos, recargas, pasos, impactos, interfaz.
let ctx = null, master = null, sfx = null, echoIn = null, noiseBuf = null, ambient = null, world = null, muffle = null;
let volume = 0.7;
const listener = { x: 0, y: 0, z: 0, yaw: 0 };
let active = 0;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
  sfx = ctx.createGain(); sfx.connect(comp);
  // bus del mundo (sonidos con posición, eco y ambiente): se amortigua en la pausa táctica
  muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.connect(sfx);
  world = ctx.createGain(); world.connect(muffle);
  // eco para disparos (rebote en edificios/contenedores)
  echoIn = ctx.createGain(); echoIn.gain.value = 0.22;
  const dl = ctx.createDelay(1); dl.delayTime.value = 0.14;
  const fb = ctx.createGain(); fb.gain.value = 0.32;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
  echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(world);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
export function setVolume(v) { volume = v; if (master) master.gain.value = v; }
// 0 = normal · 1 = como bajo el agua (pausa)
export function setMuffle(k) {
  if (!ctx) return;
  const t = ctx.currentTime;
  muffle.frequency.setTargetAtTime(20000 * Math.pow(0.03, k), t, 0.12);
  world.gain.setTargetAtTime(1 - 0.45 * k, t, 0.12);
}
export function setListener(x, y, z, yaw) { listener.x = x; listener.y = y; listener.z = z; listener.yaw = yaw; }
export const audioReady = () => !!ctx;

// Nodo de salida con atenuación por distancia, paneo estéreo y filtro de lejanía.
function out(pos, vol = 1, range = 60) {
  const t = ctx.currentTime;
  const g = ctx.createGain();
  if (!pos) { g.gain.value = vol; g.connect(sfx); return { node: g, t, far: 0 }; }
  const dx = pos.x - listener.x, dz = pos.z - listener.z, dy = (pos.y || 0) - listener.y;
  const dist = Math.hypot(dx, dy, dz);
  const att = vol / (1 + (dist / range) * (dist / range) * 4 + dist * 0.02);
  if (att < 0.01) return null;
  g.gain.value = att;
  const pan = ctx.createStereoPanner();
  // ángulo relativo a la vista (adelante = -Z)
  const s = Math.sin(listener.yaw), c = Math.cos(listener.yaw);
  const rx = dx * c - dz * s; // derecha local
  pan.pan.value = Math.max(-0.9, Math.min(0.9, rx / Math.max(1, dist)));
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(700, 16000 / (1 + dist * 0.09));
  g.connect(lp); lp.connect(pan); pan.connect(world);
  return { node: g, t, far: Math.min(1, dist / 80) };
}

function noise(dest, t, dur, { type = 'lowpass', f = 3000, q = 0.7, f2 = null, vol = 1, attack = 0.001 } = {}) {
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(fl); fl.connect(g); g.connect(dest);
  src.start(t, Math.random() * 1.5, dur + 0.05);
  return g;
}
function tone(dest, t, dur, f1, f2, { type = 'sine', vol = 1, attack = 0.002 } = {}) {
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
}

const SHOT = {
  rifle:    { lp: 3600, dec: 0.2, th: 120, thv: 0.9, crack: 0.5, vol: 0.9 },
  smg:      { lp: 4200, dec: 0.12, th: 150, thv: 0.6, crack: 0.45, vol: 0.75 },
  pistol:   { lp: 3400, dec: 0.13, th: 170, thv: 0.6, crack: 0.5, vol: 0.75 },
  heavy:    { lp: 2800, dec: 0.27, th: 95, thv: 1.0, crack: 0.55, vol: 1.0 },
  sniper:   { lp: 2600, dec: 0.55, th: 75, thv: 1.2, crack: 0.8, vol: 1.15 },
  shotgun:  { lp: 2000, dec: 0.38, th: 70, thv: 1.2, crack: 0.4, vol: 1.1 },
  magnum:   { lp: 2600, dec: 0.32, th: 85, thv: 1.1, crack: 0.6, vol: 1.0 },
  launcher: { lp: 700, dec: 0.18, th: 220, thv: 1.0, crack: 0.0, vol: 0.9, thEnd: 55 },
};

export function playShot(type, pos = null) {
  if (!ctx || active > 28) return;
  if (type === 'knife') return play('knife', pos);
  const p = SHOT[type] || SHOT.rifle;
  const o = out(pos, p.vol * (pos ? 1.3 : 0.55), 70);
  if (!o) return;
  active++; setTimeout(() => active--, 400);
  const { node, t, far } = o;
  noise(node, t, p.dec * (1 + far), { f: p.lp * (1 - far * 0.5), vol: 1 });
  if (p.crack) noise(node, t, 0.035, { type: 'highpass', f: 2500, vol: p.crack });
  tone(node, t, 0.14, p.th, p.thEnd || p.th * 0.35, { vol: p.thv });
  if (type === 'sniper' || type === 'shotgun' || type === 'heavy' || type === 'magnum') noise(node, t + 0.02, 0.6, { f: 500, vol: 0.25 });
  node.connect(echoIn);
  // mecanismo (sólo el jugador local lo oye)
  if (!pos && type !== 'launcher') noise(node, t + 0.03, 0.04, { type: 'bandpass', f: 5200, q: 3, vol: 0.12 });
}

// Sonidos varios
export function play(name, pos = null, vol = 1) {
  if (!ctx) return;
  const o = out(pos, vol, 25);
  if (!o) return;
  const { node, t } = o;
  switch (name) {
    case 'magOut': noise(node, t, 0.06, { type: 'bandpass', f: 1800, q: 4, vol: 0.5 }); tone(node, t, 0.05, 900, 500, { type: 'square', vol: 0.06 }); break;
    case 'magIn': noise(node, t, 0.05, { type: 'bandpass', f: 2600, q: 5, vol: 0.6 }); noise(node, t + 0.05, 0.05, { type: 'bandpass', f: 1400, q: 4, vol: 0.5 }); break;
    case 'bolt': noise(node, t, 0.07, { type: 'bandpass', f: 2200, q: 3, vol: 0.5 }); noise(node, t + 0.16, 0.06, { type: 'bandpass', f: 3000, q: 4, vol: 0.5 }); break;
    case 'pump': noise(node, t, 0.09, { type: 'bandpass', f: 1500, q: 2, vol: 0.6 }); noise(node, t + 0.14, 0.08, { type: 'bandpass', f: 1900, q: 3, vol: 0.6 }); break;
    case 'shell': noise(node, t, 0.05, { type: 'bandpass', f: 2300, q: 6, vol: 0.45 }); break;
    case 'draw': noise(node, t, 0.12, { type: 'bandpass', f: 3500, f2: 1800, q: 2, vol: 0.25 }); break;
    case 'empty': tone(node, t, 0.03, 2400, 2000, { type: 'square', vol: 0.08 }); break;
    case 'hit': tone(node, t, 0.05, 1900, 1700, { type: 'triangle', vol: 0.35 }); noise(node, t, 0.03, { type: 'highpass', f: 4000, vol: 0.2 }); break;
    case 'headshot': tone(node, t, 0.25, 2700, 2600, { type: 'sine', vol: 0.4 }); tone(node, t, 0.2, 5400, 5300, { type: 'sine', vol: 0.12 }); break;
    case 'kill': tone(node, t, 0.12, 300, 120, { type: 'sine', vol: 0.6 }); tone(node, t + 0.05, 0.3, 1600, 1500, { type: 'triangle', vol: 0.25 }); break;
    case 'hurt': tone(node, t, 0.12, 160, 70, { vol: 0.6 }); noise(node, t, 0.08, { f: 800, vol: 0.4 }); break;
    case 'death': tone(node, t, 0.5, 220, 50, { type: 'sawtooth', vol: 0.15 }); noise(node, t, 0.3, { f: 600, vol: 0.4 }); break;
    case 'step': noise(node, t, 0.06, { type: 'bandpass', f: 600 + Math.random() * 500, q: 1.2, vol: 0.35 * vol }); break;
    case 'land': noise(node, t, 0.12, { f: 500, vol: 0.5 }); tone(node, t, 0.08, 90, 50, { vol: 0.3 }); break;
    case 'jump': noise(node, t, 0.08, { type: 'bandpass', f: 900, q: 1, vol: 0.2 }); break;
    case 'knife': noise(node, t, 0.18, { type: 'bandpass', f: 1800, f2: 5000, q: 2, vol: 0.5, attack: 0.04 }); break;
    case 'knifeHit': noise(node, t, 0.09, { f: 1200, vol: 0.7 }); tone(node, t, 0.1, 200, 80, { vol: 0.5 }); break;
    case 'impact': noise(node, t, 0.05, { type: 'bandpass', f: 2500 + Math.random() * 1500, q: 2, vol: 0.25 }); break;
    case 'flesh': noise(node, t, 0.07, { f: 900, vol: 0.5 }); break;
    case 'explosion':
      noise(node, t, 1.4, { f: 900, f2: 120, vol: 1.6 }); tone(node, t, 0.6, 90, 28, { vol: 1.4 }); noise(node, t, 0.08, { type: 'highpass', f: 1500, vol: 0.6 });
      node.connect(echoIn); break;
    case 'ui': tone(node, t, 0.06, 900, 1200, { type: 'triangle', vol: 0.15 }); break;
    case 'uiHover': tone(node, t, 0.03, 1500, 1600, { type: 'sine', vol: 0.05 }); break;
    case 'buy': tone(node, t, 0.1, 880, 880, { type: 'triangle', vol: 0.2 }); tone(node, t + 0.1, 0.2, 1320, 1320, { type: 'triangle', vol: 0.2 }); break;
    case 'reward': [660, 880, 1100, 1320].forEach((f, i) => tone(node, t + i * 0.08, 0.25, f, f, { type: 'triangle', vol: 0.18 })); break;
    case 'spawn': tone(node, t, 0.3, 400, 800, { type: 'sine', vol: 0.15 }); break;
    case 'streak': [523, 659, 784].forEach((f, i) => tone(node, t + i * 0.07, 0.3, f, f, { type: 'square', vol: 0.06 })); break;
    case 'heartbeat': tone(node, t, 0.12, 70, 45, { vol: 0.7 }); tone(node, t + 0.16, 0.14, 62, 40, { vol: 0.5 }); break;
    case 'whoosh': noise(node, t, 1.4, { type: 'bandpass', f: 400, f2: 2200, q: 0.8, vol: 0.35, attack: 0.5 }); noise(node, t + 0.6, 1.2, { type: 'bandpass', f: 2200, f2: 300, q: 0.8, vol: 0.25 }); break;
    case 'bodyfall': tone(node, t, 0.35, 120, 45, { vol: 0.9 }); noise(node, t + 0.48, 0.22, { f: 400, vol: 0.7 }); tone(node, t + 0.3, 2.6, 3900, 3700, { type: 'sine', vol: 0.025, attack: 0.4 }); break;
    case 'rewind': noise(node, t, 0.45, { type: 'bandpass', f: 5000, f2: 400, q: 2.5, vol: 0.5 }); [0, 0.08, 0.16, 0.24].forEach(d => tone(node, t + d, 0.06, 1800 - d * 3000, 900 - d * 1500, { type: 'square', vol: 0.05 })); break;
    case 'deploy': noise(node, t, 1.1, { type: 'bandpass', f: 300, f2: 2600, q: 0.7, vol: 0.45, attack: 0.6 }); tone(node, t, 1.0, 180, 720, { type: 'triangle', vol: 0.08, attack: 0.3 }); break;
    case 'deployLand': tone(node, t, 0.4, 95, 40, { vol: 0.8 }); noise(node, t, 0.25, { f: 2400, f2: 300, vol: 0.5 }); node.connect(echoIn); break;
    case 'titleHit': tone(node, t, 1.6, 70, 32, { vol: 1.0 }); noise(node, t, 0.9, { f: 2600, f2: 140, vol: 0.7 }); tone(node, t, 2.2, 880, 870, { type: 'triangle', vol: 0.05, attack: 0.02 }); tone(node, t, 2.2, 1318, 1310, { type: 'sine', vol: 0.035, attack: 0.02 }); node.connect(echoIn); break;
    case 'clunk': noise(node, t, 0.05, { type: 'highpass', f: 1800, vol: 0.6 }); tone(node, t, 0.16, 140, 70, { vol: 0.6 }); noise(node, t + 0.02, 0.12, { f: 700, vol: 0.4 }); break;
    case 'hum': tone(node, t, 1.4, 120, 120, { type: 'sawtooth', vol: 0.035, attack: 0.05 }); tone(node, t, 1.4, 240, 240, { type: 'sine', vol: 0.03, attack: 0.05 }); break;
    case 'mmSearch': [0, 0.35, 0.7].forEach(d => tone(node, t + d, 0.25, 1400, 1400, { type: 'sine', vol: 0.06 })); noise(node, t, 1.2, { type: 'bandpass', f: 800, f2: 2400, q: 3, vol: 0.12, attack: 0.3 }); break;
    case 'mmFound': tone(node, t, 0.9, 80, 40, { vol: 0.9 }); [784, 1175].forEach((f, i) => tone(node, t + i * 0.1, 0.8, f, f, { type: 'triangle', vol: 0.15 })); noise(node, t, 0.5, { f: 3000, f2: 300, vol: 0.4 }); node.connect(echoIn); break;
    case 'mmJoin': tone(node, t, 0.07, 1900 + Math.random() * 400, 1700, { type: 'sine', vol: 0.05 }); break;
    case 'pauseIn': tone(node, t, 0.45, 420, 90, { type: 'sine', vol: 0.25 }); noise(node, t, 0.35, { f: 2400, f2: 200, vol: 0.25 }); break;
    case 'pauseOut': tone(node, t, 0.35, 110, 460, { type: 'sine', vol: 0.22 }); noise(node, t, 0.3, { f: 300, f2: 2600, vol: 0.2, attack: 0.1 }); break;
    // ---- bullet cam (V2) ----
    case 'bulletLaunch': tone(node, t, 0.5, 90, 38, { vol: 0.9 }); noise(node, t, 0.35, { f: 2600, f2: 300, vol: 0.7 }); node.connect(echoIn); break;
    case 'bulletFlight': noise(node, t, 2.6, { type: 'bandpass', f: 520, f2: 160, q: 1.4, vol: 0.55, attack: 0.15 }); tone(node, t, 2.6, 140, 52, { type: 'sawtooth', vol: 0.05, attack: 0.3 }); tone(node, t, 2.4, 3100, 2300, { type: 'sine', vol: 0.02, attack: 0.4 }); break;
    case 'timeFreeze': noise(node, t, 0.9, { type: 'bandpass', f: 300, f2: 4200, q: 3, vol: 0.45, attack: 0.6 }); tone(node, t + 0.55, 0.5, 60, 30, { vol: 0.8 }); break;
    case 'shock': tone(node, t, 1.1, 75, 26, { vol: 1.1 }); noise(node, t, 0.6, { f: 1400, f2: 90, vol: 0.9 }); tone(node, t, 0.12, 1900, 600, { type: 'triangle', vol: 0.15 }); node.connect(echoIn); break;
    case 'shatter': for (let i = 0; i < 9; i++) { const d = i * 0.025 + Math.random() * 0.02; noise(node, t + d, 0.18, { type: 'highpass', f: 2500 + Math.random() * 3000, vol: 0.35 }); tone(node, t + d, 0.15, 2400 + Math.random() * 2600, 900, { type: 'triangle', vol: 0.06 }); } tone(node, t, 0.5, 90, 40, { vol: 0.6 }); break;
    case 'xray': tone(node, t, 1.2, 880, 870, { type: 'square', vol: 0.05, attack: 0.05 }); tone(node, t, 1.2, 1320, 1310, { type: 'sine', vol: 0.06, attack: 0.05 }); noise(node, t, 0.3, { type: 'highpass', f: 6000, vol: 0.25 }); tone(node, t, 0.6, 70, 35, { vol: 0.7 }); break;
    case 'comicPow': tone(node, t, 0.25, 160, 60, { type: 'square', vol: 0.5 }); noise(node, t, 0.3, { f: 3000, f2: 500, vol: 0.8 }); tone(node, t + 0.08, 0.35, 660, 990, { type: 'triangle', vol: 0.18 }); break;
    case 'slowmo': tone(node, t, 1.3, 260, 55, { vol: 0.5, attack: 0.05 }); noise(node, t, 1.4, { f: 900, f2: 120, vol: 0.4, attack: 0.2 }); break;
    case 'killcam': tone(node, t, 0.9, 110, 40, { vol: 0.9 }); noise(node, t, 0.5, { f: 1600, f2: 200, vol: 0.6 }); tone(node, t + 0.02, 1.4, 1320, 1250, { type: 'triangle', vol: 0.08 }); node.connect(echoIn); break;
    case 'medal': tone(node, t, 0.18, 1175, 1175, { type: 'triangle', vol: 0.2 }); tone(node, t + 0.09, 0.4, 1568, 1568, { type: 'triangle', vol: 0.2 }); tone(node, t + 0.09, 0.4, 3136, 3136, { type: 'sine', vol: 0.05 }); break;
    case 'victory': [523, 659, 784, 1047].forEach((f, i) => tone(node, t + i * 0.11, 1.2 - i * 0.1, f, f, { type: 'triangle', vol: 0.16 })); tone(node, t, 1.5, 65, 40, { vol: 0.8 }); node.connect(echoIn); break;
    case 'defeat': [392, 349, 311, 262].forEach((f, i) => tone(node, t + i * 0.16, 1.1, f, f * 0.98, { type: 'triangle', vol: 0.15 })); tone(node, t, 1.6, 55, 35, { vol: 0.7 }); break;
    case 'podium': noise(node, t, 2.5, { f: 300, f2: 2400, vol: 0.18, attack: 1.2 }); tone(node, t + 0.4, 2.5, 196, 196, { type: 'sine', vol: 0.12, attack: 0.8 }); tone(node, t + 0.4, 2.5, 294, 294, { type: 'sine', vol: 0.08, attack: 0.8 }); break;
    case 'count': tone(node, t, 0.025, 1800 + Math.random() * 200, 1800, { type: 'square', vol: 0.03 }); break;
    case 'levelup': [523, 659, 784, 1047, 1319].forEach((f, i) => tone(node, t + i * 0.07, 0.6, f, f, { type: 'triangle', vol: 0.15 })); noise(node, t + 0.3, 0.9, { type: 'highpass', f: 6000, vol: 0.15, attack: 0.1 }); break;
    case 'latch': noise(node, t, 0.05, { type: 'bandpass', f: 2600, q: 5, vol: 0.6 }); tone(node, t, 0.06, 1400, 700, { type: 'square', vol: 0.05 }); noise(node, t + 0.05, 0.08, { type: 'bandpass', f: 900, q: 3, vol: 0.4 }); break;
    case 'tease': tone(node, t, 2.0, 220, 880, { type: 'sawtooth', vol: 0.05, attack: 1.5 }); noise(node, t, 2.0, { type: 'bandpass', f: 300, f2: 3000, q: 1.5, vol: 0.18, attack: 1.6 }); break;
    case 'teaseUp': tone(node, t, 0.5, 660, 1320, { type: 'triangle', vol: 0.16 }); tone(node, t, 0.6, 1320, 1320, { type: 'sine', vol: 0.06 }); break;
    case 'crateOpen': tone(node, t, 0.8, 90, 35, { vol: 1.0 }); noise(node, t, 0.7, { f: 3000, f2: 300, vol: 0.9 }); noise(node, t, 0.05, { type: 'highpass', f: 3000, vol: 0.7 }); node.connect(echoIn); break;
    case 'reveal_common': [523, 659].forEach((f, i) => tone(node, t + i * 0.1, 0.5, f, f, { type: 'triangle', vol: 0.14 })); break;
    case 'reveal_rare': [523, 659, 784].forEach((f, i) => tone(node, t + i * 0.09, 0.7, f, f, { type: 'triangle', vol: 0.15 })); break;
    case 'reveal_epic': [587, 740, 880, 1175].forEach((f, i) => tone(node, t + i * 0.08, 0.9, f, f, { type: 'triangle', vol: 0.15 })); noise(node, t, 1.0, { type: 'highpass', f: 5000, vol: 0.1, attack: 0.2 }); break;
    case 'reveal_legendary': [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(node, t + i * 0.07, 1.3, f, f, { type: 'triangle', vol: 0.16 })); tone(node, t, 2, 65, 65, { vol: 0.5, attack: 0.05 }); noise(node, t + 0.2, 1.6, { type: 'highpass', f: 6000, vol: 0.16, attack: 0.3 }); node.connect(echoIn); break;
    case 'tick': tone(node, t, 0.04, 1000, 1000, { type: 'square', vol: 0.06 }); break;
    case 'pickup': tone(node, t, 0.08, 600, 900, { type: 'triangle', vol: 0.2 }); noise(node, t, 0.06, { type: 'bandpass', f: 2000, q: 3, vol: 0.3 }); break;
    case 'spray': noise(node, t, 0.5, { type: 'highpass', f: 3000, vol: 0.25, attack: 0.05 }); break;
    case 'whiz': noise(node, t, 0.12, { type: 'bandpass', f: 3500, f2: 1500, q: 4, vol: 0.4, attack: 0.03 }); break;
    case 'match': [392, 523, 659, 784].forEach((f, i) => tone(node, t + i * 0.12, 0.5, f, f, { type: 'triangle', vol: 0.15 })); break;
    // ---- battle royale ----
    case 'chute': noise(node, t, 0.09, { type: 'bandpass', f: 900, q: 1.2, vol: 0.9 }); noise(node, t + 0.05, 0.5, { f: 600, f2: 150, vol: 0.5 }); tone(node, t, 0.3, 110, 60, { vol: 0.5 }); break;
    case 'zoneWarn': [0, 0.42].forEach(d => { tone(node, t + d, 0.32, 660, 660, { type: 'square', vol: 0.06, attack: 0.02 }); tone(node, t + d + 0.16, 0.2, 495, 495, { type: 'square', vol: 0.05 }); }); tone(node, t, 1.4, 55, 50, { type: 'sawtooth', vol: 0.12, attack: 0.2 }); break;
    case 'heal': [880, 1108, 1318].forEach((f, i) => tone(node, t + i * 0.07, 0.5, f, f * 1.01, { type: 'sine', vol: 0.06, attack: 0.03 })); noise(node, t, 0.4, { type: 'highpass', f: 5000, vol: 0.06, attack: 0.1 }); break;
    case 'armorBreak': noise(node, t, 0.25, { type: 'highpass', f: 2500, vol: 0.7 }); tone(node, t, 0.4, 1800, 300, { type: 'triangle', vol: 0.2 }); [0.03, 0.07, 0.12].forEach(d => tone(node, t + d, 0.08, 3200 - d * 8000, 2000, { type: 'sine', vol: 0.08 })); break;
    case 'armorUp': tone(node, t, 0.3, 300, 900, { type: 'triangle', vol: 0.12 }); noise(node, t, 0.12, { type: 'bandpass', f: 1200, q: 2, vol: 0.3 }); break;
    case 'armorHit': tone(node, t, 0.07, 2400, 1600, { type: 'triangle', vol: 0.12 }); noise(node, t, 0.05, { type: 'highpass', f: 4000, vol: 0.25 }); break;
  }
}

// Bucles continuos (motor del avión, viento de la caída libre). set(volumen, velocidad) · stop()
export function loopSound(kind) {
  if (!ctx) return { set() {}, stop() {} };
  const g = ctx.createGain(); g.gain.value = 0; g.connect(sfx);
  const nodes = [];
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter();
  src.connect(f); f.connect(g); src.start(); nodes.push(src);
  if (kind === 'plane') {
    f.type = 'lowpass'; f.frequency.value = 320;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; lp.connect(g);
    for (const [fr, v] of [[58, 0.32], [87, 0.2], [116, 0.12]]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; const og = ctx.createGain(); og.gain.value = v; o.connect(og); og.connect(lp); o.start(); nodes.push(o); }
    // batido de las hélices
    const trem = ctx.createGain(); trem.gain.value = 0.8; g.disconnect(); g.connect(trem); trem.connect(sfx);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 9; const lg = ctx.createGain(); lg.gain.value = 0.2; lfo.connect(lg); lg.connect(trem.gain); lfo.start(); nodes.push(lfo);
  } else { f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.5; }
  return {
    set(vol, speed = 0) {
      const t = ctx.currentTime;
      g.gain.setTargetAtTime(vol, t, 0.2);
      if (kind === 'wind') f.frequency.setTargetAtTime(400 + speed * 30, t, 0.2);
    },
    stop() { g.gain.setTargetAtTime(0, ctx.currentTime, 0.25); setTimeout(() => nodes.forEach(n => { try { n.stop(); } catch { /* ya parado */ } }), 1200); },
  };
}

// Ambiente de fondo por mapa (viento, maquinaria...)
export function startAmbient(kind) {
  stopAmbient();
  if (!ctx) return;
  const g = ctx.createGain(); g.gain.value = 0; g.connect(world);
  g.gain.linearRampToValueAtTime(kind === 'foundry' ? 0.07 : 0.05, ctx.currentTime + 2);
  const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = kind === 'foundry' ? 180 : 420;
  src.connect(f); f.connect(g); src.start();
  const nodes = [src];
  if (kind === 'foundry') { const o = ctx.createOscillator(); o.frequency.value = 55; const og = ctx.createGain(); og.gain.value = 0.25; o.connect(og); og.connect(g); o.start(); nodes.push(o); }
  // ráfagas de viento
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg); lg.connect(f.frequency); lfo.start(); nodes.push(lfo);
  ambient = { g, nodes };
}
export function stopAmbient() {
  if (!ambient || !ctx) return;
  const a = ambient; ambient = null;
  a.g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5);
  setTimeout(() => a.nodes.forEach(n => { try { n.stop(); } catch { /* ya parado */ } }), 700);
}
