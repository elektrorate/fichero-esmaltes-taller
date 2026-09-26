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

  for (let r = headerIndex + 1; r < rowsData.length; r += 1) {
    const row = rowsData[r] || [];
    const hasContent = row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
    if (!hasContent) continue;

    // Descarta filas de total o subtotal: no son materiales de la receta.
    const materialCells = columns
      .filter(c => c.kind === 'material' || c.kind === 'packed')
      .map(c => String(row[c.index] ?? '').trim())
      .filter(Boolean);
    if (materialCells.length > 0 && materialCells.every(isTotalRow)) continue;

    const { base: rowBase, additional: rowAdditional } = extractRecipeItems(row, columns);
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
