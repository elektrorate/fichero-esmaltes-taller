import { useState, useEffect, useMemo } from 'react';
import { auth, db } from '../lib/firebase';
import { collection, query, limit, orderBy, onSnapshot } from 'firebase/firestore';
import { Glaze, UserProfile } from '../types';
import { motion } from 'motion/react';
import { Database, Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: any, id?: string) => void;
  profile: UserProfile | null;
}

interface ActivityEvent {
  id: string;
  type: 'edit' | 'recalc' | 'publish';
  glazeId?: string;
  name: string;
  code?: string;
  area?: boolean;
  byName?: string;
  at: any;
}

const EDITION_LABELS: Record<ActivityEvent['type'], string> = {
  edit: 'Ficha modificada',
  recalc: 'Recalculada',
  publish: 'Publicada',
};

const getDateMs = (value: any): number => {
  if (!value) return 0;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const fmtShortDate = (value: any): string => {
  if (!value) return 'Reciente';
  try {
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return 'Reciente';
  }
};

type RecentItem = Glaze & { inRecalculoArea?: boolean };

export default function Dashboard({ onNavigate, profile }: DashboardProps) {
  const uid = profile?.uid ?? auth.currentUser?.uid ?? null;
  const [glazes, setGlazes] = useState<Glaze[]>([]);
  const [recalcItems, setRecalcItems] = useState<Glaze[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const glazesRef = collection(db, 'glazes');
    const unsubscribe = onSnapshot(glazesRef, (snapshot) => {
      setGlazes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Glaze)));
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'activity'), orderBy('at', 'desc'), limit(15)),
      (snapshot) => {
        setActivity(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityEvent)));
      },
      (error) => {
        console.error('Error cargando historial de actividad:', error);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const itemRef = collection(db, `recalculos/${uid}/items`);
    const unsubscribe = onSnapshot(
      query(itemRef, orderBy('updatedAt', 'desc')),
      (snapshot) => {
        setRecalcItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Glaze)));
      },
      (error) => {
        console.error('Error cargando área de recálculo en dashboard:', error);
      },
    );
    return () => unsubscribe();
  }, [uid]);

  const stats = useMemo(() => ({
    total: glazes.length,
    pending: glazes.filter(g => g.status === 'pending').length,
    validated: glazes.filter(g => g.status === 'validated').length,
    lowInventory: glazes.filter(g => g.inventoryLevel !== undefined && g.inventoryLevel <= 25)
  }), [glazes]);

  const derivedRecent: RecentItem[] = useMemo(() => {
    const repos = glazes.map(g => ({ ...g } as RecentItem));
    const area = recalcItems.map(g => ({ ...g, inRecalculoArea: true } as RecentItem));
    return [...repos, ...area]
      .sort((a, b) => getDateMs(b.updatedAt || b.createdAt) - getDateMs(a.updatedAt || a.createdAt))
      .slice(0, 8);
  }, [glazes, recalcItems]);

  const cards = [
    { label: 'Total Esmaltes', value: stats.total, icon: Database, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'En Recálculo', value: recalcItems.length, icon: Clock, color: 'text-purple-500', bg: 'bg-purple-50' },
    { label: 'Pendientes', value: stats.pending, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Formulados', value: stats.validated, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  ];

  const badgeToneClass: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700',
    purple: 'bg-[#FBF7FA] text-[#8a168a]',
    amber: 'bg-amber-100 text-amber-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  const historyRows = useMemo(() => {
    if (activity.length > 0) {
      // Historial real de actividad: cada guardado genera un evento con su marca de tiempo.
      return activity.slice(0, 10).map((ev) => ({
        key: `act-${ev.id}`,
        name: ev.name,
        subtitle: ev.code ? `#${ev.code}` : '',
        badge: {
          label: EDITION_LABELS[ev.type] || ev.type,
          tone: ev.type === 'publish' ? 'emerald' : ev.type === 'recalc' ? 'purple' : ev.type === 'edit' ? 'gray' : 'gray',
        },
        date: fmtShortDate(ev.at),
        imgSeed: ev.glazeId || ev.id,
        onOpen: () => {
          if (ev.type === 'recalc') onNavigate('recalculo');
          else if (ev.glazeId) onNavigate('detail', ev.glazeId);
        },
      }));
    }
    // Respaldo: derivado del campo updatedAt de repositorio y área de recálculo.
    return derivedRecent.map((g) => ({
      key: `derived-${g.id}`,
      name: g.name,
      subtitle: `${g.code || ''}${g.color ? ' • ' + g.color : ''}`,
      badge: g.inRecalculoArea
        ? { label: 'En recálculo', tone: 'purple' }
        : {
            label: g.status,
            tone: g.status === 'published' ? 'emerald' : g.status === 'pending' ? 'amber' : 'gray',
          },
      date: fmtShortDate(g.updatedAt || g.createdAt),
      imgSeed: g.id || 'x',
      onOpen: () => (g.inRecalculoArea ? onNavigate('recalculo') : g.id ? onNavigate('detail', g.id) : undefined),
    }));
  }, [activity, derivedRecent, onNavigate]);

  return (
    <div className="space-y-8">
      {stats.lowInventory.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] bg-red-50 border border-red-100 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
        >
          <div className="flex items-start md:items-center gap-4">
            <div className="rounded-full bg-red-100 p-3 text-red-600 shrink-0">
              <AlertCircle size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-red-900 tracking-tight">Alerta de Inventario Crítico</h3>
              <p className="text-sm text-red-700 mt-1">
                Existen {stats.lowInventory.length} {stats.lowInventory.length === 1 ? 'materia prima' : 'materias primas'} con existencias al 25% o menos. Requieren reabastecimiento pronto.
              </p>
            </div>
          </div>
          <button 
            onClick={() => onNavigate('inventory-alerts')}
            className="shrink-0 rounded-xl bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-red-700 transition"
          >
            Revisar Inventario
          </button>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-[24px] bg-white p-6 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className={card.bg + " rounded-xl p-2.5"}>
                <card.icon className={card.color} size={20} />
              </div>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-[#636E72]">{card.label}</p>
              <h4 className="mt-1 text-2xl font-semibold tracking-tight">{card.value}</h4>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-[24px] bg-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold tracking-tight">Últimas Fichas Modificadas</h3>
            <div className="mt-6 space-y-4">
              {historyRows.length > 0 ? historyRows.map((row) => (
                <div 
                  key={row.key} 
                  onClick={() => row.onOpen?.()}
                  className="group flex cursor-pointer items-center gap-4 rounded-2xl p-3 transition-all hover:bg-[#F7F7F5]"
                >
                  <img 
                    src={`https://picsum.photos/seed/${row.imgSeed}/80/80`} 
                    className="h-14 w-14 rounded-xl object-cover" 
                    alt={row.name} 
                  />
                  <div className="flex-1 min-w-0">
                    <h5 className="text-sm font-semibold truncate">{row.name}</h5>
                    <p className="text-xs text-[#636E72] truncate">{row.subtitle}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeToneClass[row.badge.tone]}`}>
                      {row.badge.label}
                    </span>
                    <p className="mt-1 text-[10px] text-[#B2BEC3]">{row.date}</p>
                  </div>
                </div>
              )) : (
                <p className="text-center text-sm text-[#636E72] py-10">No hay actividad registrada aún.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[24px] bg-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold tracking-tight">Distribución</h3>
            <div className="mt-6 space-y-4">
              {['Brillante', 'Mate', 'Satinado'].map(cat => (
                <div key={cat} className="space-y-2">
                  <div className="flex justify-between text-xs font-medium">
                    <span>{cat}</span>
                    <span>{Math.floor(Math.random() * 40 + 10)}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-[#F4F4F2]">
                    <div className="h-full rounded-full bg-[#2D3436]" style={{ width: `${Math.floor(Math.random() * 40 + 10)}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
