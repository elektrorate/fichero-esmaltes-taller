// Lectura de recetas en Excel.
//
// Lógica pura y sin dependencias de React ni de Firebase para poder testearla
// aislada. Dos formatos:
//
//   1. Catálogo: una ficha por fila, con columna de nombre. Cada fila es una
//      ficha y sus columnas de material/cantidad forman la receta.
//   2. Receta vertical: una columna de material y otra de cantidad, sin
//      columna de nombre. Cada fila es un material de la MISMA ficha, que se
//      nombra como la hoja.
//
// El segundo formato se añadió porque una hoja con "Material / Cantidad (g)"
// es la receta de un esmalte, no un catálogo: tratar cada fila como una ficha
// independiente produce 36 fichas sin nombre, y el mensaje de error resultante
// no explicaba qué faltaba.

import type { Glaze, RecipeItem } from '../types';

export interface TableColumn {
  index: number;
  kind: 'text' | 'material' | 'amount' | 'packed';
  sub: string;
  num?: number;
}

/** Fila que parece un total o un subtotal, no un material. */
const isTotalRow = (label: string) => /^(total|subtotal|suma|resumen)\b/i.test(label.trim());

/**
 * Palabras que sí son encabezado. La comparación es exacta y normalizada: sirve
 * para distinguir "Material" de un material llamado "Óxido de cobalto", que
 * contiene "oxido" pero no es un encabezado.
 */
const HEADER_CELL_WORDS = new Set([
  'material', 'materiales', 'materia', 'materia prima', 'materia primas', 'materias',
  'prima', 'primas', 'cruda', 'blanca', 'ingrediente', 'componente',
  'cantidad', 'cant', 'porcentaje', 'peso', 'pesos', 'gramos', 'gr', 'g',
  'aditivo', 'aditivo(s)', 'adicional', 'oxido', 'oxidos', 'colorante', 'pigmento', 'tinte',
  'total', 'total base', 'suma', 'subtotal', 'resumen', 'base', 'receta',
  'codigo', 'nombre', 'nombre del esmalte', 'ficha', 'notas', 'observaciones',
  'color', 'acabado', 'textura', 'uso', 'temperatura', 'cono', 'atmosfera', 'url',
]);

const normalizeCell = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(token => token.length > 0)
    .join(' ')
    .trim();

/** ¿La celda es un encabezado y no un valor? */
export const isHeaderCell = (value: unknown): boolean => {
  const text = String(value ?? '').trim();
  if (!text) return true;
  // Todas las palabras deben ser de encabezado. "cantidad g" es un
  // encabezado; "oxido de cobalto" no, porque "de" y "cobalto" no lo son.
  const tokens = normalizeCell(text).split(' ').filter(Boolean);
  if (tokens.length === 0) return true;
  return tokens.every(token => HEADER_CELL_WORDS.has(token));
};

/** ¿El valor es un número, no el nombre de un material? */
const isNumericCell = (value: unknown): boolean => {
  if (typeof value === 'number') return Number.isFinite(value);
  const text = String(value ?? '').trim();
  if (!text) return false;
  return /^-?\d+(?:[.,]\d+)?\s*(?:%|[a-zA-Z]{0,3})?$/.test(text) && /\d/.test(text);
};

/**
 * Rescate para hojas sin encabezados claros: toma el primer texto no vacío de
 * la fila como material y el primer número como cantidad, sin depender de qué
 * columna se reconoció como encabezado.
 */
export const extractPositionalItems = (row: unknown[]): RecipeItem[] => {
  let material = '';
  let amount = 0;
  let foundAmount = false;

  for (const cell of row || []) {
    const text = String(cell ?? '').trim();
    if (!text) continue;

    if (!foundAmount && isNumericCell(cell)) {
      amount = parseExcelAmount(cell);
      foundAmount = true;
      continue;
    }
    if (!material && !isHeaderCell(cell)) {
      material = text;
    }
  }

  if (!material) return [];
  return [{ material, amount }];
};

export const parseExcelAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  let text = String(value).trim();
  if (!text) return 0;

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? (parseFloat(match[0]) || 0) : 0;
};

