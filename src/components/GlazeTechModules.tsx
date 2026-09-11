import { useEffect, useMemo, useState } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { Glaze, TechSpecs, PreparationData, FiringCurve, AnalysisData, ApplicationData, ApplicationPhoto, SafetyData } from '../types';
import { ORTON_CONES, ATMOSPHERE_OPTIONS, APPLICATION_METHOD_OPTIONS, FOOD_SAFETY_STATUSES } from '../constants';
import RichTextEditor from './RichTextEditor';
import { cn } from '../lib/utils';
import { SYSTEM_PRESETS } from '../firingCurve/presets';
import { subscribePrograms } from '../firingCurve/persistence';
import { programToGlazeCurve } from '../firingCurve/importToGlaze';
import { computeCurve, formatDuration } from '../firingCurve/engine';
import { FiringProgram } from '../firingCurve/types';
import FiringCurveChart from './FiringCurveChart';

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

const TYPE_LABEL: Record<FiringProgram['type'], string> = {
  bisque: 'Bizcochado',
  glaze: 'Esmalte',
  custom: 'Personalizado',
};

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F9F9F7] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#85929E]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#2D3436]">{value}</p>
    </div>
  );
}

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

  // ---- Programas de «Curva de Cocción» para vincular a la ficha ----
  const [userPrograms, setUserPrograms] = useState<FiringProgram[]>([]);
  useEffect(() => {
    const unsub = subscribePrograms((items) => {
      setUserPrograms(items);
    });
    return unsub;
  }, []);

  const systemPrograms = useMemo(
    () =>
      SYSTEM_PRESETS.map((p) => ({
        program: p,
        maxTemp: computeCurve(p).metrics.maxTemp,
      })),
    [],
  );

  const selectedProgram = useMemo(() => {
    const id = value.firingCurve?.programId;
    if (!id) return null;
    return (
      SYSTEM_PRESETS.find((p) => p.id === id) ??
      userPrograms.find((p) => p.id === id) ??
      null
    );
  }, [value.firingCurve?.programId, userPrograms]);

  const curveResult = useMemo(
    () => (selectedProgram ? computeCurve(selectedProgram) : null),
    [selectedProgram],
  );

  const onSelectProgram = (id: string) => {
    if (!id) {
      onChange({ ...value, firingCurve: undefined });
      return;
    }
    const p = SYSTEM_PRESETS.find((x) => x.id === id) ?? userPrograms.find((x) => x.id === id);
    if (!p) return;
    setFiringCurve(programToGlazeCurve(p, value.firingCurve));
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
        <div className="mt-4 grid grid-cols-1 gap-1.5 pb-4 sm:flex sm:flex-wrap">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all sm:justify-start',
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
            <div className="space-y-4">
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
            {/* Selector de programa guardado en «Curva de Cocción» */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label>Programa de cocción</Label>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[#636E72]">
                    La curva no se edita aquí: pulsa un programa de abajo para vincularlo a esta ficha. Así se muestra en
                    la ficha pública.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = '#/firing-curve';
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[#E4E4E2] px-4 py-2 text-sm font-medium text-[#2D3436] hover:bg-[#F7F7F5]"
                >
                  <ExternalLink size={15} />
                  Crear / editar en «Curva de Cocción»
                </button>
              </div>

              {/* Presets del sistema */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Presets del sistema</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {systemPrograms.map(({ program, maxTemp }) => (
                    <button
                      key={program.id}
                      type="button"
                      onClick={() => onSelectProgram(program.id!)}
                      className={cn(
                        'flex flex-col items-start rounded-2xl border p-3 text-left transition-all',
                        selectedProgram?.id === program.id
                          ? 'border-[#8a168a] bg-[#8a168a]/5 shadow-sm'
                          : 'border-[#E4E4E2] bg-[#F7F7F5] hover:border-[#2D3436] hover:bg-white',
                      )}
                    >
                      <span className="text-sm font-semibold text-[#2D3436]">{program.name}</span>
                      <span className="mt-0.5 text-[11px] text-[#85929E]">
                        {TYPE_LABEL[program.type]} · {Math.round(maxTemp)} °C
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Mis curvas guardadas */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Mis curvas guardadas</p>
                {userPrograms.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#E4E4E2] p-3 text-center text-xs text-[#B2BEC3]">
                    Aún no tienes curvas guardadas. Crea una en «Curva de Cocción».
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {userPrograms.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelectProgram(p.id!)}
                        className={cn(
                          'flex flex-col items-start rounded-2xl border p-3 text-left transition-all',
                          selectedProgram?.id === p.id
                            ? 'border-[#8a168a] bg-[#8a168a]/5 shadow-sm'
                            : 'border-[#E4E4E2] bg-[#F7F7F5] hover:border-[#2D3436] hover:bg-white',
                        )}
                      >
                        <span className="text-sm font-semibold text-[#2D3436]">{p.name}</span>
                        <span className="mt-0.5 text-[11px] text-[#85929E]">
                          {TYPE_LABEL[p.type]}
                          {p.cone ? ` · Cono ${p.cone}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {value.firingCurve && (
                <button
                  type="button"
                  onClick={() => onSelectProgram('')}
                  className="flex items-center gap-1.5 rounded-xl border border-red-200 px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  Desvincular curva de esta ficha
                </button>
              )}
            </div>

            {selectedProgram && curveResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Chip label="T. inicial" value={`${Math.round(curveResult.metrics.initialTemp)} °C`} />
                  <Chip label="T. máxima" value={`${Math.round(curveResult.metrics.maxTemp)} °C`} />
                  <Chip label="Duración" value={formatDuration(curveResult.metrics.totalDurationMin)} />
                  <Chip label="Cono Orton" value={selectedProgram.cone ? `Cono ${selectedProgram.cone}` : '—'} />
                </div>

                <FiringCurveChart program={selectedProgram} result={curveResult} />

                <div className="overflow-x-auto rounded-2xl border border-[#E4E4E2]">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-[#E4E4E2] text-left text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                        <th className="px-3 py-2">#</th>
                        <th className="px-3 py-2">Tipo</th>
                        <th className="px-3 py-2 text-right">Inicio</th>
                        <th className="px-3 py-2 text-right">Objetivo</th>
                        <th className="px-3 py-2 text-right">Tasa / Duración</th>
                        <th className="px-3 py-2 text-right">Acumulado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F4F4F2]">
                      {curveResult.segments.map((s) => (
                        <tr key={s.segmentId}>
                          <td className="px-3 py-2 text-[#B2BEC3]">{s.index + 1}</td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                                s.type === 'hold'
                                  ? 'bg-orange-50 text-orange-700'
                                  : s.direction === 'down'
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'bg-emerald-50 text-emerald-700',
                              )}
                            >
                              {s.type === 'hold' ? 'Meseta' : s.direction === 'down' ? 'Rampa ↓' : 'Rampa ↑'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#636E72]">{Math.round(s.startTemp)}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#636E72]">{Math.round(s.endTemp)}</td>
                          <td className="px-3 py-2 text-right font-mono text-[#636E72]">
                            {s.type === 'hold' ? formatDuration(s.durationMin) : `${Math.round(s.rate ?? 0)} °C/h`}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-[#636E72]">{formatDuration(s.endTimeMin)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div>
                {value.firingCurve &&
                (value.firingCurve.name ||
                  value.firingCurve.finalTemperature !== undefined ||
                  (value.firingCurve.segments || []).length > 0) && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-800">
                    Esta ficha tiene una curva definida manualmente (sin programa vinculado). Para replantearla,
                    selecciona un programa de las tarjetas de arriba.
                  </div>
                )}
              </div>
            )}
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