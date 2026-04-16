import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Glaze } from '../types';
import { Settings, PackageSearch } from 'lucide-react';
import { cn } from '../lib/utils';

export default function SettingsPanel() {
  const [glazes, setGlazes] = useState<Glaze[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'glazes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setGlazes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Glaze)));
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const updateInventory = async (id: string, level: number) => {
    try {
      await updateDoc(doc(db, 'glazes', id), {
        inventoryLevel: level
      });
    } catch (error) {
      console.error('Error updating inventory:', error);
    }
  };

  const getInventoryColor = (level?: number) => {
    if (level === undefined) return 'text-[#B2BEC3] bg-gray-100'; // No data
    if (level <= 0) return 'text-red-700 bg-red-100';
    if (level <= 25) return 'text-amber-700 bg-amber-100';
    if (level <= 50) return 'text-yellow-700 bg-yellow-100';
    return 'text-emerald-700 bg-emerald-100';
  };

  if (loading) return <div className="py-20 text-center text-[#636E72]">Cargando inventario...</div>;

  return (
    <div className="space-y-8">
      <div className="rounded-[32px] bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#F4F4F2] p-3 text-[#2D3436]">
            <Settings size={24} />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Configuración e Inventario</h2>
            <p className="text-sm text-[#636E72]">Administra la existencia física de tus esmaltes.</p>
          </div>
        </div>
      </div>

      <div className="rounded-[32px] bg-white p-8 shadow-sm space-y-6">
        <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <PackageSearch size={20} />
          Niveles de Inventario
        </h3>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#F4F4F2] text-left text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">
                <th className="pb-4 pl-4">Esmalte</th>
                <th className="pb-4">Código</th>
                <th className="pb-4">Estado Actual</th>
                <th className="pb-4 text-right pr-4">Ajustar Nivel</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F2]">
              {glazes.map((glaze) => (
                <tr key={glaze.id} className="transition-all hover:bg-[#F7F7F5]/50">
                  <td className="py-4 pl-4 font-medium flex items-center gap-3">
                    <img 
                      src={glaze.mainImage || `https://picsum.photos/seed/${glaze.id}/40/40`} 
                      className="h-10 w-10 rounded-lg object-cover" 
                      alt="" 
                      referrerPolicy="no-referrer"
                    />
                    {glaze.name}
                  </td>
                  <td className="py-4 font-mono text-xs text-[#636E72]">{glaze.code}</td>
                  <td className="py-4">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider", getInventoryColor(glaze.inventoryLevel))}>
                      {glaze.inventoryLevel === undefined ? 'Sin datos' : `${glaze.inventoryLevel}%`}
                    </span>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => updateInventory(glaze.id!, 100)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-[#2D3436] hover:text-white", glaze.inventoryLevel === 100 ? "bg-[#2D3436] text-white border-transparent" : "border border-[#E4E4E2] bg-white")}>100%</button>
                      <button onClick={() => updateInventory(glaze.id!, 75)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-[#2D3436] hover:text-white", glaze.inventoryLevel === 75 ? "bg-[#2D3436] text-white border-transparent" : "border border-[#E4E4E2] bg-white")}>75%</button>
                      <button onClick={() => updateInventory(glaze.id!, 50)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-[#2D3436] hover:text-white", glaze.inventoryLevel === 50 ? "bg-[#2D3436] text-white border-transparent" : "border border-[#E4E4E2] bg-white")}>50%</button>
                      <button onClick={() => updateInventory(glaze.id!, 25)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-amber-600 hover:border-amber-600 hover:text-white", glaze.inventoryLevel === 25 ? "bg-amber-600 border-amber-600 text-white" : "border border-[#E4E4E2] bg-white")}>25%</button>
                      <button onClick={() => updateInventory(glaze.id!, 0)} className={cn("rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all hover:bg-red-600 hover:border-red-600 hover:text-white", glaze.inventoryLevel === 0 ? "bg-red-600 border-red-600 text-white" : "border border-[#E4E4E2] bg-white")}>0%</button>
                    </div>
                  </td>
                </tr>
              ))}
              {glazes.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-[#B2BEC3] text-sm">No hay esmaltes registrados todavía.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
