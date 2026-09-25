import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Info, X } from 'lucide-react';

export interface DataNotice {
  tone: 'success' | 'info';
  title: string;
  detail: string;
}

interface DataNoticeBannerProps {
  notice: DataNotice | null;
  onDismiss: () => void;
}

/**
 * Aviso visible cuando una importación ha rellenado la ficha o ha creado
 * fichas nuevas. Antes el resultado solo se mostraba como texto gris bajo los
 * botones, donde pasaba desapercibido y no quedaba claro si había que guardar.
 */
export default function DataNoticeBanner({ notice, onDismiss }: DataNoticeBannerProps) {
  return (
    <AnimatePresence>
      {notice && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          role="status"
          aria-live="polite"
          data-testid="data-notice"
          className={notice.tone === 'success'
            ? 'flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3'
            : 'flex items-start gap-3 rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3'}
        >
          {notice.tone === 'success'
            ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
            : <Info size={18} className="mt-0.5 shrink-0 text-[#636E72]" />}
          <div className="min-w-0 flex-1">
            <p className={notice.tone === 'success'
              ? 'text-sm font-semibold text-emerald-800'
              : 'text-sm font-semibold text-[#2D3436]'}>
              {notice.title}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-[#636E72]">{notice.detail}</p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 rounded-lg p-1 text-[#B2BEC3] transition-colors hover:bg-white hover:text-[#2D3436]"
            aria-label="Cerrar aviso"
          >
            <X size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
