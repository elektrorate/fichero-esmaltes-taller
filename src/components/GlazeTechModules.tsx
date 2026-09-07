import { useState } from 'react';
import {
  ClipboardList,
  FlaskConical,
  Flame,
  Microscope,
  Brush,
  ShieldCheck,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  ImagePlus,
} from 'lucide-react';
import { Glaze, TechSpecs, PreparationData, FiringCurve, FiringSegment, AnalysisData, ApplicationData, ApplicationPhoto, SafetyData } from '../types';
import { ORTON_CONES, ATMOSPHERE_OPTIONS, APPLICATION_METHOD_OPTIONS, FOOD_SAFETY_STATUSES } from '../constants';
import RichTextEditor from './RichTextEditor';
import { cn } from '../lib/utils';

const TABS = [
  { id: 'specs', label: 'Ficha técnica', icon: ClipboardList },
  { id: 'preparation', label: 'Preparación', icon: FlaskConical },
  { id: 'curve', label: 'Curva de cocción', icon: Flame },
  { id: 'analysis', label: 'Análisis', icon: Microscope },
  { id: 'application', label: 'Aplicación', icon: Brush },
  { id: 'safety', label: 'Seguridad y uso', icon: ShieldCheck },
] as const;

type TabId = (typeof TABS)[number]['id'];

const fieldInput =
  'w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436] focus:bg-white';

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">{children}</label>;
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <input
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldInput}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  suffix,
}: {
  label: string;
  value?: number;
  onChange: (v?: number) => void;
  placeholder?: string;
  suffix?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] focus-within:border-[#2D3436]">
        <input
          type="number"
          inputMode="decimal"
          step="any"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          placeholder={placeholder}
          className="w-full min-w-0 rounded-l-xl bg-transparent px-3 py-2 text-sm outline-none"
        />
        {suffix && <span className="pr-3 text-xs font-medium text-[#636E72]">{suffix}</span>}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={fieldInput}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiChipField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value?: string[];
  onChange: (v: string[]) => void;
  options: string[];
}) {
  const selected = value || [];
  const toggle = (option: string) => {
    onChange(
      selected.includes(option) ? selected.filter((v) => v !== option) : [...selected, option]
    );
  };
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-xs font-medium transition-all',
              selected.includes(o)
                ? 'border-[#2D3436] bg-[#2D3436] text-white'
                : 'border-[#E4E4E2] bg-white text-[#636E72] hover:border-[#2D3436] hover:text-[#2D3436]'
            )}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function RichField({
  label,
  value,
  onChange,
  placeholder,
  minRows,
}: {
  label: string;
  value?: string;
  onChange: (v: string) => void;
  placeholder?: string;
  minRows?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <RichTextEditor value={value || ''} onChange={onChange} placeholder={placeholder} minRows={minRows} />
    </div>
  );
}

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX = 800;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX) {
            height *= MAX / width;
            width = MAX;
          }
        } else {
          if (height > MAX) {
            width *= MAX / height;
            height = MAX;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.6));
      };
      img.onerror = () => reject(new Error('Imagen no válida'));
    };
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
  });
};

interface GlazeTechModulesProps {
  value: Partial<Glaze>;
  onChange: (next: Partial<Glaze>) => void;
}

