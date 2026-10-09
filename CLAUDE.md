# STRYKEN LAB V2 — contexto para Claude

> **V2** (2026-10-08): copia de `stryken-lab` con Arena, rangos, listas de modos, eventos, exclusivos, game feel y HUD nuevos. Todo el trabajo nuevo va en **`stryken-lab-v2/`**; `stryken-lab/` queda como estaba (V1).

FPS de navegador (Three.js r170, módulos ES, sin build) que recrea el look & feel de Cryzen.io con **assets 100 % propios**.

## Reglas del usuario (obligatorias)
- **No tocar `../stryken/`** (el juego original) ni `../stryken-lab/` (V1). Todo cambio va en `stryken-lab-v2/`. Al terminar, comprobar desde `CLAUDE GABO/` que `find stryken -newer stryken-lab/lab3.css -type f` no devuelve nada.
- **MASTER RULE:** no parar porque algo funcione. Hacerlo verse mejor, sentirse mejor, más fluido, más memorable. Si está roto, arreglar la causa raíz.
- El usuario escribe en español o inglés: responder en el idioma en que escribe.
- No inventar sistemas que el juego original no tiene, salvo que el usuario los pida.
- **Blender:** usar sólo un agente a la vez (4 agentes en paralelo lo congelaron). Nunca junto a Unreal ni Roblox Studio.
- **Ahorrar créditos:** el usuario se quejó del gasto. No lanzar subagentes salvo que lo pida. Preferir pocos pasos bien pensados. Leer sólo las partes necesarias de archivos grandes (`match.js`, `ui.js`, `viewmodel.js`).

## Ejecutar y probar
- **Servidor:** launch config `stryken-lab-v2` (`python serve.py 5185`, sin caché).
- **URLs de prueba:**
  - `?autostart=<modo>`: entra directo (`dm`, `tdm`, `knife`, `br`, `arena1`, `arena3`, `arena5`, `arena2`, `arena4`, `snipers`, `lowgrav`, `blades`, `evecon`, `evknife`, `evnight`).
  - `?event=evecon|evknife|evnight`: fuerza un evento de fin de semana.
  - `?notitle`: abre el lobby sin pantalla de título.
  - `?models=code`: usa las armas por código en vez de los modelos de Blender.
- **Panel del navegador oculto:**
  - Sólo pinta durante capturas: `game.debug.snap()`, poner `#snapimg` en `zIndex = 5` y hacer la captura **dos veces** (la primera sale vieja).
  - Emular 960×540 con `resize_window`.
  - En el panel oculto los `setTimeout` se ralentizan: recargar en una llamada y esperar en otra.
  - Pausar con `game.paused = true` y avanzar a mano con `game.debug.step(s)`.
- **Ayudas de depuración** (`game.debug.*`): `step`, `snap`, `free`, `freezeBots`/`unfreezeBots`, `placeBot`, `aimAt`, `click`, `key`, `quickEnd`, `dieTo`.
- **Tests** (con `../.tools/node-v24.21.0-win-x64/node.exe`): `node tests/maps.test.js` (navegación y spawns de todos los mapas) y `node tests/raycast.test.js`.
- **Comprobar sintaxis:** `node --check <archivo>`.
- **Lógica de partida:** usar siempre `match.after(seg, fn)` (tiempo de juego), nunca `setTimeout`.
- **Rendimiento:** medir con `renderer.info.render.calls` y `.triangles`; para fugas de memoria, vigilar `renderer.info.memory.geometries`.

## Mapa del código
- `src/main.js` — App: arranque, estados (title/lobby/wartable/match…), render, resolución dinámica, `pixelRatio()` con presupuesto de píxeles, `game.debug`.
- `src/game/match.js` — partida: actores, disparos, daño, muertes, fin, podio. `shadowLOD` (sólo los soldados a menos de 35 m dan sombra).
- `src/game/bot.js` — IA de bots; la puntería depende de `DIFFICULTY` en `src/data/modes.js` (wobble, settle, spreadMul, head, flinch).
- `src/game/br.js`, `src/ui/brhud.js`, `src/gfx/brgfx.js`, `src/data/korva.js`, `src/data/loot.js` — Battle Royale (isla Korva, 24 jugadores).
- `src/game/death.js` (killcam), `src/game/cine.js` (intro, grabadora, killcam final).
- `src/gfx/models.js` — `GUN_PARTS` (especificación de cada arma: manos, boca del cañón, miras, ópticas), soldados, `setSoldierWeapon` (caché + LOD).
- `src/gfx/gunmodels.js` — carga los `.glb` listados en `assets/models/manifest.json`.
- `src/gfx/viewmodel.js` — arma en primera persona y sus animaciones (mag/bolt/slide/pump/drum).
- `src/ui/*`: hud, lobby/ui, pausa, perfil (`record.js`), matchmaking, mesa táctica (`gfx/wartable.js`).
- `src/data/*`: armas, cosméticos, modos, mapas, carrera.
- Estilos: `style.css` + `lab.css` … `lab9.css` (uno por secuencia).
- Historial detallado de todo lo hecho: **`LAB.md`**.

