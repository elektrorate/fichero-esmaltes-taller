// Presets del sistema de Curvas de Cocción.
// Son programas orientativos, editables por el usuario para crear presets
// personalizados, pero NUNCA se sobrescriben en su versión original.
//
// NO se presentan como universales ni como garantía de seguridad: su idoneidad
// depende de la pasta, espesor, humedad residual, carga, ventilación, horno y
// las recomendaciones del fabricante.

import { FiringProgram, FiringSegmentInput, FiringPresetKind } from './types';

let counter = 0;
function seg(type: FiringSegmentInput['type'], values: Partial<FiringSegmentInput> = {}): FiringSegmentInput {
  counter += 1;
  return { id: `sys-${counter}`, type, ...values };
}

function makePreset(
  id: string,
  name: string,
  description: string,
  type: FiringProgram['type'],
  initialTemp: number,
  segments: FiringSegmentInput[],
  cone?: string,
  ortonRate?: number,
): FiringProgram {
  return {
    id,
    name,
    type,
    kind: 'system' as FiringPresetKind,
    description,
    initialTemp,
    segments,
    cone,
    ortonRate,
  };
}

export const SYSTEM_PRESETS: FiringProgram[] = [
  makePreset(
    'sys-bisque-980',
    'Bizcocho 980 °C (orientativo)',
    'Programa orientativo de bizcochado. No es universalmente seguro: su idoneidad depende de la pasta, espesor, humedad residual, carga, ventilación, horno y recomendaciones del fabricante. Las mesetas a 100 °C no garantizan la eliminación completa de la humedad ni la de 600 °C el quemado completo de los orgánicos.',
    'bisque',
    20,
    [
      seg('ramp', { targetTemp: 100, rate: 100 }),
      seg('hold', { durationMinutes: 60 }),
      seg('ramp', { targetTemp: 600, rate: 200 }),
      seg('hold', { durationMinutes: 20 }),
      seg('ramp', { targetTemp: 980, rate: 150 }),
      seg('hold', { durationMinutes: 10 }),
    ],
    '05',
    150,
  ),
  makePreset(
    'sys-glaze-1260',
    'Esmalte alta 1260 °C (orientativo)',
    'Programa orientativo de esmalte de alta temperatura. No es una curva universal para todas las pastas y esmaltes: adáptalo a tu pasta, esmalte, cono y horno. La temperatura máxima no equivale automáticamente a la caída de un cono.',
    'glaze',
    20,
    [
      seg('ramp', { targetTemp: 150, rate: 100 }),
      seg('hold', { durationMinutes: 30 }),
      seg('ramp', { targetTemp: 600, rate: 180 }),
      seg('hold', { durationMinutes: 15 }),
      seg('ramp', { targetTemp: 1260, rate: 180 }),
      seg('hold', { durationMinutes: 15 }),
    ],
    '10',
    150,
  ),
];

export function getSystemPreset(id: string): FiringProgram | undefined {
  return SYSTEM_PRESETS.find((p) => p.id === id);
}

export function cloneProgram(source: FiringProgram, overrides: Partial<FiringProgram> = {}): FiringProgram {
  const clone: FiringProgram = {
    name: source.name,
    type: source.type,
    description: source.description,
    initialTemp: source.initialTemp,
    cone: source.cone,
    ortonRate: source.ortonRate,
    segments: source.segments.map((s) => ({ ...s })),
    kind: 'custom',
    createdAt: undefined,
    updatedAt: undefined,
    ...overrides,
  };
  return clone;
}
