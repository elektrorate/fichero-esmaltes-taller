import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, addDoc, deleteDoc, collection, serverTimestamp, query, orderBy, limit, onSnapshot, where, getDocs } from 'firebase/firestore';
import { Glaze, GlazeCopy, RecipeItem, GlazeStatus } from '../types';
import { STATUS_LABELS, ATMOSPHERE_OPTIONS } from '../constants';
import GlazeTechModules from './GlazeTechModules';
import { motion } from 'motion/react';
import { Save, Plus, Trash2, Calculator, Info, Image as ImageIcon, AlertCircle, Loader2 as Spinner, Upload, FileInput, Copy } from 'lucide-react';
import { cn } from '../lib/utils';

interface GlazeFormProps {
  glazeId: string | null;
  initialCopyIndex?: number | null;
  onCancel: () => void;
  onSuccess: () => void;
  onDelete: (id: string) => void;
}

const CATEGORIES = {
  finish: [
    { label: 'Brillante', code: 'BR' },
    { label: 'Semi-brillante', code: 'SB' },
    { label: 'Mate', code: 'MT' },
    { label: 'Satinado', code: 'ST' },
    { label: 'Opaco', code: 'OP' },
    { label: 'Translúcido', code: 'TR' },
    { label: 'Cristalino', code: 'CR' },
    { label: 'Moteado', code: 'SP' },
    { label: 'Texturizado', code: 'TX' },
    { label: 'Reactivo', code: 'RV' }
  ],
  color: [
    { label: 'Blanco', code: 'B' },
    { label: 'Negro', code: 'N' },
    { label: 'Gris', code: 'G' },
    { label: 'Azul', code: 'A' },
    { label: 'Verde', code: 'V' },
    { label: 'Rojo', code: 'R' },
    { label: 'Marrón', code: 'M' },
    { label: 'Amarillo', code: 'Y' },
    { label: 'Naranja', code: 'O' },
    { label: 'Púrpura', code: 'P' },
    { label: 'Tierra / terracota', code: 'T' },
    { label: 'Crema / beige', code: 'C' },
    { label: 'Transparente', code: 'TR' }
  ],
  usage: [
    { label: 'Apto para vajilla / food safe', code: 'FS' },
    { label: 'Decorativo', code: 'DC' }
  ],
  texture: ['Liso', 'Sedoso', 'Rugoso', 'Arenoso', 'Moteado', 'Craquelado', 'Lava / volcánico', 'Piel de naranja', 'Escurrido controlado'],
  application: ['Inmersión', 'Vertido', 'Pincel', 'Aerógrafo', 'Pulverizado', 'Capa única', 'Multicapa'],
  family: ['Borosilicato', 'Feldespático', 'Litio', 'Zinc', 'Magnesio', 'Cenizas', 'Alta alúmina', 'Baja expansión']
};

const RAW_MATERIALS = [
  'Sílice', 'Caolín EPK', 'Caolín Grolleg', 'Caolín calcinado', 'Arcilla de bola',
  'Arcilla inglesa', 'Bentonita', 'Feldespato potásico', 'Feldespato sódico',
  'Nefelina sienita', 'Carbonato cálcico', 'Dolomita', 'Talco', 'Wollastonita',
  'Carbonato de magnesio', 'Carbonato de bario', 'Carbonato de estroncio',
  'Carbonato de litio', 'Espodumena', 'Petalita', 'Borato de calcio', 'Colemanita',
  'Ulexita', 'Frita 3110', 'Frita 3134', 'Frita CQ003', 'Frita 3195', 'Frita 3124',
  'Frita 3249', 'Frita 3269', 'Óxido de zinc', 'Alúmina hidratada', 'Óxido de estaño',
  'Zircon', 'Óxido de zirconio', 'Dióxido de titanio', 'Rutilo', 'Ceniza de hueso',
  'Fosfato tricálcico', 'Óxido de hierro', 'Óxido rojo', 'Óxido negro', 'Óxido de cobre',
  'Carbonato de cobre', 'Óxido de cobalto', 'Carbonato de cobalto', 'Óxido de manganeso',
  'Dióxido de manganeso', 'Óxido de níquel', 'Óxido de cromo', 'Óxido de vanadio',
  'Ilmenita', 'Carbonato de manganeso', 'Carbonato de níquel', 'Carbonato de hierro',
  'Nitrato de cobalto', 'Nitrato de cobre', 'Silicato de sodio', 'Epsom (sulfato de magnesio)',
  'Chamota fina', 'Arena silícea fina', 'Chamota molida', 'Chamota refractaria fina',
  'Ceniza vegetal tamizada', 'Ceniza de madera', 'Fluorita', 'Bórax', 'Ácido bórico',
  'Sulfato de bario', 'Óxido de molibdeno', 'Óxido de titanio anatasa', 'Carburo de silicio'
];

const GLAZY_DATA_BASE_URLS = [
  'https://cdn.jsdelivr.net/gh/derekphilipau/glazy-data@master',
  'https://raw.githubusercontent.com/derekphilipau/glazy-data/master'
];
const FALLBACK_GLAZY_DATA_FILE = 'glazy_20260531.yaml.gz';
const GLAZY_API_URLS = ['/glazy-api/api', 'https://api.glazy.org/api'];
const GLAZY_CLOUD_URL = 'https://ddms6z64wp3a6.cloudfront.net';

interface GlazyRecipeImport {
  id: string;
  name: string;
  state?: string;
  cone?: string;
  surface?: string;
  transparency?: string;
  atmospheres: string[];
  country?: string;
  subtype?: string;
  description?: string;
  mainImage?: string;
  gallery?: string[];
  base: RecipeItem[];
  additional: RecipeItem[];
  totalBase: number;
}

const decodeYamlValue = (value: string) => value
  .trim()
  .replace(/^'|'$/g, '')
  .replace(/^"|"$/g, '')
  .replace(/''/g, "'");

const getYamlField = (block: string, field: string) => {
  const match = block.match(new RegExp(`\\n\\s{2}${field}:\\s*(.+)`));
  return match ? decodeYamlValue(match[1]) : undefined;
};

const getIndentedYamlField = (block: string, field: string) => {
  const match = block.match(new RegExp(`\\n\\s+${field}:\\s*(.+)`));
  return match ? decodeYamlValue(match[1]) : undefined;
};

const extractGlazyRecipeId = (url: string) => {
  const match = url.match(/(?:recipes\/|^)(\d{3,})(?:\D|$)/);
  return match?.[1];
};

