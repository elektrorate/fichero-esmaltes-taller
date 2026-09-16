import { useState, useEffect, useMemo } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, deleteDoc, getDoc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { Glaze, GlazeStatus, UserProfile } from '../types';
import { STATUS_LABELS, ORTON_CONES, matchesOrtonCone } from '../constants';
import { generateBulkPDF } from '../lib/pdfUtils';
import { motion, AnimatePresence } from 'motion/react';
import { Edit2, Eye, MoreVertical, Tag, FileDown, CheckSquare, Square, Download, X, Check, Loader2, Filter, RotateCcw, Trash2, Search } from 'lucide-react';
import { cn } from '../lib/utils';

const FILTER_OPTIONS = {
  colors: ['Blanco', 'Negro', 'Azul', 'Rojo', 'Amarillo', 'Verde', 'Naranja', 'Morado', 'Marrón', 'Gris', 'Transparente'],
  finishes: ['Brillante', 'Mate', 'Satinado', 'Metálico', 'Opaco', 'Translúcido', 'Transparente', 'Cristalino', 'Texturizado'],
  textures: ['Liso', 'Sedoso', 'Rugoso', 'Arenoso', 'Moteado', 'Craquelado', 'Lava / volcánico', 'Piel de naranja', 'Escurrido controlado'],
  usages: ['Apto para vajilla / food safe', 'Decorativo']
};

interface GlazeListProps {
  searchQuery?: string;
  activeFilters?: any;
  statusScope?: GlazeStatus[];
  highlightInventoryAlerts?: boolean;
  showStatusFilter?: boolean;
  showDraftCopies?: boolean;
  profile?: UserProfile | null;
  onSelect: (id: string, copyIndex?: number | null) => void;
  onEdit: (id: string, copyIndex?: number | null) => void;
}

type DisplayGlaze = Glaze & {
  displayId: string;
  parentId: string;
  copyIndex: number | null;
  isCopy: boolean;
};

const STATUS_BADGE_STYLES: Record<GlazeStatus, string> = {
  draft: 'bg-gray-900/80 text-white',
  pending: 'bg-amber-500/90 text-white',
  validated: 'bg-emerald-600/90 text-white',
  published: 'bg-emerald-700/90 text-white',
  archived: 'bg-red-600/90 text-white'
};

const isPublishedStatus = (status: GlazeStatus) => status === 'published';

