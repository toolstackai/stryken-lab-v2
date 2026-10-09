// Efectos: trazadoras, chispas, agujeros de bala, sangre, explosiones, sprays, fogonazos en tercera persona.
import * as THREE from 'three';
import { glowSprite, muzzleSprite, smokeSprite, bulletHoleTex, scorchTex, sprayTexture } from './textures.js';

const UP = new THREE.Vector3(0, 0, 1);
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); scene.add(this.root);
    this.parts = [];
    // trazadoras
    this.tracerGeo = new THREE.BoxGeometry(1, 1, 1); this.tracerGeo.translate(0, 0, -0.5); this.tracerGeo.userData.shared = true;
    this.tracers = [];
    // pool de sprites
    this.sprites = [];
    for (let i = 0; i < 160; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; this.root.add(s); this.sprites.push(s);
    }
    this.si = 0;
    // decals
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.holeMat = new THREE.MeshBasicMaterial({ map: bulletHoleTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.scorchMat = new THREE.MeshBasicMaterial({ map: scorchTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0x8a0d0d, map: scorchTex(), transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    // marcas en paredes/suelo: 3 mallas instanciadas en anillo (antes: hasta 90 mallas = 90 draw calls)
    this.decalSets = new Map();
    for (const [mat, n] of [[this.holeMat, 140], [this.scorchMat, 24], [this.bloodMat, 40]]) {
      const im = new THREE.InstancedMesh(this.decalGeo, mat, n); im.count = 0; im.frustumCulled = false; im.renderOrder = 1;
      this.root.add(im); this.decalSets.set(mat, { im, n, i: 0, used: 0 });
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._rz = new THREE.Quaternion(); this._z = new THREE.Vector3(0, 0, 1);
    this.tracerPool = [];
    this.debrisGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 9, 2); scene.add(this.flashLight);
    this.flashT = 0;
  }

  sprite(tex, blending = THREE.AdditiveBlending) {
    const s = this.sprites[this.si++ % this.sprites.length];
    s.material.map = tex; s.material.blending = blending; s.material.opacity = 1; s.material.color.setRGB(1, 1, 1); s.material.rotation = Math.random() * 6.28;
    s.visible = true;
    // generación del sprite: si se reutiliza, la partícula anterior lo detecta y muere (sin buscar en la lista)
    s.userData.gen = (s.userData.gen || 0) + 1;
    return s;
  }

  tracer(from, to, color = 0xffe9a8, width = 0.025) {
    const d = from.distanceTo(to);
    if (d < 0.5) return;
    // trazadoras reutilizadas (antes se creaba un material nuevo por bala → basura y tirones)
    const m = this.tracerPool.pop() || new THREE.Mesh(this.tracerGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.material.color.set(color); m.material.opacity = 0.9; m.visible = true;
    m.position.copy(from); m.lookAt(to);
    const len = Math.min(d, 6);
    m.scale.set(width, width, len);
    if (m.parent !== this.root) this.root.add(m);
    const speed = 380;
    const dir = to.clone().sub(from).normalize();
    let travelled = 0;
    this.parts.push({ obj: m, life: d / speed + 0.02, own: true, update: (p, dt) => {
      travelled += speed * dt;
      const t = Math.min(travelled, d);
      m.position.copy(from).addScaledVector(dir, t);
      m.scale.z = Math.min(len, t);
      if (t >= d) m.material.opacity *= 0.5;
    } });
  }

  muzzle(pos, big = 1) {
    const s = this.sprite(muzzleSprite());
    s.position.copy(pos); s.scale.setScalar(0.5 * big);
    this.parts.push({ obj: s, life: 0.05, update: (p) => { s.material.opacity = p.life / 0.05; } });
    this.flashLight.position.copy(pos); this.flashLight.intensity = 6 * big; this.flashT = 0.05;
  }

  impact(pos, normal, kind = 'world') {
    // chispas + polvo
    const n = kind === 'world' ? 5 : 0;
    for (let i = 0; i < n; i++) {
      const s = this.sprite(glowSprite());
      s.position.copy(pos); s.scale.setScalar(0.06);
      const v = new THREE.Vector3(normal.x + (Math.random() - 0.5) * 1.4, normal.y + Math.random() * 0.8, normal.z + (Math.random() - 0.5) * 1.4).multiplyScalar(3 + Math.random() * 4);
      this.parts.push({ obj: s, life: 0.25 + Math.random() * 0.15, update: (p, dt) => { v.y -= 14 * dt; s.position.addScaledVector(v, dt); s.material.opacity = Math.min(1, p.life * 5); } });
    }
    const d = this.sprite(smokeSprite(), THREE.NormalBlending);
    d.material.color.setRGB(0.75, 0.72, 0.68); d.position.copy(pos).addScaledVector(normal, 0.08); d.scale.setScalar(0.25);
    this.parts.push({ obj: d, life: 0.5, update: (p, dt) => { d.scale.multiplyScalar(1 + dt * 2.5); d.position.y += dt * 0.3; d.material.opacity = p.life * 1.2; } });
    if (kind === 'world') this.decal(pos, normal, this.holeMat, 0.11 + Math.random() * 0.04);
  }

  blood(pos, dir) {
    for (let i = 0; i < 6; i++) {
      const s = this.sprite(smokeSprite(), THREE.NormalBlending);
      s.material.color.setRGB(0.65 + Math.random() * 0.2, 0.03, 0.03);
      s.position.copy(pos); s.scale.setScalar(0.12 + Math.random() * 0.1);
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5), dir.y + Math.random() * 0.6, dir.z + (Math.random() - 0.5)).multiplyScalar(1.5 + Math.random() * 2);
      this.parts.push({ obj: s, life: 0.4, update: (p, dt) => { v.y -= 9 * dt; s.position.addScaledVector(v, dt); s.material.opacity = p.life * 2.5; } });
    }
  }

  explosion(pos) {
    const f = this.sprite(muzzleSprite()); f.position.copy(pos); f.scale.setScalar(1);
    this.parts.push({ obj: f, life: 0.25, update: (p, dt) => { f.scale.multiplyScalar(1 + dt * 18); f.material.opacity = p.life * 4; } });
    for (let i = 0; i < 10; i++) {
      const s = this.sprite(glowSprite());
      s.material.color.setRGB(1, 0.55 + Math.random() * 0.3, 0.2);
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 1.5)); s.scale.setScalar(1.2 + Math.random());
      const life = 0.35 + Math.random() * 0.25;
      this.parts.push({ obj: s, life, update: (p, dt) => { s.scale.multiplyScalar(1 + dt * 2); s.position.y += dt * 1.5; s.material.opacity = p.life / life; } });
    }
    for (let i = 0; i < 14; i++) {
      const s = this.sprite(smokeSprite(), THREE.NormalBlending);
      const dark = 0.25 + Math.random() * 0.2; s.material.color.setRGB(dark, dark, dark);
      s.position.copy(pos); s.scale.setScalar(1 + Math.random());
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).multiplyScalar(5);
      this.parts.push({ obj: s, life: 1.4 + Math.random(), update: (p, dt) => { v.multiplyScalar(1 - dt * 2.2); s.position.addScaledVector(v, dt); s.scale.multiplyScalar(1 + dt * 0.8); s.material.opacity = Math.min(0.85, p.life * 0.6); } });
    }
    for (let i = 0; i < 18; i++) {
      const s = this.sprite(glowSprite()); s.position.copy(pos); s.scale.setScalar(0.12);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 8);
      this.parts.push({ obj: s, life: 0.5 + Math.random() * 0.4, update: (p, dt) => { v.y -= 15 * dt; s.position.addScaledVector(v, dt); } });
    }
    this.flashLight.position.copy(pos); this.flashLight.intensity = 40; this.flashT = 0.15;
    this.decal(pos.clone().setY(pos.y), new THREE.Vector3(0, 1, 0), this.scorchMat, 3.2);
  }

  smokePuff(pos, scale = 0.3) {
    const s = this.sprite(smokeSprite(), THREE.NormalBlending);
    s.material.color.setRGB(0.8, 0.8, 0.8); s.position.copy(pos); s.scale.setScalar(scale);
    this.parts.push({ obj: s, life: 0.7, update: (p, dt) => { s.scale.multiplyScalar(1 + dt * 1.5); s.material.opacity = p.life * 0.8; } });
  }

  decal(pos, normal, mat, size) {
    const set = this.decalSets.get(mat); if (!set) return null;
    this._q.setFromUnitVectors(UP, normal).multiply(this._rz.setFromAxisAngle(this._z, Math.random() * 6.28));
    this._p.copy(pos).addScaledVector(normal, 0.012);
    this._m.compose(this._p, this._q, this._s.setScalar(size));
    set.im.setMatrixAt(set.i, this._m);
    set.i = (set.i + 1) % set.n; set.used = Math.min(set.n, set.used + 1);
    set.im.count = set.used; set.im.instanceMatrix.needsUpdate = true;
    return null;
  }

  spray(pos, normal, text, color) {
    const mat = new THREE.MeshBasicMaterial({ map: sprayTexture(text, color), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -5 });
    const m = new THREE.Mesh(this.decalGeo, mat);
    m.position.copy(pos).addScaledVector(normal, 0.02);
    m.quaternion.setFromUnitVectors(UP, normal);
    if (Math.abs(normal.y) > 0.7) m.rotateZ(Math.random() * 6.28);
    m.scale.setScalar(1.6);
    this.root.add(m);
    if (this.lastSpray) this.root.remove(this.lastSpray);
    this.lastSpray = m;
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (!p.own) { if (p.gen === undefined) p.gen = p.obj.userData.gen; else if (p.gen !== p.obj.userData.gen) { this.parts.splice(i, 1); continue; } }
      if (p.life <= 0) {
        if (p.own) { this.root.remove(p.obj); p.obj.visible = false; this.tracerPool.push(p.obj); }
        else p.obj.visible = false;
        this.parts.splice(i, 1); continue;
      }
      p.update(p, dt);
    }
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flashLight.intensity = 0; }
  }

  clear() {
    for (const p of this.parts) { if (p.own) { this.root.remove(p.obj); this.tracerPool.push(p.obj); } else p.obj.visible = false; }
    this.parts = [];
    for (const set of this.decalSets.values()) { set.im.count = 0; set.i = 0; set.used = 0; }
  }
}
