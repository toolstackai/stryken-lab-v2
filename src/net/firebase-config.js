// Configuración de Firebase para guardar el progreso en la nube (ver docs/CLOUD_SETUP.md).
// Pega aquí el objeto "firebaseConfig" de tu proyecto (Configuración del proyecto → Tus apps → Web).
// Estas claves de Firebase para web son públicas por diseño: la seguridad la ponen las reglas de Firestore.
// Mientras sea null, el juego guarda el progreso sólo en este navegador (como siempre).
export const FIREBASE_CONFIG = null;
/* Ejemplo:
export const FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'tu-proyecto.firebaseapp.com',
  projectId: 'tu-proyecto',
  storageBucket: 'tu-proyecto.appspot.com',
  messagingSenderId: '...',
  appId: '...',
};
*/
