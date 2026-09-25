import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X, RotateCcw, Save, Copy } from 'lucide-react';

interface ConflictModalProps {
  open: boolean;
  fields: string[];
  remoteEditor?: string;
  saving?: boolean;
  /** Descarta los cambios locales y recarga la ficha del servidor. */
  onReload: () => void;
  /** Guarda igualmente, sobrescribiendo lo que haya en el servidor. */
  onOverwrite: () => void;
  onClose: () => void;
}

const FIELD_LABELS: Record<string, string> = {
  name: 'nombre',
  code: 'código',
  color: 'color',
  finish: 'acabado',
  texture: 'textura',
  status: 'estado',
  isValidated: 'validación',
  recipe: 'fórmula',
  mainImage: 'imagen principal',
  gallery: 'galería',
  description: 'descripción',
  notes: 'notas',
  application: 'aplicación',
  preparation: 'preparación',
  analysis: 'análisis',
  technical: 'datos técnicos',
  safety: 'seguridad',
  firingCurve: 'curva de cocción',
  chemistry: 'química',
  tags: 'etiquetas',
  surface: 'superficie',
  transparency: 'transparencia',
  usage: 'uso',
  chemicalFamily: 'familia química',
  atmosphere: 'atmósfera',
  cone: 'cono',
  temperature: 'temperatura',
};

const describeField = (field: string) => FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase();

export default function ConflictModal({
  open,
  fields,
  remoteEditor,
  saving = false,
  onReload,
  onOverwrite,
  onClose,
}: ConflictModalProps) {
  const [showAll, setShowAll] = useState(false);
  if (!open) return null;

  const visible = showAll ? fields : fields.slice(0, 6);

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="conflict-title"
          className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-[28px] bg-white shadow-xl"
        >
          <div className="flex items-start justify-between border-b border-[#F4F4F2] px-6 py-5">
            <div className="flex gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50">
                <AlertTriangle size={20} className="text-amber-500" />
              </div>
              <div>
                <h3 id="conflict-title" className="text-lg font-semibold tracking-tight text-[#2D3436]">
                  Esta ficha cambió mientras la editabas
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[#85929E]">
                  {remoteEditor
                    ? <>Otra persona (<strong className="text-[#2D3436]">{remoteEditor}</strong>) guardó cambios en esta ficha después de que la abriste. Tu guardado se ha detenido para no perder su trabajo.</>
                    : <>Se guardaron cambios en esta ficha después de que la abriste. Tu guardado se ha detenido para no perderlos.</>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg p-1.5 text-[#B2BEC3] hover:bg-[#F4F4F2] hover:text-[#2D3436] disabled:opacity-40"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>

          {fields.length > 0 && (
            <div className="border-b border-[#F4F4F2] px-6 py-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#85929E]">
                Campos con cambios distintos
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {visible.map(field => (
                  <span
                    key={field}
                    className="rounded-lg bg-[#F7F7F5] px-2.5 py-1 text-[11px] font-medium capitalize text-[#2D3436]"
                  >
                    {describeField(field)}
                  </span>
                ))}
              </div>
              {fields.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAll(value => !value)}
                  className="mt-2 text-[11px] font-semibold text-[#8a168a] hover:underline"
                >
                  {showAll ? 'Ver menos' : `Ver los ${fields.length} campos`}
                </button>
              )}
            </div>
          )}

          <div className="space-y-2.5 px-6 py-5">
            <button
              type="button"
              onClick={onReload}
              disabled={saving}
              className="flex w-full items-center gap-3 rounded-2xl border border-[#E4E4E2] px-4 py-3.5 text-left transition-colors hover:border-[#2D3436] hover:bg-[#F7F7F5] disabled:opacity-50"
            >
              <RotateCcw size={18} className="shrink-0 text-[#2D3436]" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[#2D3436]">Recargar y empezar de cero</span>
                <span className="mt-0.5 block text-xs text-[#85929E]">
                  Descarta lo que has escrito y carga la versión guardada.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOverwrite}
              disabled={saving}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3.5 text-left transition-colors hover:border-amber-400 hover:bg-amber-100 disabled:opacity-50"
            >
              <Copy size={18} className="shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-amber-800">Guardar igualmente</span>
                <span className="mt-0.5 block text-xs text-amber-700">
                  Tu versión replaces los {fields.length > 0 ? `${fields.length} ` : ''}campos en conflicto. Los cambios ajenos que no hayas tocado se conservan.
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="w-full rounded-2xl px-4 py-2.5 text-center text-xs font-semibold text-[#85929E] transition-colors hover:bg-[#F7F7F5] hover:text-[#2D3436] disabled:opacity-50"
            >
              Cancelar y seguir editando
            </button>

            {saving && (
              <p className="flex items-center justify-center gap-2 pt-1 text-xs font-medium text-[#85929E]">
                <Save size={13} className="animate-pulse" />
                Guardando…
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
