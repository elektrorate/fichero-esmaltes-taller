import { describe, it, expect } from 'vitest';
import { findConflictingFields, buildComparableGlaze, stableStringify } from './concurrency';
import type { Glaze } from '../types';

/** Timestamp de Firestore simulado: dos instancias del mismo instante. */
const timestamp = (millis: number) => ({
  seconds: Math.floor(millis / 1000),
  nanoseconds: (millis % 1000) * 1e6,
  toMillis: () => millis,
  toDate: () => new Date(millis),
  toJSON: () => ({ seconds: millis / 1000 }),
});

const BASE = {
  id: 'abc',
  name: 'Celadón',
  code: 'TB-001',
  color: 'Verde',
  status: 'draft',
  isValidated: false,
  inventoryLevel: 40,
  recipe: { base: [{ material: 'Sílice', amount: 2.4 }], additional: [], totalBase: 100 },
  createdAt: timestamp(1_700_000_000_000),
  updatedAt: timestamp(1_700_000_000_000),
  authorId: 'u1',
  authorName: 'Erick',
};

describe('stableStringify', () => {
  it('no depende del orden de las claves', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
  });

  it('trata dos Timestamps del mismo instante como iguales', () => {
    // Es el caso crítico: dos lecturas del mismo documento crean objetos
    // distintos en memoria. Sin normalizar, daría falso positivo siempre.
    expect(stableStringify({ at: timestamp(1_700_000_000_000) }))
      .toBe(stableStringify({ at: timestamp(1_700_000_000_000) }));
  });

  it('distingue instantes distintos', () => {
    expect(stableStringify({ at: timestamp(1) })).not.toBe(stableStringify({ at: timestamp(2) }));
  });

  it('respeta el orden de los arrays (no son conjuntos)', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('no explota con referencias circulares', () => {
    const cyclic: Record<string, unknown> = { name: 'x' };
    cyclic.self = cyclic;
    expect(() => stableStringify(cyclic)).not.toThrow();
  });
});

/**
 * El id identifica el documento, no es contenido. La línea base del formulario
 * y la versión que lee el servidor tienen que compararse aunque una lo
 * incluya y la otra no. Este bloque existió para evitar un falso positivo que
 * bloqueaba el guardado de todas las fichas: la línea base venía de
 * `glazeRepo.get` sin `id` y el servidor de `getWithCopies` con `id`.
 */
describe('identidad del documento', () => {
  it('no ve conflicto si solo cambia la presencia del id', () => {
    const sinId = { name: 'Celadón', color: 'Verde' };
    const conId = { id: 'abc123', name: 'Celadón', color: 'Verde' };
    expect(findConflictingFields(sinId, conId)).toEqual([]);
    expect(findConflictingFields(conId, sinId)).toEqual([]);
  });

  it('no ve conflicto si el id es el mismo', () => {
    const conId = { id: 'abc123', name: 'Celadón' };
    expect(findConflictingFields(conId, { ...conId })).toEqual([]);
  });

  it('sigue detectando un conflicto real aunque el id coincida', () => {
    const mine = { id: 'abc123', name: 'Celadón' };
    const remote = { id: 'abc123', name: 'Celadón de Rye' };
    expect(findConflictingFields(mine, remote)).toEqual(['name']);
  });
});

/**
 * Al crear una ficha el formulario no tiene línea base y la deja vacía. Sin
 * este caso, guardar una ficha nueva comparaba `{}` contra el documento recién
 * creado y daba por cambiados todos los campos.
 */
describe('ficha nueva sin línea base', () => {
  it('no ve conflicto si no hay línea base', () => {
    expect(findConflictingFields({}, { name: 'Celadón', color: 'Verde' })).toEqual([]);
  });

  it('no ve conflicto si la línea base llega como null o undefined', () => {
    const remote = { name: 'Celadón' };
    expect(findConflictingFields(null, remote)).toEqual([]);
    expect(findConflictingFields(undefined, remote)).toEqual([]);
  });

  it('sigue detectando conflictos cuando la línea base sí tiene contenido', () => {
    expect(findConflictingFields({ name: 'A' }, { name: 'B' })).toEqual(['name']);
  });
});

