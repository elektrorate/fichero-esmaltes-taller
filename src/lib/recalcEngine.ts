// Motor determinista de recálculo de fórmulas de esmalte.
// - Los materiales BASE representan el 100 % de la fórmula y se normalizan
//   mediante regla de tres simple.
// - Los EXTRAS (óxidos, pigmentos, colorantes y otros aditivos) se calculan
//   como porcentaje sobre la base original y NO forman parte del 100 %.
// - Se trabaja siempre con valores sin redondear; el redondeo es solo visual.

export interface RecalcRecipeInput {
  base: Array<{ material: string; amount: number }>;
  additional: Array<{ material: string; amount: number }>;
}

export interface RecalcRow {
  material: string;
  amount: number;
  percent: number;
  recalculated: number;
}

export interface RecalcResult {
  ok: boolean;
  error?: string;
  desiredBase: number;
  baseSum: number;
  baseRows: RecalcRow[];
  extraRows: RecalcRow[];
  baseTotalPercent: number;
  baseTotalWeight: number;
  extrasTotalPercent: number;
  extrasTotalWeight: number;
  totalPercent: number;
  totalWeight: number;
}

const EMPTY_FAILURE = (desiredBase: number, error: string): RecalcResult => ({
  ok: false,
  error,
  desiredBase,
  baseSum: 0,
  baseRows: [],
  extraRows: [],
  baseTotalPercent: 0,
  baseTotalWeight: 0,
  extrasTotalPercent: 0,
  extrasTotalWeight: 0,
  totalPercent: 0,
  totalWeight: 0,
});

export const computeRecalc = (recipe: RecalcRecipeInput, desiredBase: number): RecalcResult => {
  if (!Number.isFinite(desiredBase) || desiredBase <= 0) {
    return EMPTY_FAILURE(
      desiredBase,
      'Introduce una cantidad de base válida y mayor que cero (p. ej. 10, 50, 100, 500 o 1.000).',
    );
  }

  const baseItems = (recipe.base || []).filter((item) => Boolean(item.material && item.material.trim()));
  for (const item of baseItems) {
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return EMPTY_FAILURE(
        desiredBase,
        `La cantidad de "${item.material}" no es válida. Los materiales base deben tener cantidades mayores que cero.`,
      );
    }
  }

  const baseSum = baseItems.reduce((acc, item) => acc + Number(item.amount), 0);
  if (!Number.isFinite(baseSum) || baseSum <= 0) {
    return EMPTY_FAILURE(
      desiredBase,
      'La fórmula no tiene materiales base con cantidades válidas. La suma de la base debe ser mayor que cero para poder recalculizar.',
    );
  }

  const baseRows: RecalcRow[] = baseItems.map((item) => {
    const amount = Number(item.amount);
    const percent = (amount / baseSum) * 100;
    const recalculated = (amount / baseSum) * desiredBase;
    return { material: item.material, amount, percent, recalculated };
  });

  const extraRows: RecalcRow[] = (recipe.additional || [])
    .filter((item) => Boolean(item.material && item.material.trim()))
    .map((item) => {
      const amount = Number(item.amount);
      return {
        material: item.material,
        amount,
        percent: Number.isFinite(amount) && amount > 0 ? (amount / baseSum) * 100 : 0,
        recalculated: Number.isFinite(amount) && amount > 0 ? (amount / baseSum) * desiredBase : 0,
      };
    })
    .filter((row) => row.amount > 0);

  const baseTotalPercent = 100;
  const baseTotalWeight = desiredBase;
  const extrasTotalPercent = extraRows.reduce((acc, row) => acc + row.percent, 0);
  const extrasTotalWeight = extraRows.reduce((acc, row) => acc + row.recalculated, 0);

  return {
    ok: true,
    desiredBase,
    baseSum,
    baseRows,
    extraRows,
    baseTotalPercent,
    baseTotalWeight,
    extrasTotalPercent,
    extrasTotalWeight,
    totalPercent: baseTotalPercent + extrasTotalPercent,
    totalWeight: baseTotalWeight + extrasTotalWeight,
  };
};

// Formateadores de solo presentación (no se usan en los cálculos).
export const formatAmount = (value: number): string => value.toFixed(2);
export const formatPercent = (value: number): string => value.toFixed(2);

export interface RecalculatedRecipe extends RecalcRecipeInput {
  totalBase: number;
}

// Construye la receta normalizada (base al 100 % y extras sobre la base) a
// partir del resultado. Redondea a 2 decimales solo al materializar el guardado.
export const buildRecalculatedRecipe = (result: RecalcResult): RecalculatedRecipe => ({
  base: result.baseRows.map((row) => ({
    material: row.material,
    amount: Number(row.recalculated.toFixed(2)),
  })),
  additional: result.extraRows.map((row) => ({
    material: row.material,
    amount: Number(row.recalculated.toFixed(2)),
  })),
  totalBase: result.baseTotalWeight,
});