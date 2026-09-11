// Modelo de datos de los programas de cocción cerámica.
// Independiente de la capa visual para permitir persistencia y cálculo.

export type FiringProgramType = 'bisque' | 'glaze' | 'custom';

export type FiringSegmentType = 'ramp' | 'hold';

// Dirección derivada de la rampa (nunca almacenada por el usuario).
export type RampDirection = 'up' | 'down';

export interface FiringSegmentInput {
  /** Identificador estable del segmento. */
  id: string;
  type: FiringSegmentType;
  /** Rampa: temperatura objetivo en °C. */
  targetTemp?: number;
  /** Rampa: tasa en °C/h. Siempre positiva; la dirección se deriva de la diferencia de temperaturas. */
  rate?: number;
  /** Meseta: duración en minutos. */
  durationMinutes?: number;
}

// Indica si un ítem proviene del sistema (no editable/sobrescribible) o es del usuario.
export type FiringPresetKind = 'system' | 'custom';

export interface FiringProgram {
  /** Id Firestore (presente sólo en ítems persistidos). */
  id?: string;
  name: string;
  type: FiringProgramType;
  description?: string;
  initialTemp: number;
  segments: FiringSegmentInput[];
  /** Cono Orton de referencia opcional (p.ej. '6'). */
  cone?: string;
  /** Velocidad de referencia Orton en °C/h: 15, 60 o 150. */
  ortonRate?: number;
  kind: FiringPresetKind;
  /** Id del usuario propietario (persistencia). */
  ownerId?: string;
  createdAt?: any;
  updatedAt?: any;
}

// ------------------------- Resultado del motor -------------------------

export interface FiringComputedSegment {
  segmentId: string;
  index: number;
  type: FiringSegmentType;
  startTemp: number;
  endTemp: number;
  /** Duración del segmento en minutos. */
  durationMin: number;
  /** Tiempo de inicio acumulado en minutos. */
  startTimeMin: number;
  /** Tiempo final acumulado en minutos. */
  endTimeMin: number;
  /** Rampa: tasa en °C/h. */
  rate?: number;
  /** Rampa: dirección derivada. */
  direction?: RampDirection;
  /** Meseta: duración en minutos. */
  durationMinutes?: number;
}

export interface FiringMetrics {
  initialTemp: number;
  maxTemp: number;
  finalTemp: number;
  totalDurationMin: number;
  totalRampMin: number;
  totalHoldMin: number;
  /** Mantenimiento únicamente en las mesetas a la temperatura máxima alcanzada. */
  peakHoldMin: number;
  segmentCount: number;
  /** Velocidad de la última rampa ascendente, cuando exista. */
  lastHeatingRate?: number;
}

export type FiringWarningSeverity = 'info' | 'warning' | 'critical';

export interface FiringWarning {
  id: string;
  severity: FiringWarningSeverity;
  /** i18n key/mensaje en español. */
  message: string;
  /** Segmento implicado, si aplica. */
  segmentId?: string;
}

export interface FiringValidationIssue {
  id: string;
  severity: FiringWarningSeverity;
  message: string;
  segmentId?: string;
}

export interface FiringCurveResult {
  ok: boolean;
  segments: FiringComputedSegment[];
  metrics: FiringMetrics;
  warnings: FiringWarning[];
  validationIssues: FiringValidationIssue[];
  /** Punto de inicio (tiempo 0). */
  start: { timeMin: number; temp: number };
}

// ------------------------- Límites configurables -------------------------

export interface KilnLimits {
  minTemp: number;
  maxTemp: number;
}

export interface WarningConfig {
  /** Zona de inversión del cuarzo (configurable), en °C. */
  quartzMin: number;
  quartzMax: number;
  /** Tasa orientativa por encima de la cual se avisa al cruzar la zona del cuarzo. */
  quartzFastRate: number;
  /** Zona orientativa de cristobalita (sólo enfriamiento). */
  cristobaliteMin: number;
  cristobaliteMax: number;
}