const looksLikeSpreadsheetSource = (value: string) => {
  return /docs\.google\.com\/spreadsheets|\.xlsx(?:\?|#|$)|\.xls(?:\?|#|$)|\.csv(?:\?|#|$)|\.tsv(?:\?|#|$)/i.test(value);
};

const getGlazyImageUrl = (materialId: number | string, filename?: string, size = 'l') => {
  if (!filename) return '';
  const id = `${materialId}`;
  const folder = id.slice(-2);
  return `${GLAZY_CLOUD_URL}/uploads/recipes/${folder}/${size}_${filename}`;
};

const mapGlazyStatus = (state?: string): GlazeStatus => {
  const normalized = state?.toLowerCase() || '';
  if (normalized.includes('production')) return 'published';
  if (normalized.includes('testing')) return 'pending';
  if (normalized.includes('discontinued')) return 'archived';
  return 'draft';
};

const mapGlazySurface = (surface?: string) => {
  const normalized = surface?.toLowerCase() || '';
  if (normalized.includes('semi') && (normalized.includes('gloss') || normalized.includes('bright'))) return 'Semi-brillante';
  if (normalized.includes('gloss') || normalized.includes('bright')) return 'Brillante';
  if (normalized.includes('satin')) return 'Satinado';
  if (normalized.includes('matte') || normalized.includes('matt')) return 'Mate';
  if (normalized.includes('opaque')) return 'Opaco';
  return 'Brillante';
};

const inferGlazyColor = (recipe: Pick<GlazyRecipeImport, 'name' | 'subtype' | 'description'>) => {
  const text = `${recipe.name} ${recipe.subtype || ''} ${recipe.description || ''}`.toLowerCase();
  if (text.includes('blue') || text.includes('cobalt')) return 'Azul';
  if (text.includes('green') || text.includes('celadon') || text.includes('copper')) return 'Verde';
  if (text.includes('purple') || text.includes('eggplant') || text.includes('manganese')) return 'Púrpura';
  if (text.includes('red')) return 'Rojo';
  if (text.includes('yellow')) return 'Amarillo';
  if (text.includes('orange')) return 'Naranja';
  if (text.includes('black')) return 'Negro';
  if (text.includes('white')) return 'Blanco';
  if (text.includes('brown') || text.includes('iron')) return 'Marrón';
  if (text.includes('gray') || text.includes('grey')) return 'Gris';
  return 'Blanco';
};

const inferGlazyTexture = (recipe: Pick<GlazyRecipeImport, 'name' | 'subtype' | 'description'>) => {
  const text = `${recipe.name} ${recipe.subtype || ''} ${recipe.description || ''}`.toLowerCase();
  if (text.includes('crawl')) return 'Craquelado';
  if (text.includes('speck') || text.includes('crystal')) return 'Moteado';
  if (text.includes('lava') || text.includes('volcan')) return 'Lava / volcánico';
  if (text.includes('rough')) return 'Rugoso';
  return 'Liso';
};

const mapAtmosphere = (atmospheres: string[]) => {
  const first = atmospheres[0]?.toLowerCase() || '';
  if (first.includes('reduction')) return 'Reducción';
  if (first.includes('neutral')) return 'Neutra';
  if (first.includes('oxidation')) return 'Oxidación';
  return 'Oxidación';
};

const normalizeExcelHeader = (value: unknown) => {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[áàâä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[°º]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(' ')
    .filter(token => token !== 'c' && token !== 'grados' && token.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['nombre', 'nombre del esmalte', 'nombre esmalte', 'esmalte', 'nombre de la ficha', 'ficha'],
  code: ['n', 'numero', 'numero de ficha', 'n de ficha', 'n ficha', 'codigo', 'codigo de ficha', 'codigo ficha', 'id', 'identificador'],
  finish: ['acabado', 'terminacion', 'superficie', 'brillo', 'acabado superficial'],
  color: ['color'],
  texture: ['textura'],
  usage: ['uso', 'usos', 'uso de la pieza', 'uso funcional', 'destino'],
  applicationMethod: ['tecnica', 'tecnica de aplicacion', 'aplicacion', 'metodo de aplicacion'],
  chemicalFamily: ['familia', 'familia quimica', 'base quimica'],
  observations: ['observaciones', 'notas', 'descripcion', 'descripcion del esmalte', 'comentarios', 'anotaciones'],
  temperature: ['temperatura', 't', 'temp', 'temperatura de coccion', 'temp coccion', 'temperatura de cocido', 'temp cocido'],
  cone: ['cono', 'cono orton'],
  clayBody: ['arcilla', 'pasta', 'cuerpo', 'cuerpo arcilloso', 'pasta arcillosa', 'tipo de arcilla', 'tipo de pasta', 'pasta ceramica'],
  firingType: ['tipo de coccion', 'coccion', 'tecnica de coccion', 'horno'],
  atmosphere: ['atmosfera'],
  total: ['total', 'peso total', 'total base', 'base total'],
  glazyUrl: ['url', 'link', 'url glazy', 'link glazy', 'fuente', 'fuente glazy']
};

const BASE_MATERIAL_WORDS = ['materia prima', 'materia', 'material', 'ingrediente', 'componente', 'base'];
const ADDITIONAL_MATERIAL_WORDS = ['aditivo', 'adicional', 'oxido', 'colorante', 'pigmento', 'tinte'];
const AMOUNT_WORDS = ['cantidad', 'cant', 'porcentaje', 'peso', 'gramos', 'gr'];

interface TableColumn {
  index: number;
  kind: 'text' | 'material' | 'amount' | 'packed';
  sub: string;
  num?: number;
}

const classifyExcelHeader = (raw: unknown): TableColumn | null => {
  const rawText = String(raw ?? '').trim();

  const percentMatch = rawText.match(/^%\s*(\d{1,2})$/);
  if (percentMatch) {
    return { index: 0, kind: 'amount', sub: 'base', num: parseInt(percentMatch[1], 10) };
  }

  const header = normalizeExcelHeader(raw);
  if (!header) return null;

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(header)) {
      return { index: 0, kind: 'text', sub: field };
    }
  }

  const numbered = header.match(/^(.+?)\s+(\d{1,2})$/);
  const base = numbered ? numbered[1] : null;
  const num = numbered ? parseInt(numbered[2], 10) : null;

  const isAmount = (w: string) => AMOUNT_WORDS.some(word => w === word || w.includes(word));
  const isBaseMaterial = (w: string) => BASE_MATERIAL_WORDS.some(word => w.includes(word));
  const isAdditionalMaterial = (w: string) => ADDITIONAL_MATERIAL_WORDS.some(word => w.includes(word));

  if (numbered && num) {
    if (isAmount(base || '')) return { index: 0, kind: 'amount', sub: 'base', num };
    if (isBaseMaterial(base || '')) return { index: 0, kind: 'material', sub: 'base', num };
    if (isAdditionalMaterial(base || '')) return { index: 0, kind: 'material', sub: 'additional', num };
    return null;
  }

  if (isAmount(header)) return { index: 0, kind: 'amount', sub: 'base', num: 1 };
  if (isBaseMaterial(header)) return { index: 0, kind: 'material', sub: 'base', num: 1 };
  if (isAdditionalMaterial(header)) return { index: 0, kind: 'material', sub: 'additional', num: 1 };

  if (header === 'materias' || header === 'receta' || header === 'materias primas' || header === 'formula') {
    return { index: 0, kind: 'packed', sub: 'base' };
  }
  if (header === 'aditivos' || header === 'oxidos' || header === 'adicionales') {
    return { index: 0, kind: 'packed', sub: 'additional' };
  }

  return null;
};

const parseExcelAmount = (value: unknown): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined) return 0;
  let text = String(value).trim();
  if (!text) return 0;

  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }

  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? (parseFloat(match[0]) || 0) : 0;
};

const splitListValue = (value: string) =>
  value
    .split(/[,;|/]+/)
    .map(item => item.trim())
    .filter(Boolean);

const parsePackedMaterias = (text: string): RecipeItem[] => {
  const items: RecipeItem[] = [];
  text.split(/\s*\|\s*|\n/).forEach(part => {
    const clean = part.trim().replace(/:$/, '');
    if (!clean) return;

    if (clean.includes(',')) {
      const lastComma = clean.lastIndexOf(',');
      const rightPart = clean.slice(lastComma + 1).trim().replace(/(?:g|gr|grm|kg)\.?\s*$/i, '');
      if (/^(?:-?\d+(?:[.,]\d+)?)$/.test(rightPart)) {
        const material = clean.slice(0, lastComma).trim();
        if (material) {
          items.push({ material, amount: parseExcelAmount(rightPart) });
          return;
        }
      }
    }

    const match = clean.match(/^(.*?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*(?:g|gr|grm|kg|gr\.|g\.)\s*$/)
      || clean.match(/^(.*?)\s*[:=]?\s*(-?\d+(?:[.,]\d+)?)\s*%?\s*$/);
    if (match && match[1].trim()) {
      items.push({ material: match[1].trim().replace(/,$/, ''), amount: parseExcelAmount(match[2]) });
    } else if (match) {
      items.push({ material: clean, amount: parseExcelAmount(match[2]) });
    } else {
      items.push({ material: clean, amount: 0 });
    }
  });
  return items;
};

const mapTableValue = (field: string, raw: unknown): string => {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const normalized = normalizeExcelHeader(value);

  const matchFirst = (map: Array<[string[], string]>) => {
    return map.find(([keywords]) => keywords.some(keyword => normalized.includes(keyword)))?.[1] || value;
  };

  switch (field) {
    case 'color':
      return matchFirst([
        [['anaranjado', 'naranja'], 'Naranja'],
        [['terracota', 'tierra'], 'Tierra / terracota'],
        [['crema', 'beige', 'marfil'], 'Crema / beige'],
        [['purpura', 'lila', 'violeta'], 'Púrpura'],
        [['transparente'], 'Transparente'],
        [['marron', 'cafe', 'chocolate', 'hierro'], 'Marrón'],
        [['amarillo'], 'Amarillo'],
        [['cobalto', 'azul'], 'Azul'],
        [['blanco'], 'Blanco'],
        [['negro'], 'Negro'],
        [['verde'], 'Verde'],
        [['rojo'], 'Rojo'],
        [['gris'], 'Gris']
      ]);
    case 'finish':
      return matchFirst([
        [['semi brillante', 'semi'], 'Semi-brillante'],
        [['satin'], 'Satinado'],
        [['transluc'], 'Translúcido'],
        [['cristalin', 'cristal'], 'Cristalino'],
        [['motead', 'speck'], 'Moteado'],
        [['textur'], 'Texturizado'],
        [['reactiv'], 'Reactivo'],
        [['opac'], 'Opaco'],
        [['mate'], 'Mate'],
        [['brill', 'lustroso', 'gloss'], 'Brillante']
      ]);
    case 'texture':
      return matchFirst([
        [['piel de naranja'], 'Piel de naranja'],
        [['lava', 'volcan'], 'Lava / volcánico'],
        [['craquel'], 'Craquelado'],
        [['escurrido'], 'Escurrido controlado'],
        [['motead', 'speck', 'cristal'], 'Moteado'],
        [['sedoso'], 'Sedoso'],
        [['arenoso'], 'Arenoso'],
        [['rugoso', 'rustic'], 'Rugoso'],
        [['liso'], 'Liso']
      ]);
    case 'usage':
      if (['vajilla', 'aliment', 'food', 'cocina', 'comida'].some(kw => normalized.includes(kw))) {
        return 'Apto para vajilla / food safe';
      }
      if (normalized.includes('decor')) return 'Decorativo';
      return value;
    case 'applicationMethod':
      return matchFirst([
        [['inmersion', 'inmersio'], 'Inmersión'],
        [['aerografo', 'airbrush'], 'Aerógrafo'],
        [['pulveriz', 'spray'], 'Pulverizado'],
        [['capa unica', 'una capa'], 'Capa única'],
        [['multicapa', 'multi'], 'Multicapa'],
        [['pincel'], 'Pincel'],
        [['vertid'], 'Vertido'],
        [['otro', 'otra'], 'Otro']
      ]);
    case 'atmosphere':
      if (normalized.includes('oxid')) return 'Oxidación';
      if (normalized.includes('reduct')) return 'Reducción';
      if (normalized.includes('neutral') || normalized.includes('neutra')) return 'Neutra';
      return ATMOSPHERE_OPTIONS.includes(value) ? value : 'Otra';
    case 'chemicalFamily':
      return matchFirst([
        [['borosilic'], 'Borosilicato'],
        [['feldespat'], 'Feldespático'],
        [['ceniz'], 'Cenizas'],
        [['alta alumina', 'alumina'], 'Alta alúmina'],
        [['baja expansion'], 'Baja expansión'],
        [['magnesio'], 'Magnesio'],
        [['zinc'], 'Zinc'],
        [['litio', 'espodumena', 'petalita'], 'Litio']
      ]);
    default:
      return value;
  }
};

const buildGlazeFromTableRow = (row: unknown[], columns: TableColumn[], sheetName: string): Partial<Glaze> | null => {
  const getText = (fields: string[]): string => {
    const col = columns.find(c => c.kind === 'text' && fields.includes(c.sub));
    return col ? String(row[col.index] ?? '').trim() : '';
  };

  const name = getText(['name']);
  if (!name) return null;
  if (/^(total|subtotal|suma|resumen)\b/i.test(name.trim())) return null;

  let base: RecipeItem[] = [];
  let additional: RecipeItem[] = [];
  const usedAmountIndexes = new Set<number>();

  columns
    .filter(c => c.kind === 'material')
    .forEach(col => {
      const raw = String(row[col.index] ?? '').trim();
      if (!raw) return;

      if (raw.includes('|') || raw.includes('\n') || /[,;]\s*\d/.test(raw)) {
        const items = parsePackedMaterias(raw);
        items.forEach(item => {
          if (col.sub === 'base') base.push(item);
          else additional.push(item);
        });
        return;
      }

      const amountCol = columns.find(c => c.kind === 'amount' && c.num === col.num && c.sub === col.sub && !usedAmountIndexes.has(c.index))
        || columns.find(c => c.kind === 'amount' && c.num === col.num && !usedAmountIndexes.has(c.index));
      if (amountCol) usedAmountIndexes.add(amountCol.index);
      const amount = amountCol ? parseExcelAmount(row[amountCol.index]) : 0;
      const item: RecipeItem = { material: raw, amount };
      if (col.sub === 'base') base.push(item);
      else additional.push(item);
    });

  columns
    .filter(c => c.kind === 'packed')
    .forEach(col => {
      const rawText = String(row[col.index] ?? '').trim();
      if (!rawText) return;
      const items = parsePackedMaterias(rawText);
      if (col.sub === 'base') base = base.concat(items);
      else additional = additional.concat(items);
    });

  const totalCol = columns.find(c => c.kind === 'text' && c.sub === 'total');
  const totalBase = totalCol
    ? parseExcelAmount(row[totalCol.index])
    : base.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);

  const temperature = getText(['temperature']);
  const cone = getText(['cone']);

  return {
    name,
    code: getText(['code']) || '',
    finish: mapTableValue('finish', getText(['finish'])),
    color: mapTableValue('color', getText(['color'])),
    texture: mapTableValue('texture', getText(['texture'])),
    usage: splitListValue(getText(['usage'])).map(value => mapTableValue('usage', value)).filter(Boolean),
    applicationMethod: splitListValue(getText(['applicationMethod'])).map(value => mapTableValue('applicationMethod', value)).filter(Boolean),
    chemicalFamily: mapTableValue('chemicalFamily', getText(['chemicalFamily'])) || 'Borosilicato',
    temperature: temperature || (cone ? `Cono Orton ${cone}` : ''),
    clayBody: getText(['clayBody']) || 'Gres / Porcelana',
    firingType: getText(['firingType']),
    atmosphere: mapTableValue('atmosphere', getText(['atmosphere'])) || '',
    observations: [getText(['observations']), `Importada desde tabla Excel (hoja: ${sheetName})`].filter(Boolean).join('\n'),
    recipe: { base, additional, totalBase },
    status: 'draft',
    techSpecs: cone ? { cone } : undefined
  };
};

