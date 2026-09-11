import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Flame,
  Copy,
  Save,
  Trash2,
  Plus,
  ChevronUp,
  ChevronDown,
  Loader2,
  Info,
  BookOpen,
  FilePlus2,
  Pencil,
  X,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { cn } from '../lib/utils';
import {
  FiringProgram,
  FiringProgramType,
  FiringSegmentInput,
  FiringPresetKind,
} from '../firingCurve/types';
import { SYSTEM_PRESETS, getSystemPreset, cloneProgram } from '../firingCurve/presets';
import { computeCurve, validateProgram, formatDuration, rounded } from '../firingCurve/engine';
import { ORTON_CONES_TABLE, ORTON_RATE_OPTIONS } from '../firingCurve/orton';
import {
  subscribePrograms,
  saveProgram,
  updateProgram,
  deleteProgram,
} from '../firingCurve/persistence';
import FiringCurveChart from './FiringCurveChart';
import FiringPhasesModal from './FiringPhasesModal';

let segCounter = 0;
function nextSegId(): string {
  segCounter += 1;
  return `seg-${Date.now()}-${segCounter}`;
}

interface ConfirmAction {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

const TYPE_LABELS: Record<FiringProgramType, string> = {
  bisque: 'Bizcochado',
  glaze: 'Esmalte',
  custom: 'Personalizado',
};

// Registro simple para que App.tsx pueda consultar si hay cambios sin guardar
// antes de navegar fuera de la sección (evita perder una curva sin avisar).
export const firingCurveGuard: {
  check: () => boolean;
} = {
  check: () => true,
};

export default function FiringCurveView() {
  const [mode, setMode] = useState<FiringProgramType>('bisque');
  const [programs, setPrograms] = useState<FiringProgram[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('sys-bisque-980');
  const [sourceOrigin, setSourceOrigin] = useState<FiringProgram>(() => getSystemPreset('sys-bisque-980')!);
  const [draft, setDraft] = useState<FiringProgram>(() => cloneProgram(getSystemPreset('sys-bisque-980')!));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [phasesOpen, setPhasesOpen] = useState(false);
  const [savingNew, setSavingNew] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  const dirty = useMemo(() => {
    const o = sourceOrigin;
    const d = draft;
    const oSegs = o.segments.map((s) => `${s.type}:${s.targetTemp}:${s.rate}:${s.durationMinutes}`).join('|');
    const dSegs = d.segments.map((s) => `${s.type}:${s.targetTemp}:${s.rate}:${s.durationMinutes}`).join('|');
    return (
      o.name !== d.name ||
      o.type !== d.type ||
      o.initialTemp !== d.initialTemp ||
      o.cone !== d.cone ||
      o.ortonRate !== d.ortonRate ||
      (o.description ?? '') !== (d.description ?? '') ||
      oSegs !== dSegs
    );
  }, [draft, sourceOrigin]);

  // ---- guard de cambios sin guardar ante navegación / recarga ----
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  useEffect(() => {
    firingCurveGuard.check = () => !dirty || window.confirm(
      'Tienes cambios sin guardar en la curva actual. ¿Seguro que quieres abandonar esta sección sin guardar?',
    );
    return () => {
      firingCurveGuard.check = () => true;
    };
  }, [dirty]);

  const result = useMemo(() => computeCurve(draft), [draft]);

  // ---- suscripción a presets personalizados (sólo del usuario autenticado) ----
  useEffect(() => {
    const unsub = subscribePrograms((items) => {
      setPrograms(items);
      setLoadingItems(false);
    });
    return unsub;
  }, []);

  // ---- helpers sobre segmentos ----
  const updateSegment = useCallback((id: string, patch: Partial<FiringSegmentInput>) => {
    setDraft((prev) => ({
      ...prev,
      segments: prev.segments.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const removeSegment = useCallback((id: string) => {
    setDraft((prev) => ({ ...prev, segments: prev.segments.filter((s) => s.id !== id) }));
  }, []);

  const addSegment = useCallback((type: FiringSegmentInput['type']) => {
    setDraft((prev) => {
      const lastTemp = prev.segments.length
        ? lastEndTemp(prev.segments)
        : prev.initialTemp;
      const seg: FiringSegmentInput =
        type === 'ramp'
          ? { id: nextSegId(), type, targetTemp: roundedUp(lastTemp + 50), rate: 100 }
          : { id: nextSegId(), type, durationMinutes: 10 };
      return { ...prev, segments: [...prev.segments, seg] };
    });
  }, []);

  const duplicateSegment = useCallback((id: string) => {
    setDraft((prev) => {
      const idx = prev.segments.findIndex((s) => s.id === id);
      if (idx < 0) return prev;
      const copy = { ...prev.segments[idx], id: nextSegId() };
      const segments = [...prev.segments];
      segments.splice(idx + 1, 0, copy);
      return { ...prev, segments };
    });
  }, []);

  const moveSegment = useCallback((id: string, dir: -1 | 1) => {
    setDraft((prev) => {
      const idx = prev.segments.findIndex((s) => s.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.segments.length) return prev;
      const segments = [...prev.segments];
      const [item] = segments.splice(idx, 1);
      segments.splice(to, 0, item);
      return { ...prev, segments };
    });
  }, []);

  // ---- cargar un preset (con guard de cambios sin guardar) ----
  const loadPreset = useCallback(
    (target: FiringProgram, preserveId?: string) => {
      if (dirty) {
        const proceed = window.confirm(
          'Tienes cambios sin guardar en la curva actual. ¿Quieres descartarlos y cargar este preset?',
        );
        if (!proceed) return;
      }
      const src = cloneProgram(target, {
        name: target.name,
        ...(preserveId ? { id: preserveId } : {}),
      });
      setSourceOrigin(src);
      setDraft(src);
      setSelectedId(target.id || preserveId || `sys-${target.name}`);
      setMode(target.type);
    },
    [dirty],
  );

  // ---- persistencia ----
  const handleSaveCurrent = async () => {
    if (!auth.currentUser) {
      setMessage({ type: 'error', text: 'Inicia sesión para guardar.' });
      return;
    }
    const issues = validateProgram(draft);
    if (issues.some((i) => i.severity === 'critical')) {
      setMessage({ type: 'error', text: 'Corrige los campos obligatorios antes de guardar.' });
      return;
    }
    setBusy(true);
    setMessage(null);
try {
          let id = draft.id;
          if (id) {
            await updateProgram(draft);
            setMessage({ type: 'success', text: 'Programa actualizado.' });
          } else {
            id = await saveProgram({ ...draft, kind: 'custom', ownerId: auth.currentUser.uid });
            setMessage({ type: 'success', text: 'Programa guardado.' });
          }
          const saved = { ...draft, name: draft.name, id } as FiringProgram;
          setDraft(saved);
          setSourceOrigin(cloneProgram(saved));
        } catch (e) {
          console.error('Error guardando programa:', e);
          const msg = e instanceof Error ? e.message : String(e);
          const isPermission = /insufficient|permission|denied/i.test(msg);
          setMessage({
            type: 'error',
            text: isPermission
              ? 'No tienes permisos para guardar aquí. Si acabas de registrar la cuenta, cierra sesión y vuelve a entrar.'
              : 'No se pudo guardar.',
          });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveAsPreset = async () => {
    if (!auth.currentUser) {
      setMessage({ type: 'error', text: 'Inicia sesión para guardar.' });
      return;
    }
    const issues = validateProgram(draft);
    if (issues.some((i) => i.severity === 'critical')) {
      setMessage({ type: 'error', text: 'Corrige los campos obligatorios antes de guardar.' });
      return;
    }
    setSavingNew(true);
    setNewPresetName('');
    setConfirm({
      title: 'Guardar como preset',
      message: 'Define un nombre identificativo para tu curva personalizada.',
      confirmLabel: 'Guardar',
      onConfirm: async () => {
        const name = newPresetName.trim();
        setConfirm(null);
        setSavingNew(false);
        setBusy(true);
        try {
          const id = await saveProgram({
            ...draft,
            name: name || draft.name || 'Mi preset',
            kind: 'custom',
            ownerId: auth.currentUser.uid,
          });
          const named = { ...draft, name: name || draft.name || 'Mi preset', id } as FiringProgram;
          setDraft(named);
          setSourceOrigin(cloneProgram(named));
          setSelectedId(id);
          setMessage({ type: 'success', text: `Preset "${named.name}" guardado.` });
        } catch (e) {
          console.error('Error guardando preset:', e);
          const msg = e instanceof Error ? e.message : String(e);
          const isPermission = /insufficient|permission|denied/i.test(msg);
          setMessage({
            type: 'error',
            text: isPermission
              ? 'No tienes permisos para guardar aquí. Si acabas de registrar la cuenta, cierra sesión y vuelve a entrar.'
              : 'No se pudo guardar el preset.',
          });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleDuplicateCurrent = async () => {
    if (!auth.currentUser) {
      setMessage({ type: 'error', text: 'Inicia sesión para duplicar.' });
      return;
    }
    const name = draft.name + ' (copia)';
    setBusy(true);
    try {
      const id = await saveProgram({
        ...cloneProgram(draft, { name, kind: 'custom', ownerId: auth.currentUser.uid }),
      });
      setMessage({ type: 'success', text: 'Copia guardada.' });
      const dup = { ...cloneProgram(draft, { name, kind: 'custom', ownerId: auth.currentUser.uid }), id } as FiringProgram;
      setDraft(dup);
      setSourceOrigin(cloneProgram(dup));
      setSelectedId(id);
    } catch (e) {
      setMessage({ type: 'error', text: 'No se pudo duplicar.' });
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = (item: FiringProgram) => {
    setConfirm({
      title: `Eliminar "${item.name}"`,
      message: 'Esta acción no se puede deshacer. El preset personalizado se borrará permanentemente.',
      confirmLabel: 'Eliminar',
      danger: true,
      onConfirm: async () => {
        setBusy(true);
        try {
          if (item.id) await deleteProgram(item.id);
          if (selectedId === item.id) {
            const first = SYSTEM_PRESETS.find((p) => p.type === mode) || SYSTEM_PRESETS[0];
            const src = cloneProgram(first, { name: first.name });
            setSourceOrigin(src);
            setDraft(src);
            setSelectedId(first.id!);
          }
          setMessage({ type: 'success', text: 'Preset eliminado.' });
        } catch (e) {
          setMessage({ type: 'error', text: 'No se pudo eliminar.' });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleRename = (item: FiringProgram) => {
    const name = window.prompt('Nuevo nombre del preset:', item.name);
    if (name && name.trim() && item.id) {
      updateProgram({ ...item, name: name.trim() })
        .then(() => setMessage({ type: 'success', text: 'Nombre actualizado.' }))
        .catch(() => setMessage({ type: 'error', text: 'No se pudo renombrar.' }));
    }
  };

  const duplicateUser = (item: FiringProgram) => {
    if (!auth.currentUser) return;
    saveProgram(cloneProgram({ ...item, name: item.name + ' (copia)' }, { ownerId: auth.currentUser.uid }))
      .then(() => setMessage({ type: 'success', text: 'Copia creada.' }))
      .catch(() => setMessage({ type: 'error', text: 'No se pudo duplicar.' }));
  };

  // ---- orquesta selección de preset personalizado ----
  const loadUserItem = (item: FiringProgram) => {
    // conserva el id para que "Guardar" actualice el preset original
    loadPreset(item, item.id);
  };

  const customItems = programs;
  const systemItems = SYSTEM_PRESETS.filter((p) => p.type === mode);

  // ---- métricas para el editor ----
  const segmentRows = result.segments;

  if (loadingItems) {
    return (
      <div className="flex h-64 items-center justify-center text-[#85929E]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando presets...
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Encabezado */}
      <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-[#F4F4F2] p-3 text-[#8a168a]">
              <Flame size={22} />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-[#1F2933]">
                Curva de Cocción
              </h2>
              <p className="mt-0.5 text-sm text-[#66707A]">
                Editor y planificador determinista de programas de cocción cerámica. No es una
                simulación física del horno ni una garantía de seguridad.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                Cambios sin guardar
              </span>
            )}
            <button
              onClick={() => setPhasesOpen(true)}
              className="flex items-center gap-1.5 rounded-xl border border-[#E4E4E2] px-3 py-2 text-sm font-medium text-[#2D3436] hover:bg-[#F7F7F5]"
            >
              <BookOpen size={16} /> Fases de cocción
            </button>
          </div>
        </div>

        {/* Selector de tipo */}
        <div className="mt-4 flex gap-2">
          {(['bisque', 'glaze'] as FiringProgramType[]).map((t) => (
            <button
              key={t}
              onClick={() => setMode(t)}
              className={cn(
                'rounded-xl px-4 py-2.5 text-sm font-medium transition-all',
                mode === t
                  ? 'bg-[#2D3436] text-white'
                  : 'border border-[#E4E4E2] text-[#636E72] hover:bg-[#F7F7F5]',
              )}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </section>

      {message && (
        <div
          className={cn(
            'rounded-xl p-4 text-sm font-medium',
            message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
          )}
        >
          {message.text}
        </div>
      )}

      {/* Selector de presets */}
      <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-tight text-[#1F2933]">Selector de programas y presets</h3>
          {draft.kind === 'system' ? (
            <span className="rounded-full bg-[#F4F4F2] px-3 py-1 text-xs text-[#85929E]">Preset del sistema</span>
          ) : (
            <span className="rounded-full bg-[#8a168a]/10 px-3 py-1 text-xs font-medium text-[#8a168a]">Preset personalizado</span>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
              Presets del sistema ({TYPE_LABELS[mode]})
            </label>
            <select
              value={selectedId}
              onChange={(e) => {
                const id = e.target.value;
                const sys = getSystemPreset(id);
                if (sys) loadPreset(sys);
              }}
              className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
            >
              {systemItems.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
              Mis presets
            </label>
            {customItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E4E4E2] px-3 py-2.5 text-center text-xs text-[#B2BEC3]">
                Aún no tienes presets personalizados.
              </div>
            ) : (
              <select
                value=""
                onChange={(e) => {
                  const id = e.target.value;
                  const item = customItems.find((c) => c.id === id);
                  if (item) loadUserItem(item);
                }}
                className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2.5 text-sm text-[#636E72] outline-none focus:border-[#2D3436] focus:bg-white"
              >
                <option value="" disabled>
                  {customItems.length} presets guardados...
                </option>
                {customItems.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Gestión de presets personalizados */}
        {customItems.length > 0 && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {customItems.map((c) => (
                <span
                  key={c.id}
                  className={cn(
                    'group flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs',
                    selectedId === c.id
                      ? 'border-[#8a168a] bg-[#8a168a]/10 text-[#8a168a]'
                      : 'border-[#E4E4E2] text-[#636E72]',
                  )}
                >
                  <button onClick={() => loadUserItem(c)} className="font-medium hover:underline">
                    {c.name}
                  </button>
                  <button onClick={() => handleRename(c)} aria-label={`Renombrar ${c.name}`} className="opacity-50 hover:opacity-100">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => duplicateUser(c)} aria-label={`Duplicar ${c.name}`} className="opacity-50 hover:opacity-100">
                    <Copy size={12} />
                  </button>
                  <button onClick={() => requestDelete(c)} aria-label={`Eliminar ${c.name}`} className="opacity-50 hover:opacity-100 hover:text-red-500">
                    <Trash2 size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Datos generales */}
      <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <h3 className="mb-3 text-sm font-semibold tracking-tight text-[#1F2933]">Datos del programa</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Nombre</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
              placeholder="Nombre del programa"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Temp. inicial (°C)</label>
            <input
              type="number"
              value={draft.initialTemp}
              onChange={(e) => setDraft({ ...draft, initialTemp: Number(e.target.value) })}
              className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Descripción</label>
            <textarea
              value={draft.description || ''}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className="w-full resize-none rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
              placeholder="Notas orientativas, pasta, espesor..."
            />
          </div>
        </div>
      </section>

      {/* Tabla de segmentos + Gráfica */}
      <div className="grid gap-5 xl:grid-cols-2">
        <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-[#1F2933]">Segmentos</h3>
            <div className="flex items-center gap-2">
              <button onClick={() => addSegment('ramp')} className="flex items-center gap-1 rounded-xl border border-[#E4E4E2] px-3 py-1.5 text-xs font-medium hover:bg-[#F7F7F5]">
                <Plus size={14} /> Rampa
              </button>
              <button onClick={() => addSegment('hold')} className="flex items-center gap-1 rounded-xl border border-[#E4E4E2] px-3 py-1.5 text-xs font-medium hover:bg-[#F7F7F5]">
                <Plus size={14} /> Meseta
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[#F0F0EE] text-left text-[10px] uppercase tracking-widest text-[#85929E]">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">Tipo</th>
                  <th className="py-2 pr-2 text-right">Inicio</th>
                  <th className="py-2 pr-2 text-right">Objetivo (°C)</th>
                  <th className="py-2 pr-2 text-right">Tasa (°C/h)</th>
                  <th className="py-2 pr-2 text-right">Duración</th>
                  <th className="py-2 pr-2 text-right">Acumulado</th>
                  <th className="py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-[#F6F6F4]">
                  <td className="py-1.5 pr-2 text-[#B2BEC3]">—</td>
                  <td className="py-1.5 pr-2 text-xs text-[#636E72]">Inicio</td>
                  <td className="py-1.5 pr-2 text-right text-[#636E72]">{Math.round(draft.initialTemp)}</td>
                  <td className="py-1.5 pr-2 text-right text-[#B2BEC3]">—</td>
                  <td className="py-1.5 pr-2 text-right text-[#B2BEC3]">—</td>
                  <td className="py-1.5 pr-2 text-right text-[#B2BEC3]">—</td>
                  <td className="py-1.5 pr-2 text-right text-[#B2BEC3]">0 min</td>
                  <td className="py-1.5" />
                </tr>
                {draft.segments.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-4 text-center text-xs text-[#B2BEC3]">
                      Sin segmentos. Añade una rampa o meseta.
                    </td>
                  </tr>
                ) : (
                  draft.segments.map((s, i) => {
                    const comp = segmentRows.find((c) => c.segmentId === s.id);
                    const startTemp = comp ? comp.startTemp : segmentStartTemp(draft, i);
                    return (
                      <tr key={s.id} className="border-b border-[#F6F6F4]">
                        <td className="py-1.5 pr-2 font-mono text-[#B2BEC3]">{i + 1}</td>
                        <td className="py-1.5 pr-2">
                          <select
                            value={s.type}
                            onChange={(e) => {
                              const nt = e.target.value as FiringSegmentInput['type'];
                              if (nt === 'hold') {
                                updateSegment(s.id, { type: 'hold', durationMinutes: 10 });
                              } else {
                                const t = comp ? comp.endTemp : segmentStartTemp(draft, i);
                                updateSegment(s.id, { type: 'ramp', targetTemp: roundedUp(t + 50), rate: 100 });
                              }
                            }}
                            className="rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-xs outline-none focus:border-[#2D3436]"
                          >
                            <option value="ramp">Rampa</option>
                            <option value="hold">Meseta</option>
                          </select>
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-[#636E72]">{Math.round(startTemp)}</td>
                        <td className="py-1.5 pr-2 text-right">
                          {s.type === 'ramp' ? (
                            <input
                              type="number"
                              value={s.targetTemp ?? ''}
                              onChange={(e) => updateSegment(s.id, { targetTemp: Number(e.target.value) })}
                              className="w-20 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-right font-mono text-xs outline-none focus:border-[#2D3436]"
                            />
                          ) : (
                            <span className="text-[#B2BEC3]">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {s.type === 'ramp' ? (
                            <input
                              type="number"
                              value={s.rate ?? ''}
                              onChange={(e) => updateSegment(s.id, { rate: Number(e.target.value) })}
                              className="w-20 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-right font-mono text-xs outline-none focus:border-[#2D3436]"
                            />
                          ) : (
                            <span className="text-[#B2BEC3]">—</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right">
                          {s.type === 'hold' ? (
                            <input
                              type="number"
                              value={s.durationMinutes ?? ''}
                              onChange={(e) => updateSegment(s.id, { durationMinutes: Number(e.target.value) })}
                              className="w-16 rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-right font-mono text-xs outline-none focus:border-[#2D3436]"
                            />
                          ) : (
                            <span className="text-[#636E72]">{comp ? formatDuration(comp.durationMin) : '—'}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-[#636E72]">
                          {comp ? formatDuration(comp.endTimeMin) : '—'}
                        </td>
                        <td className="py-1.5 text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <button onClick={() => duplicateSegment(s.id)} title="Duplicar" className="rounded p-1 text-[#B2BEC3] hover:text-[#2D3436]">
                              <Copy size={13} />
                            </button>
                            <button onClick={() => moveSegment(s.id, -1)} title="Subir" className="rounded p-1 text-[#B2BEC3] hover:text-[#2D3436]">
                              <ChevronUp size={14} />
                            </button>
                            <button onClick={() => moveSegment(s.id, 1)} title="Bajar" className="rounded p-1 text-[#B2BEC3] hover:text-[#2D3436]">
                              <ChevronDown size={14} />
                            </button>
                            <button onClick={() => removeSegment(s.id)} title="Eliminar" className="rounded p-1 text-[#B2BEC3] hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {result.validationIssues.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {result.validationIssues.map((v) => (
                <div
                  key={v.id}
                  className={cn(
                    'flex items-start gap-2 rounded-xl px-3 py-2 text-xs',
                    v.severity === 'critical' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
                  )}
                >
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{v.message}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight text-[#1F2933]">Gráfica</h3>
            {/* Cono Orton */}
            <div className="flex items-center gap-2">
              <select
                value={draft.cone || ''}
                onChange={(e) => setDraft({ ...draft, cone: e.target.value || undefined })}
                className="rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-xs outline-none focus:border-[#2D3436]"
                aria-label="Cono Orton de referencia"
              >
                <option value="">Sin cono</option>
                {ORTON_CONES_TABLE.map((c) => (
                  <option key={c.cone} value={c.cone}>
                    Cono {c.cone}
                  </option>
                ))}
              </select>
              <select
                value={draft.ortonRate || 150}
                onChange={(e) => setDraft({ ...draft, ortonRate: Number(e.target.value) })}
                className="rounded-lg border border-[#E4E4E2] bg-[#F7F7F5] px-2 py-1 text-xs outline-none focus:border-[#2D3436]"
                aria-label="Velocidad de referencia Orton"
              >
                {ORTON_RATE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r} °C/h
                  </option>
                ))}
              </select>
            </div>
          </div>
          <FiringCurveChart program={draft} result={result} />
          {draft.cone && (
            <p className="mt-1 text-[11px] text-[#85929E]">
              Los conos miden trabajo térmico; su caída depende de temperatura, tiempo, velocidad y
              condiciones de cocción. La línea discontinua es una referencia visual, no una predicción exacta de la caída.
            </p>
          )}
        </section>
      </div>

      {/* Métricas + Advertencias */}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-[#1F2933]">Métricas</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Metric label="Temp. inicial" value={`${Math.round(rounded(result.metrics.initialTemp))} °C`} />
            <Metric label="Temp. máxima" value={`${Math.round(rounded(result.metrics.maxTemp))} °C`} />
            <Metric label="Temp. final" value={`${Math.round(rounded(result.metrics.finalTemp))} °C`} />
            <Metric label="Duración total" value={formatDuration(result.metrics.totalDurationMin)} />
            <Metric label="Rampas" value={formatDuration(result.metrics.totalRampMin)} />
            <Metric label="Mesetas" value={formatDuration(result.metrics.totalHoldMin)} />
            <Metric label="Meseta en pico" value={formatDuration(result.metrics.peakHoldMin)} />
            <Metric label="Segmentos" value={String(result.metrics.segmentCount)} />
            <Metric
              label="Última rampa ↑"
              value={result.metrics.lastHeatingRate !== undefined ? `${Math.round(result.metrics.lastHeatingRate)} °C/h` : '—'}
            />
          </div>
        </section>

        <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
          <h3 className="mb-3 text-sm font-semibold tracking-tight text-[#1F2933]">Advertencias técnicas</h3>
          {result.warnings.length === 0 ? (
            <p className="text-sm text-[#85929E]">No hay advertencias para este programa.</p>
          ) : (
            <div className="space-y-2">
              {result.warnings.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'flex items-start gap-2 rounded-xl px-3 py-2 text-xs leading-relaxed',
                    w.severity === 'critical'
                      ? 'bg-red-50 text-red-700'
                      : w.severity === 'warning'
                        ? 'bg-amber-50 text-amber-700'
                        : 'bg-blue-50 text-blue-700',
                  )}
                >
                  <Info size={14} className="mt-0.5 shrink-0" />
                  <span>{w.message}</span>
                </div>
              ))}
              <p className="pt-1 text-[11px] text-[#85929E]">
                Estas advertencias son criterios orientativos, no una garantía de seguridad. El riesgo real depende
                de los gradientes térmicos, el espesor, la composición, la geometría y la carga del horno.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Acciones */}
      <section className="rounded-[20px] border border-white/70 bg-white p-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleSaveCurrent}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-[#2D3436] px-4 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Guardar
          </button>
          <button
            onClick={handleSaveAsPreset}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl bg-[#8a168a] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#6b0f6b] disabled:opacity-50"
          >
            <FilePlus2 size={16} /> Guardar como preset
          </button>
          <button
            onClick={handleDuplicateCurrent}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-xl border border-[#E4E4E2] px-4 py-2.5 text-sm font-medium hover:bg-[#F7F7F5] disabled:opacity-50"
          >
            <Copy size={16} /> Duplicar
          </button>
        </div>
      </section>

      {/* Modal guardar como preset (nombre) */}
      <ConfirmDialog
        confirm={savingNew ? confirm : null}
        onDismiss={() => {
          setSavingNew(false);
          setConfirm(null);
        }}
        onConfirm={() => {
          const c = confirm;
          if (!c) return;
          setSavingNew(false);
          setConfirm(null);
          c.onConfirm();
        }}
        extra={
          <div className="mb-4">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
              Nombre del preset
            </label>
            <input
              autoFocus
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="p.ej. Mi esmalte 1260"
              className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
            />
          </div>
        }
      />

      {/* Modal de confirmación genérico (eliminar) */}
      {confirm && !savingNew && (
        <ConfirmDialog
          confirm={confirm}
          onDismiss={() => setConfirm(null)}
          onConfirm={() => {
            const c = confirm;
            setConfirm(null);
            c.onConfirm();
          }}
        />
      )}

      <FiringPhasesModal open={phasesOpen} onClose={() => setPhasesOpen(false)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#F9F9F7] p-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[#85929E]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-[#2D3436]">{value}</p>
    </div>
  );
}

function segmentStartTemp(program: FiringProgram, index: number): number {
  let t = program.initialTemp;
  for (let i = 0; i < index; i++) {
    const s = program.segments[i];
    if (s.type === 'ramp') t = s.targetTemp as number;
  }
  return t;
}

function lastEndTemp(segments: FiringSegmentInput[]): number {
  let t = 0;
  for (const s of segments) {
    if (s.type === 'ramp' && typeof s.targetTemp === 'number') t = s.targetTemp as number;
  }
  return t;
}

function roundedUp(n: number): number {
  return Math.round(n);
}

interface ConfirmDialogProps {
  confirm: ConfirmAction | null;
  onDismiss: () => void;
  onConfirm: () => void;
  extra?: React.ReactNode;
}

function ConfirmDialog({ confirm, onDismiss, onConfirm, extra }: ConfirmDialogProps) {
  if (!confirm) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] bg-white p-7 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-lg font-semibold tracking-tight">{confirm.title}</h4>
          <button onClick={onDismiss} className="text-[#B2BEC3] hover:text-[#2D3436]" aria-label="Cerrar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-[#636E72]">{confirm.message}</p>
        {extra}
        <div className="mt-6 flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl border border-[#E4E4E2] px-4 py-2.5 text-sm font-medium hover:bg-[#F7F7F5]"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={cn(
              'flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white',
              confirm.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#2D3436] hover:bg-black',
            )}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
