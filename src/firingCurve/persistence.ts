// Persistencia de programas y presets de Curva de Cocción en Firebase Firestore.
// Estructura: colección `firingPrograms/{userId}/programs/<docId>`.
// Cada usuario accede únicamente a sus propios ítems (reglas de seguridad en
// `firestore.rules`). Se usan timestamps de servidor y se respetan las reglas.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { FiringProgram } from './types';

const PATH = (uid: string) => `firingPrograms/${uid}/programs`;

function assertUser(): string {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Debes iniciar sesión para guardar programas o presets.');
  return uid;
}

function toFirestore(program: FiringProgram) {
  return {
    name: program.name,
    type: program.type,
    description: program.description ?? '',
    initialTemp: program.initialTemp,
    segments: program.segments,
    cone: program.cone ?? '',
    ortonRate: program.ortonRate ?? null,
    kind: program.kind,
    ownerId: auth.currentUser?.uid ?? '',
    createdAt: program.createdAt ?? null,
    updatedAt: serverTimestamp(),
  };
}

function fromDoc(id: string, data: any): FiringProgram {
  return {
    id,
    name: data.name ?? 'Sin título',
    type: data.type ?? 'custom',
    description: data.description ?? '',
    initialTemp: Number.isFinite(Number(data.initialTemp)) ? Number(data.initialTemp) : 20,
    segments: Array.isArray(data.segments) ? data.segments : [],
    cone: data.cone || undefined,
    ortonRate: data.ortonRate ?? undefined,
    kind: data.kind === 'system' ? 'system' : 'custom',
    ownerId: data.ownerId,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/** Lista en tiempo real los programas/presets del usuario autenticado. */
export function subscribePrograms(callback: (items: FiringProgram[]) => void): () => void {
  let unsubSnapshot: (() => void) | null = null;
  let cancelled = false;
  const unsubAuth = onAuthStateChanged(auth, (user) => {
    unsubSnapshot?.();
    unsubSnapshot = null;
    if (cancelled) return;
    if (!user) {
      callback([]);
      return;
    }
    const q = query(collection(db, PATH(user.uid)));
    unsubSnapshot = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) => fromDoc(d.id, d.data()));
        callback(items);
      },
      (error) => {
        console.error('Error suscribiendo a programas de cocción:', error);
        callback([]);
      },
    );
  });
  return () => {
    cancelled = true;
    unsubAuth();
    unsubSnapshot?.();
  };
}

export async function saveProgram(program: FiringProgram): Promise<string> {
  const uid = assertUser();
  const ref = await addDoc(collection(db, PATH(uid)), toFirestore(program));
  return ref.id;
}

export async function updateProgram(program: FiringProgram): Promise<void> {
  const uid = assertUser();
  const id = program.id;
  if (!id) throw new Error('El programa no tiene id. Guárdalo primero.');
  await updateDoc(doc(db, PATH(uid), id), toFirestore(program));
}

export async function deleteProgram(id: string): Promise<void> {
  const uid = assertUser();
  await deleteDoc(doc(db, PATH(uid), id));
}
