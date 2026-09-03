import { useState, useEffect } from 'react';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, collection, addDoc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Glaze, Comment, UserProfile } from '../types';
import { STATUS_LABELS } from '../constants';
import { generateGlazePDF } from '../lib/pdfUtils';
import { motion } from 'motion/react';
import { ArrowLeft, Edit2, Share2, Printer, MessageSquare, User, Calendar, Tag, Thermometer, FlaskConical, Download, Loader2 } from 'lucide-react';
import { cn } from '../lib/utils';

interface GlazeDetailProps {
  id: string;
  profile?: UserProfile | null;
  onEdit: () => void;
  onBack: () => void;
}

export default function GlazeDetail({ id, profile = null, onEdit, onBack }: GlazeDetailProps) {
  const [glaze, setGlaze] = useState<Glaze | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [activeImage, setActiveImage] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribeGlaze = onSnapshot(doc(db, 'glazes', id), (doc) => {
      if (doc.exists()) {
        setGlaze({ id: doc.id, ...doc.data() } as Glaze);
      }
      setLoading(false);
    });

    const q = query(collection(db, 'glazes', id, 'comments'), orderBy('createdAt', 'asc'));
    const unsubscribeComments = onSnapshot(q, (snapshot) => {
      setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Comment)));
    });

    return () => {
      unsubscribeGlaze();
      unsubscribeComments();
    };
  }, [id]);

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    try {
      await addDoc(collection(db, 'glazes', id, 'comments'), {
        glazeId: id,
        authorId: auth.currentUser?.uid,
        authorName: auth.currentUser?.displayName || 'Anónimo',
        text: newComment,
        createdAt: serverTimestamp()
      });
      setNewComment('');
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleExportPDF = async () => {
    if (!glaze) return;
    setIsExporting(true);
    try {
      await generateGlazePDF(glaze);
    } catch (error) {
      console.error('Error exporting PDF:', error);
    } finally {
      setIsExporting(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-[#636E72]">Cargando ficha técnica...</div>;
  if (!glaze) return <div className="py-20 text-center text-[#636E72]">Ficha no encontrada.</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-sm font-medium text-[#636E72] hover:text-[#2D3436]">
          <ArrowLeft size={18} />
          Volver al repositorio
        </button>
        <div className="flex gap-3">
          {profile?.role === 'admin' && (
            <button 
              onClick={handleExportPDF}
              disabled={isExporting}
              className="flex items-center gap-2 rounded-xl border border-[#E4E4E2] px-4 py-2 text-sm font-medium text-[#636E72] hover:bg-white disabled:opacity-70"
              title="Exportar PDF"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Descargando...
                </>
              ) : (
                <>
                  <Download size={18} />
                  PDF
                </>
              )}
            </button>
          )}
          {profile?.role === 'admin' && (
            <button className="rounded-xl border border-[#E4E4E2] p-2.5 text-[#636E72] hover:bg-white">
              <Printer size={18} />
            </button>
          )}
          <button className="rounded-xl border border-[#E4E4E2] p-2.5 text-[#636E72] hover:bg-white">
            <Share2 size={18} />
          </button>
          <button onClick={onEdit} className="flex items-center gap-2 rounded-xl bg-[#2D3436] px-6 py-2.5 text-sm font-medium text-white hover:bg-black">
            <Edit2 size={18} />
            Editar Ficha
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-[auto_1fr]">
        {/* Left Column: Photo */}
        <div className="space-y-6">
          <div className="overflow-hidden rounded-[32px] bg-white shadow-sm max-w-[70%]">
            <img 
              src={activeImage || glaze.mainImage || `https://picsum.photos/seed/${glaze.id}/800/600`} 
              className="w-full aspect-[8/10] object-cover transition-all duration-300" 
              alt={glaze.name} 
              referrerPolicy="no-referrer"
            />
            {((glaze.mainImage ? 1 : 0) + (glaze.gallery?.length || 0)) > 1 && (
              <div className="flex gap-3 overflow-x-auto border-t border-[#F4F4F2] p-4">
                {[glaze.mainImage, ...(glaze.gallery || [])].filter(Boolean).map((img, idx) => (
                  <button 
                    key={idx}
                    onClick={() => setActiveImage(img as string)}
                    className={cn(
                      "h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 transition-all",
                      (activeImage || glaze.mainImage) === img ? "border-[#2D3436] opacity-100" : "border-transparent opacity-60 hover:opacity-100"
                    )}
                  >
                    <img src={img as string} className="h-full w-full object-cover" alt="Thumbnail" referrerPolicy="no-referrer" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Name, Tech Data, Firing Details, Comments */}
        <div className="space-y-6">
          <div className="rounded-[32px] bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-3xl font-semibold tracking-tight">{glaze.name}</h1>
                <p className="mt-1 text-sm font-bold uppercase tracking-[0.2em] text-[#8a168a]">{glaze.code}</p>
              </div>
              <span className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-widest ${
                glaze.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 
                glaze.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {STATUS_LABELS[glaze.status]}
              </span>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Acabado</p>
                <p className="text-sm font-medium">{glaze.finish}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Color</p>
                <p className="text-sm font-medium">{glaze.color}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Textura</p>
                <p className="text-sm font-medium">{glaze.texture}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Uso</p>
                <p className="text-sm font-medium">
                  {glaze.usage && glaze.usage.length > 0 ? glaze.usage.join(', ') : 'No especificado'}
                </p>
              </div>
            </div>

            <div className="mt-6 border-t border-[#F4F4F2] pt-6 grid grid-cols-3 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Thermometer size={12} className="text-[#8a168a]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Temperatura</p>
                </div>
                <p className="text-sm font-medium">{glaze.temperature || 'No especificada'}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <FlaskConical size={12} className="text-[#8a168a]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Atmósfera</p>
                </div>
                <p className="text-sm font-medium">{glaze.atmosphere || 'Oxidación'}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Tag size={12} className="text-[#8a168a]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Pasta</p>
                </div>
                <p className="text-sm font-medium">{glaze.clayBody || 'Gres / Porcelana'}</p>
              </div>
            </div>

            <div className="mt-6 border-t border-[#F4F4F2] pt-6 grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <User size={12} className="text-[#8a168a]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Autor</p>
                </div>
                <p className="text-sm font-medium">{glaze.authorName}</p>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-[#8a168a]" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">Creado</p>
                </div>
                <p className="text-sm font-medium">
                  {glaze.createdAt?.toDate ? glaze.createdAt.toDate().toLocaleDateString() : 'Reciente'}
                </p>
              </div>
            </div>
          </div>

          {/* Comments Section */}
          <div className="rounded-[32px] bg-white p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <MessageSquare size={18} className="text-[#2D3436]" />
              <h4 className="text-sm font-bold uppercase tracking-widest">Comentarios Internos</h4>
            </div>
            
            <div className="max-h-[300px] overflow-y-auto space-y-4 pr-2">
              {comments.map((comment) => (
                <div key={comment.id} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#2D3436]">{comment.authorName}</span>
                    <span className="text-[9px] text-[#8a168a]">
                      {comment.createdAt?.toDate ? comment.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ahora'}
                    </span>
                  </div>
                  <p className="rounded-2xl bg-[#F7F7F5] p-3 text-xs text-[#636E72]">{comment.text}</p>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="py-4 text-center text-xs text-[#8a168a]">No hay comentarios aún.</p>
              )}
            </div>

            <form onSubmit={handleAddComment} className="relative">
              <input 
                value={newComment}
                onChange={e => setNewComment(e.target.value)}
                placeholder="Escribe un comentario..."
                className="w-full rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 pr-12 text-xs outline-none focus:border-[#2D3436] focus:bg-white"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-[#2D3436] p-1.5 text-white hover:bg-black">
                <ChevronRight size={14} />
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Recipe & Observations - Side by Side */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Recipe Table */}
      <div className="rounded-[32px] bg-white p-8 shadow-sm">
        <div className="flex items-center justify-between border-b border-[#D5D0CC] pb-6">
          <h3 className="text-lg font-semibold tracking-tight">Fórmula Técnica</h3>
          <div className="flex gap-4 text-xs font-bold uppercase tracking-widest text-[#8a168a]">
            <span>Base: {glaze.recipe.totalBase}g</span>
          </div>
        </div>

        <div className="mt-8 space-y-10">
          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Composición Base</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D5D0CC] text-left text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                  <th className="pb-3">Material</th>
                  <th className="pb-3 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5D0CC]">
                {glaze.recipe.base.map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 font-medium">{item.material}</td>
                    <td className="py-3 text-right font-mono">{item.amount.toFixed(1)}</td>
                  </tr>
                ))}
                <tr className="bg-[#F7F7F5]/50">
                  <td className="py-3 font-bold">Total Base</td>
                  <td className="py-3 text-right font-bold font-mono">
                    {glaze.recipe.base.reduce((acc, i) => acc + i.amount, 0).toFixed(1)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Adicionales</h4>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#D5D0CC] text-left text-[10px] font-bold uppercase tracking-widest text-[#8a168a]">
                  <th className="pb-3">Material</th>
                  <th className="pb-3 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D5D0CC]">
                {glaze.recipe.additional.map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 font-medium">{item.material}</td>
                    <td className="py-3 text-right font-mono">{item.amount.toFixed(1)}</td>
                  </tr>
                ))}
                {glaze.recipe.additional.length === 0 && (
                  <tr><td colSpan={2} className="py-4 text-center text-xs text-[#8a168a]">Sin adicionales</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Observations */}
      <div className="rounded-[32px] bg-white p-8 shadow-sm">
        <h3 className="text-lg font-semibold tracking-tight">Observaciones de Laboratorio</h3>
        <div className="mt-6 text-sm leading-relaxed text-[#636E72] whitespace-pre-wrap">
          {glaze.observations || "Sin observaciones adicionales registradas."}
        </div>
      </div>
      </div>
    </div>
  );
}

function ChevronRight({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>;
}
