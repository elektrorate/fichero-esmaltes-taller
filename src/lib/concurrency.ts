// Detección de conflictos de edición concurrente.
//
// Lógica pura, sin dependencias de Firebase, para poder testearla aislada.
// El objetivo: que dos personas que tienen la misma ficha abierta no pierdan
// trabajo la una de la otra en silencio.

import type { Glaze } from '../types';

/**
 * Serializa un valor de forma estable (claves ordenadas) para poder comparar
 * el estado que el usuario tiene en pantalla con el que hay en el servidor.
 *
 * Se normalizan los Timestamps de Firestore a milisegundos porque dos lecturas
 * del mismo documento producen objetos distintos en memoria que sí son
 * equivalentes en valor.
 */
export function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();

  const normalize = (input: unknown): unknown => {
    if (input === null || typeof input !== 'object') {
      return typeof input === 'function' ? undefined : input;
    }
    if (input instanceof Date) return input.toISOString();
    if (typeof (input as { toMillis?: unknown }).toMillis === 'function') {
      const millis = (input as { toMillis: () => number }).toMillis();
      return Number.isFinite(millis) ? millis : null;
    }
    if (Array.isArray(input)) return input.map(normalize);
    if (seen.has(input)) return '[circular]';
    seen.add(input);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input as Record<string, unknown>).sort()) {
      const cleaned = normalize((input as Record<string, unknown>)[key]);
      if (cleaned !== undefined) out[key] = cleaned;
    }
    return out;
  };

  try {
    return JSON.stringify(normalize(value)) ?? '';
  } catch {
    return '';
  }
}

/**
 * Campos que nunca deben provocar un conflicto:
 *  - `copies`: las gestiona la ruta de copias, con su propia comprobación.
 *  - `createdAt`, `authorId`, `authorName`: los escribe la capa de datos.
 *  - `updatedAt`: cambia en cada escritura, incluso en un simple ajuste de
 *    inventario, y no representa una edición de contenido.
 *  - `inventoryLevel`: lo edita el panel de inventario. `saveContent` lo
 *    excluye de la escritura, así que no puede pisarse y no debe generar un
 *    aviso que bloquearía el guardado de la ficha sin motivo.
 *
 * `id` se ignora por un motivo distinto: identifica el documento, no es
 * contenido. La línea base se carga con `glazeRepo.get` y el servidor con
 * `getWithCopies`, y si uno lo incluye y el otro no, comparar el id produce
 * un conflicto en todas las fichas sin que exista ninguno real.
 */
export const CONCURRENCY_IGNORED_FIELDS = [
  'id',
  'copies',
  'createdAt',
  'updatedAt',
  'authorId',
  'authorName',
  'inventoryLevel',
];

/**
 * Prepara una ficha para comparar el contenido y las copias.
 *
 * Las copias se guardan en el documento bajo la clave `__copies`, así que se
 * reconstruyen aquí para que una diferencia en ellas se detecte como un
 * conflicto y no pase desapercibida. El `copyId` se normaliza por posición
 * porque cada copia reescrita recibe un id nuevo y comparar el id daría falso
 * positivo en cuanto una copia se vuelve a guardar.
 *
 * Importante: recibe la ficha TAL COMO SE CARGÓ, nunca con las copias que se
 * van a escribir. Sustituir las copias de la línea base por las nuevas hace
 * que toda edición de una copia parezca un conflicto, porque la diferencia
 * comparada es precisamente el cambio que el usuario está haciendo.
 */
export function buildComparableGlaze(glaze: Partial<Glaze>): Record<string, unknown> {
  const { copies, updatedAt: _updated, createdAt: _created, ...content } = glaze as Glaze & {
    updatedAt?: unknown;
    createdAt?: unknown;
  };
  void _updated;
  void _created;
  return {
    ...content,
    __copies: (copies || []).map((copy, index) => ({ ...copy, copyId: `idx-${index}` })),
  };
}

/**
 * Devuelve los campos en los que la versión local y la del servidor difieren.
 * Una lista vacía significa que no hay conflicto y el guardado puede seguir.
 */
export function findConflictingFields(mine: unknown, remote: unknown): string[] {
  if (!remote || typeof remote !== 'object') return [];
  const mineRecord = (mine && typeof mine === 'object' ? mine : {}) as Record<string, unknown>;
  const remoteRecord = remote as Record<string, unknown>;
  // Sin línea base no hay contra qué comparar. El formulario la deja vacía al
  // crear una ficha, y comparar `{}` contra un documento recién creado daría
  // todos los campos por cambiados.
  if (Object.keys(mineRecord).length === 0) return [];
  const keys = new Set([...Object.keys(mineRecord), ...Object.keys(remoteRecord)]);
  const conflicts: string[] = [];
  for (const key of keys) {
    if (CONCURRENCY_IGNORED_FIELDS.includes(key)) continue;
    if (stableStringify(mineRecord[key]) !== stableStringify(remoteRecord[key])) {
      conflicts.push(key);
    }
  }
  return conflicts.sort();
}
