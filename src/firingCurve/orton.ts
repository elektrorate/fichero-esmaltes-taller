// Tabla de conos pirométricos Orton (autosoportados / "self-supporting").
//
// FUENTE:
//   Orton Ceramic Foundation — "Pyrometric Cone Temperature Equivalents
//   (Self-Supporting Cones)".
//   https://www.ortonceramic.com/resources/reference/cone-temperature-equivalents
//
// Las temperaturas corresponden a las velocidades de referencia publicadas del
// tramo final de calentamiento (no a la velocidad media de toda la cocción):
//   15 °C/h, 60 °C/h y 150 °C/h.
//
// NOTA: Los conos miden trabajo térmico acumulado; la caída depende de la
// combinación de temperatura, tiempo, velocidad y condiciones de cocción.
// Las celdas sin dato ("nulo") se respetan y NO se inventan ni se interpolan.
//
// Las filas se listan de cono más bajo (022) a más alto (12), incluyendo el
// cono intermedio 05½ (escrito "05 1/2").

export interface OrtonConeRow {
  cone: string;
  /** °C a 15 °C/h, o null si no está publicado. */
  rate15: number | null;
  /** °C a 60 °C/h, o null si no está publicado. */
  rate60: number | null;
  /** °C a 150 °C/h, o null si no está publicado. */
  rate150: number | null;
}

export const ORTON_RATE_OPTIONS: number[] = [15, 60, 150];

export const ORTON_CONES_TABLE: OrtonConeRow[] = [
  { cone: '022', rate15: 566, rate60: 586, rate150: 590 },
  { cone: '021', rate15: 577, rate60: 600, rate150: 617 },
  { cone: '020', rate15: 589, rate60: 626, rate150: 638 },
  { cone: '019', rate15: 638, rate60: 676, rate150: 693 },
  { cone: '018', rate15: 668, rate60: 712, rate150: 732 },
  { cone: '017', rate15: 703, rate60: 736, rate150: 761 },
  { cone: '016', rate15: 732, rate60: 769, rate150: 794 },
  { cone: '015', rate15: 762, rate60: 788, rate150: 816 },
  { cone: '014', rate15: 792, rate60: 807, rate150: 836 },
  { cone: '013', rate15: 826, rate60: 837, rate150: 859 },
  { cone: '012', rate15: 839, rate60: 858, rate150: 880 },
  { cone: '011', rate15: 858, rate60: 873, rate150: 892 },
  { cone: '010', rate15: 884, rate60: 898, rate150: 913 },
  { cone: '09', rate15: 895, rate60: 917, rate150: 928 },
  { cone: '08', rate15: 907, rate60: 942, rate150: 954 },
  { cone: '07', rate15: 955, rate60: 973, rate150: 985 },
  { cone: '06', rate15: 985, rate60: 995, rate150: 1011 },
  { cone: '05 1/2', rate15: 999, rate60: 1012, rate150: 1023 },
  { cone: '05', rate15: 1015, rate60: 1030, rate150: 1046 },
  { cone: '04', rate15: 1046, rate60: 1060, rate150: 1070 },
  { cone: '03', rate15: 1066, rate60: 1086, rate150: 1101 },
  { cone: '02', rate15: 1098, rate60: 1101, rate150: 1120 },
  { cone: '01', rate15: 1110, rate60: 1117, rate150: 1137 },
  { cone: '1', rate15: 1127, rate60: 1136, rate150: 1154 },
  { cone: '2', rate15: 1130, rate60: 1142, rate150: 1162 },
  { cone: '3', rate15: 1149, rate60: 1152, rate150: 1168 },
  { cone: '4', rate15: 1155, rate60: 1160, rate150: 1181 },
  { cone: '5', rate15: 1166, rate60: 1184, rate150: 1205 },
  { cone: '6', rate15: 1189, rate60: 1220, rate150: 1241 },
  { cone: '7', rate15: 1212, rate60: 1237, rate150: 1255 },
  { cone: '8', rate15: 1224, rate60: 1247, rate150: 1269 },
  { cone: '9', rate15: 1240, rate60: 1257, rate150: 1278 },
  { cone: '10', rate15: 1263, rate60: 1282, rate150: 1303 },
  { cone: '11', rate15: 1280, rate60: 1293, rate150: 1312 },
  { cone: '12', rate15: 1296, rate60: 1304, rate150: 1324 },
];

/** Devuelve la temperatura equivalente (°C) de un cono a una velocidad dada, o null si no hay dato. */
export function ortonTempFor(cone: string | undefined, rate: number | undefined): number | null {
  if (!cone) return null;
  const row = ORTON_CONES_TABLE.find((r) => r.cone.toLowerCase() === cone.trim().toLowerCase());
  if (!row) return null;
  const key = rate === 15 ? 'rate15' : rate === 60 ? 'rate60' : rate === 150 ? 'rate150' : null;
  if (!key) return null;
  return row[key] ?? null;
}
