# STRYKEN LAB — prototipos cinemáticos

Copia experimental de `stryken/` (el juego original no se toca). Aquí se prueba el estilo "todo cinemático".

```bash
python stryken-lab/serve.py 5182
```

## Secuencia 1 — Menú
- **Cámara viva:** cada pestaña (tienda, perfil, centro, ajustes) mueve la cámara a otro punto del búnker; los paneles entran por la derecha.
- **Inventario = mochila:** el soldado se gira, la tapa se abre, la cámara entra y el interior se vuelve una **mesa de equipo 3D** (loadouts).
- **Armero (gunsmith):** preview al pasar el ratón; clic en el arma = despiece con 7 componentes, cajón de accesorios, stats en verde/rojo, piezas que salen y encajan.
- **Deploy:** PLAY → el soldado camina hacia la puerta, se abre, luz blanca → partida.

## Secuencia 2 — Partida
- **Infiltración:** vuelo sobre el mapa (por dentro del edificio en mapas techados) con título "OPERATION", modo, datos tecleados y alineaciones de equipo; la cámara baja hasta tu soldado, entra en primera persona, levanta el arma (comprobación de recámara) y el HUD se arma pieza a pieza.
- **Primera persona:** recarga con la mano llevando el cargador (táctica y en vacío con cerrojo), sonidos sincronizados, inspección en dos tiempos, inercia al moverte, humo del cañón, luz del fogonazo.
- **Medallas:** First Blood, Headshot, Longshot, Point Blank, Double/Triple Kill, Revenge, Buzzkill, Streak 5/10, Boom, Blade.
- **Final:** cámara lenta + VICTORY/DEFEAT → **FINAL KILLCAM** (repetición sobre el hombro del asesino, cámara lenta en el disparo final) → **podio MVP** (top 3 en pedestales, focos, confeti) → **informe post-partida** (contadores, anillo de XP con subida de nivel, monedas, medallas) → **regreso al lobby** (el soldado entra por la puerta).

## Secuencia 3 — Tienda y cajas
- **Probador:** en la tienda, al pasar el ratón por una skin tu soldado se la pone al instante (anillo de escaneo del color de la rareza, giro y destello). La cámara lo encuadra a la izquierda del panel en cualquier tamaño de pantalla.
- **Compra con mantener pulsado:** HOLD TO PURCHASE llena un anillo; al completarse sale el sello **UNLOCKED**, la tarjeta gira y aparecen EQUIP / CLOSE. Si no te alcanza: "NEED X MORE COINS".
- **Apertura de cajas (DAILY BOX / LEGENDARY BOX):** escena propia con la caja de suministros en un pedestal. Clic → los cierres saltan uno a uno, la caja tiembla y la luz de las ranuras va **subiendo de rareza** (azul → morado → dorado) hasta la real; la tapa sale despedida, destello del color de la rareza, haz de luz y el premio sube girando (arma, operador de pie sobre la caja o monedas). Texto estilo CoD a la izquierda: rareza, nombre, tipo, **EQUIP NOW / CONTINUE**. Repetidos se convierten en monedas.

## Secuencia 4 — Muerte y reaparición
- **Caída en primera persona:** al morir la cámara cae al suelo de lado mirando a tu asesino, el mundo pierde el color, bordes rojos, golpe sordo y pitido en los oídos.
- **Tarjeta del asesino:** emblema y fondo generados a partir de su nombre (siempre los mismos), nivel, racha, arma, **vida que le quedó**, distancia, **tu daño** sobre él y "REVENGE AVAILABLE".
- **KILLCAM:** rebobinado con interferencia VHS → repetición de los últimos ~2 s **desde los ojos del asesino, con SU arma y SU skin en primera persona** (disparos, fogonazos, cuchilladas, granadas y explosiones), **cámara lenta** en el disparo final, línea de tiempo con la marca de tu muerte. Mientras se ve, la partida sigue en vivo (silenciada).
- **Redespliegue:** vista táctica desde el cielo (cuadrícula, retícula, "REDEPLOYING · mapa", altitud bajando) que cae en picado hasta tu operador, entra en su cabeza, levanta el arma y el HUD se arma de nuevo.
- **ESPACIO / clic** salta la killcam; **B** abre el loadout y el redespliegue espera. Se puede desactivar en Ajustes → KILLCAM ON DEATH. Muertes sin asesino (caída) muestran "K.I.A." sin killcam.

