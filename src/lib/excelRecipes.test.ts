// Pruebas de la lectura de recetas en Excel.
//
// El caso que motiva el módulo: una hoja con "Material" y "Cantidad (g)" y 36
// filas de datos. No es un catálogo sino la receta de una sola ficha, y antes
// se descartaba cada fila por no tener columna de nombre.

import { describe, it, expect } from 'vitest';
import {
  buildGlazeFromRecipeSheet,
  extractPositionalItems,
  extractRecipeItems,
  hasMaterialColumn,
  hasNameColumn,
  isHeaderCell,
  parseExcelAmount,
  parsePackedMaterias,
  type TableColumn,
} from './excelRecipes';

const materialCol = (index: number, sub = 'base'): TableColumn => ({ index, kind: 'material', sub, num: 1 });
const amountCol = (index: number, sub = 'base'): TableColumn => ({ index, kind: 'amount', sub, num: 1 });

describe('parseExcelAmount', () => {
  it('lee números', () => {
    expect(parseExcelAmount(12.5)).toBe(12.5);
  });

  it('convierte coma decimal', () => {
    expect(parseExcelAmount('12,5')).toBe(12.5);
  });

  it('convierte punto de miles y coma decimal', () => {
    expect(parseExcelAmount('1.234,5')).toBe(1234.5);
  });

  it('extrae el número de un texto con unidades', () => {
    expect(parseExcelAmount('250 g')).toBe(250);
  });

  it('devuelve 0 para celdas vacías', () => {
    expect(parseExcelAmount('')).toBe(0);
    expect(parseExcelAmount(null)).toBe(0);
    expect(parseExcelAmount(undefined)).toBe(0);
  });
});

describe('extractRecipeItems', () => {
  it('empareja material con su cantidad', () => {
    const { base } = extractRecipeItems(['Feldespato', '40'], [materialCol(0), amountCol(1)]);
    expect(base).toEqual([{ material: 'Feldespato', amount: 40 }]);
  });

  it('empareja por número cuando hay varios', () => {
    const columns = [materialCol(0), amountCol(1), { ...materialCol(2), num: 2 }, { ...amountCol(3), num: 2 }];
    const { base } = extractRecipeItems(['Caolín', '20', 'Sílice', '30'], columns);
    expect(base).toEqual([
      { material: 'Caolín', amount: 20 },
      { material: 'Sílice', amount: 30 },
    ]);
  });

  it('separa los aditivos', () => {
    const { base, additional } = extractRecipeItems(
      ['Caolín', '80', 'Óxido de hierro', '8'],
      [materialCol(0), amountCol(1), materialCol(2, 'additional'), amountCol(3, 'additional')],
    );
    expect(base).toEqual([{ material: 'Caolín', amount: 80 }]);
    expect(additional).toEqual([{ material: 'Óxido de hierro', amount: 8 }]);
  });

  it('ignora materiales sin nombre', () => {
    const { base } = extractRecipeItems(['', '20'], [materialCol(0), amountCol(1)]);
    expect(base).toEqual([]);
  });
});

describe('detección del formato de la hoja', () => {
  it('reconoce el catálogo por la columna de nombre', () => {
    const columns: TableColumn[] = [
      { index: 0, kind: 'text', sub: 'name' },
      materialCol(1),
      amountCol(2),
    ];
    expect(hasNameColumn(columns)).toBe(true);
    expect(hasMaterialColumn(columns)).toBe(true);
  });

  it('reconoce la receta vertical sin columna de nombre', () => {
    const columns: TableColumn[] = [materialCol(0), amountCol(1)];
    expect(hasNameColumn(columns)).toBe(false);
    expect(hasMaterialColumn(columns)).toBe(true);
  });

  it('no ve materiales si solo hay columnas de texto', () => {
    const columns: TableColumn[] = [{ index: 0, kind: 'text', sub: 'observations' }];
    expect(hasMaterialColumn(columns)).toBe(false);
  });
});

