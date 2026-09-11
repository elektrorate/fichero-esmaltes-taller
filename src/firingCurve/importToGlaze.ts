// Conversión de un programa de cocción (sección «Curva de Cocción») al modelo
// que se almacena en la ficha de esmalte (`Glaze.firingCurve`).
// Función pura: separa el cálculo de la presentación y es testeable.

import { Glaze, FiringCurve, FiringSegment } from '../types';
import { FiringProgram } from './types';
import { computeCurve } from './engine';

const TYPE_LABEL: Record<FiringProgram['type'], string> = {
  bisque: 'Bizcochado',
  glaze: 'Esmalte',
  custom: 'Personalizado',
};

/**
 * Deriva la ficha curva a partir de un programa de la sección «Curva de Cocción».
 * Conserva los campos de texto libres ya existentes en la ficha (enfriamiento,
 * parámetros esenciales y observaciones) y sobrescribe los datos del programa.
 */
export function programToGlazeCurve(
  program: FiringProgram,
  existing?: Glaze['firingCurve'],
): FiringCurve {
  const result = computeCurve(program);
  const segments: FiringSegment[] = result.segments.map((s, i) => {
    const base: FiringSegment = { index: i + 1 };
    if (s.type === 'ramp') {
      base.rate = s.rate;
      base.targetTemperature = s.endTemp;
      base.soak = 0;
      base.soakUnit = 'min';
    } else {
      base.targetTemperature = s.endTemp;
      base.soak = s.durationMin;
      base.soakUnit = 'min';
    }
    return base;
  });

  const peakHold = result.metrics.peakHoldMin;

  const out: FiringCurve = {
    name: program.name,
    program: TYPE_LABEL[program.type],
    finalTemperature: result.metrics.maxTemp,
    segments,
  };
  // Se evita escribir campos con valor `undefined` (Firestore no los admite):
  // se incluyen únicamente las claves con valor definido.
  if (program.id) out.programId = program.id;
  if (peakHold > 0) {
    out.finalSoak = peakHold;
    out.finalSoakUnit = 'min';
  }
  // Conserva el texto libre ya escrito en la ficha.
  if (existing?.cooling) out.cooling = existing.cooling;
  if (existing?.essentialParameters) out.essentialParameters = existing.essentialParameters;
  if (existing?.additionalNotes) out.additionalNotes = existing.additionalNotes;
  return out;
}