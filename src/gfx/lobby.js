// Escena 3D del lobby: búnker/almacén con el soldado del jugador en el centro (y su party a los lados).
import * as THREE from 'three';
import * as T from './textures.js';
import { Batcher, trs } from './geo.js';
import { makeSoldier, poseSoldier, stdMat } from './models.js';
import { mat } from './world.js';
import { makeEnv } from './env.js';

export class Lobby {
  constructor(renderer) {
    const scene = this.scene = new THREE.Scene();
    scene.environment = makeEnv(renderer, '#5c6e64', '#7a8a80', '#3a3a35'); scene.environmentIntensity = 0.45;
    scene.background = new THREE.Color(0x1a2026);
    scene.fog = new THREE.Fog(0x1a2026, 9, 22);
    this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 60);
    this.camera.position.set(0, 1.55, 5.6);
    this.look = new THREE.Vector3(0, 1.05, 0);
    this.build();
    this.soldiers = [];
    this.t = 0; this.spin = 0; this.spinV = 0;
    // cámara cinemática: pose actual que persigue a la del "plano" activo
    this.cam = { pos: new THREE.Vector3(0, 1.4, 4.4), look: new THREE.Vector3(0, 1.05, 0), fov: 50 };
    this.shot = 'home';
    this.cine = null; this.cineSpin = 0; this.lid = 0; this.walk = 0;
    this.packLight = new THREE.PointLight(0xffd59a, 0, 1.5, 1.5); this.scene.add(this.packLight);
    // efecto de cambio de skin: anillo de escaneo que recorre el cuerpo + destello
    this.scanMat = new THREE.MeshBasicMaterial({ color: 0x2fc6d8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.scan = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.025, 6, 48), this.scanMat); this.scan.rotation.x = Math.PI / 2; this.scene.add(this.scan);
    this.scanDisc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2fc6d8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.scene.add(this.scanDisc);
    this.swapLight = new THREE.PointLight(0x2fc6d8, 0, 4, 1.5); this.scene.add(this.swapLight);
    this.swapT = 1;
  }

  // Planos de cámara de cada sección del menú (la cámara viaja suavemente entre ellos)
  static SHOTS = {
    home:    { pos: [0, 1.4, 4.4], look: [0, 1.05, 0], fov: 50 },
    title:   { pos: [-1.5, 0.45, 3.4], look: [-0.85, 1.38, 0], fov: 40 },
    // matchmaking: la cámara se acerca despacio al soldado mientras se busca partida
    mm:      { pos: [-0.7, 1.5, 3.0], look: [0.35, 1.2, 0], fov: 40 },
    // hoja de servicio: el soldado a la derecha, el panel a la izquierda
    record:  { pos: [-0.7, 1.45, 4.3], look: [0, 1.0, 0], fov: 40, side: -0.98 },
    profile: { pos: [0.75, 1.62, 1.75], look: [-0.05, 1.5, 0], fov: 38 },
    // side: desplazamiento lateral por aspecto para que el soldado quede en el hueco libre a la izquierda del panel
    store:   { pos: [0.8, 1.45, 4.7], look: [0, 0.98, 0], fov: 42, side: 0.98 },
    center:  { pos: [-1.6, 1.85, 0.4], look: [-2.5, 1.9, -3.9], fov: 44 },
    settings:{ pos: [2.6, 2.2, 1.6], look: [5.0, 3.4, -3.4], fov: 46 },
  };
  setShot(name) { if (!this.cine) this.shot = name; }
  swapFx(color = '#2fc6d8') { this.swapT = 0; const c = new THREE.Color(color); this.scanMat.color.copy(c); this.scanDisc.material.color.copy(c); this.swapLight.color.copy(c); }

  // Cinemáticas guionizadas: 'bag' (inventario en la mochila) y 'deploy' (salir por la puerta).
  // dir = 1 hacia delante, -1 en reversa. onDone se llama al terminar.
  playCine(name, dir = 1, onDone = null) {
    if (dir < 0 && this.cine && this.cine.name === name) { this.cine.dir = -1; this.cine.finished = false; this.cine.onDone = onDone; this.cine.speed = 1.5; return; }
    const dur = name === 'bag' ? 2.6 : name === 'return' ? 3.0 : 3.2;
    const s0 = this.soldiers[0];
    // posición final de la mochila (con el soldado ya girado de espaldas)
    const keep = s0.root.rotation.y;
    s0.root.rotation.y = Math.PI * 2; s0.root.updateMatrixWorld(true);
    const pack = s0.pack.getWorldPosition(new THREE.Vector3());
    s0.root.rotation.y = keep; s0.root.updateMatrixWorld(true);
    const out = new THREE.Vector3(pack.x, 0, pack.z).sub(new THREE.Vector3(s0.root.position.x, 0, s0.root.position.z)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const from = { pos: this.cam.pos.clone(), look: this.cam.look.clone(), fov: this.cam.fov };
    let path;
    if (name === 'bag') {
      const P = (o, u) => pack.clone().addScaledVector(out, o).addScaledVector(up, u);
      path = {
        pos: new THREE.CatmullRomCurve3([from.pos, P(1.5, 0.2), P(0.75, 0.3), P(0.18, 0.62), P(0.02, 0.2)]),
        look: new THREE.CatmullRomCurve3([from.look, P(0, 0), P(0, 0.08), P(0, -0.05), P(0, -0.4)]),
        fov: [from.fov, 42, 40, 48, 78],
      };
    } else if (name === 'return') {
      // regreso: entra por la puerta mirando a cámara; la cámara retrocede hasta el plano principal
      path = {
        pos: new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, 1.55, -0.8), new THREE.Vector3(0.7, 1.6, 0.9), new THREE.Vector3(0.3, 1.45, 3.0), new THREE.Vector3(0, 1.4, 4.4)]),
        look: new THREE.CatmullRomCurve3([new THREE.Vector3(0.3, 1.4, -4.5), new THREE.Vector3(0.25, 1.35, -2.5), new THREE.Vector3(0.1, 1.15, -0.4), new THREE.Vector3(0, 1.05, 0)]),
        fov: [56, 52, 50, 50],
      };
    } else {
      // deploy: el soldado camina hacia la puerta; la cámara lo sigue por encima del hombro
      path = {
        pos: new THREE.CatmullRomCurve3([from.pos, new THREE.Vector3(1.4, 1.7, 2.6), new THREE.Vector3(0.9, 1.75, 0.9), new THREE.Vector3(0.6, 1.7, -0.8), new THREE.Vector3(0.35, 1.6, -2.3)]),
        look: new THREE.CatmullRomCurve3([from.look, new THREE.Vector3(0, 1.3, 0), new THREE.Vector3(0.2, 1.5, -2), new THREE.Vector3(0.3, 1.4, -4), new THREE.Vector3(0.3, 1.3, -6)]),
        fov: [from.fov, 46, 50, 58, 75],
      };
    }
    this.seen = this.seen || {};
    const speed = this.seen[name] ? 1.7 : 1; this.seen[name] = true;
    this.cine = { name, dir, t: dir > 0 ? 0 : dur, dur, path, onDone, from, speed };
  }

  updateCine(dt) {
    const c = this.cine, s0 = this.soldiers[0];
    c.t = Math.max(0, Math.min(c.dur, c.t + dt * c.dir * (c.speed || 1)));
    const k = c.t / c.dur;
    const ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const u = ss(0, 1, k);
    // cámara a lo largo del spline
    this.cam.pos.copy(c.path.pos.getPoint(u)); this.cam.look.copy(c.path.look.getPoint(u));
    const f = c.path.fov, seg = Math.min(f.length - 2, Math.floor(u * (f.length - 1))), lt = u * (f.length - 1) - seg;
    this.cam.fov = f[seg] + (f[seg + 1] - f[seg]) * lt;
    if (c.name === 'bag') {
      this.cineSpin = ss(0, 0.36, k) * Math.PI;
      this.lid = ss(0.42, 0.72, k);
      this.packLight.intensity = ss(0.5, 0.85, k) * 2.5;
      s0.pack.getWorldPosition(this.packLight.position); this.packLight.position.y += 0.15;
    } else if (c.name === 'return') {
      this.cineSpin = 0;
      this.walk = 1 - ss(0.08, 0.78, k);
      const d = 1 - ss(0.7, 0.92, k);
      this.door.rotation.y = -d * 1.6;
      this.doorLight.intensity = d * 60;
    } else {
      // girar hacia la puerta, caminar y abrir
      this.cineSpin = ss(0, 0.2, k) * Math.PI;
      this.walk = ss(0.15, 0.95, k);
      const d = ss(0.45, 0.75, k);
      this.door.rotation.y = -d * 1.6;
      this.doorLight.intensity = d * 60;
    }
    this.cineK = k;
    if ((c.dir > 0 && c.t >= c.dur) || (c.dir < 0 && c.t <= 0)) {
      const done = c.onDone; this.cine = c.dir > 0 ? { ...c, finished: true } : null;
      if (c.dir < 0) { this.cineSpin = 0; this.lid = 0; this.walk = 0; this.door.rotation.y = 0; this.doorLight.intensity = 0; this.packLight.intensity = 0; }
      if (done) done();
    }
  }
  // Saltar: lleva la cinemática a su final
  skipCine() { const c = this.cine; if (c && !c.finished) c.t = c.dir > 0 ? c.dur : 0; }
  resetCine() { this.cine = null; this.cineSpin = 0; this.lid = 0; this.walk = 0; this.door.rotation.y = 0; this.doorLight.intensity = 0; this.packLight.intensity = 0; this.shot = 'home'; }

  build() {
    const B = new Batcher();
    const wallM = new THREE.MeshStandardMaterial({ map: T.paintedWall(0x5f7a66, 'lobbywall'), roughness: 0.9 }); wallM.userData.texSize = 4;
    const lowM = new THREE.MeshStandardMaterial({ map: T.paintedWall(0x3c4c42, 'lobbylow'), roughness: 0.9 }); lowM.userData.texSize = 3;
    const floorM = new THREE.MeshStandardMaterial({ map: T.concrete(0x8f918a, 'lobbyfloor'), roughness: 0.85 }); floorM.userData.texSize = 3;
    const ceilM = stdMat(0x2a302e, { roughness: 1 });
    // habitación: x -7..7, z -4..7, y 0..5
    B.box(0, -0.1, 1.5, 16, 0.2, 13, floorM);
    B.box(0, 5.1, 1.5, 16, 0.2, 13, ceilM);
    // muro del fondo con hueco para la puerta (x -0.5..1.1, alto 2.5)
    B.box(-4.25, 2.5, -4.1, 7.5, 5, 0.2, wallM); B.box(4.55, 2.5, -4.1, 6.9, 5, 0.2, wallM); B.box(0.3, 3.75, -4.1, 1.6, 2.5, 0.2, wallM);
    B.box(-4.25, 0.6, -3.98, 7.5, 1.2, 0.05, lowM); B.box(4.55, 0.6, -3.98, 6.9, 1.2, 0.05, lowM);
    // pasillo exterior iluminado
    B.box(0.3, -0.1, -6, 3, 0.2, 4, floorM);
    B.box(-7.1, 2.5, 1.5, 0.2, 5, 13, wallM); B.box(7.1, 2.5, 1.5, 0.2, 5, 13, wallM);
    B.box(-6.98, 0.6, 1.5, 0.05, 1.2, 13, lowM); B.box(6.98, 0.6, 1.5, 0.05, 1.2, 13, lowM);
    // vigas y tuberías del techo
    for (const x of [-4.5, 0, 4.5]) B.box(x, 4.8, 1.5, 0.35, 0.4, 13, mat('darkMetal'));
    for (const [z, y, r] of [[-3.7, 4.4, 0.12], [-3.4, 4.6, 0.08]]) B.add(new THREE.CylinderGeometry(r, r, 16, 8), stdMat(0x6a7480, { metalness: 0.5, roughness: 0.4 }), trs(0, y, z, 0, 0, Math.PI / 2));
    // puerta metálica + marco + EXIT
    B.box(0.3, 2.55, -3.95, 1.8, 0.1, 0.14, mat('darkMetal')); B.box(-0.55, 1.25, -3.95, 0.1, 2.5, 0.14, mat('darkMetal')); B.box(1.15, 1.25, -3.95, 0.1, 2.5, 0.14, mat('darkMetal'));
    this.door = new THREE.Group(); this.door.position.set(-0.5, 0, -3.95); this.scene.add(this.door);
    const dm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.5, 0.1), mat('metalWall')); dm.position.set(0.8, 1.25, 0); dm.castShadow = true; this.door.add(dm);
    const hnd = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.08), mat('black')); hnd.position.set(1.35, 1.2, 0.07); this.door.add(hnd);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.02), stdMat(0x3a4552)); win.position.set(0.8, 1.9, 0.06); this.door.add(win);
    // luz exterior (se ve al abrir la puerta)
    const out = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.5), new THREE.MeshBasicMaterial({ color: 0xfff4dc, fog: false })); out.scale.set(2, 2, 1); out.position.set(0.3, 1.6, -7.5); this.scene.add(out);
    this.doorLight = new THREE.SpotLight(0xfff0d0, 0, 12, 0.7, 0.5, 1); this.doorLight.position.set(0.3, 2.2, -4.3); this.doorLight.target.position.set(0.3, 0, 1); this.scene.add(this.doorLight, this.doorLight.target);
    const exit = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.42), new THREE.MeshBasicMaterial({ map: T.signTexture('EXIT', { bg: '#1d4a2c', fg: '#9dffb8', border: '#cfd8cf' }) }));
    exit.position.set(0.3, 3.0, -3.88); this.scene.add(exit);
    // tablón de corcho con papeles
    const cork = stdMat(0x8a6a44, { roughness: 1 });
    B.box(-2.5, 1.9, -3.95, 2.0, 1.2, 0.06, cork); B.box(-2.5, 1.9, -3.97, 2.15, 1.35, 0.04, mat('wood'));
    const papers = [['MISSION', 'BRIEF'], ['WANTED'], ['MAP', 'B-2'], ['ROTA']];
    papers.forEach((p, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.44), new THREE.MeshStandardMaterial({ map: T.paperTexture(p), roughness: 1 }));
      m.position.set(-3.2 + i * 0.46, 1.95 + (i % 2) * 0.12, -3.91); m.rotation.z = (i - 1.5) * 0.06; this.scene.add(m);
    });
    // estanterías metálicas con cajas (izquierda)
    const shelfM = stdMat(0x4a5560, { metalness: 0.4, roughness: 0.5 });
    for (const [x, z] of [[-6.2, -2.5], [-6.2, 0.6]]) {
      for (const y of [0.3, 1.3, 2.3, 3.3]) B.box(x, y, z, 1.2, 0.06, 2.8, shelfM);
      for (const sz of [-1.35, 1.35]) for (const sx of [-0.55, 0.55]) B.box(x + sx, 1.8, z + sz, 0.06, 3.6, 0.06, shelfM);
      for (const [y, dz, s] of [[0.33, -0.7, 0.6], [0.33, 0.4, 0.5], [1.33, -0.2, 0.7], [2.33, 0.6, 0.55], [2.33, -0.6, 0.45], [3.33, 0.0, 0.6]]) {
        const cm = new THREE.MeshStandardMaterial({ map: T.crate(0xa8743f), roughness: 0.9 });
        B.add(new THREE.BoxGeometry(s, s * 0.8, s), cm, trs(x, y + s * 0.4, z + dz, 0, dz, 0));
      }
    }
    // sofá (izquierda delante)
    const sofaM = stdMat(0x5b5240, { roughness: 1 }), sofaD = stdMat(0x463e30, { roughness: 1 });
    B.box(-4.6, 0.25, 2.2, 1.0, 0.5, 2.6, sofaD); B.box(-4.55, 0.6, 2.2, 0.9, 0.2, 2.4, sofaM);
    B.box(-5.0, 0.95, 2.2, 0.25, 0.9, 2.6, sofaM); B.box(-4.6, 0.75, 0.95, 1.0, 0.5, 0.2, sofaD); B.box(-4.6, 0.75, 3.45, 1.0, 0.5, 0.2, sofaD);
    const cushion = stdMat(0x6b6150, { roughness: 1 });
    B.box(-4.45, 0.78, 1.6, 0.75, 0.16, 1.1, cushion); B.box(-4.45, 0.78, 2.8, 0.75, 0.16, 1.1, cushion);
    // cajas de cartón en el suelo
    const card = stdMat(0xb68a55, { roughness: 1 });
    B.box(-5.5, 0.35, 4.6, 0.8, 0.7, 0.8, card); B.box(-5.3, 0.95, 4.5, 0.6, 0.5, 0.6, card);
    // cómoda / cajonera (derecha)
    const dr = new THREE.MeshStandardMaterial({ map: T.wood(0x8a4f2e, 'drawer'), roughness: 0.8 }); dr.userData.texSize = 1.5;
    B.box(4.6, 0.55, -1.2, 2.2, 1.1, 0.8, dr);
    for (const y of [0.25, 0.6, 0.95]) { B.box(4.6, y, -0.79, 2.0, 0.28, 0.03, dr); B.box(4.6, y, -0.76, 0.3, 0.05, 0.03, mat('darkMetal')); }
    // cajas de munición verdes
    const ammo = stdMat(0x55663a, { roughness: 0.7 });
    for (const [x, y, z] of [[5.6, 0.25, 1.2], [5.6, 0.75, 1.2], [6.1, 0.25, 2.0]]) { B.box(x, y, z, 0.9, 0.5, 0.6, ammo); B.box(x, y + 0.26, z, 0.3, 0.04, 0.1, mat('darkMetal')); }
    // unidad de ventilación arriba a la derecha
    B.box(5.2, 3.7, -3.6, 2.2, 1.4, 0.8, stdMat(0xb8bcb8, { roughness: 0.6, metalness: 0.3 }));
    B.add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 16), stdMat(0x4a525c, { roughness: 0.6 }), trs(4.7, 3.7, -3.18, Math.PI / 2, 0, 0));
    B.add(new THREE.TorusGeometry(0.5, 0.05, 6, 20), stdMat(0x9aa2a8, { roughness: 0.5 }), trs(4.7, 3.7, -3.12));
    for (let i = -2; i <= 2; i++) B.box(4.7, 3.7 + i * 0.18, -3.1, 0.95, 0.025, 0.02, stdMat(0x9aa2a8, { roughness: 0.5 }), 1, { noShadow: true });
    for (let i = 0; i < 4; i++) B.box(5.7 + i * 0.12, 3.7, -3.18, 0.04, 1.1, 0.04, mat('darkMetal'));
    this.fan = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.08, 0.02), mat('black')); this.fan.position.set(4.7, 3.7, -3.1); this.scene.add(this.fan);
    // lámpara colgante
    B.add(new THREE.ConeGeometry(0.5, 0.35, 10, 1, true), mat('darkMetal'), trs(0, 4.0, 1.2));
    B.box(0, 4.5, 1.2, 0.03, 0.8, 0.03, mat('black'));
    this.bulbMat = stdMat(0xfff3d0, { emissive: 0xffe2a8, emissiveIntensity: 3 });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), this.bulbMat); bulb.position.set(0, 3.85, 1.2); this.scene.add(bulb);
    this.scene.add(...B.build(this.scene));

    // luces
    const hemi = new THREE.HemisphereLight(0xb8c8d8, 0x3a3428, 1.1); this.scene.add(hemi);
    const lamp = new THREE.PointLight(0xffd9a0, 22, 14, 1.5); lamp.position.set(0, 3.7, 1.2); this.scene.add(lamp); // sin sombra: una luz puntual con sombra dibuja la sala 6 veces por frame
    const key = new THREE.SpotLight(0xfff0e0, 40, 14, 0.5, 0.6, 1.4); key.position.set(2.2, 4.2, 4.5); key.target.position.set(0, 1, 0); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x7fb0ff, 1.4); rim.position.set(-3, 3, -4); this.scene.add(rim);
    const exitL = new THREE.PointLight(0x7dffa0, 3, 4); exitL.position.set(0.3, 3.0, -3.5); this.scene.add(exitL);
    // haz de luz de la lámpara (cono aditivo con degradado)
    const gc = document.createElement('canvas'); gc.width = 4; gc.height = 128; const gg = gc.getContext('2d');
    const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
    const beamTex = new THREE.CanvasTexture(gc);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.35, 3.7, 28, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffdca0, alphaMap: beamTex, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(0, 3.85 - 1.85, 1.2); this.scene.add(beam);
    // pantalla de título: baliza roja giratoria + contraluz frío desde la puerta (todo apagado fuera del título)
    const beaconM = new THREE.MeshStandardMaterial({ color: 0x3a0806, emissive: 0xff2a14, emissiveIntensity: 0, roughness: 0.4 });
    const bb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.16), mat('darkMetal')); bb.position.set(2.1, 3.02, -3.93); this.scene.add(bb);
    const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.2, 14), beaconM); beacon.position.set(2.1, 3.15, -3.88); this.scene.add(beacon);
    this.beaconM = beaconM;
    this.beaconLight = new THREE.SpotLight(0xff2a14, 0, 16, 0.42, 0.55, 1.1); this.beaconLight.position.set(2.1, 3.15, -3.75); this.scene.add(this.beaconLight, this.beaconLight.target);
    this.beaconGlow = new THREE.PointLight(0xff2a14, 0, 5, 1.6); this.beaconGlow.position.set(2.1, 3.2, -3.6); this.scene.add(this.beaconGlow);
    this.titleRim = new THREE.SpotLight(0x9cc2ff, 0, 12, 0.45, 0.6, 1); this.titleRim.position.set(-0.4, 3.4, -3.3); this.titleRim.target.position.set(0, 1.2, 0.2); this.scene.add(this.titleRim, this.titleRim.target);
    this.L = { hemi: [hemi, hemi.intensity], lamp: [lamp, lamp.intensity], key: [key, key.intensity], rim: [rim, rim.intensity], exit: [exitL, exitL.intensity], beam: [beam.material, beam.material.opacity] };
    // polvo flotando en el haz
    const N = 140, pos = new Float32Array(N * 3); this.motes = [];
    for (let i = 0; i < N; i++) { const a = Math.random() * 6.28, r = Math.random() * 1.6; this.motes.push({ x: Math.cos(a) * r, y: 0.3 + Math.random() * 3.4, z: 1.2 + Math.sin(a) * r, ph: Math.random() * 6.28 }); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.022, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.dust.frustumCulled = false; this.scene.add(this.dust);
    this.powerT = 99;
  }

  // ---------- Pantalla de título ----------
  // powerT: -1 = búnker a oscuras (título) · 0..3 = encendido en curso · 99 = normal
  setTitle(on) {
    this.powerT = on ? -1 : 99;
    if (on) { const S = Lobby.SHOTS.title; this.shot = 'title'; this.cam.pos.set(...S.pos); this.cam.look.set(...S.look); this.cam.fov = S.fov; }
    this.applyPower();
  }
  powerOn() { if (this.powerT < 0) this.powerT = 0; }
  applyPower() {
    const t = this.powerT, normal = t >= 99, dark = t < 0;
    // parpadeo de fluorescente al encenderse cada luz
    const fl = (t0) => normal ? 1 : dark || t < t0 ? 0 : t < t0 + 0.06 ? 1 : t < t0 + 0.13 ? 0.12 : t < t0 + 0.18 ? 1 : t < t0 + 0.27 ? 0.3 : 1;
    const ramp = (a, b) => normal ? 1 : dark ? 0 : Math.min(1, Math.max(0, (t - a) / (b - a)));
    const L = this.L, lampK = fl(0.35), keyK = fl(0.8);
    L.lamp[0].intensity = L.lamp[1] * lampK;
    L.key[0].intensity = L.key[1] * keyK;
    L.hemi[0].intensity = L.hemi[1] * (0.07 + 0.93 * ramp(0.3, 1.4));
    L.rim[0].intensity = L.rim[1] * (normal ? 1 : 2.4 - 1.4 * ramp(0.4, 1.4));
    L.exit[0].intensity = L.exit[1] * (normal ? 1 : 0.7);
    L.beam[0].opacity = L.beam[1] * lampK;
    this.bulbMat.emissiveIntensity = 3 * Math.max(0.04, lampK);
    this.dust.material.opacity = 0.8 * Math.max(0.3, lampK);
    const b = normal ? 0 : dark ? 1 : 1 - ramp(0, 0.3);
    this.beaconLight.intensity = 45 * b; this.beaconGlow.intensity = 5 * b; this.beaconM.emissiveIntensity = 4 * b;
    this.titleRim.intensity = 70 * (normal ? 0 : dark ? 1 : 1 - ramp(0.4, 1.3));
  }


  // party: [{skin, weapon}] — el jugador al centro, amigos a los lados
  setPlayers(list) {
    for (const s of this.soldiers) this.scene.remove(s.root);
    this.soldiers = [];
    const spots = [[0, 0, 0], [-2.7, 0, -0.8], [2.7, 0, -0.8]];
    list.slice(0, 3).forEach((p, i) => {
      const s = makeSoldier(p.skin, p.weapon || 'akr', p.weaponSkin || 'factory', { relaxed: true });
      s.root.position.set(...spots[i]);
      s.root.rotation.y = Math.PI + (i === 1 ? -0.35 : i === 2 ? 0.35 : 0);
      s.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(s.root);
      this.soldiers.push(s);
    });
  }

  // Posición en pantalla (0..1) de la cabeza de cada soldado, para las etiquetas de nombre.
  headScreen(i, w, h) {
    const s = this.soldiers[i]; if (!s) return null;
    const v = new THREE.Vector3(); s.head.getWorldPosition(v); v.y += 0.55;
    v.project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
  }

  update(dt, aspect) {
    this.t += dt;
    if (this.powerT < 99) {
      if (this.powerT >= 0) { this.powerT += dt; if (this.powerT > 2.2) this.powerT = 99; }
      this.applyPower();
      const a = this.t * 3.4;
      this.beaconLight.target.position.set(2.1 + Math.cos(a) * 6, 0.8, -1.2 + Math.sin(a) * 5);
    }
    this.camera.aspect = aspect;
    if (this.cine && !this.cine.finished) this.updateCine(dt);
    else if (!this.cine) {
      // la cámara persigue el plano activo con suavizado (movimiento de grúa)
      const S = Lobby.SHOTS[this.shot] || Lobby.SHOTS.home;
      const zoom = this.shot === 'home' && aspect < 1.2 ? 1.5 : 1;
      const k = 1 - Math.exp(-dt * 3.2);
      const side = (S.side || 0) * Math.max(0.9, Math.min(2, aspect));
      this.cam.pos.lerp(new THREE.Vector3(S.pos[0] + side + Math.sin(this.t * 0.15) * 0.08, S.pos[1] + Math.sin(this.t * 0.4) * 0.02, S.pos[2] * zoom), k);
      this.cam.look.lerp(new THREE.Vector3(S.look[0] + side, S.look[1], S.look[2]), k);
      this.cam.fov += (S.fov - this.cam.fov) * k;
    }
    this.camera.position.copy(this.cam.pos);
    this.camera.lookAt(this.cam.look);
    this.camera.fov = this.cam.fov;
    this.camera.updateProjectionMatrix();
    this.fan.rotation.z += dt * 8;
    const dp = this.dust.geometry.attributes.position;
    this.motes.forEach((m, i) => dp.setXYZ(i, m.x + Math.sin(this.t * 0.3 + m.ph) * 0.15, m.y + Math.sin(this.t * 0.2 + m.ph * 1.7) * 0.2, m.z + Math.cos(this.t * 0.25 + m.ph) * 0.15));
    dp.needsUpdate = true;
    this.spin += this.spinV * dt; this.spinV *= Math.exp(-dt * 4);
    if (this.swapT < 1) this.swapT = Math.min(1, this.swapT + dt * 1.9);
    this.soldiers.forEach((s, i) => {
      poseSoldier(s, { moveSpeed: 0, phase: 0, crouch: 0, air: false, pitch: -0.05 + Math.sin(this.t * 0.9 + i) * 0.02, dead: 0 });
      s.spine.rotation.y = Math.sin(this.t * 0.5 + i * 2) * 0.08;
      s.head.rotation.y = Math.sin(this.t * 0.35 + i) * 0.3;
      s.spine.position.y += Math.sin(this.t * 1.6 + i) * 0.006;
      if (i === 0) {
        s.root.rotation.y = Math.PI + this.spin + this.cineSpin;
        if (this.swapT < 1) {
          // giro rápido + rebote mientras el escaneo sube por el cuerpo
          const k = this.swapT, e = 1 - Math.pow(1 - k, 3);
          s.root.rotation.y += (1 - e) * Math.PI * 2;
          s.root.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.05);
          this.scan.position.set(s.root.position.x, 0.05 + e * 2.05, s.root.position.z);
          this.scanMat.opacity = Math.sin(k * Math.PI) * 0.9;
          this.scanDisc.position.set(s.root.position.x, 0.02, s.root.position.z); this.scanDisc.material.opacity = (1 - k) * 0.35;
          this.swapLight.position.set(s.root.position.x, 1.2, s.root.position.z + 0.6); this.swapLight.intensity = (1 - k) * 12;
        } else { s.root.scale.setScalar(1); this.scanMat.opacity = 0; this.scanDisc.material.opacity = 0; this.swapLight.intensity = 0; }
        s.packLid.rotation.x = -this.lid * 2.0;
        if (this.walk > 0) {
          // caminar hacia la puerta
          s.root.position.set(0.3 * this.walk, 0, -5.2 * this.walk);
          poseSoldier(s, { moveSpeed: 3.5, phase: this.t * 7, crouch: 0, air: false, pitch: 0, dead: 0 });
        } else s.root.position.set(0, 0, 0);
      }
    });
  }
}