const parseWorkbookTables = (workbook: XLSX.WorkBook): { rows: Array<{ sheet: string; glaze: Partial<Glaze> }>; diagnostics: string[] } => {
  const rows: Array<{ sheet: string; glaze: Partial<Glaze> }> = [];
  const diagnostics: string[] = [];

  const CORE_TEXT_SUBS = new Set(['name', 'code']);

  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const rowsData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, blankrows: true });

    const hasAnyData = rowsData.some(row => (row || []).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
    if (!hasAnyData) return;

    let headerIndex = -1;
    let columns: TableColumn[] = [];
    let fallback: { index: number; columns: TableColumn[] } | null = null;

    for (let r = 0; r < rowsData.length; r += 1) {
      const row = rowsData[r] || [];
      const classified = row
        .map((cell, index) => {
          const col = classifyExcelHeader(cell);
          return col ? { ...col, index } : null;
        })
        .filter((col): col is TableColumn => col !== null);

      if (classified.length >= 2) {
        headerIndex = r;
        columns = classified;
        break;
      }
      if (classified.length === 1 && (CORE_TEXT_SUBS.has(classified[0].sub) || classified[0].kind === 'material')) {
        fallback = { index: r, columns: classified };
      }
    }

    if (headerIndex < 0 && fallback) {
      const hasDataBelow = rowsData
        .slice(fallback.index + 1)
        .some(row => (row || []).some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''));
      if (hasDataBelow) {
        headerIndex = fallback.index;
        columns = fallback.columns;
      }
    }

    if (headerIndex < 0) {
      diagnostics.push(`Hoja '${sheetName}': no detecté un encabezado de tabla.`);
      return;
    }

    const recognizedHeaders = columns
      .map(col => String(rowsData[headerIndex][col.index] ?? '').trim())
      .filter(Boolean);

    let rowCount = 0;
    for (let r = headerIndex + 1; r < rowsData.length; r += 1) {
      const row = rowsData[r] || [];
      if (!row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '')) continue;
      rowCount += 1;
      const glaze = buildGlazeFromTableRow(row, columns, sheetName);
      if (glaze) rows.push({ sheet: sheetName, glaze });
    }

    diagnostics.push(
      `Hoja '${sheetName}': tabla detectada (${recognizedHeaders.length} columnas: ${recognizedHeaders.join(', ') || 'sin nombres'}; ${rowCount} filas de datos).`
    );
  });

  return { rows, diagnostics };
};

const parseYamlList = (value?: string) => {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(item => decodeYamlValue(item))
    .filter(Boolean);
};

const parseGlazyRecipeBlock = (block: string, id: string): GlazyRecipeImport => {
  const name = getYamlField(block, 'Name') || `Glazy ${id}`;
  const recipe: GlazyRecipeImport = {
    id,
    name,
    state: getYamlField(block, 'State'),
    cone: getYamlField(block, 'Cone'),
    surface: getYamlField(block, 'Surface'),
    transparency: getYamlField(block, 'Transparency'),
    atmospheres: parseYamlList(getYamlField(block, 'Atmospheres')),
    country: getYamlField(block, 'Country'),
    subtype: getYamlField(block, 'Subtype'),
    description: getYamlField(block, 'Description'),
    base: [],
    additional: [],
    totalBase: 0
  };

  const ingredientMatches = block.matchAll(/\n\s{4}-\n([\s\S]*?)(?=\n\s{4}-\n|\n\s{2}[A-Z][^:\n]+:|$)/g);
  for (const ingredientMatch of ingredientMatches) {
    const ingredient = ingredientMatch[1];
    const material = getIndentedYamlField(`\n${ingredient}`, 'Name');
    const amount = Number(getIndentedYamlField(`\n${ingredient}`, 'Percentage'));
    const isAdditional = /\n\s+Additional:\s+true/.test(ingredient);

    if (material && Number.isFinite(amount)) {
      const item = { material, amount };
      if (isAdditional) {
        recipe.additional.push(item);
      } else {
        recipe.base.push(item);
      }
    }
  }

  recipe.totalBase = recipe.base.reduce((acc, item) => acc + item.amount, 0);
  return recipe;
};

