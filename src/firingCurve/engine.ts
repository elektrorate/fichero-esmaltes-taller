// Motor matemático determinista de curvas de cocción.
// Recibe una temperatura inicial y un arreglo de segmentos, y devuelve una
// estructura calculada: puntos, duraciones, tiempos acumulados, métricas y
// advertencias. NO es una simulación física del horno ni una garantía de
// seguridad: es un planificador de programas.
//
// Conserva precisión decimal en el cálculo; el redondeo es sólo de presentación.

import {
  FiringComputedSegment,
  FiringCurveResult,
  FiringMetrics,
  FiringProgram,
  FiringSegmentInput,
  FiringValidationIssue,
  FiringWarning,
  FiringWarningSeverity,
  KilnLimits,
  RampDirection,
  WarningConfig,
} from './types';

export const DEFAULT_KILN_LIMITS: KilnLimits = { minTemp: 0, maxTemp: 1500 };

export const DEFAULT_WARNING_CONFIG: WarningConfig = {
  quartzMin: 540,
  quartzMax: 600,
  quartzFastRate: 250,
  cristobaliteMin: 220,
  cristobaliteMax: 270,
};

export interface EngineOptions {
  kilnLimits?: Partial<KilnLimits>;
  warnings?: Partial<WarningConfig>;
}

export interface SegmentSpec {
  id: string;
  type: FiringSegmentInput['type'];
  targetTemp?: number;
  rate?: number;
  durationMinutes?: number;
}

/** Valida un programa y devuelve la lista de problemas (sin silenciar segmentos inválidos). */
export function validateProgram(
  program: Pick<FiringProgram, 'initialTemp' | 'segments'>,
  options: EngineOptions = {},
): FiringValidationIssue[] {
  const issues: FiringValidationIssue[] = [];
  const limits: KilnLimits = { ...DEFAULT_KILN_LIMITS, ...options.kilnLimits };
  const { initialTemp, segments } = program;

  if (!Number.isFinite(initialTemp)) {
    issues.push({ id: 'initial-temp-nan', severity: 'critical', message: 'La temperatura inicial debe ser un número finito.' });
  }

  if (!Array.isArray(segments)) {
    issues.push({ id: 'no-segments-array', severity: 'critical', message: 'El programa no tiene segmentos.' });
    return issues;
  }

  if (segments.length === 0) {
    issues.push({ id: 'no-segments', severity: 'critical', message: 'El programa está vacío. Añade al menos un segmento.' });
    return issues;
  }

  segments.forEach((seg, i) => {
    if (seg.type === 'ramp') {
      const t = seg.targetTemp;
      const r = seg.rate;
      if (t === undefined || !Number.isFinite(t)) {
        issues.push({ id: `ramp-temp-${i}`, severity: 'critical', message: `Segmento ${i + 1}: la temperatura objetivo no es un número finito.`, segmentId: seg.id });
      }
      if (r === undefined || !Number.isFinite(r) || r <= 0) {
        issues.push({ id: `ramp-rate-${i}`, severity: 'critical', message: `Segmento ${i + 1}: la tasa debe ser un número positivo mayor que 0.`, segmentId: seg.id });
      }
    } else if (seg.type === 'hold') {
      const d = seg.durationMinutes;
      if (d === undefined || !Number.isFinite(d) || d < 0) {
        issues.push({ id: `hold-duration-${i}`, severity: 'critical', message: `Segmento ${i + 1}: la duración de la meseta debe ser un número no negativo.`, segmentId: seg.id });
      }
    }
  });

  if (Number.isFinite(initialTemp) && (initialTemp < limits.minTemp || initialTemp > limits.maxTemp)) {
    issues.push({
      id: 'initial-temp-range',
      severity: 'warning',
      message: `La temperatura inicial (${initialTemp} °C) queda fuera del rango configurable del horno (${limits.minTemp}–${limits.maxTemp} °C).`,
    });
  }

  // Temperaturas fuera de rango (saltando cuando hay NaN, ya reportado).
  segments.forEach((seg, i) => {
    const t = seg.type === 'ramp' ? seg.targetTemp : undefined;
    if (t !== undefined && Number.isFinite(t) && (t < limits.minTemp || t > limits.maxTemp)) {
      issues.push({
        id: `temp-range-${i}`,
        severity: 'warning',
        message: `Segmento ${i + 1}: la temperatura ${t} °C queda fuera del rango configurable del horno (${limits.minTemp}–${limits.maxTemp} °C).`,
        segmentId: seg.id,
      });
    }
  });

  return issues;
}

