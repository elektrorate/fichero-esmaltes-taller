import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRecipeValue(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
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