const fetchGlazyRecipeFromApi = async (sourceUrl: string) => {
  const recipeId = extractGlazyRecipeId(sourceUrl);
  if (!recipeId) {
    throw new Error('Pega un enlace válido de Glazy, por ejemplo https://glazy.org/recipes/669259');
  }

  let recipeData: any = null;
  for (const apiUrl of GLAZY_API_URLS) {
    try {
      const response = await fetch(`${apiUrl}/recipes/${recipeId}`, { cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const payload = await response.json();
        recipeData = payload.data;
        break;
      }
    } catch {
      recipeData = null;
    }
  }

  if (!recipeData) {
    throw new Error('No se pudo leer la API pública de Glazy.');
  }

  const base: RecipeItem[] = [];
  const additional: RecipeItem[] = [];
  for (const component of recipeData.materialComponents || []) {
    const item = {
      material: component.material?.name || 'Material sin nombre',
      amount: Number(component.percentageAmount) || 0
    };

    if (component.isAdditional) {
      additional.push(item);
    } else {
      base.push(item);
    }
  }

  const imageUrls = (recipeData.images || [])
    .map((image: any) => getGlazyImageUrl(recipeData.id, image.filename))
    .filter(Boolean);
  const mainImage = getGlazyImageUrl(recipeData.id, recipeData.thumbnail?.filename)
    || imageUrls[0]
    || '';

  return {
    id: `${recipeData.id}`,
    name: recipeData.name || `Glazy ${recipeId}`,
    state: recipeData.materialStateName,
    cone: recipeData.fromOrtonConeName && recipeData.toOrtonConeName
      ? `${recipeData.fromOrtonConeName} - ${recipeData.toOrtonConeName}`
      : recipeData.fromOrtonConeName || recipeData.toOrtonConeName,
    surface: recipeData.surfaceTypeName,
    transparency: recipeData.transparencyTypeName,
    atmospheres: (recipeData.atmospheres || []).map((atmosphere: any) => atmosphere.name).filter(Boolean),
    country: recipeData.countryName,
    subtype: recipeData.materialTypeName,
    description: recipeData.description,
    mainImage,
    gallery: imageUrls.filter((imageUrl: string) => imageUrl !== mainImage),
    base,
    additional,
    totalBase: Number(recipeData.materialComponentTotalAmount) || base.reduce((acc, item) => acc + item.amount, 0)
  } satisfies GlazyRecipeImport;
};

const fetchGlazyRecipeFromPublicData = async (sourceUrl: string) => {
  const recipeId = extractGlazyRecipeId(sourceUrl);
  if (!recipeId) {
    throw new Error('Pega un enlace válido de Glazy, por ejemplo https://glazy.org/recipes/669259');
  }

  if (!('DecompressionStream' in window)) {
    throw new Error('Este navegador no permite descomprimir el archivo público de Glazy. Prueba desde Chrome actualizado.');
  }

  let latestFile = FALLBACK_GLAZY_DATA_FILE;
  for (const baseUrl of GLAZY_DATA_BASE_URLS) {
    try {
      const latestResponse = await fetch(`${baseUrl}/LATEST`, { cache: 'no-store' });
      if (latestResponse.ok) {
        latestFile = (await latestResponse.text()).trim() || FALLBACK_GLAZY_DATA_FILE;
        break;
      }
    } catch {
      latestFile = FALLBACK_GLAZY_DATA_FILE;
    }
  }

  let dataResponse: Response | null = null;
  for (const baseUrl of GLAZY_DATA_BASE_URLS) {
    try {
      const response = await fetch(`${baseUrl}/${latestFile}`, { cache: 'force-cache' });
      if (response.ok && response.body) {
        dataResponse = response;
        break;
      }
    } catch {
      dataResponse = null;
    }
  }

  if (!dataResponse?.body) {
    throw new Error('No se pudo descargar la base pública de recetas de Glazy. Revisa tu conexión o intenta de nuevo.');
  }

  const decompressedStream = dataResponse.body.pipeThrough(new DecompressionStream('gzip'));
  const yamlText = await new Response(decompressedStream).text();
  const recipePattern = new RegExp(`\\n-\\n\\s{2}ID:\\s*${recipeId}\\n[\\s\\S]*?(?=\\n-\\n\\s{2}ID:|$)`);
  const recipeBlock = yamlText.match(recipePattern)?.[0];

  if (!recipeBlock || !/\n\s{2}Type:\s*'?Recipe'?/.test(recipeBlock)) {
    throw new Error(`No encontré la receta ${recipeId} en el archivo público de Glazy.`);
  }

  const recipe = parseGlazyRecipeBlock(recipeBlock, recipeId);
  if (recipe.base.length === 0) {
    throw new Error(`Encontré la receta ${recipeId}, pero no pude leer sus ingredientes.`);
  }

  return recipe;
};

// Helper to remove accents for search
function normalizeString(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function AutocompleteInput({ value, onChange, placeholder, wrapperClassName, inputClassName }: { value: string, onChange: (val: string) => void, placeholder: string, wrapperClassName?: string, inputClassName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredMaterials = value ? RAW_MATERIALS.filter(m => 
    normalizeString(m).toLowerCase().startsWith(normalizeString(value).toLowerCase())
  ) : [];

  return (
    <div className={`relative ${wrapperClassName || ''}`} ref={wrapperRef}>
      <input
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={inputClassName}
        placeholder={placeholder}
      />
      {isOpen && value && filteredMaterials.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#E4E4E2] bg-white p-1 shadow-lg">
          {filteredMaterials.map(m => (
            <li
              key={m}
              onClick={() => {
                onChange(m);
                setIsOpen(false);
              }}
              className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-[#2D3436] hover:bg-[#F7F7F5]"
            >
              <span className="font-bold">{m.substring(0, value.length)}</span>
              <span>{m.substring(value.length)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GlazeForm({ glazeId, initialCopyIndex = null, onCancel, onSuccess, onDelete }: GlazeFormProps) {
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkImportMessage, setBulkImportMessage] = useState('');
  const [activeCopyIndex, setActiveCopyIndex] = useState(-1);
  const [codeDuplicate, setCodeDuplicate] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const [calcMode, setCalcMode] = useState<'percent' | 'grams'>('grams');
  const [targetWeight, setTargetWeight] = useState(100);

  const [formData, setFormData] = useState<Partial<Glaze>>({
    name: '',
    code: '',
    mainImage: '',
    gallery: [],
    finish: 'Brillante',
    color: 'Blanco',
    texture: 'Liso',
    usage: ['Apto para vajilla / food safe'],
    applicationMethod: [],
    chemicalFamily: 'Borosilicato',
    observations: '',
    status: 'draft',
    recipe: {
      base: [{ material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }],
      additional: [{ material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }],
      totalBase: 100
    }
  });
  const [originalData, setOriginalData] = useState<Glaze | null>(null);

  const [variant, setVariant] = useState('');
  const [nextNumber, setNextNumber] = useState('001');

  useEffect(() => {
    if (!glazeId) {
      const q = query(collection(db, 'glazes'), orderBy('createdAt', 'desc'), limit(1));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const lastGlaze = snapshot.docs[0].data() as Glaze;
          const lastCode = lastGlaze.code || '';
          const match = lastCode.match(/-(\d{3})(?:-[A-Z])?$/);
          if (match) {
            const nextNum = parseInt(match[1]) + 1;
            setNextNumber(nextNum.toString().padStart(3, '0'));
          }
        }
      });
      return () => unsubscribe();
    }
  }, [glazeId]);

  useEffect(() => {
    const colorCode = CATEGORIES.color.find(c => c.label === formData.color)?.code || '';
    const finishCode = CATEGORIES.finish.find(f => f.label === formData.finish)?.code || '';
    const usageCode = formData.usage && formData.usage.length > 0 
      ? CATEGORIES.usage.find(u => u.label === formData.usage![0])?.code || ''
      : '';
    
    let generatedCode = `${colorCode}-${finishCode}-${usageCode}-${nextNumber}`;
    if (variant) {
      generatedCode += `-${variant.toUpperCase()}`;
    }
    
    if (formData.code !== generatedCode && !codeManuallyEdited) {
      setFormData(prev => ({ ...prev, code: generatedCode }));
    }
  }, [formData.color, formData.finish, formData.usage, nextNumber, variant]);

  useEffect(() => {
    if (!formData.code || formData.code.length < 5) {
      setCodeDuplicate(false);
      return;
    }
    const checkDuplicate = async () => {
      const q = query(collection(db, 'glazes'), where('code', '==', formData.code));
      const snapshot = await getDocs(q);
      const isDuplicate = !snapshot.empty && snapshot.docs.some(d => d.id !== glazeId);
      setCodeDuplicate(isDuplicate);
    };
    const timer = setTimeout(checkDuplicate, 500);
    return () => clearTimeout(timer);
  }, [formData.code, glazeId]);

  useEffect(() => {
    if (glazeId) {
      const fetchGlaze = async () => {
        try {
          const docRef = doc(db, 'glazes', glazeId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as Glaze;
            setOriginalData(data);
            const copyIndex = initialCopyIndex ?? -1;
            const copy = copyIndex >= 0 ? data.copies?.[copyIndex] : null;
            if (copy) {
              setFormData({ ...copy, copies: data.copies || [] });
              setActiveCopyIndex(copyIndex);
            } else {
              setFormData(data);
              setActiveCopyIndex(-1);
            }
            
            const codeParts = data.code.split('-');
            if (codeParts.length >= 4) {
              setNextNumber(codeParts[3]);
              if (codeParts.length === 5) {
                setVariant(codeParts[4]);
              }
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'glazes');
        }
      };
      fetchGlaze();
    }
  }, [glazeId, initialCopyIndex]);

  const syncRecipeTotals = (recipe: NonNullable<typeof formData.recipe>) => {
    recipe.totalBase = recipe.base.reduce((acc, item) => acc + (Number(item.amount) || 0), 0);
    return recipe;
  };

  const handleRecipeChange = (type: 'base' | 'additional', index: number, field: keyof RecipeItem, value: string | number) => {
    const newRecipe = { ...formData.recipe! };
    const items = [...newRecipe[type]];
    items[index] = { ...items[index], [field]: value } as RecipeItem;
    newRecipe[type] = items;
    setFormData({ ...formData, recipe: syncRecipeTotals(newRecipe) });
  };

  const addRecipeRow = (type: 'base' | 'additional') => {
    const newRecipe = { ...formData.recipe! };
    newRecipe[type] = [...newRecipe[type], { material: '', amount: 0 }];
    setFormData({ ...formData, recipe: syncRecipeTotals(newRecipe) });
  };

  const removeRecipeRow = (type: 'base' | 'additional', index: number) => {
    const newRecipe = { ...formData.recipe! };
    newRecipe[type] = newRecipe[type].filter((_, i) => i !== index);
    setFormData({ ...formData, recipe: syncRecipeTotals(newRecipe) });
  };

  const calculateTotals = () => {
    const baseTotal = formData.recipe?.base.reduce((acc, item) => acc + (Number(item.amount) || 0), 0) || 0;
    const additionalTotal = formData.recipe?.additional.reduce((acc, item) => acc + (Number(item.amount) || 0), 0) || 0;
    return { baseTotal, additionalTotal };
  };

  const { baseTotal } = calculateTotals();

  const handleRescale = () => {
    if (baseTotal === 0) return;
    const factor = targetWeight / baseTotal;
    const newRecipe = { ...formData.recipe! };
    newRecipe.base = newRecipe.base.map(item => ({ ...item, amount: Number((item.amount * factor).toFixed(1)) }));
    newRecipe.additional = newRecipe.additional.map(item => ({ ...item, amount: Number((item.amount * factor).toFixed(1)) }));
    newRecipe.totalBase = targetWeight;
    setFormData({ ...formData, recipe: newRecipe });
  };

  const buildGlazeFromImportedRecipe = (importedRecipe: GlazyRecipeImport, originalUrl: string): Partial<Glaze> => {
    const notes = [
      `Fórmula fuente cargada desde Glazy: ${originalUrl}`,
      `ID Glazy: ${importedRecipe.id}`,
      importedRecipe.surface ? `Superficie: ${importedRecipe.surface}` : '',
      importedRecipe.transparency ? `Transparencia: ${importedRecipe.transparency}` : '',
      importedRecipe.country ? `País de referencia: ${importedRecipe.country}` : '',
      importedRecipe.subtype ? `Tipo: ${importedRecipe.subtype}` : '',
      importedRecipe.description ? `Descripción: ${importedRecipe.description}` : ''
    ].filter(Boolean);

    return {
      name: importedRecipe.name,
      code: `GLAZY-${importedRecipe.id}`,
      finish: mapGlazySurface(importedRecipe.surface),
      color: inferGlazyColor(importedRecipe),
      texture: inferGlazyTexture(importedRecipe),
      usage: ['Decorativo'],
      applicationMethod: [],
      chemicalFamily: 'Borosilicato',
      status: 'draft',
      temperature: importedRecipe.cone ? `Cono Orton ${importedRecipe.cone}` : '',
      atmosphere: mapAtmosphere(importedRecipe.atmospheres),
      clayBody: 'Gres / Porcelana',
      firingType: '',
      mainImage: importedRecipe.mainImage || '',
      gallery: importedRecipe.gallery || [],
      observations: notes.join('\n'),
      recipe: {
        base: importedRecipe.base,
        additional: importedRecipe.additional,
        totalBase: importedRecipe.totalBase || 100
      }
    };
  };

  const getAvailableCode = async (baseCode: string) => {
    for (let index = 0; index <= 99; index += 1) {
      const candidate = index === 0 ? baseCode : `${baseCode}-${index + 1}`;
      const snapshot = await getDocs(query(collection(db, 'glazes'), where('code', '==', candidate)));

      if (snapshot.empty) {
        return candidate;
      }
    }

    return `${baseCode}-${Date.now().toString().slice(-6)}`;
  };

  const getStoredCopies = () => originalData?.copies || formData.copies || [];

  const getFreshOriginalData = async () => {
    if (!glazeId) return originalData;
    const docSnap = await getDoc(doc(db, 'glazes', glazeId));
    if (!docSnap.exists()) return originalData;
    return docSnap.data() as Glaze;
  };

  const selectOriginal = () => {
    if (originalData) {
      setFormData(originalData);
    }
    setActiveCopyIndex(-1);
  };

  const selectCopy = (index: number) => {
    const copy = getStoredCopies()[index];
    if (!copy) return;
    setFormData({ ...copy, copies: getStoredCopies() });
    setActiveCopyIndex(index);
  };

  const buildCopyFromActiveForm = (copyNumber: number, existingCopy?: GlazeCopy): GlazeCopy => {
    const now = new Date();
    const recipe = formData.recipe
      ? syncRecipeTotals({
          ...formData.recipe,
          base: formData.recipe.base.map(item => ({ ...item })),
          additional: formData.recipe.additional.map(item => ({ ...item })),
        })
      : {
          base: [],
          additional: [],
          totalBase: 0
        };
    const baseCode = activeCopyIndex >= 0
      ? (existingCopy?.code || formData.code || 'FICHA')
      : `${formData.code || 'FICHA'}-C${copyNumber}`;
    const internalCopy: GlazeCopy = {
      copyId: existingCopy?.copyId || `${Date.now()}`,
      sourceCode: existingCopy?.sourceCode || originalData?.code || formData.code || '',
      name: activeCopyIndex >= 0 ? (formData.name || `Copia ${copyNumber}`) : `${formData.name} - Copia ${copyNumber}`,
      code: baseCode,
      mainImage: formData.mainImage || '',
      gallery: [...(formData.gallery || [])],
      finish: formData.finish || '',
      color: formData.color || '',
      texture: formData.texture || '',
      usage: [...(formData.usage || [])],
      applicationMethod: [...(formData.applicationMethod || [])],
      chemicalFamily: formData.chemicalFamily || '',
      observations: formData.observations || '',
      recipe,
      temperature: formData.temperature || '',
      clayBody: formData.clayBody || '',
      firingType: formData.firingType || '',
      atmosphere: formData.atmosphere || '',
      status: formData.status || 'draft',
      authorId: formData.authorId || auth.currentUser?.uid || '',
      authorName: formData.authorName || auth.currentUser?.displayName || 'Anónimo',
      isValidated: formData.status === 'validated' || formData.status === 'published',
      createdAt: existingCopy?.createdAt || now,
      updatedAt: now,
    };

    if (formData.inventoryLevel !== undefined) {
      internalCopy.inventoryLevel = formData.inventoryLevel;
    }

    return internalCopy;
  };

  const isRepositoryStatus = (status: GlazeStatus) => status === 'validated' || status === 'published';

  const moveCopyToDraft = (copy: GlazeCopy): GlazeCopy => ({
    ...copy,
    status: 'draft',
    isValidated: false,
    updatedAt: new Date(),
  });

  const loadSourceFormula = async () => {
    setSourceLoading(true);
    setSourceError('');

    try {
      if (looksLikeSpreadsheetSource(sourceUrl)) {
        throw new Error('Ese enlace parece ser de Excel o Google Sheets. Para cargar varias URLs usa el botón "Subir archivo Excel con URLs" de abajo.');
      }

      let importedRecipe: GlazyRecipeImport;
      try {
        importedRecipe = await fetchGlazyRecipeFromApi(sourceUrl);
      } catch {
        importedRecipe = await fetchGlazyRecipeFromPublicData(sourceUrl);
      }

      const importedGlaze = buildGlazeFromImportedRecipe(importedRecipe, sourceUrl);

      setCodeManuallyEdited(true);
      setCalcMode('grams');
      setTargetWeight(importedRecipe.totalBase || 100);
      setFormData({
        ...formData,
        ...importedGlaze,
        status: mapGlazyStatus(importedRecipe.state),
        clayBody: formData.clayBody || importedGlaze.clayBody
      });
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'No pude cargar esa fórmula fuente.');
    } finally {
      setSourceLoading(false);
    }
  };

  const extractGlazyUrlsFromWorkbook = (workbook: XLSX.WorkBook) => {
    const urls = new Set<string>();
    const urlPattern = /(?:https?:\/\/)?(?:www\.)?glazy\.org\/recipes\/(\d+)/gi;
    const recipeIdPattern = /^\s*(\d{5,9})\s*$/;

    const collectUrl = (value: unknown) => {
      if (value === null || value === undefined) return;
      const text = String(value).trim();
      if (!text) return;

      let match: RegExpExecArray | null;
      urlPattern.lastIndex = 0;
      while ((match = urlPattern.exec(text)) !== null) {
        urls.add(`https://glazy.org/recipes/${match[1]}`);
      }

      const recipeId = text.match(recipeIdPattern)?.[1];
      if (recipeId) {
        urls.add(`https://glazy.org/recipes/${recipeId}`);
      }
    };

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        blankrows: false
      });

      rows.flat().forEach((value) => {
        collectUrl(value);
      });

      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:A1');
      for (let row = range.s.r; row <= range.e.r; row += 1) {
        for (let col = range.s.c; col <= range.e.c; col += 1) {
          const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
          collectUrl(cell?.v);
          collectUrl(cell?.w);
          collectUrl(cell?.l?.Target);
        }
      }
    });

    return Array.from(urls);
  };

  const handleBulkSourceImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    setBulkImporting(true);
    setBulkImportMessage('Leyendo Excel...');
    setSourceError('');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const urls = extractGlazyUrlsFromWorkbook(workbook);
      const { rows: tables, diagnostics } = parseWorkbookTables(workbook);

      const total = urls.length + tables.length;
      if (total === 0) {
        setBulkImportMessage('');
        setSourceError(`No leí fichas de ese archivo. ${diagnostics.join(' ')} Revisa que la tabla tenga un encabezado con columnas como Nombre, Código, Materia 1/ Cantidad 1.`);
        return;
      }

      let created = 0;
      const failed: string[] = [];

      let progress = 0;
      const advance = async () => {
        progress += 1;
        setBulkImportMessage(`Importando ${progress} de ${total}...`);
      };

      for (const url of urls) {
        await advance();
        try {
          let importedRecipe: GlazyRecipeImport;
          try {
            importedRecipe = await fetchGlazyRecipeFromApi(url);
          } catch {
            importedRecipe = await fetchGlazyRecipeFromPublicData(url);
          }

          const importedGlaze = buildGlazeFromImportedRecipe(importedRecipe, url);
          const code = await getAvailableCode(importedGlaze.code || `GLAZY-${importedRecipe.id}`);

          await addDoc(collection(db, 'glazes'), {
            ...importedGlaze,
            code,
            status: 'draft',
            authorId: auth.currentUser?.uid,
            authorName: auth.currentUser?.displayName || 'Anónimo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          created += 1;
        } catch {
          failed.push(url);
        }
      }

      for (const { sheet, glaze: rowGlaze } of tables) {
        await advance();
        try {
          const baseCode = rowGlaze.code || rowGlaze.name || `FICHA-${sheet}`;
          const code = await getAvailableCode(baseCode);

          await addDoc(collection(db, 'glazes'), {
            ...rowGlaze,
            code,
            status: 'draft',
            authorId: auth.currentUser?.uid,
            authorName: auth.currentUser?.displayName || 'Anónimo',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          created += 1;
        } catch {
          failed.push(rowGlaze.name || `fila de ${sheet}`);
        }
      }

      setBulkImportMessage(`Importación terminada: ${created} fichas borrador creadas${failed.length ? `, ${failed.length} fallidas` : ''}.`);
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : 'No pude leer ese Excel.');
      setBulkImportMessage('');
    } finally {
      setBulkImporting(false);
    }
  };

  const getAmountInputValue = (amount: number) => (amount === 0 ? '' : amount);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, targetIdx?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido.');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress to 0.6 quality JPEG to keep size really small (~50-100KB)
        const base64String = canvas.toDataURL('image/jpeg', 0.6);

        if (targetIdx === undefined) {
          // Main image
          setFormData({ ...formData, mainImage: base64String });
        } else {
          // Gallery update or add
          const newGallery = [...(formData.gallery || [])];
          if (!formData.mainImage && targetIdx === -1) {
            setFormData({ ...formData, mainImage: base64String });
            return;
          }
          if (!formData.mainImage && targetIdx >= 0) {
            newGallery.splice(targetIdx, 1);
            setFormData({ ...formData, mainImage: base64String, gallery: newGallery });
            return;
          }
          if (targetIdx === -1) {
            newGallery.push(base64String);
          } else {
            newGallery[targetIdx] = base64String;
          }
          if (newGallery.length < 8) {
            newGallery.push('');
          }
          setFormData({ ...formData, gallery: newGallery });
        }
      };
    };
  };

  const handleDelete = async () => {
    if (!glazeId) return;
    if (activeCopyIndex >= 0 && originalData) {
      const confirmedCopy = window.confirm(`¿Quieres eliminar la Copia ${activeCopyIndex + 1}? La ficha original no se eliminará.`);
      if (!confirmedCopy) return;

      setDeleting(true);
      try {
        const nextCopies = [...(originalData.copies || [])];
        nextCopies.splice(activeCopyIndex, 1);
        const nextOriginalData = {
          ...originalData,
          copies: nextCopies,
          updatedAt: new Date(),
        };

        await setDoc(doc(db, 'glazes', glazeId), {
          ...nextOriginalData,
          updatedAt: serverTimestamp(),
        });

        setOriginalData(nextOriginalData);
        setFormData(nextOriginalData);
        setActiveCopyIndex(-1);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'glazes');
      } finally {
        setDeleting(false);
      }
      return;
    }

    const confirmed = window.confirm('¿Estás seguro de que quieres eliminar esta ficha? Esta acción no se puede deshacer.');
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'glazes', glazeId));
      onDelete(glazeId);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'glazes');
    } finally {
      setDeleting(false);
    }
  };

  const handleDuplicate = async () => {
    if (!glazeId || !formData.name) return;

    setDuplicating(true);
    try {
      const freshOriginalData = await getFreshOriginalData();
      const currentCopies = freshOriginalData?.copies || [];
      if (currentCopies.length >= 3) {
        alert('Esta ficha ya tiene el máximo de 3 copias internas.');
        return;
      }

      const nextCopyNumber = currentCopies.length + 1;
      const internalCopy = {
        ...buildCopyFromActiveForm(nextCopyNumber),
        status: 'draft' as GlazeStatus,
        isValidated: false,
      };
      const nextCopies = [...currentCopies, internalCopy];
      const nextOriginalData = {
        ...(freshOriginalData || originalData || formData),
        copies: nextCopies,
      } as Glaze;
      await setDoc(doc(db, 'glazes', glazeId), {
        ...nextOriginalData,
        copies: nextCopies,
        updatedAt: serverTimestamp(),
      });

      setOriginalData(nextOriginalData);
      setFormData({ ...internalCopy, copies: nextCopies });
      setActiveCopyIndex(nextCopies.length - 1);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'glazes');
    } finally {
      setDuplicating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (codeDuplicate) return;
    setLoading(true);
    try {
      const recipe = formData.recipe
        ? syncRecipeTotals({
            ...formData.recipe,
            base: [...formData.recipe.base],
            additional: [...formData.recipe.additional],
          })
        : formData.recipe;

      const data = {
        ...formData,
        recipe,
        authorId: auth.currentUser?.uid,
        authorName: auth.currentUser?.displayName || 'Anónimo',
        updatedAt: serverTimestamp(),
        createdAt: formData.createdAt || serverTimestamp(),
      };

      if (glazeId && activeCopyIndex >= 0 && originalData) {
        const nextCopies = [...(originalData.copies || [])];
        const activeCopyData = buildCopyFromActiveForm(activeCopyIndex + 1, nextCopies[activeCopyIndex]);
        nextCopies[activeCopyIndex] = activeCopyData;
        const nextOriginalData = {
          ...originalData,
          status: isRepositoryStatus(activeCopyData.status) ? 'draft' as GlazeStatus : originalData.status,
          isValidated: isRepositoryStatus(activeCopyData.status) ? false : originalData.isValidated,
          copies: isRepositoryStatus(activeCopyData.status)
            ? nextCopies.map((copy, index) => index === activeCopyIndex ? { ...copy, isValidated: true } : moveCopyToDraft(copy))
            : nextCopies,
          updatedAt: new Date(),
        };
        const savedActiveCopy = nextOriginalData.copies[activeCopyIndex];

        await setDoc(doc(db, 'glazes', glazeId), {
          ...nextOriginalData,
          updatedAt: serverTimestamp(),
        });
        setOriginalData(nextOriginalData);
        setFormData({ ...savedActiveCopy, copies: nextOriginalData.copies });
      } else if (glazeId) {
        const freshOriginalData = await getFreshOriginalData();
        const currentCopies = freshOriginalData?.copies || originalData?.copies || [];
        const nextData = {
          ...data,
          isValidated: isRepositoryStatus(data.status),
          copies: isRepositoryStatus(data.status)
            ? currentCopies.map(moveCopyToDraft)
            : currentCopies,
        } as Glaze;
        await setDoc(doc(db, 'glazes', glazeId), nextData);
        setOriginalData(nextData);
      } else {
        await addDoc(collection(db, 'glazes'), data);
      }
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'glazes');
    } finally {
      setLoading(false);
    }
  };

  const storedCopies = getStoredCopies();
  const activeCopy = activeCopyIndex >= 0 && formData.recipe ? formData as GlazeCopy : null;
  const showOnlyActiveVersion = isRepositoryStatus(formData.status);
  const copySelectorIndexes = showOnlyActiveVersion && activeCopyIndex >= 0 ? [activeCopyIndex] : [0, 1, 2];

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{glazeId ? 'Editar Esmalte' : 'Nueva Ficha Técnica'}</h3>
          <p className="text-sm text-[#636E72]">Completa los datos técnicos del laboratorio.</p>
        </div>
        {glazeId && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#E4E4E2] bg-white p-2 shadow-sm">
            {(!showOnlyActiveVersion || activeCopyIndex === -1) && (
              <button
                type="button"
                onClick={selectOriginal}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all",
                  activeCopyIndex === -1 ? "bg-[#2D3436] text-white" : "text-[#636E72] hover:bg-[#F7F7F5] hover:text-[#2D3436]"
                )}
              >
                Original
              </button>
            )}
            {copySelectorIndexes.map((index) => {
              const copy = storedCopies[index];
              return (
              <button
                key={copy?.copyId || index}
                type="button"
                disabled={!copy}
                onClick={() => selectCopy(index)}
                className={cn(
                  "rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wide transition-all",
                  activeCopyIndex === index ? "bg-[#8a168a] text-white" : "text-[#636E72] hover:bg-[#F7F7F5] hover:text-[#2D3436]",
                  !copy && "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[#636E72]"
                )}
              >
                Copia {index + 1}
              </button>
              );
            })}
          </div>
        )}
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="flex flex-wrap gap-3">
          <div className="flex min-w-[280px] flex-1 flex-col gap-2 sm:max-w-[520px]">
            <div className="flex overflow-hidden rounded-xl border border-red-200 bg-white shadow-sm">
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => {
                  setSourceUrl(event.target.value);
                  setSourceError('');
                }}
                placeholder="Pega una URL de receta Glazy..."
                className="min-w-0 flex-1 px-4 py-2.5 text-sm outline-none"
              />
              <button
                type="button"
                onClick={loadSourceFormula}
                disabled={sourceLoading}
                className="flex shrink-0 items-center gap-2 bg-red-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-white transition-all hover:bg-red-700 disabled:opacity-70"
              >
                {sourceLoading ? <Spinner className="h-4 w-4 animate-spin" /> : <FileInput size={18} />}
                Cargar 1 fórmula Glazy
              </button>
            </div>
            {sourceError && (
              <p className="text-xs font-medium text-red-600">{sourceError}</p>
            )}
            {bulkImportMessage && (
              <p className="text-xs font-medium text-[#636E72]">{bulkImportMessage}</p>
            )}
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#E4E4E2] bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-[#2D3436] transition-all hover:border-[#2D3436] hover:bg-[#F7F7F5]">
              {bulkImporting ? <Spinner className="h-4 w-4 animate-spin" /> : <Upload size={16} />}
