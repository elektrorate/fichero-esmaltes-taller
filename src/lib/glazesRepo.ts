// Capa de acceso a datos de las fichas. Todo el acceso a la colección `glazes`
// pasa por aquí: los componentes no importan `firebase/firestore`.
//
// Reglas del módulo:
//  - `update`/`patch` usan `merge: true` siempre. Escribir el documento entero
//    fue la causa raíz de los lost updates entre usuarios.
//  - Se relee el documento antes de mutar arrays embebidos (`copies`).
//  - `sanitizeFirestore` es la única implementación: Firestore rechaza
//    `undefined` en cualquier nivel del objeto.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { auth, db, getGlazeStorage } from './firebase';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { findConflictingFields, buildComparableGlaze } from './concurrency';
import type { Comment, Glaze, GlazeStatus } from '../types';

export const GLAZES_COLLECTION = 'glazes';
export const ACTIVITY_COLLECTION = 'activity';
export const FORMULADAS_COLLECTION = 'formuladas';
export const RECALCULOS_COLLECTION = 'recalculos';

/** Error de acceso a datos con mensaje apto para mostrar al usuario. */
export class GlazeRepoError extends Error {
  readonly code: string;
  readonly path: string | null;

  constructor(message: string, code = 'unknown', path: string | null = null, options?: { cause?: unknown }) {
    super(message);
    this.name = 'GlazeRepoError';
    this.code = code;
    this.path = path;
    if (options?.cause) this.cause = options.cause;
  }
}

/**
 * Conflicto de edición: el documento cambió en el servidor después de que el
 * usuario cargara la ficha. Se distingue del resto de errores para que el
 * formulario pueda ofrecer una decisión en vez de un simple "no se pudo".
 */
export class GlazeConflictError extends GlazeRepoError {
  readonly remoteUpdatedAt: unknown;
  readonly conflictingFields: string[];

  constructor(conflictingFields: string[], remoteUpdatedAt: unknown, path: string | null) {
    super(
      'Esta ficha se ha modificado mientras la editabas. Tu guardado no se ha aplicado para no pisar los cambios de otra persona.',
      'edit-conflict',
      path,
    );
    this.name = 'GlazeConflictError';
    this.conflictingFields = conflictingFields;
    this.remoteUpdatedAt = remoteUpdatedAt;
  }
}

/** Convierte cualquier error de Firebase en un `GlazeRepoError` con mensaje
 * entendible. Nunca se muestra el volcado JSON interno al usuario.
 */
export function toRepoError(error: unknown, path: string | null = null): GlazeRepoError {
  if (error instanceof GlazeRepoError) return error;  const code = typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : 'unknown';

  const messages: Record<string, string> = {
    'permission-denied': 'No tienes permiso para esta operación.',
    unavailable: 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.',
    'not-found': 'El registro ya no existe.',
    unauthenticated: 'Tu sesión ha caducado. Vuelve a iniciar sesión.',
    'failed-precondition': 'Firestore no está disponible en este navegador.',
    aborted: 'La operación se canceló porque hubo otra escritura simultánea.',
    'resource-exhausted': 'La ficha es demasiado grande para guardarse. Reduce el número de fotos.',
  };

  const raw = error instanceof Error ? error.message : String(error);
  return new GlazeRepoError(messages[code] ?? raw, code, path, { cause: error });
}

/** Ejecuta una operación de Firestore devolviendo siempre un `GlazeRepoError`. */
async function run<T>(path: string | null, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toRepoError(error, path);
  }
}

/**
 * Elimina recursivamente las claves con valor `undefined`. Firestore no las
 * admite, y aparecen con facilidad en los módulos técnicos del formulario.
 */
export function sanitizeFirestore<T>(value: T): T {
  if (value === undefined) return undefined as unknown as T;
  if (Array.isArray(value)) return value.map(item => sanitizeFirestore(item)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = sanitizeFirestore(val);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out as T;
  }
  return value;
}

type TimestampLike = { toDate: () => Date } | string | number | Date | null | undefined;