describe('buildGlazeFromRecipeSheet', () => {
  it('convierte la hoja en una ficha con el nombre de la hoja', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Feldespato', '400'],
      ['Caolín', '200'],
      ['Sílice', '150'],
    ];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado peliut');

    expect(glaze).not.toBeNull();
    expect(glaze?.name).toBe('Dorado peliut');
    expect(glaze?.recipe?.base).toEqual([
      { material: 'Feldespato', amount: 400 },
      { material: 'Caolín', amount: 200 },
      { material: 'Sílice', amount: 150 },
    ]);
    expect(glaze?.recipe?.totalBase).toBe(750);
  });

  it('acepta el caso de 36 materiales y no crea 36 fichas', () => {
    const rows: unknown[][] = [['Material', 'Cantidad (g)']];
    for (let i = 0; i < 36; i += 1) rows.push([`Materia ${i + 1}`, String((i + 1) * 10)]);

    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado peliut');

    expect(glaze?.name).toBe('Dorado peliut');
    expect(glaze?.recipe?.base).toHaveLength(36);
    expect(glaze?.recipe?.totalBase).toBe(10 * (36 * 37) / 2);
  });

  it('salta filas de total y subtotal', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Caolín', '200'],
      ['Total', '200'],
      ['Suma', '200'],
    ];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado');

    expect(glaze?.recipe?.base).toEqual([{ material: 'Caolín', amount: 200 }]);
    expect(glaze?.recipe?.totalBase).toBe(200);
  });

  it('salta filas totalmente vacías', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Caolín', '200'],
      ['', ''],
      [null, null],
      ['Sílice', '100'],
    ];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado');

    expect(glaze?.recipe?.base).toHaveLength(2);
  });

  it('devuelve null si no hay ningún material', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['', ''],
    ];
    expect(buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado')).toBeNull();
  });

  it('devuelve null si la hoja no tiene nombre', () => {
    const rows = [['Material', 'Cantidad (g)'], ['Caolín', '200']];
    expect(buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], '   ')).toBeNull();
  });

  it('acepta el encabezado en una fila posterior', () => {
    const rows = [
      ['Receta del esmalte', null, null],
      [null, null, null],
      ['Material', 'Cantidad (g)', null],
      ['Caolín', '200', null],
    ];
    const glaze = buildGlazeFromRecipeSheet(rows, 2, [materialCol(0), amountCol(1)], 'Dorado');

    expect(glaze?.recipe?.base).toEqual([{ material: 'Caolín', amount: 200 }]);
  });

  it('admite decimales con coma en la cantidad', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Caolín', '12,5'],
    ];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado');

    expect(glaze?.recipe?.base).toEqual([{ material: 'Caolín', amount: 12.5 }]);
  });

  it('anota la procedencia en observaciones', () => {
    const rows = [['Material', 'Cantidad (g)'], ['Caolín', '200']];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, [materialCol(0), amountCol(1)], 'Dorado peliut');

    expect(glaze?.observations).toContain('Dorado peliut');
  });
});

describe('parsePackedMaterias', () => {
  it('separa varios materiales en una celda', () => {
    expect(parsePackedMaterias('Caolín: 200 | Sílice: 100')).toEqual([
      { material: 'Caolín', amount: 200 },
      { material: 'Sílice', amount: 100 },
    ]);
  });

  it('lee "material, cantidad"', () => {
    expect(parsePackedMaterias('Caolín, 200 g')).toEqual([{ material: 'Caolín', amount: 200 }]);
  });
});