describe('findConflictingFields', () => {
  it('no detecta conflicto si la versión local y la del servidor coinciden', () => {
    expect(findConflictingFields(BASE, { ...BASE })).toEqual([]);
  });

  it('detecta el campo que otra persona cambió', () => {
    const remote = { ...BASE, color: 'Azul' };
    expect(findConflictingFields(BASE, remote)).toEqual(['color']);
  });

  it('acumula varios campos en conflicto', () => {
    const remote = { ...BASE, color: 'Azul', finish: 'Mate' };
    expect(findConflictingFields(BASE, remote)).toEqual(['color', 'finish']);
  });

  it('ignora updatedAt: un ajuste de inventario no debe bloquear el guardado', () => {
    // SettingsPanel cambia solo `inventoryLevel`, que dispara updatedAt.
    // Si eso contara como conflicto, tocar el stock desde el panel dejaría
    // al resto del taller sin poder guardar sus fichas.
    const remote = { ...BASE, inventoryLevel: 12, updatedAt: timestamp(1_800_000_000_000) };
    expect(findConflictingFields(BASE, remote)).toEqual([]);
  });

  it('ignora los metadatos que escribe la capa de datos', () => {
    const remote = {
      ...BASE,
      authorId: 'u2',
      authorName: 'Otra persona',
      createdAt: timestamp(1_600_000_000_000),
    };
    expect(findConflictingFields(BASE, remote)).toEqual([]);
  });

  it('ignora `copies`: lo controla la ruta de copias', () => {
    const remote = { ...BASE, copies: [{ copyId: 'c1', sourceCode: 'TB-001' }] };
    expect(findConflictingFields({ ...BASE, copies: [] }, remote)).toEqual([]);
  });

  it('detecta un cambio profundo dentro de la fórmula', () => {
    const remote = {
      ...BASE,
      recipe: { base: [{ material: 'Sílice', amount: 9.9 }], additional: [], totalBase: 100 },
    };
    expect(findConflictingFields(BASE, remote)).toEqual(['recipe']);
  });

  it('detecta un cambio en un campo que solo existe en el servidor', () => {
    const remote = { ...BASE, tags: ['nuevo'] };
    expect(findConflictingFields(BASE, remote)).toEqual(['tags']);
  });

  it('devuelve lista vacía si el servidor responde null', () => {
    expect(findConflictingFields(BASE, null)).toEqual([]);
  });

  it('ordena los conflictos para que el diálogo sea estable', () => {
    const remote = { ...BASE, finish: 'Mate', color: 'Azul', texture: 'Rugoso' };
    const result = findConflictingFields(BASE, remote);
    expect(result).toEqual([...result].sort());
  });
});

describe('findConflictingFields con copias', () => {
  // `saveCopies` mapea el array a la clave `__copies` justamente porque
  // `copies` está en la lista de ignorados: el contenido de la ficha y el de
  // las copias se comprueban en rutas separadas.
  it('detecta un cambio en una copia cuando se compara bajo __copies', () => {
    const base = {
      name: 'Celadón',
      __copies: [
        { copyId: 'idx-0', status: 'draft', recipe: { base: [{ material: 'A', amount: 1 }] } },
        { copyId: 'idx-1', status: 'draft', recipe: { base: [{ material: 'B', amount: 2 }] } },
      ],
    };
    const remote = {
      name: 'Celadón',
      __copies: [
        { copyId: 'idx-0', status: 'draft', recipe: { base: [{ material: 'A', amount: 1 }] } },
        { copyId: 'idx-1', status: 'validated', recipe: { base: [{ material: 'B', amount: 2 }] } },
      ],
    };
    expect(findConflictingFields(base, remote)).toEqual(['__copies']);
  });

  it('no da conflicto si las copias son equivalentes tras normalizar el copyId', () => {
    // Guardar una copia le asigna un copyId nuevo. Como `saveCopies` lo
    // sobrescribe por posición (`idx-N`), el id no debe provocar conflicto.
    const base = { name: 'X', __copies: [{ copyId: 'idx-0', status: 'draft', notes: 'igual' }] };
    const remote = { name: 'X', __copies: [{ copyId: 'idx-0', status: 'draft', notes: 'igual' }] };
    expect(findConflictingFields(base, remote)).toEqual([]);
  });

  it('detecta que otra persona añadió una copia', () => {
    const base = { name: 'X', __copies: [{ copyId: 'idx-0', status: 'draft' }] };
    const remote = {
      name: 'X',
      __copies: [
        { copyId: 'idx-0', status: 'draft' },
        { copyId: 'idx-1', status: 'draft' },
      ],
    };
    expect(findConflictingFields(base, remote)).toEqual(['__copies']);
  });
});

