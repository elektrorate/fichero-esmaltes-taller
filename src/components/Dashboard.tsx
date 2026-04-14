import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, limit, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { Glaze } from '../types';
import { motion } from 'motion/react';
import { Database, Clock, CheckCircle, AlertCircle, TrendingUp } from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: any, id?: string) => void;
}

export default function Dashboard({ onNavigate }: DashboardProps) {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    validated: 0,
    recent: [] as Glaze[]
  });

  useEffect(() => {
    const glazesRef = collection(db, 'glazes');
    
    // Real-time stats
    const unsubscribe = onSnapshot(glazesRef, (snapshot) => {
      const glazes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Glaze));
      setStats({
        total: glazes.length,
        pending: glazes.filter(g => g.status === 'pending').length,
        validated: glazes.filter(g => g.status === 'validated' || g.status === 'published').length,
        recent: glazes.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5)
      });
    });

    return () => unsubscribe();
  }, []);

  const cards = [
    { label: 'Total Esmaltes', value: stats.total, icon: Database, color: 'text-blue-500', bg: 'bg-blue-50' },
    { label: 'Pendientes', value: stats.pending, icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50' },
    { label: 'Validados', value: stats.validated, icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
    { label: 'Actividad', value: '+12%', icon: TrendingUp, color: 'text-purple-500', bg: 'bg-purple-50' },
  ];

  return (
    <div className="space-y-8">
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
            <h3 className="text-lg font-semibold tracking-tight">Últimas Fichas</h3>
            <div className="mt-6 space-y-4">
              {stats.recent.length > 0 ? stats.recent.map((glaze) => (
                <div 
                  key={glaze.id} 
                  onClick={() => onNavigate('detail', glaze.id)}
                  className="group flex cursor-pointer items-center gap-4 rounded-2xl p-3 transition-all hover:bg-[#F7F7F5]"
                >
                  <img 
                    src={glaze.mainImage || `https://picsum.photos/seed/${glaze.id}/80/80`} 
                    className="h-14 w-14 rounded-xl object-cover" 
                    alt={glaze.name} 
                  />
                  <div className="flex-1">
                    <h5 className="text-sm font-semibold">{glaze.name}</h5>
                    <p className="text-xs text-[#636E72]">{glaze.code} • {glaze.color}</p>
                  </div>
                  <div className="text-right">
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      glaze.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 
                      glaze.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {glaze.status}
                    </span>
                    <p className="mt-1 text-[10px] text-[#B2BEC3]">
                      {glaze.createdAt?.toDate ? glaze.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                    </p>
                  </div>
                </div>
              )) : (
                <p className="text-center text-sm text-[#636E72] py-10">No hay esmaltes registrados aún.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[24px] bg-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold tracking-tight">Distribución</h3>
            <div className="mt-6 space-y-4">
              {/* Placeholder for a chart or simple list */}
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
