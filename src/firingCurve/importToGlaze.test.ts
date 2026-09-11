// Tests de la conversión de un programa de «Curva de Cocción» a la curva
// almacenada en la ficha de esmalte.

import { describe, it, expect } from 'vitest';
import { programToGlazeCurve } from './importToGlaze';
import { SYSTEM_PRESETS } from './presets';
import { getSystemPreset } from './presets';

describe('programToGlazeCurve', () => {
  it('convierte un programa de bizcochado al modelo de la ficha', () => {
    const program = getSystemPreset('sys-bisque-980')!;
    const curve = programToGlazeCurve(program);

    expect(curve.programId).toBe('sys-bisque-980');
    expect(curve.program).toBe('Bizcochado');
    expect(curve.name).toBe(program.name);
    expect(curve.finalTemperature).toBe(980);
    expect(curve.finalSoak).toBe(10);
    expect(curve.finalSoakUnit).toBe('min');

    // 6 segmentos del programa -> 6 de la ficha
    expect(curve.segments).toHaveLength(6);
    // Primera rampa hasta 100 °C a 100 °C/h
    expect(curve.segments![0]).toMatchObject({
      index: 1,
      rate: 100,
      targetTemperature: 100,
      soak: 0,
      soakUnit: 'min',
    });
    // Primera meseta de 60 min mantiene la temperatura del punto anterior
    expect(curve.segments![1]).toMatchObject({
      index: 2,
      soak: 60,
      soakUnit: 'min',
    });
  });

  it('convierte un programa de esmalte de alta temperatura', () => {
    const program = getSystemPreset('sys-glaze-1260')!;
    const curve = programToGlazeCurve(program);

    expect(curve.program).toBe('Esmalte');
    expect(curve.finalTemperature).toBe(1260);
    expect(curve.segments).toHaveLength(6);
    expect(curve.segments![4]).toMatchObject({
      rate: 180,
      targetTemperature: 1260,
      soak: 0,
    });
  });

  it('conserva el texto libre ya escrito en la ficha', () => {
    const existing = {
      cooling: 'Enfriamiento lento hasta 400 °C',
      essentialParameters: 'Empastar bien en piezas grandes',
      additionalNotes: 'No abrir antes de 8 h',
    };
    const curve = programToGlazeCurve(SYSTEM_PRESETS[0], existing);

    expect(curve.cooling).toBe('Enfriamiento lento hasta 400 °C');
    expect(curve.essentialParameters).toBe('Empastar bien en piezas grandes');
    expect(curve.additionalNotes).toBe('No abrir antes de 8 h');
  });

  it('asigna finalSoak a la meseta en el pico máximo', () => {
    const program = SYSTEM_PRESETS[0];
    const curve = programToGlazeCurve(program);
    expect(curve.finalSoak).toBe(10);
  });
});