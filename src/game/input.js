// Entrada de teclado/ratón con pointer lock. También acepta eventos sintéticos (pruebas automáticas).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set(); this.pressed = new Set();
    this.mouse = [false, false, false]; this.mousePressed = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.enabled = false; // sólo durante la partida y sin menús abiertos
    this.textFocus = false;
    addEventListener('keydown', (e) => {
      if (this.textFocus) return;
      if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code !== 'ControlLeft')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse = [false, false, false]; });
    addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouse[e.button] = true; this.mousePressed[e.button] = true;
    });
    addEventListener('mouseup', (e) => { this.mouse[e.button] = false; });
    addEventListener('mousemove', (e) => {
      if (this.locked || this.free) { this.dx += e.movementX || 0; this.dy += e.movementY || 0; }
    });
    addEventListener('wheel', (e) => { if (this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    addEventListener('contextmenu', (e) => { if (this.enabled) e.preventDefault(); });
    this.free = false; // true = acepta movimiento del ratón sin pointer lock (modo prueba)
  }
  get locked() { return document.pointerLockElement === this.canvas; }
  lock() {
    if (this.locked) return;
    const plain = () => { try { const q = this.canvas.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch { /* sin pointer lock */ } };
    try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch { plain(); }
  }
  unlock() { if (this.locked) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mousePressed = [false, false, false]; this.dx = 0; this.dy = 0; this.wheel = 0; }
  reset() { this.keys.clear(); this.pressed.clear(); this.mouse = [false, false, false]; this.endFrame(); }
}