## Secuencia 5 — Carga y pantalla de título
- **Carga:** fondo táctico oscuro; el logo STRYKEN aparece en contorno y se va **llenando con el progreso** (un escáner cian lo recorre), mensajes tipo "SCANNING SECTOR · HARBOR", porcentaje; al 100 % el logo destella.
- **Título:** el búnker del lobby **a oscuras**, una **baliza roja giratoria** barre las paredes, contraluz frío sobre tu operador (plano en contrapicado), polvo en el aire. El logo entra **golpeando letra a letra** (aberración cromática), la bala cruza la pantalla dejando estela, brillo metálico, subtítulo que se cierra, **PRESS ANY KEY**, tu operador y nivel abajo.
- **Al pulsar:** golpe grave, el logo atraviesa la cámara, **las luces se encienden una a una con parpadeo de fluorescente** (con su "clunk"), la cámara sube al plano del lobby y **el menú se arma pieza a pieza** (barra superior, PLAY, caja diaria…). Después salen las recompensas diarias / noticias.
- La tecla también activa el audio del navegador. La segunda vez en la misma sesión el título entra más rápido. `?notitle` entra directo al lobby; `?autostart=…` salta todo.

## Secuencia 6 — Mesa táctica y matchmaking
- **Mesa táctica (botón de modo):** sala de operaciones a oscuras con pantallas de inteligencia; una mesa proyecta **el mapa real en holograma** (construido con sus cajas de colisión: contenedores, naves, templo…), con línea de escaneo, parpadeo y puntos de inserción. **Pasar el ratón** por un modo = el holograma se reconstruye en onda desde el centro con su mapa y el panel de inteligencia cambia (objetivo, jugadores, tiempo, meta, dificultad). **Clic** = sello SELECTED. Los modos "COMING SOON" muestran su mapa pero tiemblan al pulsarlos. CUSTOM MATCH abre la partida personalizada; ESC vuelve.
- **Matchmaking (PLAY):** el botón se convierte en panel de búsqueda (radar, región, ping, cronómetro) mientras la cámara se acerca al soldado → **MATCH FOUND** golpea la pantalla, la tarjeta del mapa gira → la lista se llena jugador a jugador (party marcada, equipos azul/rojo, ping) con **los nombres que de verdad estarán en la partida** → LOBBY FULL · DEPLOYING → cinemática de la puerta. ESC cancela mientras busca; ESPACIO/clic despliega ya.

## Secuencia 7 — Perfil y progresión
- **Hoja de servicio (PROFILE):** pantalla completa con tu soldado a la derecha. **Tarjeta de jugador** (fondo + emblema + nombre + rango con insignia de galones/estrellas), barra de XP con el próximo premio, **anillos** de K/D, precisión, headshots y victorias que se llenan, y contadores que suben.
- **Rangos:** RECRUIT → PRIVATE → SPECIALIST → CORPORAL → SERGEANT → STAFF SERGEANT → LIEUTENANT → CAPTAIN → COMMANDER (nivel 30, insignia dorada).
- **CAREER TRACK:** un premio por nivel (2–30): monedas, fragmentos, emblemas, tarjetas y skins. Al entrar, **la línea de progreso avanza nodo a nodo** desde tu última visita (promoción). CLAIM: monedas con "+150", emblemas/tarjetas con sello, **skins con la escena de apertura de caja** (secuencia 3) y EQUIP NOW. Repetidos → monedas. Nivel 30 da además el emblema SOVEREIGN.
- **IDENTITY:** 9 emblemas y 8 tarjetas generados en SVG; pasar el ratón = vista previa en tu tarjeta, clic = equipar; los bloqueados dicen en qué nivel salen.
- Tu emblema y rango aparecen también en la pantalla de título y en la lista del matchmaking. Punto rojo en PROFILE y aviso cuando hay premios nuevos.