describe('isHeaderCell', () => {
  it('reconoce palabras de encabezado', () => {
    expect(isHeaderCell('Material')).toBe(true);
    expect(isHeaderCell('cantidad (g)')).toBe(true);
    expect(isHeaderCell('  Cantidad  ')).toBe(true);
    expect(isHeaderCell('Materia Prima')).toBe(true);
  });

  it('no confunde un material que contiene una palabra de encabezado', () => {
    // Contiene "oxido" pero es un material, no el encabezado de una columna.
    expect(isHeaderCell('Óxido de cobalto')).toBe(false);
    expect(isHeaderCell('Carbonato de bario')).toBe(false);
    expect(isHeaderCell('Sílice 325')).toBe(false);
  });

  it('trata la celda vacía como encabezado', () => {
    expect(isHeaderCell('')).toBe(true);
    expect(isHeaderCell(null)).toBe(true);
  });
});

describe('extractPositionalItems', () => {
  it('toma el primer texto como material y el primer número como cantidad', () => {
    expect(extractPositionalItems(['Óxido de cobalto', '3,5'])).toEqual([
      { material: 'Óxido de cobalto', amount: 3.5 },
    ]);
  });

  it('no usa un número como nombre de material', () => {
    expect(extractPositionalItems(['5'])).toEqual([]);
  });

  it('descarta la palabra de encabezado como material', () => {
    expect(extractPositionalItems(['Material', 'Cantidad'])).toEqual([]);
  });

  it('tolera columnas vacías delante', () => {
    expect(extractPositionalItems(['', '', 'Caolín', '', '20'])).toEqual([
      { material: 'Caolín', amount: 20 },
    ]);
  });
});

/**
 * Formas reales de hojas de receta que hicieron fallar al primer importador: la
 * fila de encabezado no existe, así que el detector tomaba el primer material
 * como si fuera el encabezado y la hoja terminaba sin materiales.
 */
describe('hojas de receta sin fila de encabezado', () => {
  it('recupera el primer material tomado como encabezado', () => {
    // El detector marca la fila 0 como encabezado porque "Óxido de cobalto"
    // clasifica como material. En realidad es el primer material.
    const rows = [
      ['Óxido de cobalto', '3'],
      ['Carbonato de bario', '20'],
    ];
    const columns: TableColumn[] = [materialCol(0, 'additional')];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, columns, 'Alternativo España');

    expect(glaze?.name).toBe('Alternativo España');
    const items = [...(glaze?.recipe?.base || []), ...(glaze?.recipe?.additional || [])];
    expect(items).toEqual([
      { material: 'Óxido de cobalto', amount: 0 },
      { material: 'Carbonato de bario', amount: 0 },
    ]);
  });

  it('rescata materiales cuando la columna reconocida está vacía', () => {
    // La columna que se reconoció como material no contiene nada: los datos
    // están en otra columna y solo se recuperan por posición.
    const rows = [
      ['Material', ''],
      ['Caolín', ''],
      ['Sílice', '100'],
    ];
    const columns: TableColumn[] = [materialCol(1)];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, columns, 'Alternativo España');

    const items = [...(glaze?.recipe?.base || []), ...(glaze?.recipe?.additional || [])];
    expect(items).toEqual([
      { material: 'Caolín', amount: 0 },
      { material: 'Sílice', amount: 100 },
    ]);
  });

  it('no duplica la fila de encabezado si era un encabezado de verdad', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Caolín', '200'],
    ];
    const columns: TableColumn[] = [materialCol(0), amountCol(1)];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, columns, 'Dorado');

    expect(glaze?.recipe?.base).toEqual([{ material: 'Caolín', amount: 200 }]);
  });

  it('mantiene el total cuando solo hay aditivos', () => {
    const rows = [
      ['Material', 'Cantidad (g)'],
      ['Óxido de hierro', '8'],
    ];
    const columns: TableColumn[] = [materialCol(0, 'additional'), amountCol(1, 'additional')];
    const glaze = buildGlazeFromRecipeSheet(rows, 0, columns, 'Alternativo España');

    expect(glaze?.recipe?.additional).toEqual([{ material: 'Óxido de hierro', amount: 8 }]);
    expect(glaze?.recipe?.totalBase).toBe(0);
  });
});