function directionFor(from: number, to: number): RampDirection {
  if (to > from) return 'up';
  if (to < from) return 'down';
  return 'up'; // sin cambio; se detectará como segmento sin cambio de temperatura
}

export function computeCurve(
  program: Pick<FiringProgram, 'initialTemp' | 'segments'>,
  options: EngineOptions = {},
): FiringCurveResult {
  const issues = validateProgram(program, options);
  const hasCritical = issues.some((i) => i.severity === 'critical');
  const initialTemp = Number.isFinite(program.initialTemp) ? program.initialTemp : 0;
  const segments = Array.isArray(program.segments) ? program.segments : [];

  // Estructura mínima para render sin errores aunque el programa sea inválido.
  const emptyMetrics: FiringMetrics = {
    initialTemp,
    maxTemp: Number.isFinite(initialTemp) ? initialTemp : 0,
    finalTemp: Number.isFinite(initialTemp) ? initialTemp : 0,
    totalDurationMin: 0,
    totalRampMin: 0,
    totalHoldMin: 0,
    peakHoldMin: 0,
    segmentCount: segments.length,
  };

  const start = { timeMin: 0, temp: initialTemp };

  if (hasCritical) {
    return {
      ok: false,
      segments: [],
      metrics: emptyMetrics,
      warnings: [],
      validationIssues: issues,
      start,
    };
  }

  let currentTemp = initialTemp;
  let currentTime = 0;
  const computed: FiringCurveResult['segments'] = [];
  let maxTemp = Number.isFinite(initialTemp) ? initialTemp : 0;
  const warnings: FiringWarning[] = [];
  const warnCfg: WarningConfig = { ...DEFAULT_WARNING_CONFIG, ...options.warnings };
  let lastHeatingRate: number | undefined;

  segments.forEach((seg, i) => {
    const startTime = currentTime;
    const startTemp = currentTemp;

    if (seg.type === 'ramp') {
      const target = seg.targetTemp as number;
      const rate = seg.rate as number;
      const dT = target - currentTemp;
      // Segmento "sin cambio de temperatura innecesario".
      if (dT === 0) {
        warnings.push({
          id: `no-change-${i}`,
          severity: 'info',
          message: `Segmento ${i + 1}: rampa sin cambio de temperatura (empieza y termina en ${currentTemp} °C). Revisa si pretendías una meseta.`,
          segmentId: seg.id,
        });
      }
      const durationMin = (Math.abs(dT) / rate) * 60;
      const direction = directionFor(startTemp, target);
      if (direction === 'up') {
        lastHeatingRate = rate;
        if (crossesZone(startTemp, target, warnCfg.quartzMin, warnCfg.quartzMax)) {
          warnings.push({
            id: `quartz-up-${i}`,
            severity: rate >= warnCfg.quartzFastRate ? 'warning' : 'info',
            message:
              `Segmento ${i + 1}: la rampa ascendente atraviesa la zona de inversión del cuarzo (${warnCfg.quartzMin}–${warnCfg.quartzMax} °C) a ${formatRate(rate)} °C/h. ` +
              `El riesgo de roturas depende de los gradientes térmicos, el espesor, la composición, la geometría y la carga del horno. ` +
              (rate >= warnCfg.quartzFastRate ? 'Umbral orientativo superado (configurable), no una garantía de seguridad.' : 'Criterio orientativo, no una garantía.'),
            segmentId: seg.id,
          });
        }
      } else if (direction === 'down') {
        // Enfriamiento: cuarzo y (si aplica) cristobalita.
        if (crossesZone(startTemp, target, warnCfg.quartzMin, warnCfg.quartzMax)) {
          warnings.push({
            id: `quartz-down-${i}`,
            severity: 'warning',
            message:
              `Segmento ${i + 1}: el enfriamiento atraviesa la zona de inversión del cuarzo (${warnCfg.quartzMin}–${warnCfg.quartzMax} °C) a ${formatRate(rate)} °C/h. ` +
              `Los gradientes generados dependen del espesor, la composición, la geometría y la carga. Critero orientativo.`,
            segmentId: seg.id,
          });
        }
        if (crossesZone(startTemp, target, warnCfg.cristobaliteMin, warnCfg.cristobaliteMax)) {
          warnings.push({
            id: `cristobalite-${i}`,
            severity: 'info',
            message:
              `Segmento ${i + 1}: el enfriamiento atraviesa la posible zona de inversión de la cristobalita (${warnCfg.cristobaliteMin}–${warnCfg.cristobaliteMax} °C). ` +
              `Sólo relevante si la pasta contiene cristobalita en cantidades significativas; no asumas que toda pasta la contiene.`,
            segmentId: seg.id,
          });
        }
      }

      currentTemp = target;
      currentTime += durationMin;
      computed.push({
        segmentId: seg.id,
        index: i,
        type: 'ramp',
        startTemp,
        endTemp: target,
        durationMin,
        startTimeMin: startTime,
        endTimeMin: currentTime,
        rate,
        direction,
      });
    } else {
      // hold
      const duration = seg.durationMinutes as number;
      currentTime += duration;
      computed.push({
        segmentId: seg.id,
        index: i,
        type: 'hold',
        startTemp,
        endTemp: currentTemp,
        durationMin: duration,
        startTimeMin: startTime,
        endTimeMin: currentTime,
        durationMinutes: duration,
      });
    }

    if (Number.isFinite(currentTemp) && currentTemp > maxTemp) maxTemp = currentTemp;
  });

  const totalRampMin = sum(computed, (s) => (s.type === 'ramp' ? s.durationMin : 0));
  const totalHoldMin = sum(computed, (s) => (s.type === 'hold' ? s.durationMin : 0));
  const peakHoldMin = sum(
    computed,
    (s) => (s.type === 'hold' && s.endTemp === maxTemp ? s.durationMin : 0),
  );

  const metrics: FiringMetrics = {
    initialTemp,
    maxTemp,
    finalTemp: currentTemp,
    totalDurationMin: currentTime,
    totalRampMin,
    totalHoldMin,
    peakHoldMin,
    segmentCount: computed.length,
    lastHeatingRate,
  };

  return { ok: true, segments: computed, metrics, warnings, validationIssues: issues, start };
}

function crossesZone(start: number, end: number, min: number, max: number): boolean {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  // Hay cruce si el rango recorre parte de la zona y las temperaturas no están
  // totalmente dentro (un punto exacto sobre el límite cuenta como cruce).
  return hi > min && lo < max;
}

function sum(arr: FiringComputedSegment[], fn: (s: FiringComputedSegment) => number): number {
  return arr.reduce((acc, s) => acc + fn(s), 0);
}

export function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '—';
  const total = Math.round(totalMinutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

export function formatRate(rate: number): string {
  return `${Math.round(rate)}`;
}

// Utilidades de presentación numérica (redondeo sólo al mostrar).
export function rounded(n: number, digits = 0): number {
  if (!Number.isFinite(n)) return n;
  const f = Math.pow(10, digits);
  return Math.round(n * f) / f;
}