const getSortableDate = (value: any) => {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

export default function GlazeList({
  searchQuery = '',
  activeFilters = {},
  statusScope,
  highlightInventoryAlerts = false,
  showStatusFilter = false,
  showDraftCopies = false,
  profile = null,
  onSelect,
  onEdit
}: GlazeListProps) {
  const [glazes, setGlazes] = useState<Glaze[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSendingToFormuladas, setIsSendingToFormuladas] = useState(false);

  const [filterColor, setFilterColor] = useState('');
  const [filterFinish, setFilterFinish] = useState('');
  const [filterTexture, setFilterTexture] = useState('');
  const [filterUsage, setFilterUsage] = useState('');
  const [filterTemperature, setFilterTemperature] = useState('');
  const [localSearch, setLocalSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<GlazeStatus | ''>('');

  useEffect(() => {
    const q = query(collection(db, 'glazes'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlazes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Glaze)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const hasActiveFilters = filterColor || filterFinish || filterTexture || filterUsage || filterTemperature || localSearch || filterStatus;

  const clearFilters = () => {
    setFilterColor('');
    setFilterFinish('');
    setFilterTexture('');
    setFilterUsage('');
    setFilterTemperature('');
    setLocalSearch('');
    setFilterStatus('');
  };

  const displayGlazes: DisplayGlaze[] = glazes.flatMap((glaze) => {
    if (!glaze.id) return [];

    const original: DisplayGlaze = {
      ...glaze,
      displayId: glaze.id,
      parentId: glaze.id,
      copyIndex: null,
      isCopy: false,
    };

    const copies = (glaze.copies || []).flatMap((copy, index) => {
      const isVisibleCatalogCopy = copy.status === 'published' || copy.status === 'validated';
      const isVisibleDraftCopy = showDraftCopies && (copy.status === 'draft' || copy.status === 'pending');
      if (!isVisibleCatalogCopy && !isVisibleDraftCopy) return [];

      return [{
        ...glaze,
        ...copy,
        id: glaze.id,
        copies: glaze.copies,
        displayId: `${glaze.id}-copy-${copy.copyId || index}`,
        parentId: glaze.id!,
        copyIndex: index,
        isCopy: true,
      } as DisplayGlaze];
    });

    return [original, ...copies];
  });

  const baseFilteredGlazes = displayGlazes.filter(glaze => {
    const effectiveQuery = (localSearch || searchQuery || '').toLowerCase();
    if (effectiveQuery) {
      const matchesName = glaze.name.toLowerCase().includes(effectiveQuery);
      const matchesCode = glaze.code?.toLowerCase().includes(effectiveQuery);
      if (!matchesName && !matchesCode) return false;
    }

    if (filterColor && glaze.color !== filterColor) return false;
    if (filterFinish && glaze.finish !== filterFinish) return false;
    if (filterTexture && glaze.texture !== filterTexture) return false;
    if (filterUsage && (!glaze.usage || !glaze.usage.includes(filterUsage))) return false;
    if (filterTemperature && !matchesOrtonCone(glaze.temperature, filterTemperature)) return false;

    if (showStatusFilter && filterStatus && glaze.status !== filterStatus) return false;

    if (statusScope && !(showStatusFilter && filterStatus) && !statusScope.includes(glaze.status)) return false;

    if (activeFilters.color && glaze.color !== activeFilters.color) return false;
    if (activeFilters.finish && glaze.finish !== activeFilters.finish) return false;
    if (activeFilters.texture && glaze.texture !== activeFilters.texture) return false;
    if (activeFilters.temperature && !matchesOrtonCone(glaze.temperature, String(activeFilters.temperature))) return false;
    if (activeFilters.chemicalFamily && glaze.chemicalFamily !== activeFilters.chemicalFamily) return false;
    if (activeFilters.status && glaze.status !== activeFilters.status) return false;

    return true;
  });

  const filteredGlazes = statusScope?.some(isPublishedStatus)
    ? Object.values(
        baseFilteredGlazes.reduce<Record<string, DisplayGlaze>>((officialByParent, glaze) => {
          if (!isPublishedStatus(glaze.status)) return officialByParent;
          const current = officialByParent[glaze.parentId];
          const currentDate = getSortableDate(current?.updatedAt || current?.createdAt);
          const nextDate = getSortableDate(glaze.updatedAt || glaze.createdAt);
          if (!current || nextDate >= currentDate) {
            officialByParent[glaze.parentId] = glaze;
          }
          return officialByParent;
        }, {})
      )
    : baseFilteredGlazes;
  const inventoryAlertThreshold = 25;
  const alertGlazes = filteredGlazes.filter(
    glaze => glaze.inventoryLevel !== undefined && glaze.inventoryLevel <= inventoryAlertThreshold
  );
  const regularGlazes = filteredGlazes.filter(
    glaze => glaze.inventoryLevel === undefined || glaze.inventoryLevel > inventoryAlertThreshold
  );

  // Ordena por fecha de última edición/guardado (más reciente primero) para que,
  // tras guardar una ficha, aparezca la primera en el listado.
  const byRecentFirst = (a: DisplayGlaze, b: DisplayGlaze) =>
    getSortableDate(b.updatedAt || b.createdAt) - getSortableDate(a.updatedAt || a.createdAt);
  const sortedAlertGlazes = [...alertGlazes].sort(byRecentFirst);
  const sortedRegularGlazes = [...regularGlazes].sort(byRecentFirst);
  const sortedFilteredGlazes = [...filteredGlazes].sort(byRecentFirst);

  const handleBulkExport = async () => {
    const selectedGlazes = filteredGlazes.filter(g => selectedIds.includes(g.displayId));
    if (selectedGlazes.length === 0) return;
    setIsExporting(true);
    try {
      await generateBulkPDF(selectedGlazes);
      setIsSelectionMode(false);
      setSelectedIds([]);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleBulkDelete = async () => {
    const targets = filteredGlazes.filter(g => selectedIds.includes(g.displayId));
    if (targets.length === 0) return;
    const confirmed = window.confirm(`¿Eliminar ${targets.length} ficha${targets.length === 1 ? '' : 's'}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      const originalTargets = targets.filter(g => !g.isCopy);
      const copyTargetsByParent = targets
        .filter(g => g.isCopy && g.copyIndex !== null && !originalTargets.some(original => original.parentId === g.parentId))
        .reduce<Record<string, number[]>>((groups, glaze) => {
          groups[glaze.parentId] = [...(groups[glaze.parentId] || []), glaze.copyIndex as number];
          return groups;
        }, {});

      await Promise.all(originalTargets.map(g => deleteDoc(doc(db, 'glazes', g.parentId))));
      await Promise.all(Object.entries(copyTargetsByParent).map(async ([parentId, copyIndexes]) => {
        const glazeRef = doc(db, 'glazes', parentId);
        const snapshot = await getDoc(glazeRef);
        if (!snapshot.exists()) return;

        const glaze = snapshot.data() as Glaze;
        const indexesToDelete = new Set(copyIndexes);
        const nextCopies = (glaze.copies || []).filter((_, index) => !indexesToDelete.has(index));
        await setDoc(glazeRef, {
          ...glaze,
          copies: nextCopies,
          updatedAt: serverTimestamp(),
        });
      }));
      setIsSelectionMode(false);
      setSelectedIds([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'glazes');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkSendToFormuladas = async () => {
    const targets = filteredGlazes.filter(g => selectedIds.includes(g.displayId));
    if (targets.length === 0) return;
    if (!auth.currentUser) {
      alert('Debes iniciar sesión para enviar fichas a Formuladas.');
      return;
    }
    setIsSendingToFormuladas(true);
    try {
      const uid = auth.currentUser.uid;
      await Promise.all(targets.map(async (glaze) => {
        await addDoc(collection(db, `formuladas/${uid}/items`), {
          ...glaze,
          id: undefined,
          copies: undefined,
          status: 'draft',
          isValidated: false,
          scope: 'formuladas',
          sourceGlazeId: glaze.parentId,
          sourceCode: glaze.code || 'FICHA',
          authorId: uid,
          authorName: auth.currentUser?.displayName || 'Anónimo',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }));
      setIsSelectionMode(false);
      setSelectedIds([]);
    } catch (error) {
      console.error('Error enviando a Formuladas:', error);
      handleFirestoreError(error, OperationType.CREATE, 'formuladas');
    } finally {
      setIsSendingToFormuladas(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-20 text-[#636E72]">Cargando repositorio...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setIsSelectionMode(!isSelectionMode);
              setSelectedIds([]);
            }}
            className={cn(
              "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all",
              isSelectionMode ? "bg-[#2D3436] text-white" : "border border-[#E4E4E2] text-[#636E72] hover:bg-white"
            )}
          >
            {isSelectionMode ? <X size={18} /> : <CheckSquare size={18} />}
            {isSelectionMode ? 'Cancelar Selección' : 'Seleccionar Varios'}
          </button>
          
          <AnimatePresence>
            {isSelectionMode && selectedIds.length > 0 && profile?.role === 'admin' && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={handleBulkExport}
                disabled={isExporting}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-70"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Descargando...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    Exportar PDF ({selectedIds.length})
                  </>
                )}
              </motion.button>
            )}
            {isSelectionMode && selectedIds.length > 0 && profile?.role === 'admin' && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={handleBulkSendToFormuladas}
                disabled={isSendingToFormuladas}
                className="flex items-center gap-2 rounded-xl bg-[#8a168a] px-4 py-2 text-sm font-medium text-white hover:bg-[#6d0f6d] disabled:opacity-70"
              >
                {isSendingToFormuladas ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Tag size={18} />
                    Enviar a Formuladas ({selectedIds.length})
                  </>
                )}
              </motion.button>
            )}
            {isSelectionMode && selectedIds.length > 0 && profile?.role === 'admin' && (
              <motion.button
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-70"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Eliminar ({selectedIds.length})
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
        
        {isSelectionMode && (
          <div className="flex gap-3">
            <button 
              onClick={() => setSelectedIds(filteredGlazes.map(g => g.displayId))}
              className="text-xs font-bold uppercase tracking-widest text-[#8a168a] hover:text-[#2D3436]"
            >
              Seleccionar Todos
            </button>
            <button 
              onClick={() => setSelectedIds([])}
              className="text-xs font-bold uppercase tracking-widest text-[#8a168a] hover:text-[#2D3436]"
            >
              Deseleccionar
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[#E4E4E2] bg-white p-4">
        <div className="flex items-center gap-2 text-[#8a168a]">
          <Filter size={16} />
          <span className="text-[11px] font-bold uppercase tracking-widest">Filtros</span>
        </div>
        {showStatusFilter && (
          <>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#98A2AD]" />
              <input
                type="text"
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                placeholder="Buscar por nombre o código..."
                className="w-56 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] py-2 pl-9 pr-3 text-xs font-medium outline-none transition focus:border-[#2D3436] focus:bg-white"
              />
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as GlazeStatus | '')}
              className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
            >
              <option value="">Estado</option>
              <option value="draft">Borrador</option>
              <option value="pending">Pendiente</option>
              <option value="validated">Formulado</option>
              <option value="published">Publicado</option>
            </select>
          </>
        )}
        <select
          value={filterColor}
          onChange={e => setFilterColor(e.target.value)}
          className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
        >
          <option value="">Color</option>
          {FILTER_OPTIONS.colors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={filterFinish}
          onChange={e => setFilterFinish(e.target.value)}
          className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
        >
          <option value="">Acabado</option>
          {FILTER_OPTIONS.finishes.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select
          value={filterTexture}
          onChange={e => setFilterTexture(e.target.value)}
          className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
        >
          <option value="">Textura</option>
          {FILTER_OPTIONS.textures.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select
          value={filterUsage}
          onChange={e => setFilterUsage(e.target.value)}
          className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
        >
          <option value="">Uso</option>
          {FILTER_OPTIONS.usages.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        <select
          value={filterTemperature}
          onChange={e => setFilterTemperature(e.target.value)}
          className="rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-xs font-medium outline-none focus:border-[#2D3436] focus:bg-white"
        >
          <option value="">Temperatura (Cono)</option>
          {ORTON_CONES.map(c => <option key={c.cone} value={c.cone}>Cono {c.cone} · {c.c150}°C</option>)}
        </select>
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-100"
          >
            <RotateCcw size={12} />
            Limpiar
          </button>
        )}
        {hasActiveFilters && (
          <span className="ml-auto text-[11px] font-medium text-[#636E72]">
            {filteredGlazes.length} resultado{filteredGlazes.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {filteredGlazes.length === 0 ? (
        <div className="col-span-full py-20 text-center text-[#636E72]">
          <p>No se encontraron esmaltes que coincidan con la búsqueda y filtros.</p>
        </div>
      ) : (
        <>
          {highlightInventoryAlerts && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-red-100 bg-red-50/80 p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-red-700">Productos en Alerta</h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-700">
                    {alertGlazes.length} producto{alertGlazes.length === 1 ? '' : 's'}
                  </span>
                </div>
                {alertGlazes.length === 0 && (
                  <p className="mt-3 text-sm text-red-700">No hay productos en alerta con los filtros actuales.</p>
                )}
              </div>
              {alertGlazes.length > 0 && (
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {sortedAlertGlazes.map((glaze, i) => (
                    <div key={glaze.displayId} className="rounded-[24px] ring-1 ring-red-100">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        onClick={() => isSelectionMode && toggleSelection(glaze.displayId)}
                        className={cn(
                          "group relative overflow-hidden rounded-[24px] bg-white shadow-sm transition-all hover:shadow-md",
                          isSelectionMode && "cursor-pointer ring-2 transition-all",
                          isSelectionMode && selectedIds.includes(glaze.displayId) ? "ring-[#2D3436]" : "ring-transparent"
                        )}
                      >
                        {isSelectionMode && (
                          <div className="absolute left-4 top-4 z-10">
                            {selectedIds.includes(glaze.displayId) ? (
                              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2D3436] text-white shadow-lg">
                                <Check size={14} />
                              </div>
                            ) : (
                              <div className="h-6 w-6 rounded-full border-2 border-white/50 bg-black/20 backdrop-blur-md" />
                            )}
                          </div>
                        )}
                        <div className="aspect-[4/3] overflow-hidden">
                          <img
                            src={glaze.mainImage || `https://picsum.photos/seed/${glaze.displayId}/400/300`}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                            alt={glaze.name}
                            referrerPolicy="no-referrer"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                          <span className={cn("absolute left-3 top-3 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm", STATUS_BADGE_STYLES[glaze.status])}>
                            {STATUS_LABELS[glaze.status]}
                          </span>
                          {!isSelectionMode && (
                            <div className="absolute bottom-4 left-4 right-4 flex translate-y-4 items-center justify-between opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                              <div className="flex gap-2">
                                <button onClick={(e) => { e.stopPropagation(); onSelect(glaze.parentId, glaze.copyIndex); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/40">
                                  <Eye size={18} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onEdit(glaze.parentId, glaze.copyIndex); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/40">
                                  <Edit2 size={18} />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-6">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-lg font-semibold tracking-tight">{glaze.name}</h4>
                              <p className="text-xs font-medium text-[#8a168a] uppercase tracking-widest mt-0.5">{glaze.code}</p>
                              {glaze.isCopy && (
                                <span className="mt-2 inline-flex rounded-full bg-[#8a168a]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                                  Copia {Number(glaze.copyIndex) + 1}
                                </span>
                              )}
                            </div>
                            {!isSelectionMode && (
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F7F7F5]">
                                <MoreVertical size={16} className="text-[#8a168a]" />
                              </div>
                            )}
                          </div>
                          <div className="mt-4 flex flex-wrap gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[10px] font-medium text-[#636E72]">
                              <Tag size={10} /> {glaze.finish}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[10px] font-medium text-[#636E72]">
                              <div className="h-2 w-2 rounded-full bg-blue-400" /> {glaze.color}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-700">
                              Inventario {glaze.inventoryLevel}%
                            </span>
                          </div>
                          <div className="mt-6 flex items-center justify-between border-t border-[#F4F4F2] pt-4">
                            <div className="flex items-center gap-2">
                              <div className="h-6 w-6 rounded-full bg-[#E4E4E2]" />
                              <span className="text-[11px] font-medium text-[#636E72]">{glaze.authorName}</span>
                            </div>
                            <span className="text-[11px] text-[#8a168a]">
                              {glaze.createdAt?.toDate ? glaze.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="space-y-3">
            {highlightInventoryAlerts && (
              <h3 className="text-sm font-semibold uppercase tracking-wider text-[#636E72]">Resto del Inventario</h3>
            )}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {(highlightInventoryAlerts ? sortedRegularGlazes : sortedFilteredGlazes).map((glaze, i) => (
          <motion.div
            key={glaze.displayId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => isSelectionMode && toggleSelection(glaze.displayId)}
            className={cn(
              "group relative overflow-hidden rounded-[24px] bg-white shadow-sm transition-all hover:shadow-md",
              isSelectionMode && "cursor-pointer ring-2 transition-all",
              isSelectionMode && selectedIds.includes(glaze.displayId) ? "ring-[#2D3436]" : "ring-transparent"
            )}
          >
            {isSelectionMode && (
              <div className="absolute left-4 top-4 z-10">
                {selectedIds.includes(glaze.displayId) ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2D3436] text-white shadow-lg">
                    <Check size={14} />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full border-2 border-white/50 bg-black/20 backdrop-blur-md" />
                )}
              </div>
            )}
            
            <div
              onClick={() => {
                if (!isSelectionMode) {
                  onSelect(glaze.parentId, glaze.copyIndex);
                }
              }}
              className={cn("aspect-[4/3] overflow-hidden", !isSelectionMode && "cursor-pointer")}
            >
              <img 
                src={glaze.mainImage || `https://picsum.photos/seed/${glaze.displayId}/400/300`} 
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" 
                alt={glaze.name} 
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
              <span className={cn("absolute left-3 top-3 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shadow-lg backdrop-blur-sm", STATUS_BADGE_STYLES[glaze.status])}>
                {STATUS_LABELS[glaze.status]}
              </span>
              
              {!isSelectionMode && (
                <div className="absolute bottom-4 left-4 right-4 flex translate-y-4 items-center justify-between opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onSelect(glaze.parentId, glaze.copyIndex); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/40"
                    >
                      <Eye size={18} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onEdit(glaze.parentId, glaze.copyIndex); }}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md hover:bg-white/40"
                    >
                      <Edit2 size={18} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="text-lg font-semibold tracking-tight">{glaze.name}</h4>
                  <p className="text-xs font-medium text-[#8a168a] uppercase tracking-widest mt-0.5">{glaze.code}</p>
                  {glaze.isCopy && (
                    <span className="mt-2 inline-flex rounded-full bg-[#8a168a]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                      Copia {Number(glaze.copyIndex) + 1}
                    </span>
                  )}
                </div>
                {!isSelectionMode && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[#F7F7F5]">
                    <MoreVertical size={16} className="text-[#8a168a]" />
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[10px] font-medium text-[#636E72]">
                  <Tag size={10} /> {glaze.finish}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#F4F4F2] px-2.5 py-1 text-[10px] font-medium text-[#636E72]">
                  <div className="h-2 w-2 rounded-full bg-blue-400" /> {glaze.color}
                </span>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-[#F4F4F2] pt-4">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-full bg-[#E4E4E2]" />
                  <span className="text-[11px] font-medium text-[#636E72]">{glaze.authorName}</span>
                </div>
                <span className="text-[11px] text-[#8a168a]">
                  {glaze.createdAt?.toDate ? glaze.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                </span>
              </div>
            </div>
          </motion.div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
