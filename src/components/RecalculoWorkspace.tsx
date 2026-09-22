import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PlusCircle, RefreshCcw, Trash2, Send, Loader2 as Spinner, Search, X, CheckCircle2, Calculator } from 'lucide-react';
import { auth, db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, addDoc, setDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Glaze, GlazeStatus, UserProfile } from '../types';
import RecalculoModal from './RecalculoModal';
import { buildRecalculatedRecipe, RecalcRecipeInput, RecalcResult } from '../lib/recalcEngine';
import { cn, matchesSearch } from '../lib/utils';

interface Props {
  profile: UserProfile | null;
}

interface RecItem extends Glaze {
  id: string;
  scope?: string;
  sourceGlazeId?: string;
  sourceCode?: string;
}

interface Flash {
  text: string;
  key: number;
}

const sanitize = (data: unknown): unknown => {
  if (data === null || data === undefined) return undefined;
  if (Array.isArray(data)) return data.map(sanitize);
  if (typeof data === 'object') {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const cleanValue = sanitize(value);
      if (cleanValue !== undefined) clean[key] = cleanValue;
    }
    return clean;
  }
  return data;
};

const fmtDate = (value: unknown): string => {
  if (!value) return '';
  try {
    const date =
      typeof value === 'object' && value !== null && typeof (value as { toDate?: () => Date }).toDate === 'function'
        ? (value as { toDate: () => Date }).toDate()
        : new Date(value as string | number | Date);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
};

export default function RecalculoWorkspace({ profile }: Props) {
  const uid = profile?.uid ?? auth.currentUser?.uid ?? null;
  const itemsPath = uid ? `recalculos/${uid}/items` : null;

  const [items, setItems] = useState<RecItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [sourceGlazes, setSourceGlazes] = useState<Glaze[]>([]);
  const [activeItem, setActiveItem] = useState<RecItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  useEffect(() => {
    if (!itemsPath) return;
    const q = query(collection(db, itemsPath), orderBy('updatedAt', 'desc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setItems(snap.docs.map((d) => ({ ...(d.data() as RecItem), id: d.id })));
        setLoading(false);
      },
      (error) => {
        console.error('Error cargando área de recálculo:', error);
        setLoading(false);
      },
    );
    return unsubscribe;
  }, [itemsPath]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2600);
    return () => window.clearTimeout(timer);
  }, [flash]);

  const openPicker = async () => {
    if (!picking) setPickerSearch('');
    setPicking(true);
    try {
      const snap = await getDocs(query(collection(db, 'glazes'), orderBy('createdAt', 'desc')));
      setSourceGlazes(snap.docs.map((d) => ({ ...(d.data() as Glaze), id: d.id })));
    } catch (error) {
      alert('No se pudieron cargar las fichas del repositorio.');
      setPicking(false);
    }
  };

  const buildAreaPayload = (glaze: Glaze) => ({
    name: glaze.name,
    code: glaze.code,
    mainImage: glaze.mainImage,
    gallery: glaze.gallery,
    finish: glaze.finish,
    color: glaze.color,
    texture: glaze.texture,
    usage: glaze.usage,
    applicationMethod: glaze.applicationMethod,
    chemicalFamily: glaze.chemicalFamily,
    observations: glaze.observations,
    recipe: glaze.recipe,
    temperature: glaze.temperature,
    clayBody: glaze.clayBody,
    firingType: glaze.firingType,
    atmosphere: glaze.atmosphere,
    inventoryLevel: glaze.inventoryLevel,
    techSpecs: glaze.techSpecs,
    preparation: glaze.preparation,
    firingCurve: glaze.firingCurve,
    analysis: glaze.analysis,
    application: glaze.application,
    safety: glaze.safety,
    scope: 'recalculo',
    sourceGlazeId: glaze.id,
    sourceCode: glaze.code,
    authorId: profile?.uid ?? '',
    authorName: profile?.displayName ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const handleLoad = async (glaze: Glaze) => {
    if (!itemsPath) return;
    try {
      await addDoc(collection(db, itemsPath), buildAreaPayload(glaze));
      setPicking(false);
      setFlash({ text: `"${glaze.name}" cargada en el área de Recálculo`, key: Date.now() });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo cargar la ficha en el área.');
    }
  };

  const handleRecalcSave = async (result: RecalcResult) => {
    if (!itemsPath || !activeItem) return;
    const recipe = buildRecalculatedRecipe(result);
    setSaving(true);
    try {
      await setDoc(
        doc(db, itemsPath, activeItem.id),
        { recipe, updatedAt: serverTimestamp() },
        { merge: true },
      );
      try {
        await addDoc(collection(db, 'activity'), {
          type: 'recalc',
          glazeId: activeItem.id,
          name: activeItem.name,
          code: activeItem.code,
          area: true,
          byName: profile?.displayName ?? '',
          at: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error registrando actividad de recálculo:', error);
      }
      setFlash({ text: `"${activeItem.name}" recalculada y guardada en el área`, key: Date.now() });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo guardar la ficha recalculada.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async (item: RecItem, status: GlazeStatus) => {
    if (!itemsPath) return;
    const targetLabel = status === 'draft' ? 'borrador' : 'publicado';
    if (!window.confirm(`¿Publicar "${item.name}" como ${targetLabel}? Se moverá al repositorio principal.`)) return;
    setPublishingId(item.id);
    try {
      const { id, scope, sourceGlazeId, sourceCode, createdAt, updatedAt, ...rest } = item;
      const payload = {
        ...(sanitize(rest) as object),
        status,
        isValidated: status === 'published',
        authorId: profile?.uid ?? '',
        authorName: profile?.displayName ?? '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'glazes'), payload);
      await deleteDoc(doc(db, itemsPath, item.id));
      try {
        await addDoc(collection(db, 'activity'), {
          type: 'publish',
          glazeId: item.id,
          name: item.name,
          code: item.code,
          area: true,
          byName: profile?.displayName ?? '',
          at: serverTimestamp(),
        });
      } catch (error) {
        console.error('Error registrando actividad de publicación:', error);
      }
      setFlash({ text: `"${item.name}" publicada como ${targetLabel}`, key: Date.now() });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo publicar la ficha.');
    } finally {
      setPublishingId(null);
    }
  };

  const handleDelete = async (item: RecItem) => {
    if (!itemsPath) return;
    if (!window.confirm(`¿Eliminar "${item.name}" del área de Recálculo?`)) return;
    try {
      await deleteDoc(doc(db, itemsPath, item.id));
      setFlash({ text: `"${item.name}" eliminada del área`, key: Date.now() });
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No se pudo eliminar la ficha.');
    }
  };

  const filteredGlazes = sourceGlazes.filter((g) =>
    matchesSearch(pickerSearch, g.name, g.code, g.color)
  );

  const actionButtonClass =
    'flex items-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-bold uppercase tracking-wide transition-all';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Área de Recálculo</h3>
          <p className="text-xs text-[#636E72]">
            Las fichas que cargues se guardan aquí, fuera del repositorio, hasta que las publiques como borrador o
            publicado.
          </p>
        </div>
        <button
          onClick={openPicker}
          className="flex items-center justify-center gap-2 rounded-xl bg-[#8a168a] px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-[#7a127a]"
        >
          <PlusCircle size={18} />
          Cargar nueva ficha
        </button>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Spinner size={24} className="animate-spin text-[#8a168a]" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex min-h-[40vh] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#E4E4E2] bg-white p-10 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#FBF7FA]">
            <Calculator size={32} className="text-[#8a168a]" />
          </div>
          <h3 className="mt-6 text-xl font-semibold tracking-tight text-[#2D3436]">El área está vacía</h3>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-[#636E72]">
            Carga una ficha del repositorio, normaliza su receta con el botón "Recálculo" y guárdala aquí. Solo al
            publicarla pasará al repositorio principal.
          </p>
          <button
            onClick={openPicker}
            className="mt-6 flex items-center gap-2 rounded-xl bg-[#2D3436] px-6 py-3 text-sm font-medium text-white transition-all hover:bg-[#000]"
          >
            <PlusCircle size={18} />
            Cargar nueva ficha
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-[#E4E4E2] bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-[#2D3436]">{item.name}</p>
                    <span className="rounded-lg bg-[#F4F4F2] px-2 py-0.5 font-mono text-[10px] font-bold text-[#636E72]">
                      {item.code}
                    </span>
                    <span className="rounded-lg bg-[#FBF7FA] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8a168a]">
                      En recálculo
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#636E72]">
                    Origen: {item.sourceCode || '—'} · Actualizada {fmtDate(item.updatedAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setActiveItem(item)}
                    className={cn(actionButtonClass, 'bg-[#2D3436] text-white hover:bg-[#000]')}
                  >
                    <RefreshCcw size={13} />
                    Recálculo
                  </button>
                  <button
                    onClick={() => handlePublish(item, 'draft')}
                    disabled={publishingId === item.id}
                    className={cn(actionButtonClass, 'border border-[#E4E4E2] text-[#636E72] hover:bg-[#F7F7F5] hover:text-[#2D3436]')}
                  >
                    <Send size={13} />
                    Borrador
                  </button>
                  <button
                    onClick={() => handlePublish(item, 'published')}
                    disabled={publishingId === item.id}
                    className={cn(actionButtonClass, 'bg-emerald-600 text-white hover:bg-emerald-700')}
                  >
                    {publishingId === item.id ? <Spinner size={13} className="animate-spin" /> : <Send size={13} />}
                    Publicar
                  </button>
                  <button
                    onClick={() => handleDelete(item)}
                    className={cn(actionButtonClass, 'border border-[#E4E4E2] text-[#B2BEC3] hover:border-red-200 hover:text-red-500')}
                    aria-label="Eliminar"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <RecalculoModal
        open={!!activeItem}
        recipe={
          activeItem && activeItem.recipe
            ? ({ base: activeItem.recipe.base, additional: activeItem.recipe.additional } as RecalcRecipeInput)
            : { base: [], additional: [] }
        }
        onClose={() => setActiveItem(null)}
        onApply={handleRecalcSave}
        saving={saving}
      />

      <AnimatePresence>
        {picking && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex max-h-[80vh] w-full max-w-xl flex-col overflow-hidden rounded-[28px] bg-white shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-[#F4F4F2] px-6 py-4">
                <div>
                  <h3 className="text-lg font-semibold tracking-tight">Cargar nueva ficha</h3>
                  <p className="mt-0.5 text-xs text-[#85929E]">
                    Elige una ficha del repositorio para crear una copia normalizada en el área de Recálculo.
                  </p>
                </div>
                <button
                  onClick={() => setPicking(false)}
                  className="rounded-lg p-1.5 text-[#B2BEC3] hover:bg-[#F4F4F2] hover:text-[#2D3436]"
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="border-b border-[#F4F4F2] px-6 py-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a168a]" />
                  <input
                    type="text"
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                    placeholder="Buscar por nombre o código..."
                    className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                  />
                </div>
              </div>

              <div className="space-y-1 overflow-y-auto px-3 py-2">
                {filteredGlazes.map((g) => (
                  <button
                    key={g.id}
                    onClick={() => handleLoad(g)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-all hover:bg-[#F7F7F5]"
                  >
                    <span className="truncate text-sm font-medium text-[#2D3436]">{g.name}</span>
                    <span className="shrink-0 font-mono text-xs font-bold text-[#636E72]">#{g.code}</span>
                  </button>
                ))}
                {filteredGlazes.length === 0 && (
                  <p className="py-8 text-center text-sm text-[#636E72]">Sin resultados.</p>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {flash && (
          <motion.div
            key={flash.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-[#2D3436] px-5 py-3 text-sm font-medium text-white shadow-xl"
          >
            <CheckCircle2 size={16} className="text-emerald-400" />
            {flash.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}