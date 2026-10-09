// PROGRESO EN LA NUBE (Firebase Auth + Firestore). Documento profiles/{uid} = { data: JSON del perfil, updatedAt }.
//  · Al arrancar: sesión anónima automática (o la de Google si ya la vinculaste) y se trae el perfil de la nube.
//    Gana el más reciente (updatedAt): así no se pierde progreso jugado sin conexión.
//  · Cada saveProfile() sube el perfil (agrupado cada 2 s).
//  · "Iniciar sesión con Google" vincula la cuenta anónima → mismo progreso en cualquier dispositivo.
// Si FIREBASE_CONFIG es null o no hay conexión, todo sigue funcionando sólo con localStorage.
import { FIREBASE_CONFIG } from './firebase-config.js';
import { normalizeProfile, setSaveHook, saveLocal } from '../game/profile.js';

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}`;

export const cloud = {
  enabled: !!FIREBASE_CONFIG,
  status: FIREBASE_CONFIG ? 'connecting' : 'local',   // local | connecting | guest | google | offline
  email: null,
  listeners: new Set(),
  onChange(f) { this.listeners.add(f); return () => this.listeners.delete(f); },
  emit() { for (const f of this.listeners) try { f(this); } catch (e) { /* UI */ } },
};

let F = null, app = null, auth = null, db = null, game = null, pushTO = null, pending = null;

export async function initCloud(g) {
  game = g;
  if (!cloud.enabled) return;
  try {
    const [fa, fau, ffs] = await Promise.all([import(`${CDN}/firebase-app.js`), import(`${CDN}/firebase-auth.js`), import(`${CDN}/firebase-firestore.js`)]);
    F = { ...fa, ...fau, ...ffs };
    app = F.initializeApp(FIREBASE_CONFIG);
    auth = F.getAuth(app); db = F.getFirestore(app);
    setSaveHook((p) => queuePush(p));
    F.onAuthStateChanged(auth, async (user) => {
      if (!user) { try { await F.signInAnonymously(auth); } catch (e) { offline(e); } return; }
      setUser(user);
      await pull();
    });
  } catch (e) { offline(e); }
}

function setUser(user) {
  const g = user.providerData.find(p => p.providerId === 'google.com');
  cloud.status = g ? 'google' : 'guest'; cloud.email = g ? g.email : null; cloud.emit();
}
function offline(e) { console.warn('cloud:', e); cloud.status = 'offline'; cloud.emit(); }

// Trae el perfil de la nube; gana el más reciente
async function pull() {
  const u = auth.currentUser; if (!u) return;
  try {
    const snap = await F.getDoc(F.doc(db, 'profiles', u.uid));
    const local = game.profile;
    if (snap.exists()) {
      const d = snap.data(), remote = JSON.parse(d.data || '{}');
      if ((d.updatedAt || 0) > (local.updatedAt || 0)) {
        const merged = normalizeProfile(remote);
        for (const k of Object.keys(game.profile)) delete game.profile[k];
        Object.assign(game.profile, merged);
        saveLocal(game.profile);
        if (game.state === 'lobby' && game.ui) game.ui.refreshLobby();
        if (game.ui) game.ui.toast('☁ PROGRESS LOADED FROM CLOUD');
        return;
      }
    }
    await push(local); // la nube no tenía nada o era más vieja
  } catch (e) { offline(e); }
}

function queuePush(p) {
  if (!auth || !auth.currentUser) return;
  pending = p; clearTimeout(pushTO);
  pushTO = setTimeout(() => { const q = pending; pending = null; push(q); }, 2000);
}
async function push(p) {
  const u = auth && auth.currentUser; if (!u || !p) return;
  try {
    await F.setDoc(F.doc(db, 'profiles', u.uid), { data: JSON.stringify(p), updatedAt: p.updatedAt || Date.now(), name: p.name || '' });
    if (cloud.status === 'offline') setUser(u);
  } catch (e) { offline(e); }
}
// al cerrar la pestaña: intentar subir lo pendiente
addEventListener('pagehide', () => { if (pending) { clearTimeout(pushTO); push(pending); pending = null; } });

// Vincular / iniciar sesión con Google (mismo progreso en todos tus dispositivos)
export async function signInGoogle() {
  if (!auth) return 'local';
  const provider = new F.GoogleAuthProvider();
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) await F.linkWithPopup(auth.currentUser, provider);
    else await F.signInWithPopup(auth, provider);
    setUser(auth.currentUser); await pull(); return 'ok';
  } catch (e) {
    // esa cuenta de Google ya tenía progreso (otro dispositivo): entrar con ella y traer SU progreso
    if (e && e.code === 'auth/credential-already-in-use') {
      const cred = F.GoogleAuthProvider.credentialFromError(e);
      game.profile.updatedAt = 0; // que gane la nube
      await F.signInWithCredential(auth, cred);
      setUser(auth.currentUser); await pull(); return 'ok';
    }
    console.warn('google sign-in:', e); return e && e.code || 'error';
  }
}
export async function signOutCloud() {
  if (!auth) return;
  await F.signOut(auth); // vuelve a sesión anónima nueva (onAuthStateChanged); el progreso local se queda en este navegador
}