## Secuencia 8 — Pausa táctica y ajustes
- **Pausa (ESC en partida):** el tiempo se frena hasta **congelarse** (y vuelve con rampa al reanudar), el mundo se **desenfoca** y el sonido del juego queda **amortiguado** como bajo el agua (la interfaz suena normal). Menú táctico: modo, mapa, tiempo y posición; RESUME / LOADOUT / SETTINGS / **LEAVE MATCH (mantener pulsado)**; a la derecha tu tarjeta, tus números de la partida y el marcador; consejo abajo. La killcam y el redespliegue también se congelan.
- **Ajustes (lobby y pausa):** CONTROLS · VIDEO · AUDIO · HUD & GAMEPLAY, con descripción de cada opción y vista previa: **cm/360°** de la sensibilidad, **diagrama del FOV**, ecualizador del volumen, niveles de calidad, mira con su color y forma, spray. **Vista previa en vivo:** al arrastrar el FOV (o cambiar la mira) en partida, el menú se aparta y ves el cambio en el juego. RESET PROGRESS se mantiene pulsado.

## Ópticas reales (armas con mira de serie)
Las miras ya no son cajas macizas ni una imagen plana en pantalla: son ópticas 3D por las que se mira de verdad.
- **VECTA — punto rojo (verde)** y **BOOMER M6 — mira alta de lanzagranadas**: marco abierto, cristal tintado, emisor con LED. El punto es **colimado**: sólo aparece cuando el ojo está alineado con la mira y flota sobre el blanco aunque el arma se mueva. La mira del BOOMER tiene una **escalera balística real** (10/15/20/25 m calculada con la velocidad y gravedad de la granada).
- **TALON B3 — holográfica**: túnel con dos cristales y retícula de anillo + punto.
- **AURUM DMR (2.5×) y LONGBOW (4.5×) — telescópicas reales**: la lente ocular muestra el mundo **aumentado** con una segunda cámara que mira por el eje del arma (picture-in-picture); fuera de la lente se sigue viendo todo. Retícula grabada (chevrón iluminado / duplex con marcas de caída), sombra del visor si el ojo no está centrado, aberración en el borde, objetivo con recubrimiento violeta. Al apuntar con lente, la sensibilidad se ajusta al aumento.
- También en tercera persona, lobby, armero (la óptica es una pieza del despiece con su nombre real) y en la killcam desde los ojos del asesino.
- **Miras de hierro** (AKR, SCARAB, VIPER, HAMMER, BRUTE, P9, RHINO): construidas para que la punta del poste quede **exactamente en la línea de apuntado** (verificado a ±1 px del centro). Alza de muesca con el poste a ras de las orejas (AKR, HAMMER — se quitó el asa que cruzaba la línea), dioptra/anillo (VIPER, SCARAB), banda ventilada con punto de fibra naranja (BRUTE) y 3 puntos blancos alineados por ángulo en las pistolas. Poste con punto de tritio verde en los rifles.
- Código: `src/gfx/optics.js` (+ `GUN_PARTS[id].optic` / `.irons` en `models.js`, `updateOptic/renderPip` en `viewmodel.js`).