## V2: sistemas nuevos
- `src/game/feel.js` — game feel: trauma (temblor), micropausa, golpe de FOV, destellos. Ajustes reduceShake/reduceFlash.
- `src/game/arena.js` + `src/ui/arenahud.js` + `src/data/arena.js` — Arena por rondas: fases buy/live/post, economía, tienda (B), compra rápida (F), venda (4), espectador (ESPACIO), cámara lenta y marcador gigante.
- `src/data/arenamaps.js` — mapas simétricos PIER 9 y KILN.
- `src/data/ranks.js` — 8 rangos × 3 divisiones, RP, protección de 3 derrotas, dificultad de bots según rango, insignias SVG.
- `src/data/modes.js` — listas `ranked`/`casual`/`rotating` (rotación semanal)/`event`.
- `src/data/events.js` — eventos de fin de semana, pista de recompensas, recompensas de rango y maestría (500 bajas).
- `src/ui/aarx.js` — informe: panel de rango, evento, exclusivos y votación de mapa (10 s).
- `src/game/bulletcam.js` + `src/game/impacts.js` + `v2-cine.css` — BULLET CAM: la bala mortal en cámara lenta (frena al llegar). Killcam normal = estilo `freeze`; FINAL KILLCAM = `xray` / `shatter` / `comic` al azar sin repetir (`profile.lastFinalStyle`). Boomer = sigue la granada; cuchillo = órbita. Forzar estilo: `game.debug.bulletStyle = 'xray'`.
- `src/gfx/propmodels.js` — props de Blender (`assets/props/`): granada, chaleco, venda, botiquín, munición y bala (bullet cam).
- Estilos V2: `v2.css` (HUD) y `v2-arena.css` (Arena, lobby, informe). Skill de UI: `.claude/skills/ui-game-polish/`. Informe de skills: `docs/V2_SKILLS.md`.

## Modelos 3D (Blender)
- Las 13 armas están hechas en Blender (`assets/models/*.glb`, fuente en `assets/blender/stryken_assets.blend`).
- Proceso completo, con reglas y lecciones: **skill `.claude/skills/stryken-asset/`** (`SKILL.md`, `scripts/bpy_lib.py`, `scripts/spec.py`, `scripts/verify.js`).
- Props (V2): `scripts/prop_lib.py` → `export_prop(id)` escribe `assets/props/<id>.glb`, el manifiesto de props y `assets/blender/stryken_props.blend` (nunca pisa el .blend de las armas).
- `export()` registra el modelo solo en el manifiesto; no hay que tocar código.

## Estado actual (2026-10-08, V2)
- **Hecho en V2:** Arena (1v1–5v5) con economía, rangos, listas de modos, rotación semanal, votación de mapa, eventos (Doble economía, Blade Rush, Noche en Korva), exclusivos, game feel, HUD accesible y props de Blender.

## Estado de la V1
- **Hecho:**
  - 8 secuencias cinemáticas;
  - ópticas reales y miras de hierro;
  - pase de rendimiento;
  - Battle Royale;
  - las 13 armas en Blender;
  - bots más fáciles (acierto a 10 m: fácil 17 %, normal 26 %, difícil 39 %; antes 51 %);
  - menos lag: LOD de sombras y armas, presupuesto de píxeles.
- **Pendiente:**
  - confirmar los FPS reales del usuario (pedirle el número que muestra el contador de FPS, con Blender cerrado);
  - "motion graphics" (aparcado por el usuario).
- **Siguiente propuesto:** modo **Arena** por rondas con economía, rangos, listas de modos, rotación de mapas, eventos y exclusivos. El diseño completo está en **`docs/ARENA_PLAN.md`**; aún no se ha empezado a programar.