export default function GlazeTechModules({ value, onChange }: GlazeTechModulesProps) {
  const [tab, setTab] = useState<TabId>('specs');

  const setTechSpecs = (p: Partial<TechSpecs>) =>
    onChange({ ...value, techSpecs: { ...(value.techSpecs || {}), ...p } });
  const setPreparation = (p: Partial<PreparationData>) =>
    onChange({ ...value, preparation: { ...(value.preparation || {}), ...p } });
  const setFiringCurve = (p: Partial<FiringCurve>) =>
    onChange({ ...value, firingCurve: { ...(value.firingCurve || {}), ...p } });
  const setAnalysis = (p: Partial<AnalysisData>) =>
    onChange({ ...value, analysis: { ...(value.analysis || {}), ...p } });
  const setApplication = (p: Partial<ApplicationData>) =>
    onChange({ ...value, application: { ...(value.application || {}), ...p } });
  const setSafety = (p: Partial<SafetyData>) =>
    onChange({ ...value, safety: { ...(value.safety || {}), ...p } });

  const segments = value.firingCurve?.segments || [];

  const addSegment = () => setFiringCurve({ segments: [...segments, { index: segments.length + 1 }] });
  const updateSegment = (idx: number, p: Partial<Omit<FiringSegment, 'index'>>) => {
    const next = [...segments];
    next[idx] = { ...next[idx], ...p };
    setFiringCurve({ segments: next });
  };
  const removeSegment = (idx: number) => {
    setFiringCurve({ segments: segments.filter((_, i) => i !== idx).map((s, i) => ({ ...s, index: i + 1 })) });
  };
  const moveSegment = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= segments.length) return;
    const next = [...segments];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setFiringCurve({ segments: next.map((s, i) => ({ ...s, index: i + 1 })) });
  };

  const photos = value.application?.photos || [];

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const dataUrl = await compressImage(file);
      setApplication({ photos: [...photos, { url: dataUrl, caption: '' }] });
    } catch {
      // ignore invalid images
    }
  };
  const updatePhoto = (idx: number, p: Partial<ApplicationPhoto>) => {
    const next = [...photos];
    next[idx] = { ...next[idx], ...p };
    setApplication({ photos: next });
  };
  const removePhoto = (idx: number) => {
    if (!window.confirm('¿Eliminar esta fotografía de referencia?')) return;
    setApplication({ photos: photos.filter((_, i) => i !== idx) });
  };
  const movePhoto = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    setApplication({ photos: next });
  };

  return (
    <div className="overflow-hidden rounded-[24px] bg-white shadow-sm">
      <div className="border-b border-[#F4F4F2] p-6 pb-0">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-bold uppercase tracking-widest text-[#8a168a]">Módulos Técnicos</h4>
        </div>
        <p className="mt-1 text-xs text-[#636E72]">
          Información técnica ampliada. Todos los campos son opcionales.
        </p>
        <div className="mt-4 flex flex-wrap gap-1.5 pb-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all',
                tab === id
                  ? 'bg-[#2D3436] text-white shadow-sm'
                  : 'bg-[#F7F7F5] text-[#636E72] hover:bg-[#F4F4F2] hover:text-[#2D3436]'
              )}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-6">
        {tab === 'specs' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Cono Orton</Label>
                <select
                  value={value.techSpecs?.cone || ''}
                  onChange={(e) => setTechSpecs({ cone: e.target.value })}
                  className={fieldInput}
                >
                  <option value="">Sin especificar</option>
                  {ORTON_CONES.map((c) => (
                    <option key={c.cone} value={c.cone}>
                      Cono {c.cone} · {c.c150}°C
                    </option>
                  ))}
                </select>
              </div>
              <NumberField
                label="Temperatura orientativa"
                value={value.techSpecs?.targetTemperature}
                onChange={(v) => setTechSpecs({ targetTemperature: v })}
                placeholder="Ej. 1280"
                suffix="°C"
              />
              <SelectField
                label="Atmósfera"
                value={value.techSpecs?.atmosphere}
                onChange={(v) => setTechSpecs({ atmosphere: v })}
                options={ATMOSPHERE_OPTIONS}
                placeholder="No especificada"
              />
            </div>
            <TextField
              label="Tipo de pasta utilizada"
              value={value.techSpecs?.clayBodyType}
              onChange={(v) => setTechSpecs({ clayBodyType: v })}
              placeholder="Ej. Gres Chamota XX, fabricante o referencia"
            />
            <MultiChipField
              label="Método de aplicación"
              value={value.techSpecs?.applicationMethods}
              onChange={(v) => setTechSpecs({ applicationMethods: v })}
              options={APPLICATION_METHOD_OPTIONS}
            />
            <RichField
              label="Características principales"
              value={value.techSpecs?.characteristics}
              onChange={(v) => setTechSpecs({ characteristics: v })}
              placeholder="Color, acabado, textura, nivel de brillo, comportamiento general..."
            />
          </div>
        )}

        {tab === 'preparation' && (
          <div className="space-y-5">
            <RichField
              label="Orden de mezclado"
              value={value.preparation?.mixingOrder}
              onChange={(v) => setPreparation({ mixingOrder: v })}
              placeholder="Procedimiento de preparación de la fórmula..."
            />
            <TextField
              label="Cantidad inicial de agua orientativa"
              value={value.preparation?.initialWater}
              onChange={(v) => setPreparation({ initialWater: v })}
              placeholder="Ej. 40%, o 'ajustar según densidad'"
            />
            <TextField
              label="Tamizado"
              value={value.preparation?.sieving}
              onChange={(v) => setPreparation({ sieving: v })}
              placeholder="Ej. Malla 80, dos pasadas"
            />
            <TextField
              label="Reposo"
              value={value.preparation?.resting}
              onChange={(v) => setPreparation({ resting: v })}
              placeholder="Ej. 24h en recipiente cerrado"
            />
            <RichField
              label="Recomendaciones para suspensión adecuada"
              value={value.preparation?.suspensionTips}
              onChange={(v) => setPreparation({ suspensionTips: v })}
              placeholder="Ajustes de agua, densidad, viscosidad, comportamiento..."
            />
          </div>
        )}

        {tab === 'curve' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Nombre o referencia de la curva"
                value={value.firingCurve?.name}
                onChange={(v) => setFiringCurve({ name: v })}
                placeholder="Ej. Curva de gres 10h"
              />
              <TextField
                label="Programa utilizado"
                value={value.firingCurve?.program}
                onChange={(v) => setFiringCurve({ program: v })}
                placeholder="Ej. Horno Rieda 25, programa P4"
              />
              <NumberField
                label="Temperatura final"
                value={value.firingCurve?.finalTemperature}
                onChange={(v) => setFiringCurve({ finalTemperature: v })}
                placeholder="Ej. 1260"
                suffix="°C"
              />
              <div className="space-y-1.5">
                <Label>Meseta final</Label>
                <div className="flex gap-2">
                  <div className="flex flex-1 items-center rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] focus-within:border-[#2D3436]">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={value.firingCurve?.finalSoak ?? ''}
                      onChange={(e) =>
                        setFiringCurve({ finalSoak: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                      placeholder="Ej. 30"
                      className="w-full min-w-0 rounded-l-xl bg-transparent px-3 py-2 text-sm outline-none"
                    />
                  </div>
                  <select
                    value={value.firingCurve?.finalSoakUnit || ''}
                    onChange={(e) => setFiringCurve({ finalSoakUnit: e.target.value })}
                    className={cn(fieldInput, 'w-24')}
                  >
                    <option value="">Unidad</option>
                    <option value="min">min</option>
                    <option value="h">h</option>
                  </select>
                </div>
              </div>
            </div>
            <RichField
              label="Enfriamiento"
              value={value.firingCurve?.cooling}
              onChange={(v) => setFiringCurve({ cooling: v })}
              placeholder="Curva de enfriamiento, apertura del horno, reposo..."
            />
            <RichField
              label="Parámetros esenciales para el resultado"
              value={value.firingCurve?.essentialParameters}
              onChange={(v) => setFiringCurve({ essentialParameters: v })}
              placeholder="Factores críticos de esta curva..."
            />
            <TextField
              label="Observaciones adicionales"
              value={value.firingCurve?.additionalNotes}
              onChange={(v) => setFiringCurve({ additionalNotes: v })}
              placeholder="Notas extra sobre la curva"
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">
                    Segmentos de cocción
                  </h5>
                  <p className="text-[11px] text-[#636E72]">
                    Rampas de calentamiento y enfriamiento. Velocidad negativa para enfriar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addSegment}
                  className="flex items-center gap-1.5 rounded-xl bg-[#2D3436] px-3 py-2 text-xs font-bold text-white hover:bg-black"
                >
                  <Plus size={14} />
                  Añadir segmento
                </button>
              </div>
              {segments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E4E4E2] p-8 text-center text-xs text-[#B2BEC3]">
                  Sin segmentos. Pulsa «Añadir segmento» para definir la curva.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-[#E4E4E2] text-left text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                        <th className="py-2 pr-2">Nº</th>
                        <th className="py-2 pr-2">Velocidad</th>
                        <th className="py-2 pr-2">T° objetivo</th>
                        <th className="py-2 pr-2">Meseta</th>
                        <th className="py-2 pr-2">Unidad</th>
                        <th className="py-2 pr-2">Observaciones</th>
                        <th className="py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F4F4F2]">
                      {segments.map((seg, idx) => (
                        <tr key={idx}>
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              value={seg.index}
                              readOnly
                              className="w-14 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1.5 text-center text-sm outline-none"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center rounded-lg border border-[#E4E4E2] bg-[#F7F7F5]">
                              <input
                                type="number"
                                step="any"
                                value={seg.rate ?? ''}
                                onChange={(e) =>
                                  updateSegment(idx, { rate: e.target.value === '' ? undefined : Number(e.target.value) })
                                }
                                placeholder="100"
                                className="w-20 rounded-l-lg bg-transparent px-2 py-1.5 text-sm outline-none"
                              />
                              <span className="px-2 text-[10px] text-[#636E72]">°C/h</span>
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <div className="flex items-center rounded-lg border border-[#E4E4E2] bg-[#F7F7F5]">
                              <input
                                type="number"
                                step="any"
                                value={seg.targetTemperature ?? ''}
                                onChange={(e) =>
                                  updateSegment(idx, {
                                    targetTemperature: e.target.value === '' ? undefined : Number(e.target.value),
                                  })
                                }
                                placeholder="1260"
                                className="w-20 rounded-l-lg bg-transparent px-2 py-1.5 text-sm outline-none"
                              />
                              <span className="px-2 text-[10px] text-[#636E72]">°C</span>
                            </div>
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              type="number"
                              step="any"
                              value={seg.soak ?? ''}
                              onChange={(e) =>
                                updateSegment(idx, { soak: e.target.value === '' ? undefined : Number(e.target.value) })
                              }
                              placeholder="0"
                              className="w-20 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1.5 text-sm outline-none"
                            />
                          </td>
                          <td className="py-2 pr-2">
                            <select
                              value={seg.soakUnit || ''}
                              onChange={(e) => updateSegment(idx, { soakUnit: e.target.value })}
                              className="w-20 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1.5 text-sm outline-none"
                            >
                              <option value="">—</option>
                              <option value="min">min</option>
                              <option value="h">h</option>
                            </select>
                          </td>
                          <td className="py-2 pr-2">
                            <input
                              value={seg.notes || ''}
                              onChange={(e) => updateSegment(idx, { notes: e.target.value })}
                              placeholder="Notas..."
                              className="w-full min-w-[140px] rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1.5 text-sm outline-none"
                            />
                          </td>
                          <td className="py-2">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => moveSegment(idx, -1)}
                                className="rounded-lg p-1.5 text-[#636E72] hover:bg-[#F7F7F5] disabled:opacity-30"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                disabled={idx === segments.length - 1}
                                onClick={() => moveSegment(idx, 1)}
                                className="rounded-lg p-1.5 text-[#636E72] hover:bg-[#F7F7F5] disabled:opacity-30"
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => removeSegment(idx)}
                                className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'analysis' && (
          <div className="space-y-5">
            <RichField
              label="Comportamiento químico del esmalte"
              value={value.analysis?.chemicalBehavior}
              onChange={(v) => setAnalysis({ chemicalBehavior: v })}
              placeholder="Qué ocurre durante la cocción, relación entre componentes..."
            />
            <RichField
              label="Función de las materias primas"
              value={value.analysis?.rawMaterialFunctions}
              onChange={(v) => setAnalysis({ rawMaterialFunctions: v })}
              placeholder="Función de cada material de la fórmula..."
            />
            <RichField
              label="Defectos observados"
              value={value.analysis?.defects}
              onChange={(v) => setAnalysis({ defects: v })}
              placeholder="Defectos, limitaciones o comportamientos no deseados..."
            />
            <RichField
              label="Posibles ajustes"
              value={value.analysis?.adjustments}
              onChange={(v) => setAnalysis({ adjustments: v })}
              placeholder="Modificaciones que podrían mejorar o alterar el resultado..."
            />
            <RichField
              label="Observaciones generales"
              value={value.analysis?.generalNotes}
              onChange={(v) => setAnalysis({ generalNotes: v })}
              placeholder="Conclusiones, resultados adicionales, notas de investigación..."
            />
          </div>
        )}

        {tab === 'application' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField
                label="Número de capas o espesor recomendado"
                value={value.application?.layers}
                onChange={(v) => setApplication({ layers: v })}
                placeholder="Ej. 2 capas a 0.6mm"
              />
            </div>
            <MultiChipField
              label="Técnica utilizada"
              value={value.application?.techniques}
              onChange={(v) => setApplication({ techniques: v })}
              options={APPLICATION_METHOD_OPTIONS}
            />
            <RichField
              label="Comportamiento sobre diferentes pastas"
              value={value.application?.behaviorOnClays}
              onChange={(v) => setApplication({ behaviorOnClays: v })}
              placeholder="Resultado sobre porcelana, gres, loza..."
            />
            <RichField
              label="Recomendaciones de aplicación"
              value={value.application?.recommendations}
              onChange={(v) => setApplication({ recommendations: v })}
              placeholder="Consejos de aplicación, reposos, secados..."
            />

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">
                    Fotografías de referencia
                  </h5>
                  <p className="text-[11px] text-[#636E72]">
                    Sube, elimina o reordena imágenes de aplicación con descripción opcional.
                  </p>
                </div>
                <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#2D3436] px-3 py-2 text-xs font-bold text-white hover:bg-black">
                  <ImagePlus size={14} />
                  Añadir foto
                  <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#E4E4E2] p-8 text-center text-xs text-[#B2BEC3]">
                  Sin fotografías de referencia.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {photos.map((photo, idx) => (
                    <div key={idx} className="overflow-hidden rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5]">
                      <div className="aspect-[4/3] overflow-hidden bg-white">
                        {photo.url ? (
                          <img src={photo.url} alt={`Referencia ${idx + 1}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[#B2BEC3]">
                            <ImagePlus size={28} strokeWidth={1} />
                          </div>
                        )}
                      </div>
                      <div className="space-y-2 p-3">
                        <input
                          value={photo.caption || ''}
                          onChange={(e) => updatePhoto(idx, { caption: e.target.value })}
                          placeholder="Descripción (ej. Pasta blanca, dos capas, cono 8)"
                          className="w-full rounded-lg border border-[#E4E4E2] bg-white px-2.5 py-1.5 text-xs outline-none focus:border-[#2D3436]"
                        />
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => movePhoto(idx, -1)}
                            className="rounded-lg p-1.5 text-[#636E72] hover:bg-white disabled:opacity-30"
                          >
                            <ArrowUp size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={idx === photos.length - 1}
                            onClick={() => movePhoto(idx, 1)}
                            className="rounded-lg p-1.5 text-[#636E72] hover:bg-white disabled:opacity-30"
                          >
                            <ArrowDown size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePhoto(idx)}
                            className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'safety' && (
          <div className="space-y-5">
            <RichField
              label="Precauciones de manipulación"
              value={value.safety?.handlingPrecautions}
              onChange={(v) => setSafety({ handlingPrecautions: v })}
              placeholder="Protección, ventilación, toxicidad de materias primas..."
            />
            <RichField
              label="Limitaciones del esmalte"
              value={value.safety?.glazeLimitations}
              onChange={(v) => setSafety({ glazeLimitations: v })}
              placeholder="Límites de uso, resistencia, durabilidad..."
            />
            <RichField
              label="Información sobre uso alimentario"
              value={value.safety?.foodSafetyInfo}
              onChange={(v) => setSafety({ foodSafetyInfo: v })}
              placeholder="Ensayos, resultados, condiciones de uso alimentario..."
            />
            <SelectField
              label="Estado de verificación para contacto alimentario"
              value={value.safety?.foodContactStatus}
              onChange={(v) => setSafety({ foodContactStatus: v as SafetyData['foodContactStatus'] })}
              options={FOOD_SAFETY_STATUSES}
              placeholder="Selecciona un estado"
            />
            <RichField
              label="Observaciones de seguridad adicionales"
              value={value.safety?.additionalSafetyNotes}
              onChange={(v) => setSafety({ additionalSafetyNotes: v })}
              placeholder="Otras notas de seguridad..."
            />
          </div>
        )}
      </div>
    </div>
  );
}