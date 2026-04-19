import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';
import { Boxes, PackageSearch, Search, SlidersHorizontal } from 'lucide-react';
import { db } from '../lib/firebase';
import { Glaze } from '../types';
import { cn } from '../lib/utils';

type InventoryFilter = 'all' | 'high' | 'medium' | 'low';

const INVENTORY_STEPS = [0, 25, 50, 75, 100];

export default function SettingsPanel() {
  const [glazes, setGlazes] = useState<Glaze[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<InventoryFilter>('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'glazes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlazes(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() } as Glaze)));
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const updateInventory = async (id: string, level: number) => {
    try {
      await updateDoc(doc(db, 'glazes', id), {
        inventoryLevel: level,
      });
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  const getInventoryTone = (level?: number) => {
    if (level === undefined) {
      return {
        badge: 'bg-slate-200 text-slate-600',
        bar: 'bg-slate-400',
      };
    }

    if (level <= 25) {
      return {
        badge: 'bg-red-100 text-red-600',
        bar: 'bg-red-500',
      };
    }

    if (level <= 50) {
      return {
        badge: 'bg-slate-200 text-slate-700',
        bar: 'bg-slate-500',
      };
    }

    return {
      badge: 'bg-emerald-100 text-emerald-600',
      bar: 'bg-emerald-500',
    };
  };

  const filteredGlazes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return glazes.filter((glaze) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        glaze.name.toLowerCase().includes(normalizedQuery) ||
        glaze.code.toLowerCase().includes(normalizedQuery);

      const level = glaze.inventoryLevel;
      const matchesFilter =
        activeFilter === 'all' ||
        (activeFilter === 'high' && level !== undefined && level > 50) ||
        (activeFilter === 'medium' && level !== undefined && level > 25 && level <= 50) ||
        (activeFilter === 'low' && (level === undefined || level <= 25));

      return matchesQuery && matchesFilter;
    });
  }, [activeFilter, glazes, searchQuery]);

  if (loading) {
    return <div className="py-20 text-center text-[#636E72]">Cargando inventario...</div>;
  }

  return (
    <div className="space-y-4 bg-[#F5F5F5]">
      <section className="rounded-[20px] border border-white/70 bg-[#F1F1F1] px-5 py-5 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-white p-3 text-[#2D3436] shadow-sm">
            <Boxes size={22} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold tracking-tight text-[#1F2933]">
              Configuración de Inventario
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-[#66707A]">
              Ajusta y revisa tus niveles de stock para mantener el taller siempre abastecido.
            </p>
          </div>
        </div>
      </section>

      <section className="sticky top-0 z-[5] -mx-1 rounded-[20px] bg-[#F5F5F5]/95 px-1 py-1 backdrop-blur">
        <div className="flex items-center gap-3">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2AD]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search glazes..."
              className="h-12 w-full rounded-xl border border-[#E3E7EB] bg-white pl-11 pr-4 text-sm text-[#1F2933] outline-none transition-all focus:border-[#2D3436] focus:shadow-[0_0_0_3px_rgba(45,52,54,0.08)]"
            />
          </label>

          <button
            type="button"
            onClick={() => setIsFilterOpen((prev) => !prev)}
            className={cn(
              'flex h-12 w-12 items-center justify-center rounded-xl border transition-all',
              isFilterOpen || activeFilter !== 'all'
                ? 'border-[#2D3436] bg-[#EEF1F2] text-[#2D3436]'
                : 'border-[#E3E7EB] bg-white text-[#67727D]'
            )}
            aria-label="Filtrar inventario"
          >
            <SlidersHorizontal size={18} />
          </button>
        </div>

        {isFilterOpen && (
          <div className="mt-3 flex flex-wrap gap-2 rounded-2xl bg-white p-3 shadow-[0_12px_24px_rgba(15,23,42,0.08)]">
            {[
              { key: 'all', label: 'Todos' },
              { key: 'high', label: 'Alto' },
              { key: 'medium', label: 'Medio' },
              { key: 'low', label: 'Bajo' },
            ].map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setActiveFilter(option.key as InventoryFilter)}
                className={cn(
                  'rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide transition-all',
                  activeFilter === option.key
                    ? 'bg-[#2D3436] text-white'
                    : 'border border-[#E3E7EB] bg-[#F8F9FA] text-[#5E6973]'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        {filteredGlazes.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center shadow-[0_8px_24px_rgba(15,23,42,0.05)]">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F2F4F5] text-[#83909B]">
              <PackageSearch size={20} />
            </div>
            <p className="text-sm font-medium text-[#4F5B66]">No encontramos esmaltes con ese criterio.</p>
          </div>
        ) : (
          filteredGlazes.map((glaze) => {
            const level = glaze.inventoryLevel ?? 0;
            const tone = getInventoryTone(glaze.inventoryLevel);

            return (
              <article
                key={glaze.id}
                className="rounded-2xl bg-white p-4 shadow-[0_8px_24px_rgba(15,23,42,0.05)]"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={glaze.mainImage || `https://picsum.photos/seed/${glaze.id}/96/96`}
                    alt={glaze.name}
                    referrerPolicy="no-referrer"
                    className="h-16 w-16 rounded-lg object-cover"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold leading-tight text-[#1F2933]">
                          {glaze.name}
                        </h3>
                        <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[#9AA4AE]">
                          #{glaze.code}
                        </p>
                      </div>

                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
                          tone.badge
                        )}
                      >
                        {glaze.inventoryLevel === undefined ? 'Sin datos' : `${glaze.inventoryLevel}%`}
                      </span>
                    </div>

                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#E8ECEF]">
                      <div
                        className={cn('h-full rounded-full transition-[width] duration-300 ease-out', tone.bar)}
                        style={{ width: `${Math.max(0, Math.min(level, 100))}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9AA4AE]">
                    Adjust level
                  </p>

                  <div className="mt-3 grid grid-cols-5 gap-2">
                    {INVENTORY_STEPS.map((step) => {
                      const isActive = glaze.inventoryLevel === step;

                      return (
                        <button
                          key={step}
                          type="button"
                          onClick={() => updateInventory(glaze.id!, step)}
                          className={cn(
                            'rounded-lg border px-0 py-2 text-xs font-semibold transition-all active:scale-[0.98]',
                            isActive
                              ? 'border-[#2D3436] bg-[#2D3436] text-white shadow-sm'
                              : 'border-[#E3E7EB] bg-[#F7F8F9] text-[#596570]'
                          )}
                        >
                          {step}%
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