## Rendimiento (2026-10-06)
Medido en partida (8 jugadores, Harbor): de **1.314 draw calls por frame a ~300–490** (−65–75 %), render ~3.8× más rápido en el navegador de pruebas.
- **Horneado** (`src/gfx/bake.js`): las piezas de cada hueso del soldado se funden en una malla con color por vértice (80 → 20 piezas por soldado); arma en 1ª persona 61 → 6; armas en el suelo fundidas.
- **Sombras**: mapa 4096 → 2048, recalculado a 30 Hz en partida; armas pequeñas sin sombra; la lámpara del lobby ya no hace sombra de cubo (6 pasadas por frame).
- **Efectos**: trazadoras reutilizadas (antes un material nuevo por bala), agujeros de bala instanciados (hasta 90 mallas → 3), sprites sin `needsUpdate`.
- **Tirones**: shaders precompilados al crear la partida; **resolución dinámica** (baja/sube la resolución interna en pasos de 5–10 % según FPS) antes de tocar la calidad gráfica.
- **Fuga de memoria** arreglada: soldados que salen, armas cambiadas y armas del suelo liberan su geometría (`disposeTree`); memoria estable en partidas largas.

Todas las cinemáticas se saltan con **Esc / Espacio / clic** y se aceleran al repetirlas.