Subir Excel (URLs o tablas)
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.tsv"
                className="hidden"
                disabled={bulkImporting}
                onChange={handleBulkSourceImport}
              />
            </label>
          </div>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
          {glazeId && (
            <button
              type="button"
              onClick={handleDuplicate}
              disabled={duplicating || loading || storedCopies.length >= 3}
              className="flex items-center gap-2 rounded-xl border border-[#E4E4E2] bg-white px-6 py-2.5 text-sm font-medium text-[#2D3436] transition-all hover:border-[#2D3436] hover:bg-[#F7F7F5] disabled:opacity-50"
            >
              {duplicating ? <Spinner className="h-4 w-4 animate-spin" /> : <Copy size={18} />}
              {storedCopies.length >= 3 ? 'Máximo 3 copias' : 'Duplicar Ficha'}
            </button>
          )}
          {glazeId && (
            <button 
              type="button" 
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 rounded-xl border border-red-200 px-6 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? <Spinner className="h-4 w-4 animate-spin" /> : <Trash2 size={18} />}
              {activeCopyIndex >= 0 ? 'Eliminar Copia' : 'Eliminar'}
            </button>
          )}
          <button type="button" onClick={onCancel} className="rounded-xl border border-[#E4E4E2] px-6 py-2.5 text-sm font-medium hover:bg-white">
            Cancelar
          </button>
          <button 
            type="submit" 
            disabled={loading || codeDuplicate}
            className="flex items-center gap-2 rounded-xl bg-[#2D3436] px-6 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Save size={18} />}
            Guardar Ficha
          </button>
        </div>
        </div>
      </div>

      {activeCopy && (
        <div className="rounded-[24px] border border-[#8a168a]/20 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row">
            <div className="w-full overflow-hidden rounded-2xl bg-[#F7F7F5] lg:w-56">
              {activeCopy.mainImage ? (
                <img src={activeCopy.mainImage} className="aspect-square h-full w-full object-cover" alt={activeCopy.name} referrerPolicy="no-referrer" />
              ) : (
                <div className="flex aspect-square items-center justify-center text-[#B2BEC3]">
                  <ImageIcon size={36} strokeWidth={1} />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#8a168a]">Visor de copia interna</p>
                  <h4 className="mt-1 text-xl font-semibold tracking-tight">{activeCopy.name}</h4>
                  <p className="mt-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-[#636E72]">{activeCopy.code}</p>
                </div>
                <span className="w-fit rounded-full bg-[#F7F7F5] px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#636E72]">
                  {STATUS_LABELS[activeCopy.status]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Color</p>
                  <p className="mt-1 text-sm font-medium">{activeCopy.color}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Acabado</p>
                  <p className="mt-1 text-sm font-medium">{activeCopy.finish}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Textura</p>
                  <p className="mt-1 text-sm font-medium">{activeCopy.texture}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Atmósfera</p>
                  <p className="mt-1 text-sm font-medium">{activeCopy.atmosphere || 'Oxidación'}</p>
                </div>
              </div>
              <div className="grid gap-5 border-t border-[#E4E4E2] pt-5 lg:grid-cols-2">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Composición Base</h5>
                  <div className="mt-3 space-y-2">
                    {activeCopy.recipe.base.map((item, index) => (
                      <div key={`${item.material}-${index}`} className="flex justify-between gap-4 text-sm">
                        <span className="truncate">{item.material}</span>
                        <span className="font-mono">{item.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Adicionales</h5>
                  <div className="mt-3 space-y-2">
                    {activeCopy.recipe.additional.length > 0 ? activeCopy.recipe.additional.map((item, index) => (
                      <div key={`${item.material}-${index}`} className="flex justify-between gap-4 text-sm">
                        <span className="truncate">{item.material}</span>
                        <span className="font-mono">{item.amount}</span>
                      </div>
                    )) : (
                      <p className="text-sm text-[#636E72]">Sin adicionales</p>
                    )}
                  </div>
                </div>
              </div>
              {activeCopy.observations && (
                <p className="border-t border-[#E4E4E2] pt-5 text-sm leading-relaxed text-[#636E72]">{activeCopy.observations}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Nombre del Esmalte</label>
                <input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                  placeholder="Ej. Azul Cobalto Profundo"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Código</label>
                <div className="flex items-center gap-2">
                  <input 
                    value={formData.code}
                    onChange={e => {
                      setCodeManuallyEdited(true);
                      setFormData({ ...formData, code: e.target.value.toUpperCase() });
                    }}
                    className={`flex-1 rounded-xl border bg-[#F7F7F5] px-4 py-3 text-sm font-mono font-bold outline-none ${
                      codeDuplicate 
                        ? 'border-red-400 bg-red-50 text-red-700' 
                        : 'border-[#E4E4E2] text-[#2D3436] focus:border-[#2D3436] focus:bg-white'
                    }`}
                  />
                  <div className="group relative">
                    <Info size={16} className="text-[#B2BEC3]" />
                    <div className="absolute bottom-full right-0 mb-2 hidden w-56 rounded-lg bg-[#2D3436] p-2 text-[10px] text-white group-hover:block z-50">
                      Formato: COLOR-ACABADO-USO-NÚMERO-VARIANTE. Puedes editarlo manualmente.
                    </div>
                  </div>
                </div>
                {codeDuplicate && (
                  <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                    <AlertCircle size={14} />
                    Este código ya existe. Modifícalo para continuar.
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Color</label>
                <select 
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.color.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Acabado</label>
                <select 
                  value={formData.finish}
                  onChange={e => setFormData({ ...formData, finish: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.finish.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Uso</label>
                <select 
                  value={formData.usage?.[0] || ''}
                  onChange={e => setFormData({ ...formData, usage: [e.target.value] })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.usage.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Variante (Opcional)</label>
                <input 
                  value={variant}
                  onChange={e => setVariant(e.target.value.toUpperCase().slice(0, 1))}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                  placeholder="Ej. A"
                  maxLength={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Textura</label>
                <select 
                  value={formData.texture}
                  onChange={e => setFormData({ ...formData, texture: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.texture.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Observaciones</label>
              <textarea 
                value={formData.observations}
                onChange={e => setFormData({ ...formData, observations: e.target.value })}
                rows={4}
                className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                placeholder="Notas sobre el comportamiento, defectos o consejos..."
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Temperatura</label>
                <input 
                  value={formData.temperature || ''}
                  onChange={e => setFormData({ ...formData, temperature: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                  placeholder="Ej. 1280°C"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Atmósfera</label>
                <select 
                  value={formData.atmosphere || 'Oxidación'}
                  onChange={e => setFormData({ ...formData, atmosphere: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  <option value="Oxidación">Oxidación</option>
                  <option value="Reducción">Reducción</option>
                  <option value="Neutra">Neutra</option>
                  <option value="Híbrida">Híbrida</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Pasta</label>
                <select 
                  value={formData.clayBody || 'Gres / Porcelana'}
                  onChange={e => setFormData({ ...formData, clayBody: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  <option value="Gres / Porcelana">Gres / Porcelana</option>
                  <option value="Porcelana">Porcelana</option>
                  <option value="Gres">Gres</option>
                  <option value="Loza">Loza</option>
                  <option value="Terracota">Terracota</option>
                  <option value="Bisque">Bisque</option>
                </select>
              </div>
            </div>
          </div>

          {/* Recipe Module */}
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-8">
            <div className="flex flex-col gap-4 border-b border-[#F4F4F2] pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h4 className="text-lg font-semibold tracking-tight">Módulo de Receta</h4>
                <p className="text-xs text-[#636E72]">Cálculo inteligente de base y adicionales.</p>
              </div>
              <div className="flex w-full items-center gap-2 rounded-xl bg-[#F4F4F2] p-1 sm:w-auto">
                <button 
                  type="button"
                  onClick={() => setCalcMode('percent')}
                  className={cn("flex-1 rounded-lg px-4 py-1.5 text-xs font-medium transition-all sm:flex-none", calcMode === 'percent' ? "bg-white text-[#2D3436] shadow-sm" : "text-[#636E72]")}
                >
                  Porcentaje (%)
                </button>
                <button 
                  type="button"
                  onClick={() => setCalcMode('grams')}
                  className={cn("flex-1 rounded-lg px-4 py-1.5 text-xs font-medium transition-all sm:flex-none", calcMode === 'grams' ? "bg-white text-[#2D3436] shadow-sm" : "text-[#636E72]")}
                >
                  Gramos (g)
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Base Principal</h5>
                <button type="button" onClick={() => addRecipeRow('base')} className="text-[#636E72] hover:text-[#2D3436]"><Plus size={18} /></button>
              </div>
              <div className="space-y-2">
                {formData.recipe?.base.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-3 sm:flex-row">
                    <AutocompleteInput 
                      value={item.material}
                      onChange={val => handleRecipeChange('base', idx, 'material', val)}
                      wrapperClassName="flex-1"
                      inputClassName="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="Materia prima"
                    />
                    <div className="flex items-center gap-3 sm:w-auto">
                      <input 
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={getAmountInputValue(item.amount)}
                        onChange={e => handleRecipeChange('base', idx, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white sm:w-24" 
                        placeholder="0.0"
                      />
                      <button type="button" onClick={() => removeRecipeRow('base', idx)} className="text-[#B2BEC3] hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-2 rounded-xl bg-[#F7F7F5] p-4 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold">Total Base</span>
                <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
                  {baseTotal !== 100 && calcMode === 'percent' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                      <AlertCircle size={12} /> No suma 100%
                    </span>
                  )}
                  <span className="text-lg font-bold">{baseTotal.toFixed(1)}{calcMode === 'percent' ? '%' : 'g'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Adicionales (Colorantes, Opacificantes...)</h5>
                <button type="button" onClick={() => addRecipeRow('additional')} className="text-[#636E72] hover:text-[#2D3436]"><Plus size={18} /></button>
              </div>
              <div className="space-y-2">
                {formData.recipe?.additional.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-3 sm:flex-row">
                    <AutocompleteInput 
                      value={item.material}
                      onChange={val => handleRecipeChange('additional', idx, 'material', val)}
                      wrapperClassName="flex-1"
                      inputClassName="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="Materia prima"
                    />
                    <div className="flex items-center gap-3 sm:w-auto">
                      <input 
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        value={getAmountInputValue(item.amount)}
                        onChange={e => handleRecipeChange('additional', idx, 'amount', e.target.value === '' ? 0 : parseFloat(e.target.value) || 0)}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white sm:w-24" 
                        placeholder="0.0"
                      />
                      <button type="button" onClick={() => removeRecipeRow('additional', idx)} className="text-[#B2BEC3] hover:text-red-500"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#E4E4E2] p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calculator size={18} />
                Reescalado Proporcional
              </div>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#8a168a]">Nuevo Peso Total Base</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input 
                      type="number"
                      inputMode="decimal"
                      value={targetWeight}
                      onChange={e => setTargetWeight(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                    />
                    <button 
                      type="button"
                      onClick={handleRescale}
                      className="rounded-xl bg-[#2D3436] px-4 py-2 text-xs font-bold text-white hover:bg-black sm:min-w-[96px]"
                    >
                      Ajustar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 sm:pt-5">
                  <button 
                    type="button" 
                    onClick={() => setTargetWeight(prev => Math.max(0, Math.round((baseTotal * 0.9) * 10) / 10))}
                    className="rounded-lg border border-[#E4E4E2] px-3 py-1 text-[10px] font-bold hover:bg-[#F7F7F5]"
                  >
                    -10%
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTargetWeight(prev => Math.round((baseTotal * 1.1) * 10) / 10)}
                    className="rounded-lg border border-[#E4E4E2] px-3 py-1 text-[10px] font-bold hover:bg-[#F7F7F5]"
                  >
                    +10%
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTargetWeight(prev => Math.max(0, Math.round((prev - 10) * 10) / 10))}
                    className="rounded-lg border border-[#E4E4E2] px-3 py-1 text-[10px] font-bold hover:bg-[#F7F7F5]"
                  >
                    -10g
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setTargetWeight(prev => Math.round((prev + 10) * 10) / 10)}
                    className="rounded-lg border border-[#E4E4E2] px-3 py-1 text-[10px] font-bold hover:bg-[#F7F7F5]"
                  >
                    +10g
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <GlazeTechModules value={formData} onChange={setFormData} />

        {/* Right Column: Media & Status */}
        <div className="space-y-8">
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Imagen Principal</h4>
              <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#2D3436] hover:opacity-70 transition-all">
                <Upload size={14} />
                Subir Archivo
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleImageUpload(e)}
                />
              </label>
            </div>
            <div className="group relative aspect-square overflow-hidden rounded-2xl bg-[#F7F7F5] border-2 border-dashed border-[#E4E4E2] flex flex-col items-center justify-center text-[#B2BEC3] hover:border-[#2D3436] hover:text-[#2D3436] transition-all">
              {formData.mainImage ? (
                <img src={formData.mainImage} className="h-full w-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
              ) : (
                <>
                  <ImageIcon size={40} strokeWidth={1} />
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-center">Sin imagen<br/>Sube archivo o pega URL abajo</p>
                </>
              )}
              <input 
                type="text" 
                placeholder="URL de la imagen..."
                value={formData.mainImage}
                onChange={e => setFormData({ ...formData, mainImage: e.target.value })}
                className="absolute bottom-4 left-4 right-4 rounded-lg border border-[#E4E4E2] bg-white/90 px-3 py-1.5 text-[10px] outline-none backdrop-blur-sm focus:border-[#2D3436] shadow-sm"
              />
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Galería de Fotos ({formData.gallery?.length || 0})</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(formData.gallery || []).map((img, idx) => (
                <div key={idx} className="relative rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5] overflow-hidden flex flex-col">
                  <div className="aspect-square overflow-hidden relative">
                    {img ? (
                      <img src={img} className="h-full w-full object-cover" alt={`Gallery ${idx}`} referrerPolicy="no-referrer" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-[#B2BEC3]">
                        <ImageIcon size={24} strokeWidth={1} />
                        <span className="text-[10px] mt-1 font-bold">Sin imagen</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-center gap-1 p-1.5 bg-[#F4F4F2]">
                    <button
                      type="button"
                      disabled={!img}
                      onClick={() => {
                        if (!img) return;
                        const newGallery = [...(formData.gallery || [])];
                        newGallery[idx] = formData.mainImage || '';
                        const oldMain = formData.mainImage;
                        const cleanGallery = newGallery.filter(Boolean);
                        setFormData({ ...formData, mainImage: img, gallery: oldMain ? cleanGallery : cleanGallery.filter((photo) => photo !== img) });
                      }}
                      className="rounded-lg bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#2D3436] border border-[#E4E4E2] transition-all hover:bg-[#2D3436] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white disabled:hover:text-[#2D3436]"
                    >
                      Principal
                    </button>
                    <label className="rounded-lg bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-[#2D3436] border border-[#E4E4E2] hover:bg-[#2D3436] hover:text-white transition-all cursor-pointer">
                      Subir
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, idx)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm('¿Estás seguro de que quieres eliminar esta foto?')) return;
                        const newGallery = formData.gallery?.filter((_, i) => i !== idx);
                        setFormData({ ...formData, gallery: newGallery });
                      }}
                      className="rounded-lg bg-white px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-red-500 border border-red-200 hover:bg-red-500 hover:text-white transition-all"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
              {(formData.gallery?.length || 0) < 8 ? (
                <label 
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E4E4E2] text-[#B2BEC3] transition-all hover:border-[#2D3436] hover:text-[#2D3436] hover:bg-[#F4F4F2] cursor-pointer"
                >
                  <Plus size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Añadir Foto</span>
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="hidden" 
                    onChange={(e) => {
                      handleImageUpload(e, -1);
                    }}
                  />
                </label>
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-[#E4E4E2] bg-[#F4F4F2] text-[#B2BEC3]">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-4 text-center">Límite de Galería Alcanzado</span>
                </div>
              )}
            </div>
            {(formData.gallery?.length || 0) >= 4 && (
              <p className="text-[10px] text-amber-600 mt-2 font-medium">Nota: Guarda la ficha continuamente. Múltiples fotos consumen capacidad del documento gratis.</p>
            )}
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <h4 className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Estado de la Ficha</h4>
            <div className="space-y-3">
              {(['draft', 'pending', 'validated', 'published'] as GlazeStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: s })}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all",
                    formData.status === s ? "border-[#2D3436] bg-[#2D3436] text-white" : "border-[#E4E4E2] text-[#636E72] hover:bg-[#F7F7F5]"
                  )}
                >
                  {STATUS_LABELS[s]}
                  {formData.status === s && <CheckCircle size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#2D3436] p-8 text-white shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-60">
              <Info size={14} />
              Consejo Técnico
            </div>
            <p className="text-sm leading-relaxed opacity-90">
              Recuerda que los adicionales no se suman al total base. El sistema los calcula de forma independiente para mantener la pureza de la fórmula.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function CheckCircle({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