/** Normaliza un timestamp de Firestore, un ISO o un número a milisegundos. */
export function toMillis(value: unknown): number {
  if (!value) return 0;
  if (typeof value === 'object' && value !== null && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime();
  }
  if (value instanceof Date) return value.getTime();
  const parsed = new Date(value as string | number);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

/** Formatea un timestamp de Firestore como fecha legible en español. */
export function formatDate(value: unknown, fallback = ''): string {
  if (!value) return fallback;
  try {
    const date = typeof (value as TimestampLike) === 'object' && value !== null
      && typeof (value as { toDate?: unknown }).toDate === 'function'
      ? (value as { toDate: () => Date }).toDate()
      : new Date(value as string | number);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return fallback;
  }
}

function toGlaze(snapshot: QueryDocumentSnapshot<DocumentData>): Glaze {
  return { id: snapshot.id, ...snapshot.data() } as Glaze;
}

function authorFields() {
  return {
    authorId: auth.currentUser?.uid ?? '',
    authorName: auth.currentUser?.displayName || 'Anónimo',
  };
}

export interface ActivityEvent {
  id?: string;
  type: 'edit' | 'recalc' | 'publish';
  glazeId?: string;
  name: string;
  code?: string;
  area?: boolean;
  byName: string;
  at?: unknown;
}

export const glazeRepo = {
  /** Suscripción en tiempo real a todas las fichas. Devuelve la función de baja. */
  subscribeAll(onNext: (glazes: Glaze[]) => void, onError?: (error: GlazeRepoError) => void): Unsubscribe {
    return onSnapshot(
      collection(db, GLAZES_COLLECTION),
      snapshot => onNext(snapshot.docs.map(toGlaze)),
      error => onError?.(toRepoError(error, GLAZES_COLLECTION)),
    );
  },

  /** Suscripción a las fichas más recientes por `updatedAt`. */
  subscribeRecent(limitCount: number, onNext: (glazes: Glaze[]) => void, onError?: (error: GlazeRepoError) => void): Unsubscribe {
    return onSnapshot(
      query(collection(db, GLAZES_COLLECTION), orderBy('updatedAt', 'desc'), limit(limitCount)),
      snapshot => onNext(snapshot.docs.map(toGlaze)),
      error => onError?.(toRepoError(error, GLAZES_COLLECTION)),
    );
  },

  get(id: string): Promise<Glaze | null> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      const snapshot = await getDoc(doc(db, GLAZES_COLLECTION, id));
      // El id se antepone para que la forma sea la misma que devuelven
      // `getWithCopies` y `subscribeGlaze`. Si esta lectura lo omitiese, la
      // línea base que carga el formulario y la versión del servidor que
      // compara `saveContent` no coincidirían en la misma estructura.
      return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Glaze) : null;
    });
  },

  /** Alta de ficha. Devuelve el id generado. */
  create(data: Partial<Glaze>): Promise<string> {
    return run(GLAZES_COLLECTION, async () => {
      const ref = await addDoc(
        collection(db, GLAZES_COLLECTION),
        sanitizeFirestore({
          ...data,
          ...authorFields(),
          createdAt: data.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }) as DocumentData,
      );
      return ref.id;
    });
  },

  /** Alta de ficha con los timestamps ya fijados (importaciones, áreas). */
  createWithTimestamps(data: Partial<Glaze>, createdAt: unknown): Promise<string> {
    return run(GLAZES_COLLECTION, async () => {
      const ref = await addDoc(
        collection(db, GLAZES_COLLECTION),
        sanitizeFirestore({
          ...data,
          ...authorFields(),
          createdAt: createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }) as DocumentData,
      );
      return ref.id;
    });
  },

  /**
   * Actualización parcial. Nunca sobrescribe el documento completo: evita pisar
   * campos que otro usuario haya cambiado entre la lectura y la escritura.
   */
  update(id: string, patch: Partial<Glaze>): Promise<void> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      await updateDoc(doc(db, GLAZES_COLLECTION, id), sanitizeFirestore({ ...patch, updatedAt: serverTimestamp() }) as DocumentData);
    });
  },

  /** Sustitución del contenido editable de la ficha conservando `copies`. */
  replaceContent(id: string, data: Partial<Glaze>): Promise<void> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      const { copies, id: _ignoredId, ...rest } = data as Glaze;
      await setDoc(
        doc(db, GLAZES_COLLECTION, id),
        sanitizeFirestore({
          ...rest,
          ...authorFields(),
          createdAt: data.createdAt ?? serverTimestamp(),
          updatedAt: serverTimestamp(),
        }) as DocumentData,
        { merge: true },
      );
    });
  },

  /**
   * Guardado del contenido de la ficha con control de concurrencia.
   *
   * La comprobación y la escritura ocurren dentro de la misma transacción: si
   * otra persona guarda entre ambas, Firestore reintenta y el conflicto se
   * detecta sobre el estado realmente más reciente. Esto cierra la ventana que
   * dejaba el patrón "comprobar y luego escribir" sin transaccionar.
   *
   * @param baseline Estado que el usuario tenía en pantalla al abrir la ficha.
   * @param force    Si es `true` sobrescribe sin preguntar (el usuario eligió
   *                 guardar de todos modos en el diálogo de conflicto).
   * @returns La ficha tal y como queda tras guardar, leída del servidor.
   */
  async saveContent(
    id: string,
    data: Partial<Glaze>,
    baseline: Partial<Glaze>,
    force = false,
  ): Promise<Glaze> {
    const path = `${GLAZES_COLLECTION}/${id}`;
    // El formulario no tiene ningún campo de inventario, pero su estado
    // arrastra el valor que cargó. Escribirlo aquí revertía en silencio
    // cualquier ajuste de stock hecho desde el panel mientras se editaba.
    const { copies, id: _ignoredId, inventoryLevel: _ignoredInventory, ...rest } = data as Glaze;
    void copies;
    void _ignoredId;
    void _ignoredInventory;
    const payload = sanitizeFirestore({
      ...rest,
      ...authorFields(),
      createdAt: data.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    }) as DocumentData;

    await run(path, () => runTransaction(db, async transaction => {
      const ref = doc(db, GLAZES_COLLECTION, id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        throw new GlazeRepoError('La ficha ya no existe. No se ha guardado nada.', 'not-found', path);
      }
      const remote = { id: snapshot.id, ...snapshot.data() } as Glaze;
      if (!force) {
        const conflicts = findConflictingFields(baseline, remote);
        if (conflicts.length > 0) {
          throw new GlazeConflictError(conflicts, remote.updatedAt, path);
        }
      }
      transaction.set(ref, payload, { merge: true });
    }));

    const fresh = await glazeRepo.getWithCopies(id);
    if (!fresh) throw new GlazeRepoError('La ficha ya no existe.', 'not-found', path);
    return fresh;
  },

  /**
   * Guarda el array de copias preservando el resto del documento. También
   * transaccional: evita que dos duplicados simultáneos se pisen entre ellos.
   */
  async saveCopies(
    id: string,
    copies: Glaze['copies'],
    baseline: Partial<Glaze>,
    force = false,
  ): Promise<Glaze> {
    const path = `${GLAZES_COLLECTION}/${id}`;
    await run(path, () => runTransaction(db, async transaction => {
      const ref = doc(db, GLAZES_COLLECTION, id);
      const snapshot = await transaction.get(ref);
      if (!snapshot.exists()) {
        throw new GlazeRepoError('La ficha ya no existe. No se ha guardado nada.', 'not-found', path);
      }
      const remote = { id: snapshot.id, ...snapshot.data() } as Glaze;
      if (!force) {
        // La comparación usa la línea base tal como se cargó. Sustituir aquí
        // las copias por las que se van a escribir convertía toda edición de
        // una copia en conflicto, porque la única diferencia comparada era
        // justo el cambio que el usuario estaba haciendo.
        const conflicts = findConflictingFields(
          buildComparableGlaze(baseline as Partial<Glaze>),
          buildComparableGlaze(remote),
        );
        if (conflicts.length > 0) {
          throw new GlazeConflictError(conflicts, remote.updatedAt, path);
        }
      }
      transaction.set(ref, sanitizeFirestore({ copies, updatedAt: serverTimestamp() }) as DocumentData, { merge: true });
    }));

    const fresh = await glazeRepo.getWithCopies(id);
    if (!fresh) throw new GlazeRepoError('La ficha ya no existe.', 'not-found', path);
    return fresh;
  },

  /** Borra la ficha y sus comentarios en un único batch. */
  remove(id: string): Promise<void> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      const glazeRef = doc(db, GLAZES_COLLECTION, id);
      const comments = await getDocs(collection(glazeRef, 'comments'));
      const batch = writeBatch(db);
      comments.docs.forEach(comment => batch.delete(comment.ref));
      batch.delete(glazeRef);
      await batch.commit();
    });
  },

  /** Elimina las copias indicadas releyendo antes el documento. */
  removeCopies(id: string, indexes: number[]): Promise<void> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      const fresh = await glazeRepo.get(id);
      if (!fresh) throw new GlazeRepoError('La ficha ya no existe.', 'not-found', `${GLAZES_COLLECTION}/${id}`);
      const toDelete = new Set(indexes);
      const copies = (fresh.copies || []).filter((_, index) => !toDelete.has(index));
      await glazeRepo.update(id, { copies });
    });
  },

  /**
   * Copias de la ficha recién leídas del servidor.
   *
   * Usa `getDocFromServer` a propósito: la caché persistente podría devolver
   * una versión anterior y el control de concurrencia compararía contra datos
   * obsoletos, dejando pasar conflictos reales.
   */
  async getWithCopies(id: string): Promise<Glaze | null> {
    return run(`${GLAZES_COLLECTION}/${id}`, async () => {
      const snapshot = await getDocFromServer(doc(db, GLAZES_COLLECTION, id));
      if (!snapshot.exists()) return null;
      return { id: snapshot.id, ...snapshot.data() } as Glaze;
    });
  },

  findByCode(code: string): Promise<Glaze[]> {
    return run(GLAZES_COLLECTION, async () => {
      const snapshot = await getDocs(query(collection(db, GLAZES_COLLECTION), where('code', '==', code)));
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Glaze);
    });
  },

  /** ¿Existe ya otra ficha con este código? */
  async isCodeTaken(code: string, exceptId?: string | null): Promise<boolean> {
    const matches = await glazeRepo.findByCode(code);
    return matches.some(glaze => glaze.id !== exceptId);
  },

  /**
   * Siguiente correlativo de 3 dígitos calculado sobre el MÁXIMO existente, no
   * sobre el último creado. Con el máximo, dos altas simultáneas convergen en
   * el mismo candidato y el chequeo de duplicados en el formulario lo rechaza.
   */
  async nextCodeNumber(): Promise<string> {
    return run(GLAZES_COLLECTION, async () => {
      const snapshot = await getDocs(collection(db, GLAZES_COLLECTION));
      const max = snapshot.docs.reduce((highest, entry) => {
        const code = String(entry.data().code ?? '');
        const match = code.match(/-(\d{3})(?:-[A-Z])?$/);
        return match ? Math.max(highest, Number(match[1])) : highest;
      }, 0);
      return String(max + 1).padStart(3, '0');
    });
  },

  /**
   * Primer código libre a partir de `baseCode`, probando `base`, `base-2`...
   * Se mantiene el límite de 100 intentos del comportamiento anterior.
   */
  async nextAvailableCode(baseCode: string): Promise<string> {
    for (let index = 0; index <= 99; index += 1) {
      const candidate = index === 0 ? baseCode : `${baseCode}-${index + 1}`;
      if (!(await glazeRepo.isCodeTaken(candidate))) return candidate;
    }
    return `${baseCode}-${crypto.randomUUID().slice(0, 6)}`;
  },

  /** Envía fichas al área personal de formuladas. */
  sendToFormuladas(uid: string, items: Array<Partial<Glaze> & { parentId?: string }>): Promise<void> {
    return run(`${FORMULADAS_COLLECTION}/${uid}/items`, async () => {
      const batch = writeBatch(db);
      items.forEach(item => {
        const { parentId, ...rest } = item;
        batch.set(doc(collection(db, `${FORMULADAS_COLLECTION}/${uid}/items`)), sanitizeFirestore({
          ...rest,
          scope: 'formuladas',
          sourceGlazeId: parentId ?? (item.id as string | undefined),
          sourceCode: item.code || 'FICHA',
          status: 'draft',
          isValidated: false,
          authorId: uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }) as DocumentData);
      });
      await batch.commit();
    });
  },

  logActivity(event: ActivityEvent): Promise<void> {
    return run(ACTIVITY_COLLECTION, async () => {
      await addDoc(collection(db, ACTIVITY_COLLECTION), {
        ...event,
        byName: event.byName || auth.currentUser?.displayName || 'Anónimo',
        at: serverTimestamp(),
      });
    });
  },
};
export const activityRepo = {
  subscribeRecent(limitCount: number, onNext: (events: ActivityEvent[]) => void, onError?: (error: GlazeRepoError) => void): Unsubscribe {
    return onSnapshot(
      query(collection(db, ACTIVITY_COLLECTION), orderBy('at', 'desc'), limit(limitCount)),
      snapshot => onNext(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as ActivityEvent)),
      error => onError?.(toRepoError(error, ACTIVITY_COLLECTION)),
    );
  },
};

