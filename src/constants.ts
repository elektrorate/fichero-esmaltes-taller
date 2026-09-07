import { GlazeStatus } from './types';

export const STATUS_LABELS: Record<GlazeStatus, string> = {
  draft: 'Borrador',
  pending: 'Pendiente',
  validated: 'Formulado',
  published: 'Publicado',
  archived: 'Archivado'
};

export interface OrtonCone {
  cone: string;
  c60: number;
  c150: number;
}

export const ORTON_CONES: OrtonCone[] = [
  { cone: '022', c60: 586, c150: 590 },
  { cone: '021', c60: 600, c150: 617 },
  { cone: '020', c60: 626, c150: 638 },
  { cone: '019', c60: 676, c150: 693 },
  { cone: '018', c60: 712, c150: 732 },
  { cone: '017', c60: 736, c150: 761 },
  { cone: '016', c60: 769, c150: 794 },
  { cone: '015', c60: 788, c150: 816 },
  { cone: '014', c60: 807, c150: 836 },
  { cone: '013', c60: 837, c150: 859 },
  { cone: '012', c60: 858, c150: 880 },
  { cone: '011', c60: 873, c150: 892 },
  { cone: '010', c60: 898, c150: 913 },
  { cone: '09', c60: 917, c150: 928 },
  { cone: '08', c60: 942, c150: 954 },
  { cone: '07', c60: 973, c150: 985 },
  { cone: '06', c60: 995, c150: 1011 },
  { cone: '05½', c60: 1012, c150: 1023 },
  { cone: '05', c60: 1030, c150: 1046 },
  { cone: '04', c60: 1060, c150: 1070 },
  { cone: '03', c60: 1086, c150: 1101 },
  { cone: '02', c60: 1101, c150: 1120 },
  { cone: '01', c60: 1117, c150: 1137 },
  { cone: '1', c60: 1136, c150: 1154 },
  { cone: '2', c60: 1142, c150: 1162 },
  { cone: '3', c60: 1152, c150: 1168 },
  { cone: '4', c60: 1160, c150: 1181 },
  { cone: '5', c60: 1184, c150: 1205 },
  { cone: '6', c60: 1220, c150: 1241 },
  { cone: '7', c60: 1237, c150: 1255 },
  { cone: '8', c60: 1247, c150: 1269 },
  { cone: '9', c60: 1257, c150: 1278 },
  { cone: '10', c60: 1282, c150: 1303 },
  { cone: '11', c60: 1293, c150: 1312 },
  { cone: '12', c60: 1304, c150: 1324 }
];

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const matchesOrtonCone = (temperature: string, cone: string) => {
  if (!cone) return false;
  return new RegExp(`(?<![\\d])${escapeRegex(cone)}(?![\\d])`, 'i').test(temperature || '');
};

export const ATMOSPHERE_OPTIONS = ['Oxidación', 'Reducción', 'Otra', 'No especificada'];

export const APPLICATION_METHOD_OPTIONS = ['Inmersión', 'Pincel', 'Aerógrafo', 'Vertido', 'Otro'];

export const FOOD_SAFETY_STATUSES: string[] = [
  'No evaluado',
  'En proceso de evaluación',
  'Evaluado mediante ensayos',
  'No recomendado para contacto alimentario'
];