/**
 * El bug que motivó este bloque: `saveCopies` comparaba la línea base con las
 * copias que iba a escribir, de modo que editar una copia siempre generaba
 * conflicto. Estos tests fijan que la comparación es entre la línea base tal
 * como se cargó y el servidor, nunca contra lo que el usuario está guardando.
 */
describe('buildComparableGlaze al guardar copias', () => {
  const copia = (patch: Record<string, unknown> = {}) =>
    ({
      copyId: 'idx-0',
      status: 'draft',
      notes: 'original',
      ...patch,
    }) as unknown as Glaze['copies'][number];

  it('no da conflicto al editar una copia si el servidor no ha cambiado', () => {
    // Es el caso normal: edito la copia 1 y guardo. El servidor sigue igual.
    const baseline = { name: 'Celadón', copies: [copia()] };
    const remote = { name: 'Celadón', copies: [copia()] };

    const conflicts = findConflictingFields(
      buildComparableGlaze(baseline),
      buildComparableGlaze(remote),
    );
    expect(conflicts).toEqual([]);
  });

  it('documenta el fallo: inyectar las copias nuevas en la línea base confunde', () => {
    // Esta es la forma que tenía `saveCopies` y que bloqueaba todos los
    // guardados de copia. Se conserva como prueba de por qué la comparación
    // no puede usar lo que el usuario está guardando.
    const baseline = { name: 'Celadón', copies: [copia()] };
    const remote = { name: 'Celadón', copies: [copia()] };
    const nuevas = [copia({ notes: 'mi cambio' })];

    const conCambios = findConflictingFields(
      buildComparableGlaze({ ...baseline, copies: nuevas }),
      buildComparableGlaze(remote),
    );
    expect(conCambios).toEqual(['__copies']);
  });

  it('sigue detectando el cambio de otra persona en una copia', () => {
    const baseline = { name: 'Celadón', copies: [copia()] };
    const remote = { name: 'Celadón', copies: [copia({ status: 'validated' })] };

    const conflicts = findConflictingFields(
      buildComparableGlaze(baseline),
      buildComparableGlaze(remote),
    );
    expect(conflicts).toEqual(['__copies']);
  });

  it('detecta que otra persona añadió una copia', () => {
    const baseline = { name: 'Celadón', copies: [copia()] };
    const remote = { name: 'Celadón', copies: [copia(), copia({ copyId: 'idx-1' })] };

    const conflicts = findConflictingFields(
      buildComparableGlaze(baseline),
      buildComparableGlaze(remote),
    );
    expect(conflicts).toEqual(['__copies']);
  });

  it('ignora el copyId regenerado al reordenar la posición', () => {
    const baseline = { copies: [copia({ copyId: 'viejo-a' })] };
    const remote = { copies: [copia({ copyId: 'nuevo-b' })] };

    expect(findConflictingFields(
      buildComparableGlaze(baseline),
      buildComparableGlaze(remote),
    )).toEqual([]);
  });

  it('no ve conflicto si la ficha no tiene copias', () => {
    expect(findConflictingFields(
      buildComparableGlaze({ name: 'X' }),
      buildComparableGlaze({ name: 'X' }),
    )).toEqual([]);
  });

  it('sigue detectando un cambio en el contenido junto a las copias', () => {
    const baseline = { name: 'Celadón', color: 'Verde', copies: [copia()] };
    const remote = { name: 'Celadón', color: 'Azul', copies: [copia()] };

    const conflicts = findConflictingFields(
      buildComparableGlaze(baseline),
      buildComparableGlaze(remote),
    );
    expect(conflicts).toEqual(['color']);
  });
});