/** Suscripción a una ficha concreta. `null` cuando el documento no existe. */
export function subscribeGlaze(
  id: string,
  onNext: (glaze: Glaze | null) => void,
  onError?: (error: GlazeRepoError) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, GLAZES_COLLECTION, id),
    snapshot => onNext(snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Glaze) : null),
    error => onError?.(toRepoError(error, `${GLAZES_COLLECTION}/${id}`)),
  );
}

export const commentsRepo = {
  subscribe(glazeId: string, onNext: (comments: Array<Comment & { id: string }>) => void, onError?: (error: GlazeRepoError) => void): Unsubscribe {
    return onSnapshot(
      query(collection(db, GLAZES_COLLECTION, glazeId, 'comments'), orderBy('createdAt', 'asc')),
      snapshot => onNext(snapshot.docs.map(d => ({ id: d.id, ...d.data() }) as Comment & { id: string })),
      error => onError?.(toRepoError(error, `${GLAZES_COLLECTION}/${glazeId}/comments`)),
    );
  },

  add(glazeId: string, text: string): Promise<void> {
    return run(`${GLAZES_COLLECTION}/${glazeId}/comments`, async () => {
      await addDoc(collection(db, GLAZES_COLLECTION, glazeId, 'comments'), {
        glazeId,
        authorId: auth.currentUser?.uid ?? '',
        authorName: auth.currentUser?.displayName || 'Anónimo',
        text,
        createdAt: serverTimestamp(),
      });
    });
  },
};

