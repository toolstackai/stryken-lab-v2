# Plan: Arena, rangos, listas, eventos

Ideas del amigo del usuario, refinadas (2026-10-08). **Aún sin programar.**

## Orden de trabajo
1. Arena 1v1 / 3v3 con economía.
2. Rangos, ligados a Arena y a la dificultad de los bots.
3. Listas de modos, votación de mapa y rotación semanal.
4. Eventos y exclusivos.

## 1. ARENA (por rondas, estilo Rivals, sin bomba)
Gana la ronda el equipo que queda con alguien vivo.

| Formato | Para ganar | Ronda máx. |
|---|---|---|
| 1v1 | Primero a 5 | 60 s |
| 2v2 / 3v3 | Primero a 6 | 75 s |
| 4v4 / 6v6 | Primero a 7 | 90 s |

### Economía (dentro de la partida)
- **Ganar la ronda:** +3000.
- **Perder la ronda:** +1900, más +500 por cada derrota seguida (máximo +2900). Sin este bono de derrota, quien pierde la primera ronda pierde todo el partido.
- **Baja:** +200 (con escopeta o cuchillo: +400).
- El dinero no gastado se conserva. Si mueres, pierdes el arma comprada.
- **Fase de compra:** 12 s al empezar cada ronda, usando el menú de mochila o loadout.

### Precios
| Precio | Armas |
|---|---|
| Gratis | P9 + cuchillo |
| 500 | Rhino |
| 1200–1600 | Viper, Vecta, Brute |
| 2700 | AKR, Scarab (scout) |
| 3100 | Talon, Hammer |
| 4500 | Longbow, Aurum |
| 5000 | Boomer (2 granadas como máximo) |

Además, reutilizando el Battle Royale: blindaje 400 / 1000 y venda 300.

### Toque memorable
Al final de cada ronda, cámara lenta de la última baja y un marcador grande del tipo "3 — 2".

## 2. Listas de modos
- **Clasificatoria:** Arena 1v1, 3v3 y 5v5. Sólo estas dan rango.
- **Casual:** Duelo por equipos 6v6, Todos contra todos, Cuchillos y Battle Royale.
- **Rotativa semanal:** 2v2, 4v4 y modos raros (solo francotirador, Longbow vs. cuchillo, gravedad baja…).

## 3. Mapas
- Mapa al azar dentro de cada lista.
- Al terminar la partida, votación de 10 s entre 3 mapas (con las miniaturas existentes).
- Los mapas de Arena deben ser pequeños y simétricos: recortes de Harbor y Foundry, más un mapa nuevo para 1v1.

## 4. Rangos (la lista del amigo estaba desordenada: diamante va por encima de platino)
Cada rango tiene 3 divisiones (I–III).

| Rango | Puntos (RP) |
|---|---|
| Bronce | 0 |
| Plata | 300 |
| Oro | 700 |
| Platino | 1200 |
| Diamante | 1800 |
| Obsidiana | 2500 |
| Rubí | 3300 |
| Titanio | 4200 (insignia animada) |

- **Ganar:** +20 a +30 RP, según el rendimiento.
- **Perder:** −15 a −20 RP.
- **Protección:** no se baja de rango durante 3 derrotas justo después de subir.
- **Contra bots el elo no mide nada real.** Por eso la dificultad de los bots sube con el rango: bronce = fácil, platino = normal, rubí/titanio = difícil, con bots coordinados.
- **Fin de temporada:** cada rango da una recompensa exclusiva (tarjeta, emblema y aspecto "Titanio").

## 5. Exclusivos y eventos
- **Exclusivos:** **no se compran**, sólo se ganan:
  - recompensas de rango;
  - premios de evento;
  - maestría de arma: 500 bajas con un arma dan su camuflaje dorado.
- **Eventos de fin de semana**, con reglas propias y una pista de recompensas:
  - **"Noche en Korva":** Battle Royale nocturno, con linternas.
  - **"Cuchillazo":** cada baja da velocidad.
  - **"Doble economía":** Arena con monedas x2.
- **Se reutiliza:** `src/data/career.js`, las cajas y la tienda.
