# Guardado en la nube (Firebase) — configuración en 10 minutos

El juego ya trae el código (`src/net/cloud.js`). Sólo falta crear un proyecto de Firebase (gratis) y pegar su configuración.
Mientras no lo hagas, el progreso se guarda sólo en el navegador, como siempre.

## 1. Crear el proyecto
1. Entra en <https://console.firebase.google.com> con tu cuenta de Google → **Agregar proyecto** → nombre `stryken` → sin Analytics.
2. En la página del proyecto, pulsa el icono **Web `</>`** → apodo `stryken-web` → **Registrar app**.
3. Copia el objeto `firebaseConfig` que aparece.

## 2. Pegar la configuración
Abre `src/net/firebase-config.js` y cambia `null` por tu objeto:
```js
export const FIREBASE_CONFIG = {
  apiKey: '…', authDomain: 'stryken-xxxx.firebaseapp.com', projectId: 'stryken-xxxx',
  storageBucket: 'stryken-xxxx.appspot.com', messagingSenderId: '…', appId: '…',
};
```
Estas claves web son públicas por diseño (van en el navegador de todos los jugadores). La seguridad la dan las reglas del paso 4.

## 3. Activar el inicio de sesión
**Authentication → Comenzar → Sign-in method**:
- **Anónimo** → Habilitar (guarda el progreso sin pedir cuenta).
- **Google** → Habilitar (para usar el mismo progreso en varios dispositivos).

**Authentication → Configuración → Dominios autorizados** → **Agregar dominio**: `TU-USUARIO.github.io` (y `127.0.0.1` para probar en local).

## 4. Crear la base de datos y sus reglas
**Firestore Database → Crear base de datos** → modo producción → región cercana (p. ej. `southamerica-east1`).
En **Reglas**, pega y **Publica**:
```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /profiles/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid
                         && (request.resource == null || request.resource.data.data.size() < 200000);
    }
  }
}
```
Cada jugador sólo puede leer y escribir **su propio** perfil.

## 5. Probar
Recarga el juego → **Ajustes → ACCOUNT**: debe decir **SAVED · GUEST**. Pulsa **SIGN IN WITH GOOGLE** y verás **SAVED · GOOGLE**.
Abre el juego en otro navegador o en el móvil, inicia sesión con la misma cuenta de Google: aparece tu progreso.

## Cómo funciona
- Al abrir el juego: sesión anónima automática (o la de Google) y se trae `profiles/{uid}`. Gana la copia **más reciente** (`updatedAt`), así no se pierde lo jugado sin conexión.
- Cada guardado del juego se sube a los 2 s (agrupado) y al cerrar la pestaña.
- "Hold to reset progress" también reinicia la copia de la nube.
