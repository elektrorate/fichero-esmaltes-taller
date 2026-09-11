// Conversión inversa: de la curva almacenada en la ficha (`Glaze.firingCurve`,
// esquema antiguo) a un programa de cocción (`FiringProgram`) del motor, para
// poder redibujar la gráfica de forma fiel en la ficha pública y en el PDF.

import { FiringCurve } from '../types';
import { FiringProgram, FiringSegmentInput } from './types';

let segCounter = 0;
function nextSegId(): string {
  segCounter += 1;
  return `glaze-${Date.now()}-${segCounter}`;
}

function soakToMinutes(soak: number | undefined, unit: string | undefined): number {
  if (soak === undefined || soak === null || !Number.isFinite(soak)) return 0;
  return unit === 'h' ? soak * 60 : soak;
}

/**
 * Reconstruye un `FiringProgram` a partir de la curva guardada en la ficha,
 * de forma determinista:
 *  - segmento con `rate` -> rampa (con su temperatura objetivo);
 *  - segmento sin `rate`  -> meseta (duración convertida a minutos).
 * Devuelve `null` si no hay segmentos dibujables.
 */
export function firingCurveToProgram(curve: FiringCurve | undefined): FiringProgram | null {
  if (!curve) return null;
  const segments: FiringSegmentInput[] = [];
  for (const s of curve.segments || []) {
    if (typeof s.rate === 'number' && Number.isFinite(s.rate)) {
      segments.push({
        id: nextSegId(),
        type: 'ramp',
        targetTemp: s.targetTemperature,
        rate: s.rate,
      });
    } else {
      const durationMinutes = soakToMinutes(s.soak, s.soakUnit);
      if (durationMinutes > 0) {
        segments.push({ id: nextSegId(), type: 'hold', durationMinutes });
      }
    }
  }
  if (segments.length === 0) return null;
  return {
    name: curve.name || 'Curva de cocción',
    description: '',
    type: 'custom',
    kind: 'custom',
    // La curva heredada no guarda la temperatura inicial; se asume ambiente.
    initialTemp: 20,
    cone: undefined,
    ortonRate: undefined,
    segments,
  };
}