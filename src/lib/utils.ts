import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRecipeValue(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}

/**
 * Convierte lo que el usuario teclea en una cantidad de receta a número.
 * Acepta coma y punto como separador decimal porque el teclado es español, y
 * un cero inicial es válido: "0,2" son 0,2 gramos, no un campo vacío.
 */
export function parseAmountInput(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  if (normalized === '' || normalized === '-') return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function matchesSearch(query: string, ...fields: Array<string | undefined | null | string[]>): boolean {
  const normalizedQuery = normalizeSearchText(query.trim());
  if (!normalizedQuery) return true;
  return fields.some((field) => {
    const values = Array.isArray(field) ? field : [field];
    return values.some((value) => normalizeSearchText(value ?? '').includes(normalizedQuery));
  });
}