/**
 * Sube una imagen de ficha a Firebase Storage y devuelve su URL.
 *
 * Si Storage no está configurado en el proyecto devuelve `null` para que el
 * llamante conserve el data-URL como valor de respaldo, en lugar de perder la
 * imagen. Motivo: el data-URL duplicaba cada foto dentro del documento de
 * Firestore (y dentro de cada copia) y hacía ineludible el límite de 1 MiB.
 */
export async function uploadGlazeImage(file: Blob, path: string): Promise<string | null> {
  const storage = getGlazeStorage();
  if (!storage) return null;

  // Una subida que se queda colgada por la red dejaría la ficha en
  // "Subiendo..." indefinidamente. Con límite de tiempo se cae al data-URL y
  // la foto se conserva igualmente.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('La subida a Storage tardó demasiado')), 20000);
  });

  try {
    const snapshot = await Promise.race([
      uploadBytes(ref(storage, path), file, { contentType: file.type || 'image/jpeg' }),
      timeout,
    ]);
    return await Promise.race([getDownloadURL(snapshot.ref), timeout]);
  } catch (error) {
    console.warn('No se pudo subir la imagen a Storage, se guarda incrustada:', error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export { findConflictingFields } from './concurrency';

export const isCatalogStatus = (status: GlazeStatus | undefined): boolean =>
  status === 'validated' || status === 'published';
