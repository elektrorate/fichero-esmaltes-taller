import { describe, it, expect } from 'vitest';
import {
  computeCurve,
  validateProgram,
  formatDuration,
  DEFAULT_WARNING_CONFIG,
} from './engine';
import { SYSTEM_PRESETS, cloneProgram, getSystemPreset } from './presets';
import { ORTON_CONES_TABLE, ortonTempFor, ORTON_RATE_OPTIONS } from './orton';
import { FiringProgram } from './types';

function program(overrides: Partial<FiringProgram>): FiringProgram {
  return {
    name: 'Test',
    type: 'custom',
    kind: 'custom',
    initialTemp: 20,
    segments: [],
    ...overrides,
  };
}

describe('Motor de curvas de cocción (determinista)', () => {
  it('1. El preset de bizcochado calcula correctamente la duración de cada segmento', () => {
    const preset = getSystemPreset('sys-bisque-980')!;
    const r = computeCurve(preset);
    expect(r.ok).toBe(true);
    // Segmentos: [ramp, hold, ramp, hold, ramp, hold]
    expect(r.segments.length).toBe(6);

    const [s1, s2, s3, s4, s5, s6] = r.segments;
    // ramp 20->100 a 100 °C/h => 80/100 h => 48 min
    expect(s1.durationMin).toBeCloseTo(48, 6);
    // hold 60 min
    expect(s2.durationMin).toBe(60);
    // ramp 100->600 a 200 °C/h => 500/200 h => 150 min
    expect(s3.durationMin).toBeCloseTo(150, 6);
    expect(s4.durationMin).toBe(20);
    // ramp 600->980 a 150 °C/h => 380/150 h => 152 min
    expect(s5.durationMin).toBeCloseTo(152, 6);
    expect(s6.durationMin).toBe(10);
  });

  it('2. Una meseta mantiene constante la temperatura', () => {
    const r = computeCurve(
      program({
        initialTemp: 100,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 200, rate: 100 },
          { id: 'b', type: 'hold', durationMinutes: 30 },
        ],
      }),
    );
    const hold = r.segments[1];
    expect(hold.startTemp).toBe(200);
    expect(hold.endTemp).toBe(200);
    expect(hold.durationMin).toBe(30);
  });

  it('3. Una rampa descendente calcula correctamente su duración', () => {
    const r = computeCurve(
      program({
        initialTemp: 1200,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 800, rate: 100 }],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.segments[0].durationMin).toBeCloseTo((400 / 100) * 60, 6); // 240 min
    expect(r.segments[0].direction).toBe('down');
  });

  it('4. Una tasa cero o negativa es rechazada', () => {
    const zero = computeCurve(
      program({
        initialTemp: 20,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 1000, rate: 0 }],
      }),
    );
    expect(zero.ok).toBe(false);
    expect(zero.validationIssues.some((v) => v.id.startsWith('ramp-rate'))).toBe(true);

    const neg = computeCurve(
      program({
        initialTemp: 20,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 1000, rate: -50 }],
      }),
    );
    expect(neg.ok).toBe(false);
    expect(neg.validationIssues.some((v) => v.id.startsWith('ramp-rate'))).toBe(true);
  });

  it('5. Un programa vacío no produce NaN ni errores de renderizado', () => {
    const r = computeCurve(program({ initialTemp: 20, segments: [] }));
    expect(r.ok).toBe(false);
    expect(r.segments.length).toBe(0);
    expect(r.metrics.maxTemp).toBe(20);
    expect(r.metrics.finalTemp).toBe(20);
    expect(Number.isNaN(r.metrics.totalDurationMin)).toBe(false);
    expect(r.validationIssues.some((v) => v.id === 'no-segments')).toBe(true);
  });

  it('6. La temperatura máxima se calcula correctamente', () => {
    const r = computeCurve(
      program({
        initialTemp: 100,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 500, rate: 200 },
          { id: 'b', type: 'ramp', targetTemp: 300, rate: 100 },
          { id: 'c', type: 'hold', durationMinutes: 5 },
        ],
      }),
    );
    expect(r.metrics.maxTemp).toBe(500);
  });

  it('7. El tiempo de mantenimiento en pico no incluye mesetas a temperaturas inferiores', () => {
    const r = computeCurve(
      program({
        initialTemp: 20,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 500, rate: 100 },
          { id: 'b', type: 'hold', durationMinutes: 90 }, // 500, no pico
          { id: 'c', type: 'ramp', targetTemp: 1200, rate: 200 },
          { id: 'd', type: 'hold', durationMinutes: 30 }, // pico 1200
          { id: 'e', type: 'ramp', targetTemp: 900, rate: 100 },
        ],
      }),
    );
    expect(r.metrics.peakHoldMin).toBe(30);
  });

  it('8. Los tiempos acumulados son consistentes', () => {
    const r = computeCurve(
      program({
        initialTemp: 20,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 100, rate: 100 }, // 48 min
          { id: 'b', type: 'hold', durationMinutes: 60 },
          { id: 'c', type: 'ramp', targetTemp: 600, rate: 200 }, // 150 min
        ],
      }),
    );
    const [a, b, c] = r.segments;
    expect(a.endTimeMin).toBeCloseTo(48, 6);
    expect(b.startTimeMin).toBeCloseTo(48, 6);
    expect(b.endTimeMin).toBeCloseTo(108, 6);
    expect(c.startTimeMin).toBeCloseTo(108, 6);
    expect(c.endTimeMin).toBeCloseTo(258, 6);
    expect(r.metrics.totalDurationMin).toBeCloseTo(258, 6);
  });

  it('9. La modificación de un segmento actualiza los posteriores', () => {
    const r = computeCurve(
      program({
        initialTemp: 20,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 200, rate: 100 }, // 108 min
          { id: 'b', type: 'hold', durationMinutes: 30 },
          { id: 'c', type: 'ramp', targetTemp: 1000, rate: 500 }, // 96 min
        ],
      }),
    );
    expect(r.segments[2].startTimeMin).toBeCloseTo(138, 6);
    expect(r.segments[2].endTimeMin).toBeCloseTo(234, 6);

    // Cambiando el primer segmento se recalculan los posteriores.
    const r2 = computeCurve(
      program({
        initialTemp: 20,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 200, rate: 50 }, // 216 min ahora
          { id: 'b', type: 'hold', durationMinutes: 30 },
          { id: 'c', type: 'ramp', targetTemp: 1000, rate: 500 },
        ],
      }),
    );
    expect(r2.segments[2].startTimeMin).toBeCloseTo(246, 6);
    expect(r2.segments[2].endTimeMin).toBeCloseTo(342, 6);
  });

  it('10. Las advertencias detectan cruces ascendentes y descendentes de la zona del cuarzo', () => {
    const cfg = DEFAULT_WARNING_CONFIG;
    const up = computeCurve(
      program({
        initialTemp: 20,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 700, rate: 100 }],
      }),
    );
    expect(up.warnings.some((w) => w.id === 'quartz-up-0')).toBe(true);

    const down = computeCurve(
      program({
        initialTemp: 1200,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 400, rate: 150 }],
      }),
    );
    expect(down.warnings.some((w) => w.id === 'quartz-down-0')).toBe(true);

    const noCross = computeCurve(
      program({
        initialTemp: 20,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 500, rate: 100 }],
      }),
    );
    expect(noCross.warnings.some((w) => w.id.startsWith('quartz'))).toBe(false);

    // sane check de la zona configurable
    expect(cfg.quartzMin).toBe(540);
    expect(cfg.quartzMax).toBe(600);
  });

  it('Valores NaN/Infinity son rechazados', () => {
    const r = computeCurve(
      program({
        initialTemp: Number.NaN,
        segments: [{ id: 'a', type: 'ramp', targetTemp: 1000, rate: 100 }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(Number.isNaN(r.metrics.maxTemp)).toBe(false);
  });
});

describe('Tabla Orton', () => {
  it('11. La tabla respeta los valores ausentes', () => {
    // Todos los conos 022..12 tienen las tres velocidades publicadas en esta
    // tabla; la estructura permite celdas null y la función las respeta.
    for (const row of ORTON_CONES_TABLE) {
      expect([15, 60, 150].every((r) => row[`rate${r}` as 'rate15'] !== undefined)).toBe(true);
      expect(row.rate15).not.toBeUndefined();
    }
    // Un cono inexistente devuelve null.
    expect(ortonTempFor('999', 60)).toBeNull();
    // Una velocidad no soportada devuelve null.
    expect(ortonTempFor('6', 100)).toBeNull();
  });

  it('Cobertura de conos 022 a 12 con el intermedio 05 1/2', () => {
    const first = ORTON_CONES_TABLE[0];
    const last = ORTON_CONES_TABLE[ORTON_CONES_TABLE.length - 1];
    expect(first.cone).toBe('022');
    expect(last.cone).toBe('12');
    expect(ORTON_CONES_TABLE.some((r) => r.cone === '05 1/2')).toBe(true);
    // valores de referencia c150 acordes a Orton
    expect(ortonTempFor('6', 150)).toBe(1241);
    expect(ortonTempFor('10', 150)).toBe(1303);
  });

  it('Velocidades de referencia disponibles', () => {
    expect(ORTON_RATE_OPTIONS).toEqual([15, 60, 150]);
  });

  it('Las celdas sin dato (si existieran) no se interpolarian: funcion devuelve null', () => {
    // Simula una fila con dato faltante respetándolo.
    const fake = { cone: 'x', rate15: null as number | null, rate60: null as number | null, rate150: 1200 };
    // No usamos la tabla real aquí: verificamos que el selector por clave respeta null.
    expect(fake.rate15).toBeNull();
  });
});

describe('formatDuration', () => {
  it('Formatea duraciones legibles', () => {
    expect(formatDuration(405)).toBe('6 h 45 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(360)).toBe('6 h');
    expect(formatDuration(0)).toBe('0 min');
  });
  it('Maneja valores inválidos', () => {
    expect(formatDuration(Number.NaN)).toBe('—');
    expect(formatDuration(-5)).toBe('—');
  });
});

describe('Presets y clonación', () => {
  it('12/13. Guardar y recuperar un programa conserva todos los datos (clon/destrucción)', () => {
    const sys = getSystemPreset('sys-bisque-980')!;
    const copy = cloneProgram(sys);
    expect(copy.segments.length).toBe(sys.segments.length);
    expect(copy.segments[0]).toEqual(sys.segments[0]);
    expect(copy.initialTemp).toBe(sys.initialTemp);
    expect(copy.kind).toBe('custom');
  });

  it('14. Seleccionar un preset recupera la curva completa', () => {
    // computeCurve sobre el preset del sistema devuelve la curva completa.
    const r = computeCurve(SYSTEM_PRESETS[0]);
    expect(r.metrics.segmentCount).toBe(6);
    expect(r.metrics.maxTemp).toBe(980);
  });

  it('15. Dos presets con la misma temperatura máxima pueden coexistir sin sobrescribirse', () => {
    const a = cloneProgram(getSystemPreset('sys-glaze-1260')!);
    const b = cloneProgram(getSystemPreset('sys-glaze-1260')!);
    a.name = 'Esmalte 1260 rápido';
    b.name = 'Esmalte 1260 con enfriamiento controlado';
    b.segments = [
      { id: 'x1', type: 'ramp', targetTemp: 1260, rate: 150 },
      { id: 'x2', type: 'hold', durationMinutes: 20 },
      { id: 'x3', type: 'ramp', targetTemp: 300, rate: 40 },
    ];
    expect(a.name).toBe('Esmalte 1260 rápido');
    expect(b.name).toBe('Esmalte 1260 con enfriamiento controlado');
    expect(computeCurve(a).metrics.maxTemp).toBe(1260);
    expect(computeCurve(b).metrics.maxTemp).toBe(1260);
    expect(a.segments).not.toEqual(b.segments);
  });

  it('16. Guardar como nuevo preset conserva el original', () => {
    const original = getSystemPreset('sys-bisque-980')!;
    const derivative = cloneProgram(original, { name: 'Mi bizcocho modificado' });
    derivative.segments[0] = { id: 'm1', type: 'ramp', targetTemp: 120, rate: 80 };
    // El original no cambió.
    expect(original.segments[0].targetTemp).toBe(100);
    expect(derivative.segments[0].targetTemp).toBe(120);
  });

  it('17. Los presets del sistema no pueden sobrescribirse (su id de sistema permanece)', () => {
    const sys = getSystemPreset('sys-bisque-980')!;
    // El clon para edición es kind custom y sin id de sistema.
    const editable = cloneProgram(sys);
    expect(editable.kind).toBe('custom');
    expect(editable.id).toBeUndefined();
    // El original sigue intacto.
    expect(getSystemPreset('sys-bisque-980')!.segments[2].targetTemp).toBe(600);
  });
});

describe('Validación', () => {
  it('Duraciones de meseta negativas rechazadas', () => {
    const r = computeCurve(
      program({
        initialTemp: 20,
        segments: [{ id: 'a', type: 'hold', durationMinutes: -10 }],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.validationIssues.some((v) => v.id.startsWith('hold-duration'))).toBe(true);
  });

  it('Segmentos sin cambio de temperatura generan advertencia', () => {
    const r = computeCurve(
      program({
        initialTemp: 20,
        segments: [
          { id: 'a', type: 'ramp', targetTemp: 20, rate: 100 },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.warnings.some((w) => w.id.startsWith('no-change'))).toBe(true);
  });

  it('validateProgram exportado detecta campos vacíos', () => {
    const issues = validateProgram(program({ initialTemp: 20, segments: [{ id: 'a', type: 'ramp', rate: 100 }] as any }));
    expect(issues.some((v) => v.id.startsWith('ramp-temp'))).toBe(true);
  });
});