import { describe, it, expect } from 'vitest';
import { computeRecalc, buildRecalculatedRecipe, formatAmount, formatPercent } from './recalcEngine';

const RECIPE = {
  base: [
    { material: 'Feldespato potásico', amount: 2.94 },
    { material: 'Sílice', amount: 2.38 },
    { material: 'Frita 174 (3134-2 Ferro)', amount: 1.68 },
    { material: 'Caolín Patagónico GC/F', amount: 1.12 },
    { material: 'Carbonato de calcio (Whiting)', amount: 0.75 },
    { material: 'Ceniza de hueso (Bone Ash)', amount: 0.47 },
  ],
  additional: [{ material: 'Óxido de hierro rojo', amount: 0.65 }],
};

describe('computeRecalc', () => {
  it('suma exclusivamente los materiales base (9,34 g)', () => {
    const r = computeRecalc(RECIPE, 10);
    expect(r.ok).toBe(true);
    expect(Math.abs(r.baseSum - 9.34)).toBeLessThan(1e-9);
  });

  it('normaliza la base al 100 % con regla de tres simple para 10 g', () => {
    const r = computeRecalc(RECIPE, 10);
    if (!r.ok) throw new Error(r.error);

    const expected = [
      ['Feldespato potásico', '31.48', '3.15'],
      ['Sílice', '25.48', '2.55'],
      ['Frita 174 (3134-2 Ferro)', '17.99', '1.80'],
      ['Caolín Patagónico GC/F', '11.99', '1.20'],
      ['Carbonato de calcio (Whiting)', '8.03', '0.80'],
      ['Ceniza de hueso (Bone Ash)', '5.03', '0.50'],
    ];
    expect(r.baseRows).toHaveLength(6);
    expected.forEach(([material, percent, grams], i) => {
      expect(r.baseRows[i].material).toBe(material);
      expect(formatPercent(r.baseRows[i].percent)).toBe(percent);
      expect(formatAmount(r.baseRows[i].recalculated)).toBe(grams);
    });
  });

  it('el total base es exactamente el 100 % y la cantidad solicitada', () => {
    const r = computeRecalc(RECIPE, 10);
    if (!r.ok) throw new Error(r.error);
    expect(formatPercent(r.baseTotalPercent)).toBe('100.00');
    const sumPercent = r.baseRows.reduce((acc, row) => acc + row.percent, 0);
    expect(formatPercent(sumPercent)).toBe('100.00');
    expect(formatAmount(r.baseTotalWeight)).toBe('10.00');
  });

  it('calcula los extras como porcentaje sobre la base y el total con extras', () => {
    const r = computeRecalc(RECIPE, 10);
    if (!r.ok) throw new Error(r.error);
    expect(r.extraRows).toHaveLength(1);
    expect(r.extraRows[0].material).toBe('Óxido de hierro rojo');
    expect(formatPercent(r.extraRows[0].percent)).toBe('6.96');
    expect(formatAmount(r.extraRows[0].recalculated)).toBe('0.70');
    expect(formatPercent(r.extrasTotalPercent)).toBe('6.96');
    expect(formatPercent(r.totalPercent)).toBe('106.96');
    expect(formatAmount(r.totalWeight)).toBe('10.70');
  });

  it('funciona con otras cantidades de base (50, 100, 500, 1000)', () => {
    for (const desired of [50, 100, 500, 1000]) {
      const r = computeRecalc(RECIPE, desired);
      if (!r.ok) throw new Error(r.error);
      expect(formatAmount(r.baseTotalWeight)).toBe(desired.toFixed(2));
      const sumPct = r.baseRows.reduce((acc, row) => acc + row.percent, 0);
      expect(formatPercent(sumPct)).toBe('100.00');
    }
  });

  it('funciona con recetas sin extras', () => {
    const r = computeRecalc({ ...RECIPE, additional: [] }, 10);
    if (!r.ok) throw new Error(r.error);
    expect(r.extraRows).toHaveLength(0);
    expect(formatPercent(r.extrasTotalPercent)).toBe('0.00');
    expect(formatPercent(r.totalPercent)).toBe('100.00');
    expect(formatAmount(r.totalWeight)).toBe('10.00');
  });

  it('funciona con varios extras', () => {
    const r = computeRecalc(
      {
        ...RECIPE,
        additional: [
          { material: 'Óxido de hierro rojo', amount: 0.65 },
          { material: 'Cobalto', amount: 0.2 },
        ],
      },
      10,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.extraRows).toHaveLength(2);
    expect(formatPercent(r.extrasTotalPercent)).toBe('9.10');
    expect(formatAmount(r.totalWeight)).toBe('10.91');
  });

  it('rechaza cantidades de base no positivas o no numéricas', () => {
    expect(computeRecalc(RECIPE, 0).ok).toBe(false);
    expect(computeRecalc(RECIPE, -10).ok).toBe(false);
    expect(computeRecalc(RECIPE, NaN).ok).toBe(false);
  });

  it('rechaza la recálculo cuando la suma de bases es cero', () => {
    const r = computeRecalc({ base: [], additional: [] }, 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('rechaza materiales base con cantidad cero o negativa', () => {
    const r = computeRecalc({ base: [{ material: 'Sílice', amount: 0 }], additional: [] }, 10);
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it('ignora filas sin material (filas vacías del formulario)', () => {
    const r = computeRecalc(
      {
        base: [
          { material: 'Sílice', amount: 25 },
          { material: '', amount: 40 },
        ],
        additional: [{ material: '', amount: 5 }],
      },
      100,
    );
    if (!r.ok) throw new Error(r.error);
    expect(r.baseRows).toHaveLength(1);
    expect(r.baseRows[0].material).toBe('Sílice');
    expect(formatPercent(r.extrasTotalPercent)).toBe('0.00');
  });
});

describe('buildRecalculatedRecipe', () => {
  it('construye la receta normalizada a partir del resultado (base 10 g)', () => {
    const r = computeRecalc(RECIPE, 10);
    if (!r.ok) throw new Error(r.error);
    const built = buildRecalculatedRecipe(r);

    expect(built.totalBase).toBe(10);
    const baseSum = built.base.reduce((acc, b) => acc + b.amount, 0);
    expect(Math.abs(baseSum - 10)).toBeLessThan(0.01);
    expect(built.base.find((b) => b.material === 'Feldespato potásico')?.amount).toBeCloseTo(3.15, 2);
    expect(built.base.find((b) => b.material === 'Sílice')?.amount).toBeCloseTo(2.55, 2);
    expect(built.base.find((b) => b.material === 'Frita 174 (3134-2 Ferro)')?.amount).toBeCloseTo(1.8, 2);
    expect(built.base.find((b) => b.material === 'Caolín Patagónico GC/F')?.amount).toBeCloseTo(1.2, 2);
    expect(built.base.find((b) => b.material === 'Carbonato de calcio (Whiting)')?.amount).toBeCloseTo(0.8, 2);
    expect(built.base.find((b) => b.material === 'Ceniza de hueso (Bone Ash)')?.amount).toBeCloseTo(0.5, 2);
    expect(built.additional).toHaveLength(1);
    expect(built.additional[0].amount).toBeCloseTo(0.7, 2);
  });

  it('incluye varios extras y totalBase desde el resultado', () => {
    const r = computeRecalc(
      {
        ...RECIPE,
        additional: [
          { material: 'Óxido de hierro rojo', amount: 0.65 },
          { material: 'Cobalto', amount: 0.2 },
        ],
      },
      500,
    );
    if (!r.ok) throw new Error(r.error);
    const built = buildRecalculatedRecipe(r);
    expect(built.totalBase).toBe(500);
    expect(built.additional).toHaveLength(2);
    expect(built.additional.find((a) => a.material === 'Cobalto')?.amount).toBeCloseTo(10.71, 2);
    const extraSum = built.additional.reduce((acc, a) => acc + a.amount, 0);
    expect(Math.abs(extraSum - r.extrasTotalWeight)).toBeLessThan(0.02);
  });
});