export const parsePackedMaterias = (text: string): RecipeItem[] => {
  const items: RecipeItem[] = [];
  text.split(/\s*\|\s*|\n/).forEach(part => {
    const clean = part.trim().replace(/:$/, '');
    if (!clean) return;

    if (clean.includes(',')) {
      const lastComma = clean.lastIndexOf(',');
      const rightPart = clean.slice(lastComma + 1).trim().replace(/(?:g|gr|grm|kg)\.?\s*$/i, '');
      if (/^(?:-?\d+(?:[.,]\d+)?)$/.test(rightPart)) {
        const material = clean.slice(0, lastComma).trim();
        if (material) {
          items.push({ material, amount: parseExcelAmount(rightPart) });
          return;
        }
      }
    }

    const match = clean.match(/^(.*?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:g|gr|grm|kg|gr\.|g\.)\s*$/)
      || clean.match(/^(.*?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*%?\s*$/);
    if (match && match[1].trim()) {
      items.push({ material: match[1].trim().replace(/,$/, ''), amount: parseExcelAmount(match[2]) });
    } else if (match) {
      items.push({ material: clean, amount: parseExcelAmount(match[2]) });
    } else {
      items.push({ material: clean, amount: 0 });
    }
  });
  return items;
};

/**
 * Extrae los materiales de una fila. Cada columna de material se empareja con
 * su columna de cantidad por número (`Materia 1` con `Cantidad 1`), y si no
 * hay cantidad numerada se usa la primera libre.
 */
export const extractRecipeItems = (
  row: unknown[],
  columns: TableColumn[],
): { base: RecipeItem[]; additional: RecipeItem[] } => {
  let base: RecipeItem[] = [];
  let additional: RecipeItem[] = [];
  const usedAmountIndexes = new Set<number>();

  columns
    .filter(c => c.kind === 'material')
    .forEach(col => {
      const raw = String(row[col.index] ?? '').trim();
      if (!raw) return;
      // Un número suelto en la columna de material es una cantidad mal
      // colocada, no el nombre de un material.
      if (isNumericCell(raw)) return;

      if (raw.includes('|') || raw.includes('\n') || /[,;]\s*\d/.test(raw)) {
        const items = parsePackedMaterias(raw);
        items.forEach(item => {
          if (col.sub === 'base') base.push(item);
          else additional.push(item);
        });
        return;
      }

      const amountCol = columns.find(c => c.kind === 'amount' && c.num === col.num && c.sub === col.sub && !usedAmountIndexes.has(c.index))
        || columns.find(c => c.kind === 'amount' && c.num === col.num && !usedAmountIndexes.has(c.index));
      if (amountCol) usedAmountIndexes.add(amountCol.index);
      const amount = amountCol ? parseExcelAmount(row[amountCol.index]) : 0;
      const item: RecipeItem = { material: raw, amount };
      if (col.sub === 'base') base.push(item);
      else additional.push(item);
    });

  columns
    .filter(c => c.kind === 'packed')
    .forEach(col => {
      const rawText = String(row[col.index] ?? '').trim();
      if (!rawText) return;
      const items = parsePackedMaterias(rawText);
      if (col.sub === 'base') base = base.concat(items);
      else additional = additional.concat(items);
    });

  return { base, additional };
};

/** ¿La hoja tiene una columna que identifique la ficha? */
export const hasNameColumn = (columns: TableColumn[]): boolean =>
  columns.some(c => c.kind === 'text' && c.sub === 'name');

/** ¿Hay al menos una columna que aporte materiales? */
export const hasMaterialColumn = (columns: TableColumn[]): boolean =>
  columns.some(c => c.kind === 'material' || c.kind === 'packed');

/**
 * Convierte una hoja sin columna de nombre en una única ficha llamada como la
 * hoja, juntando todos los materiales. Devuelve `null` si no queda ningún
 * material con nombre utilizable.
 */
export const buildGlazeFromRecipeSheet = (
  rowsData: unknown[][],
  headerIndex: number,
  columns: TableColumn[],
  sheetName: string,
): Partial<Glaze> | null => {
  const name = sheetName.trim();
  if (!name) return null;

  const base: RecipeItem[] = [];
  const additional: RecipeItem[] = [];

  // Si la fila que se tomó como encabezado contiene un material real y no la
  // palabra "Material", era el primer material de la receta y se estaba
  // perdiendo. Estas hojas a menudo llegan sin fila de encabezado.
  const headerRow = rowsData[headerIndex] || [];
  const headerIsData = columns
    .filter(c => c.kind === 'material' || c.kind === 'packed')
    .some(c => {
      const text = String(headerRow[c.index] ?? '').trim();
      return text !== '' && !isTotalRow(text) && !isHeaderCell(text);
    });

  const firstRow = headerIsData ? headerIndex : headerIndex + 1;

  for (let r = firstRow; r < rowsData.length; r += 1) {
    const row = rowsData[r] || [];
    const hasContent = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasContent) continue;

    // Descarta filas de total o subtotal: no son materiales de la receta.
    const materialCells = columns
      .filter(c => c.kind === 'material' || c.kind === 'packed')
      .map(c => String(row[c.index] ?? '').trim())
      .filter(Boolean);
    if (materialCells.length > 0 && materialCells.every(isTotalRow)) continue;

    let { base: rowBase, additional: rowAdditional } = extractRecipeItems(row, columns);

    // Si las columnas reconocidas no aportan nada, se rescata la fila por
    // posición: los datos pueden estar en columnas que no se reconocieron.
    if (rowBase.length === 0 && rowAdditional.length === 0) {
      const rescued = extractPositionalItems(row);
      if (rescued.length > 0) rowBase = rescued;
    }

    rowBase.forEach(item => {
      if (item.material.trim() && !isTotalRow(item.material)) base.push(item);
    });
    rowAdditional.forEach(item => {
      if (item.material.trim() && !isTotalRow(item.material)) additional.push(item);
    });
  }

  if (base.length === 0 && additional.length === 0) return null;

  const totalBase = base.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  return {
    name,
    code: '',
    recipe: { base, additional, totalBase },
    status: 'draft',
    observations: `Importada desde tabla Excel (hoja: ${name})`,
  } as Partial<Glaze>;
};
