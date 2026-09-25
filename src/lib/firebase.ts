import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '@/firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// `initializeFirestore` con caché persistente: las fichas se siguen leyendo sin
// conexión y la app no depende de la red para pintar el repositorio. Debe
// ejecutarse antes de cualquier `getFirestore` sobre la misma app, por eso
// vive aquí y no en un componente.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});

// Storage se resuelve de forma perezosa. Si el proyecto no lo tiene
// habilitado, `getStorage` lanzaría aquí y, al importarse este módulo desde
// la capa de datos, tumbaría la app entera. Con este envoltorio la
// excepción queda atrapada y `uploadGlazeImage` cae al data-URL local.
let cachedStorage: ReturnType<typeof getStorage> | null | undefined;
export function getGlazeStorage() {
  if (cachedStorage === undefined) {
    try {
      cachedStorage = getStorage(app);
    } catch (error) {
      console.warn('Firebase Storage no disponible, las imágenes se guardarán incrustadas:', error);
      cachedStorage = null;
    }
  }
  return cachedStorage;
}

export const googleProvider = new GoogleAuthProvider();

// Verificación de conectividad en el arranque. Silenciosa a propósito: si el
// proyecto no está accesible no debe romper la carga de la app.
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch {
    // Sin conexión o sin permisos: la app sigue funcionando con la caché local.
  }
}
testConnection();
