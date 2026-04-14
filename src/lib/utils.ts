import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRecipeValue(value: number, decimals: number = 1): string {
  return value.toFixed(decimals);
}
