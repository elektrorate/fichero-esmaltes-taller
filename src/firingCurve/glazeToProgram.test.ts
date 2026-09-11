// Tests de la reconstrucción de un programa desde la curva de la ficha y de la
// generación del SVG estático para la ficha pública y el PDF.

import { describe, it, expect } from 'vitest';
import { getSystemPreset } from './presets';
import { programToGlazeCurve } from './importToGlaze';
import { firingCurveToProgram } from './glazeToProgram';
import { buildCurveSvg } from './svgChart';
import { computeCurve } from './engine';
import { FiringCurve } from '../types';

describe('firingCurveToProgram', () => {
  it('reconstruye el programa desde la curva guardada en la ficha', () => {
    const program = getSystemPreset('sys-bisque-980')!;
    const curve = programToGlazeCurve(program);
    const rebuilt = firingCurveToProgram(curve)!;
    expect(rebuilt).not.toBeNull();
    expect(rebuilt.segments).toHaveLength(program.segments.length);

    const origRamps = program.segments.filter((s) => s.type === 'ramp');
    const newRamps = rebuilt.segments.filter((s) => s.type === 'ramp');
    expect(newRamps).toHaveLength(origRamps.length);
    newRamps.forEach((r, i) => {
      expect(r.rate).toBe(origRamps[i].rate);
      expect(r.targetTemp).toBe(origRamps[i].targetTemp);
    });
  });

  it('convierte una curva heredada (mesetas sin rate) a programa', () => {
    const curve: FiringCurve = {
      name: 'Curva manual',
      segments: [
        { index: 1, rate: 100, targetTemperature: 100 },
        { index: 2, soak: 30, soakUnit: 'min' },
        { index: 3, rate: 150, targetTemperature: 980 },
        { index: 4, soak: 2, soakUnit: 'h' },
      ],
    };
    const p = firingCurveToProgram(curve)!;
    expect(p.segments.map((s) => s.type)).toEqual(['ramp', 'hold', 'ramp', 'hold']);
    expect(p.segments[1]).toMatchObject({ type: 'hold', durationMinutes: 30 });
    expect(p.segments[3]).toMatchObject({ type: 'hold', durationMinutes: 120 });
  });

  it('devuelve null sin segmentos dibujables', () => {
    expect(firingCurveToProgram(undefined)).toBeNull();
    expect(firingCurveToProgram({ name: 'x' })).toBeNull();
  });
});

describe('buildCurveSvg', () => {
  it('genera un SVG con la curva y los segmentos', () => {
    const p = getSystemPreset('sys-glaze-1260')!;
    const result = computeCurve(p);
    const svg = buildCurveSvg(p, result);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
    expect(svg).toContain('Tiempo (h)');
  });

  it('devuelve cadena vacía para programas sin segmentos', () => {
    const p = getSystemPreset('sys-bisque-980')!;
    const empty = { ...p, segments: [] };
    expect(buildCurveSvg(empty, computeCurve(empty))).toBe('');
  });
});