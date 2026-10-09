# STRYKEN LAB V2

FPS de navegador (Three.js, sin build) con assets 100 % propios. **V2** añade:
- **Arena** por rondas 1v1–5v5 con economía, tienda, espectador y marcador "3 — 2"; mapas simétricos PIER 9 y KILN.
- **Rangos** (Bronce → Titanio) que suben la dificultad de los bots, **listas de modos** (clasificatoria, casual, rotación semanal) y **votación de mapa**.
- **Eventos de fin de semana** (Doble economía, Blade Rush, Noche en Korva) y **exclusivos** que sólo se ganan.
- **Bullet cam**: la bala mortal en cámara lenta con 4 estilos de impacto (onda de choque, rayos X, fragmentos, cómic).
- **Game feel** (temblor por trauma, micropausa) y **HUD accesible** (escala, color de enemigo, números de daño).
- **Guardado en la nube** opcional con Firebase (ver [docs/CLOUD_SETUP.md](docs/CLOUD_SETUP.md)).

Jugar en local: `python serve.py 5185` y abre http://localhost:5185 · Detalle de cada cambio: [LAB.md](LAB.md).

---

# STRYKEN.io

FPS de navegador que recrea el look & feel de Cryzen.io con assets 100% propios: todos los modelos 3D (soldados, 12 armas), texturas, mapas, sonidos e íconos se generan por código al cargar. Nada copiado del juego original (ni nombre, ni logo, ni arte).

## Jugar

```bash
python serve.py
```

Abre http://localhost:8080. Es 100% estático (Three.js va incluido en `vendor/`), así que puedes subir la carpeta tal cual a GitHub Pages, Netlify o itch.io.

## Qué incluye

- **Lobby 3D** estilo búnker con tu soldado, party de amigos (ADD FRIEND), monedas, nivel, DAILY BOX y botón PLAY.
- **3 mapas / 3 modos:** HARBOR (Deathmatch, puerto de contenedores), FOUNDRY (Team Deathmatch, fábrica con pasarelas), SHRINE (Knife Only, templo). Además **Custom Match**: cualquier mapa + modo, nº de bots, dificultad, tiempo y objetivo de kills.
- **12 armas, 10 loadouts** (AKR-47, BRUTE-12, LONGBOW, SCARAB-17, VIPER-5, TALON B3, VECTA, AURUM DMR, BOOMER M6, HAMMER LMG + P9, RHINO .50 y cuchillo). Los 3 primeros loadouts se editan en el Inventario.
- **Gunplay:** counter-strafe (quieto = preciso), retroceso con patrón, headshots, caída de daño, ADS, mira telescópica, ráfagas, escopeta por cartucho, lanzagranadas con explosiones, backstab con cuchillo.
- **HUD fiel al original:** KILLED / tiempo / TARGET, vida segmentada, slots de armas, munición, killfeed, chat, hitmarkers, indicadores de daño, nombres al mirar a un enemigo, marcador (TAB), cámara de muerte "KILLED BY".
- **Sistema de armas que caen:** al morir se suelta el arma principal (E para recogerla, G para soltar la tuya), sprays (T) e inspección (V).
- **Progresión:** monedas, XP y nivel, estadísticas de perfil, tienda de skins de personaje y de arma, recompensas diarias y caja diaria. Todo se guarda en el navegador.
- **Bots** con visión, oído, tiempo de reacción, puntería humana, strafe y counter-strafe; entran y salen de la partida y chatean.
- **Ambiente vivo:** mar con barco portacontenedores y gaviotas en HARBOR, brasas y polvo en FOUNDRY, pétalos de cerezo en SHRINE; sombras de contacto, bloom (calidad alta) y sombra propia del jugador.
- **Detalles de partida:** banner de inicio, cuenta regresiva final, avisos de liderato y "kills restantes", "+100" al matar, latido con poca vida, destello en enemigos al impactarlos, animación de muerte en dos fases y marcador ☠ del asesino en la cámara de muerte.
- Calidad gráfica automática (baja sola si los FPS caen) y ajustes de sensibilidad, FOV, volumen, mira y spray.

**Controles:** WASD · Espacio salto · Shift correr · Ctrl/C agacharse · Clic disparar · Clic der. apuntar (cuchillo: ataque fuerte) · R recargar · 1/2/3, rueda, Q armas · G soltar · E recoger · T spray · V inspeccionar · B loadout · Tab marcador · Enter chat · Esc menú.

## Añadir contenido

| Quiero añadir… | Archivo |
|---|---|
| Un arma | `src/data/weapons.js` (números) + su modelo en `GUN_PARTS` de `src/gfx/models.js` |
| Una skin | `src/data/cosmetics.js` (aparece sola en tienda/inventario) |
| Un mapa | `src/data/maps.js` (helpers `cont`, `crate`, `room`, `ramp`...) y su nombre en `MAP_NAMES` |
| Un modo | `src/data/modes.js` |

Después de tocar un mapa, corre las pruebas (spawns libres, navegación conectada y bots que recorren el mapa físicamente):

```bash
node tests/maps.test.js
```

## Pruebas en el navegador

`?autostart=dm` (o `tdm`, `knife`) entra directo a una partida sin pointer lock. `window.game.debug` tiene utilidades: `step(seg)`, `snap()`, `freezeBots()`, `placeBot(dist)`, `aimAt(bot)`, `click()`, `key(code)`.

## Estructura

- `src/core/`: física (cajas, rampas, raycast) y malla de navegación A* — sin Three.js, se prueba en Node
- `src/data/`: armas, mapas, modos, skins
- `src/gfx/`: texturas procedurales, modelos, mundo, lobby, viewmodel, efectos, íconos
- `src/game/`: partida, jugador, bots, actores, audio sintetizado, perfil
- `src/ui/`: menús del lobby y HUD
