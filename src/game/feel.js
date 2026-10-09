// V2 · GAME FEEL ("juice") — skill game-feel + animation-principles.
// Todo es transitorio y vive FUERA de la simulación: el temblor mueve sólo la cámara (nunca el cuerpo ni la puntería),
// la micropausa (hit-stop) escala el tiempo de juego con un reloj REAL (si no, nunca saldría de ella) y no bloquea el ratón.
//  · Temblor por TRAUMA: los golpes suman trauma (0–1), decae a 1.2/s y la intensidad es trauma² con ruido suave
//    (suma de senos, no aleatorio por frame, que "zumba").
//  · Niveles de importancia: pequeño / medio / grande. Un paso no recibe el trato de una baja múltiple.
//  · Ajustes de comodidad: "reducir temblor" y "reducir destellos".

// Ruido suave determinista en [-1, 1]
const smooth = (t, s) => (Math.sin(t * 1.0 + s) * 0.5 + Math.sin(t * 2.31 + s * 1.7) * 0.3 + Math.sin(t * 4.67 + s * 2.9) * 0.2);

export const TIERS = {
  small:  { trauma: 0.12, stop: 0,     fov: 0,    flash: 0 },
  medium: { trauma: 0.28, stop: 0.04,  fov: 1.6,  flash: 0 },
  large:  { trauma: 0.5,  stop: 0.075, fov: 3.2,  flash: 0.06 },
};

// Curvas de easing (principio "slow in / slow out" y "overshoot" para los "pops")
export const ease = {
  outCubic: (k) => 1 - Math.pow(1 - k, 3),
  outBack: (k, s = 1.7) => 1 + (s + 1) * Math.pow(k - 1, 3) + s * Math.pow(k - 1, 2),
  outElastic: (k) => k === 0 || k === 1 ? k : Math.pow(2, -10 * k) * Math.sin((k * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
};

export class Feel {
  constructor(app) {
    this.app = app;
    this.trauma = 0; this.t = Math.random() * 100;
    this.stopT = 0;        // micropausa restante (segundos reales)
    this.fovK = 0; this.fovA = 0; this.fovT = 1; // golpe de FOV (se cierra y vuelve con overshoot)
    this.flashEl = null;
  }
  get s() { return this.app.profile.settings; }
  get shakeMul() { return this.s.reduceShake ? 0.3 : 1; }

  add(amount) { this.trauma = Math.min(1, this.trauma + amount * this.shakeMul); }

  // Un evento de juego con su nivel. opts permite afinar (p. ej. trauma extra por un disparo de francotirador)
  hit(tier, opts = {}) {
    const T = TIERS[tier] || TIERS.small;
    this.add(opts.trauma ?? T.trauma);
    const stop = opts.stop ?? T.stop;
    if (stop > 0 && !this.s.reduceShake) this.stopT = Math.max(this.stopT, stop);
    const fov = opts.fov ?? T.fov;
    if (fov > 0) { this.fovA = Math.max(this.fovA * (1 - this.fovT), fov); this.fovT = 0; }
    const fl = opts.flash ?? T.flash;
    if (fl > 0 && !this.s.reduceFlash) this.flash(opts.flashColor || 'rgba(255,255,255,.55)', fl);
  }

  // Destello de bordes (no de pantalla completa: no tapa al enemigo que tienes delante)
  flash(color, dur) {
    if (!this.flashEl) {
      this.flashEl = document.createElement('div'); this.flashEl.className = 'v2-flash';
      document.getElementById('hud').appendChild(this.flashEl);
    }
    const f = this.flashEl; f.style.setProperty('--fc', color);
    if (f.animate) f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: Math.max(60, dur * 1000 * 4), easing: 'cubic-bezier(.2,.7,.3,1)' });
  }

  // Escala de tiempo de juego por la micropausa (la App la multiplica por su propia escala de pausa)
  get timeScale() { return this.stopT > 0 ? 0.06 : 1; }

  // Se llama con dt REAL (no escalado)
  update(dt) {
    this.t += dt;
    if (this.stopT > 0) this.stopT = Math.max(0, this.stopT - dt);
    this.trauma = Math.max(0, this.trauma - 1.2 * dt);
    if (this.fovT < 1) this.fovT = Math.min(1, this.fovT + dt / 0.42);
  }

  // Desplazamiento de cámara en radianes (pitch, yaw, roll). Máx ≈ 0.7° de giro y 1.4° de alabeo con trauma 1.
  offsets() {
    const k = this.trauma * this.trauma, f = 14, t = this.t * f;
    return { pitch: 0.012 * k * smooth(t, 1.3), yaw: 0.012 * k * smooth(t, 7.1), roll: 0.025 * k * smooth(t, 3.7) };
  }

  // Grados que se RESTAN al FOV: entra rápido (anticipación) y vuelve con un pequeño rebote
  fovKick() {
    if (this.fovT >= 1) return 0;
    const k = this.fovT;
    const inK = Math.min(1, k / 0.12);                 // 0 → 1 en los primeros ~50 ms
    const out = k < 0.12 ? 0 : ease.outBack((k - 0.12) / 0.88, 2.2); // 0 → 1 con overshoot
    return this.fovA * (inK - out);
  }
}
