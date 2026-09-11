import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const PHASES = [
  {
    title: 'Secado y eliminación de agua libre',
    body: 'Al inicio de la cocción se evapora el agua mecánica (no combinada químicamente). La velocidad depende de la humedad residual, el espesor y la ventilación del horno. No todas las pastas requieren la misma meseta; usa el cono testigo y las recomendaciones del fabricante.',
  },
  {
    title: 'Calentamiento y deshidroxilación',
    body: 'Por encima de los ~450–500 °C comienza a liberarse el agua químicamente combinada (deshidroxilación de la arcilla), con posibles cambios de volumen. Las temperaturas exactas varían según la composición de la arcilla.',
  },
  {
    title: 'Combustión de materia orgánica',
    body: 'Los carbonatos y materias orgánicas se queman y descomponen. Una ventilación adecuada ayuda a eliminar los gases; su quema no se garantiza sólo con una meseta fija.',
  },
  {
    title: 'Inversión del cuarzo',
    body: 'Alrededor de ~573 °C el cuarzo sufre una inversión de fase (α↔β) con un cambio brusco de volumen. Las rampas rápidas cerca de esta zona pueden aumentar el riesgo de agrietamiento, pero el resultado depende de la pasta, el espesor y la carga.',
  },
  {
    title: 'Sinterización y vitrificación',
    body: 'A temperatura suficiente las partículas se unen (sinterización) y los fundentes comienzan a formar fase vítrea (vitrificación). El rango varía mucho entre pastas.',
  },
  {
    title: 'Maduración del esmalte',
    body: 'El esmalte funde y madura en su rango definido por los conos. La temperatura máxima no equivale por sí sola a la madurez: depende del tiempo y la velocidad (trabajo térmico).',
  },
  {
    title: 'Enfriamiento controlado',
    body: 'Un enfriamiento demasiado rápido puede generar tensiones. Durante el enfriamiento se vuelven a cruzar zonas de inversión del cuarzo y, si la pasta contiene cristobalita, su inversión en la zona ~220–270 °C.',
  },
  {
    title: 'Posible inversión de la cristobalita',
    body: 'Algunas pastas desarrollan cristobalita, que sufre inversión alrededor de ~220–270 °C. No todas las pastas contienen cantidades relevantes; si no la tienes, este factor es secundario.',
  },
];

export default function FiringPhasesModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-[#F4F4F2] px-6 py-4">
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Fases de Cocción Cerámica</h3>
                <p className="mt-0.5 text-xs text-[#85929E]">
                  Referencia didáctica. Las temperaturas son orientativas y varían según pasta, esmalte y horno.
                </p>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-[#B2BEC3] hover:bg-[#F4F4F2] hover:text-[#2D3436]" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-3 overflow-y-auto px-6 py-5">
              {PHASES.map((p) => (
                <div key={p.title} className="rounded-2xl border border-[#F0F0EE] bg-[#F9F9F7] p-4">
                  <h4 className="text-sm font-semibold text-[#2D3436]">{p.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-[#636E72]">{p.body}</p>
                </div>
              ))}
              <p className="pt-1 text-xs leading-relaxed text-[#85929E]">
                Este software es un editor y planificador de programas: no sustituye las recomendaciones del fabricante
                ni la observación mediante conos testigo, y no realiza ninguna simulación física exacta del horno.
              </p>
            </div>
            <div className="border-t border-[#F4F4F2] p-4">
              <button
                onClick={onClose}
                className="w-full rounded-xl bg-[#2D3436] py-3 text-sm font-medium text-white hover:bg-black"
              >
                Entendido
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
