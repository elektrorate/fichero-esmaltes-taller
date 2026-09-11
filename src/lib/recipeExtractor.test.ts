import { describe, it, expect } from 'vitest';
import { parseExtractionJson, extractionToRecipe, ParsedExtraction } from './recipeExtractor';

describe('parseExtractionJson', () => {
  it('parses a valid extraction', () => {
    const result = parseExtractionJson({
      name: 'Blanco Mate',
      base: [
        { material: 'Feldespato', amount: 50, unit: '%' },
        { material: 'Caolín', amount: 30, unit: '%' },
      ],
      additional: [{ material: 'Óxido de hierro', amount: 2.5, unit: '%' }],
    });
    expect(result).toEqual({
      name: 'Blanco Mate',
      base: [
        { material: 'Feldespato', amount: 50, unit: '%' },
        { material: 'Caolín', amount: 30, unit: '%' },
      ],
      additional: [{ material: 'Óxido de hierro', amount: 2.5, unit: '%' }],
    });
  });

  it('drops rows without a readable amount and coerces unit', () => {
    const result = parseExtractionJson({
      base: [{ material: 'Sílice', amount: '25', unit: 'g' }, { material: '??', amount: 'abc' }],
      additional: [{ material: 'Cobalto', amount: 1, unit: 'unidades' }],
    });
    expect(result?.base).toEqual([{ material: 'Sílice', amount: 25, unit: 'g' }]);
    expect(result?.additional).toEqual([{ material: 'Cobalto', amount: 1, unit: '%' }]);
  });

  it('returns null when there are no usable materials', () => {
    expect(parseExtractionJson({ base: [], additional: [] })).toBeNull();
    expect(parseExtractionJson('nope')).toBeNull();
    expect(parseExtractionJson(null)).toBeNull();
  });
});

describe('extractionToRecipe', () => {
  it('builds a recipe and sums totalBase', () => {
    const data: ParsedExtraction = {
      name: 'Verde Turquesa',
      base: [
        { material: 'Frita A', amount: 46, unit: '%' },
        { material: 'Cuarzo', amount: 28, unit: '%' },
        { material: 'Caolín', amount: 12, unit: '%' },
      ],
      additional: [{ material: 'Óxido de cobre', amount: 3, unit: '%' }],
    };
    expect(extractionToRecipe(data)).toEqual({
      base: [
        { material: 'Frita A', amount: 46 },
        { material: 'Cuarzo', amount: 28 },
        { material: 'Caolín', amount: 12 },
      ],
      additional: [{ material: 'Óxido de cobre', amount: 3 }],
      totalBase: 86,
    });
  });
});