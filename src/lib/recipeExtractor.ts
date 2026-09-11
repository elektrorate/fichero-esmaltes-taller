// Extracción de fórmulas de esmalte desde una imagen usando la API de Gemini
// (Google AI Studio, modelo de visión). La imagen se redimensiona en el
// navegador antes de enviarla para limitar el consumo de tokens.

export interface ExtractedLine {
  material: string;
  amount: number;
  unit?: '%' | 'g';
}

export interface ParsedExtraction {
  name?: string;
  base: ExtractedLine[];
  additional: ExtractedLine[];
}

export interface ExtractionResult {
  ok: boolean;
  error?: string;
  data?: ParsedExtraction;
}

export interface BuiltRecipe {
  base: Array<{ material: string; amount: number }>;
  additional: Array<{ material: string; amount: number }>;
  totalBase: number;
}

const GEMINI_MODEL = 'gemini-3.6-flash';

const readFileAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo interpretar la imagen.'));
    img.src = src;
  });

export const downscaleImage = async (dataUrl: string, maxDim = 1600): Promise<string> => {
  const img = await loadImage(dataUrl);
  const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite procesar la imagen.');
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.85);
};

const toAmount = (value: unknown): number => {
  const num = Number(value);
  return Number.isFinite(num) ? num : NaN;
};

const normalizeLines = (value: unknown): ExtractedLine[] => {
  if (!Array.isArray(value)) return [];
  const lines: ExtractedLine[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const record = item as Record<string, unknown>;
    const material = String(record.material ?? '').trim();
    const amount = toAmount(record.amount);
    if (!material || !Number.isFinite(amount) || amount <= 0) continue;
    const unit = record.unit === 'g' ? 'g' : '%';
    lines.push({ material, amount, unit });
  }
  return lines;
};

export const parseExtractionJson = (raw: unknown): ParsedExtraction | null => {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : undefined;
  const base = normalizeLines(record.base);
  const additional = normalizeLines(record.additional);
  if (base.length === 0 && additional.length === 0) return null;
  return { ...(name ? { name } : {}), base, additional };
};

const parseModelContent = (content: string): ParsedExtraction | null => {
  const cleaned = content.replace(/```(?:json)?/gi, '').trim();
  const candidates = [cleaned];
  const tryParse = (text: string): ParsedExtraction | null => {
    try {
      return parseExtractionJson(JSON.parse(text));
    } catch {
      return null;
    }
  };
  for (const candidate of candidates) {
    const parsed = tryParse(candidate);
    if (parsed) return parsed;
  }
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) return tryParse(match[0]);
  return null;
};

export const extractRecipeFromImage = async (
  file: File,
  apiKey: string,
  model = GEMINI_MODEL,
): Promise<ExtractionResult> => {
  if (!apiKey) {
    return { ok: false, error: 'Falta la clave de Gemini. Configúrala como VITE_GEMINI_API_KEY en tu archivo .env.local.' };
  }
  try {
    const raw = await readFileAsDataUrl(file);
    const dataUrl = await downscaleImage(raw);
    const separator = dataUrl.indexOf(',');
    const mimeType = dataUrl.slice(5, separator);
    const base64 = dataUrl.slice(separator + 1);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: 'Extrae la fórmula de esmalte de esta imagen.' },
                { inlineData: { mimeType, data: base64 } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
      },
    );

    if (!response.ok) {
      let detail = `Error de Gemini (${response.status}).`;
      try {
        const errorBody = (await response.json()) as { error?: { message?: string } };
        if (errorBody.error?.message) detail = errorBody.error.message;
      } catch {
        // sin detalle adicional
      }
      if (/API key not valid|API_KEY_INVALID/.test(detail)) {
        detail = 'La clave de Gemini no es válida. Revisa VITE_GEMINI_API_KEY en .env.local.';
      }
      return { ok: false, error: detail };
    }

    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';

    const parsed = parseModelContent(content);
    if (!parsed) {
      return { ok: false, error: 'No pude extraer materiales de la fórmula en la imagen.' };
    }
    return { ok: true, data: parsed };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Error inesperado al leer la imagen.' };
  }
};

export const extractionToRecipe = (data: ParsedExtraction): BuiltRecipe => ({
  base: data.base.map((line) => ({ material: line.material, amount: line.amount })),
  additional: data.additional.map((line) => ({ material: line.material, amount: line.amount })),
  totalBase: data.base.reduce((sum, line) => sum + line.amount, 0),
});