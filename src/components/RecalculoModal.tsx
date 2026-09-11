import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Calculator, Check, Loader2 as Spinner } from 'lucide-react';
import { computeRecalc, formatAmount, formatPercent, RecalcRecipeInput, RecalcResult } from '../lib/recalcEngine';
import { cn } from '../lib/utils';

interface Props {
  open: boolean;
  recipe: RecalcRecipeInput;
  onClose: () => void;
  onApply?: (result: RecalcResult) => void;
  saving?: boolean;
}

const PRESET_AMOUNTS = [10, 50, 100, 500, 1000];

export default function RecalculoModal({ open, recipe, onClose, onApply, saving }: Props) {
  const [baseAmount, setBaseAmount] = useState(10);
  const result = computeRecalc(recipe, baseAmount);

  const handleInput = (value: string) => {
    const parsed = value.replace(',', '.');
    const num = parseFloat(parsed);
    setBaseAmount(Number.isFinite(num) ? num : NaN);
  };

  const numberInputClass =
    'w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white';

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F4F4F2] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Recálculo de la fórmula</h3>
                <p className="mt-0.5 text-xs text-[#85929E]">
                  Normaliza la base al 100 % y calcula los extras sobre esa base. {onApply ? 'Al tocar "Aplicar" se recalcula la fórmula.' : 'No se guarda ningún cambio.'}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-[#B2BEC3] hover:bg-[#F4F4F2] hover:text-[#2D3436]"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <div className="rounded-2xl border border-[#E4E4E2] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#2D3436]">
                  <Calculator size={16} className="text-[#8a168a]" />
                  Cantidad de base deseada
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.1"
                    value={Number.isNaN(baseAmount) ? '' : String(baseAmount)}
                    onChange={(e) => handleInput(e.target.value)}
                    className={cn(numberInputClass, 'sm:max-w-[160px]')}
                    placeholder="10"
                  />
                  <span className="text-sm font-medium text-[#636E72]">gramos de base</span>
                  <div className="flex flex-wrap gap-2 sm:ml-auto">
                    {PRESET_AMOUNTS.map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => setBaseAmount(amount)}
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-[11px] font-bold transition-all',
                          baseAmount === amount
                            ? 'border-[#2D3436] bg-[#2D3436] text-white'
                            : 'border-[#E4E4E2] text-[#636E72] hover:bg-[#F7F7F5] hover:text-[#2D3436]',
                        )}
                      >
                        {amount.toLocaleString('es-ES')} g
                      </button>
                    ))}
                  </div>
                </div>
                {Number.isFinite(baseAmount) && baseAmount > 0 && result.ok && (
                  <p className="mt-2 text-[11px] text-[#636E72]">
                    Base original: <strong>{formatAmount(result.baseSum)} g</strong> · Se normaliza al 100 %
                  </p>
                )}
              </div>

              {!Number.isFinite(baseAmount) || baseAmount <= 0 || !result.ok ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-600">
                  {!Number.isFinite(baseAmount) || baseAmount <= 0
                    ? 'Introduce una cantidad de base válida y mayor que cero.'
                    : result.error}
                </div>
              ) : (
                <>
                  {/* Materiales base */}
                  {result.baseRows.length > 0 && (
                    <div className="overflow-hidden rounded-2xl border border-[#E4E4E2]">
                      <div className="flex items-center justify-between border-b-2 border-[#8a168a]/30 px-4 py-3">
                        <h4 className="text-xs font-bold uppercase tracking-widest text-[#8a168a]">Materiales base</h4>
                        <span className="text-xs font-medium text-[#636E72]">100 % de la fórmula</span>
                      </div>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#F4F4F2] text-left text-[10px] font-bold uppercase tracking-widest text-[#636E72]">
                            <th className="px-4 py-2">Material</th>
                            <th className="px-4 py-2 text-right">% normalizado</th>
                            <th className="px-4 py-2 text-right">Cantidad (g)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F2]">
                          {result.baseRows.map((row, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2.5 font-medium text-[#2D3436]">{row.material}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-[#2D3436]">
                                {formatPercent(row.percent)} %
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[#2D3436]">
                                {formatAmount(row.recalculated)} g
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-[#F7F7F5] font-semibold text-[#2D3436]">
                            <td className="px-4 py-2.5">Total base</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatPercent(result.baseTotalPercent)} %</td>
                            <td className="px-4 py-2.5 text-right font-mono">{formatAmount(result.baseTotalWeight)} g</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Extras */}
                  <div className="overflow-hidden rounded-2xl border border-[#E4E4E2]">
                    <div className="flex items-center justify-between border-b-2 border-[#8a168a]/30 bg-[#FBF7FA] px-4 py-3">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-[#8a168a]">Extras</h4>
                      <span className="text-xs font-medium text-[#636E72]">% sobre la base</span>
                    </div>
                    {result.extraRows.length === 0 ? (
                      <p className="px-4 py-4 text-center text-xs text-[#8a168a]">Esta receta no tiene extras.</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[#F4F4F2] text-left text-[10px] font-bold uppercase tracking-widest text-[#636E72]">
                            <th className="px-4 py-2">Material</th>
                            <th className="px-4 py-2 text-right">% sobre base</th>
                            <th className="px-4 py-2 text-right">Cantidad (g)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#F4F4F2]">
                          {result.extraRows.map((row, i) => (
                            <tr key={i}>
                              <td className="px-4 py-2.5 font-medium text-[#2D3436]">{row.material}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-[#2D3436]">
                                {formatPercent(row.percent)} %
                              </td>
                              <td className="px-4 py-2.5 text-right font-mono text-[#2D3436]">
                                {formatAmount(row.recalculated)} g
                              </td>
                            </tr>
                          ))}
                          <tr className="bg-[#F7F7F5] font-semibold text-[#2D3436]">
                            <td className="px-4 py-2.5">Total extras</td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {formatPercent(result.extrasTotalPercent)} %
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono">
                              {formatAmount(result.extrasTotalWeight)} g
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Totales */}
                  <div className="flex flex-col gap-3 rounded-2xl border-2 border-[#8a168a]/30 bg-[#FBF7FA] p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-sm font-medium text-[#2D3436]">Peso total de la mezcla (base + extras)</div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-lg font-bold text-[#8a168a]">
                        {formatPercent(result.totalPercent)} %
                      </span>
                      <span className="font-mono text-lg font-bold text-[#2D3436]">
                        {formatAmount(result.totalWeight)} g
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-[#F4F4F2] px-6 py-4">
              <span className="text-[11px] text-[#636E72]">
                {onApply ? 'Aplicará los valores recalculados a la fórmula.' : 'Operación de consulta: no modifica la receta original.'}
              </span>
              <div className="flex items-center gap-2">
                {onApply && (
                  <button
                    type="button"
                    onClick={() => result.ok && onApply(result)}
                    disabled={!result.ok || saving}
                    className="flex items-center gap-2 rounded-xl bg-[#8a168a] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#7a127a] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? <Spinner size={14} className="animate-spin" /> : <Check size={14} />}
                    {saving ? 'Aplicando...' : 'Aplicar'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[#E4E4E2] px-6 py-2.5 text-sm font-medium text-[#2D3436] hover:bg-[#F7F7F5]"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}