## Battle Royale — KORVA ISLAND (2026-10-06)
Modo nuevo **BATTLE ROYALE** (24 jugadores en solitario, sin reapariciones). El último operador en pie gana.
- **Isla** (`src/data/korva.js`): 300×300 m con 8 zonas con nombre (TOWN, THE DOCKS, FOUNDRY WORKS, OLD SHRINE, RADAR HILL, FARMSTEAD, OUTPOST, LIGHTHOUSE), carreteras, bosque, rocas, refugios, 103 puntos de botín con calidad 0–2, playa y mar hasta el horizonte.
- **Avión → salto**: recta aleatoria que cruza la isla; puertas abiertas mientras está sobre tierra; *Espacio* para saltar, salto automático al final. Barra de ruta con la ventana de salto.
- **Caída libre** en tercera persona: *W* = picado (más rápido, FOV y líneas de velocidad, viento), A/D para dirigir; postura de paracaidista. **Paracaídas** automático a 45 m (o *Espacio* antes). Al tocar suelo, la cámara pasa sin corte a primera persona y el HUD se arma.
- **Botín con rareza** (`src/data/loot.js`): común / raro / épico / legendario con anillo de color y haz de luz en épicos y legendarios. *E* coge armas y blindaje (cambia por el que llevas); curas y munición se cogen al pasar. Las mallas sólo existen cerca de la cámara (prototipos clonados = sin coste).
- **Blindaje** 50/75/100 que absorbe el daño de armas (barra azul, sonido al romperse). **Curas**: vendas (+20 hasta 75) con *4*, botiquín (+100) con *5*, *H* elige; se canalizan andando despacio y se cancelan al disparar.
- **Tormenta**: se forma a los 90 s y se cierra en 6 fases (daño creciente). Muro animado, viñeta morada fuera, flecha y distancia a la zona segura, avisos de fase.
- **HUD**: VIVOS · temporizador de zona · BAJAS; minimapa (norte arriba) y **mapa completo con *M*** (zonas, tormenta, siguiente círculo, ruta del avión, rejilla A–H/1–8); números de daño (blanco vida, azul blindaje, amarillo cabeza).
- **Final**: al morir, killcam desde el asesino + puesto (#14 OF 24) → ELIMINATED → informe sobre una toma de dron; al ganar, VICTORY · LAST OPERATOR STANDING → podio.
- **Bots BR**: eligen dónde caer repartiéndose por la isla, planean hacia allí, buscan armas antes de pelear si van con cuchillo, se curan a cubierto, huyen de la tormenta y merodean dentro del círculo.
- **Rendimiento**: raycast por rejilla DDA, A* con búferes reutilizados, búsquedas limitadas por distancia y como mucho 2 por fotograma, armas de tercera persona y brazos compartidos entre soldados, todo lo que el botín necesita se genera al cargar. Simulación: ~0,7 ms por paso con 24 jugadores, partida completa ~7 min.

## Modelos de Blender (2026-10-07)
Las armas se pueden modelar en Blender (con Python) y entran al juego como `.glb` en lugar de las piezas por código. Las miras, las manos, las animaciones y los aspectos siguen funcionando.
- **Hechos:**
  - **AKR-47**: cargador curvo, culata con caída, guardamanos con ranuras.
  - **BRUTE-12**: corredera gruesa con estrías y 4 cartuchos rojos en el lateral.
- **Proceso:** skill `.claude/skills/stryken-asset` (spec del arma, librería bpy, guía de estilo, reglas fijas, comprobación en el juego).
- **Carga:** `src/gfx/gunmodels.js` precarga los modelos en el arranque. Si falta uno, se usa el arma por código. `?models=code` muestra las antiguas para comparar.
- **Fuentes:** `assets/blender/stryken_assets.blend` (colecciones AKR y brute).

## Archivos nuevos
- `src/game/cine.js` — infiltración, grabadora de jugadas, final killcam
- `src/gfx/podium.js` — escena del podio
- `src/ui/gunsmith.js` — mesa de equipo y armero
- `src/gfx/unbox.js` — escena de apertura de cajas
- `src/game/death.js` — muerte, killcam desde el asesino y redespliegue
- `src/ui/title.js` — pantalla de título (las luces del título viven en `Lobby.setTitle/powerOn`)
- `src/gfx/wartable.js` — mesa táctica con hologramas de mapas
- `src/ui/matchmaking.js` — búsqueda de partida
- `src/ui/record.js` — hoja de servicio, career track e identidad
- `src/data/career.js` — emblemas, tarjetas, rangos y premios por nivel
- `src/gfx/identity.js` — generador SVG de emblemas, tarjetas e insignias
- `src/ui/pause.js` — pausa táctica y panel de ajustes
- `src/game/br.js` — battle royale (avión, caída, botín, tormenta, bots)
- `src/gfx/brgfx.js` — avión, paracaídas, muro de la tormenta y modelos de botín
- `src/ui/brhud.js` — minimapa, mapa completo y HUD del battle royale
- `src/data/korva.js`, `src/data/loot.js` — isla y botín
- `lab.css` … `lab9.css` — estilos de las secuencias

## Pruebas
`?autostart=dm|tdm|knife|br` entra directo; `game.debug.quickEnd()` termina la partida con una kill real para ver killcam → podio → informe.
`game.debug.dieTo(9)` hace que un bot te mate de verdad (prueba de la secuencia de muerte).
`game.openUnbox({ title, legend, reward: { type: 'weaponSkin'|'charSkin'|'coins', id, name, rarity, weapon? } }, cb)` abre una caja con premio fijo.


## V2 (2026-10-08) — stryken-lab-v2
Copia de la V1 con: game feel (feel.js), HUD accesible (escala, colores de enemigo, numeros de dano, rastro de vida, aviso de recarga), Arena 1v1-5v5 con economia y tienda, mapas PIER 9 y KILN, rangos con dificultad de bots por rango, listas de modos con rotacion semanal, votacion de mapa, eventos de fin de semana (Doble economia, Blade Rush, Noche en Korva con estrellas, luna y linterna), exclusivos (maestria, rango, evento) y 5 props de Blender (granada, chaleco, venda, botiquin, municion). Detalle de cada skill aplicada: docs/V2_SKILLS.md.

### Bullet cam (2026-10-08)
La bala mortal en camara lenta en las killcams: sale del canon, la camara la persigue orbitando, frena casi del todo al llegar y el impacto tiene estilo propio. Killcam normal: congelar + onda de choque + la victima sale despedida. Final killcam: rayos X, estallido en fragmentos low-poly o vinetas de comic (al azar, sin repetir). Boomer: se sigue la granada; cuchillo: orbita lenta. Modelo nuevo de Blender: bala (assets/props/bullet.glb, 784 tris). Fallos arreglados durante las pruebas: recursion infinita en rayos X, fogonazo congelado delante de la camara, camara dentro de paredes en el impacto, la partida en vivo recolocaba a la victima, fragmentos sin color (colores por vertice), fuga de anillos de onda de choque.
