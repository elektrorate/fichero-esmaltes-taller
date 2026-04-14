import { useState, useEffect } from 'react';
import { db, OperationType, handleFirestoreError, auth } from '../lib/firebase';
import { collection, onSnapshot, updateDoc, doc, query, orderBy, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { UserProfile, UserRole, Glaze } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, UserCheck, UserX, Mail, ShieldCheck, UserPlus, X, Loader2, Check, Database } from 'lucide-react';
import { cn } from '../lib/utils';

export default function AdminPanel() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [invites, setInvites] = useState<{ email: string, role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', displayName: '', role: 'collaborator' as UserRole });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const qUsers = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
    });

    const qInvites = query(collection(db, 'invites'), orderBy('createdAt', 'desc'));
    const unsubscribeInvites = onSnapshot(qInvites, (snapshot) => {
      setInvites(snapshot.docs.map(doc => ({ email: doc.id, ...doc.data() } as any)));
      setLoading(false);
    });

    return () => {
      unsubscribeUsers();
      unsubscribeInvites();
    };
  }, []);

  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users');
    }
  };

  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    try {
      const email = newUser.email.toLowerCase().trim();
      const existingUser = users.find(u => u.email.toLowerCase() === email);
      
      if (existingUser) {
        await handleRoleChange(existingUser.uid, newUser.role);
        setMessage({ type: 'success', text: `Rol de ${existingUser.displayName} actualizado a ${newUser.role}.` });
        setTimeout(() => setIsAddModalOpen(false), 2000);
      } else {
        // Pre-authorize the email
        await setDoc(doc(db, 'invites', email), {
          email,
          role: newUser.role,
          createdAt: serverTimestamp()
        });
        setMessage({ type: 'success', text: `Email ${email} pre-autorizado como ${newUser.role}.` });
        setTimeout(() => setIsAddModalOpen(false), 2000);
      }
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Error al procesar la solicitud.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const seedExamples = async () => {
    setIsSubmitting(true);
    setMessage({ type: 'success', text: 'Generando recetas de ejemplo...' });
    try {
      const examples: Partial<Glaze>[] = [
        {
          name: 'Azul Cobalto Profundo',
          code: 'A-BR-FS-001',
          mainImage: 'https://picsum.photos/seed/cobalt-glaze/800/600',
          finish: 'Brillante',
          color: 'Azul',
          texture: 'Liso',
          usage: ['Apto para vajilla / food safe'],
          chemicalFamily: 'Feldespático',
          observations: 'Esmalte muy estable a 1240ºC. Ideal para piezas de uso diario.',
          status: 'published',
          recipe: {
            base: [
              { material: 'Feldespato Potásico', amount: 40 },
              { material: 'Cuarzo', amount: 30 },
              { material: 'Caolín', amount: 20 },
              { material: 'Carbonato de Calcio', amount: 10 }
            ],
            additional: [
              { material: 'Óxido de Cobalto', amount: 1.5 },
              { material: 'Bentonita', amount: 2 }
            ],
            totalBase: 100
          }
        },
        {
          name: 'Blanco Hueso Mate',
          code: 'B-MT-DC-002',
          mainImage: 'https://picsum.photos/seed/white-matte/800/600',
          finish: 'Mate',
          color: 'Blanco',
          texture: 'Sedoso',
          usage: ['Decorativo'],
          chemicalFamily: 'Magnesio',
          observations: 'Textura sedosa al tacto. No apto para ácidos fuertes.',
          status: 'published',
          recipe: {
            base: [
              { material: 'Nefelina Sienita', amount: 50 },
              { material: 'Talco', amount: 20 },
              { material: 'Caolín', amount: 15 },
              { material: 'Sílice', amount: 15 }
            ],
            additional: [
              { material: 'Óxido de Zinc', amount: 5 },
              { material: 'Dióxido de Titanio', amount: 3 }
            ],
            totalBase: 100
          }
        },
        {
          name: 'Verde Celadón Suave',
          code: 'V-ST-FS-003',
          mainImage: 'https://picsum.photos/seed/celadon/800/600',
          finish: 'Satinado',
          color: 'Verde',
          texture: 'Liso',
          usage: ['Apto para vajilla / food safe'],
          chemicalFamily: 'Cenizas',
          observations: 'Clásico celadón de reducción. En oxidación da un tono verde agua muy suave.',
          status: 'published',
          recipe: {
            base: [
              { material: 'Ceniza de Madera', amount: 40 },
              { material: 'Feldespato Sódico', amount: 30 },
              { material: 'Arcilla de Bola', amount: 30 }
            ],
            additional: [
              { material: 'Óxido de Hierro Rojo', amount: 0.8 }
            ],
            totalBase: 100
          }
        },
        {
          name: 'Rojo Sangre de Buey',
          code: 'R-OP-DC-004',
          mainImage: 'https://picsum.photos/seed/oxblood/800/600',
          finish: 'Opaco',
          color: 'Rojo',
          texture: 'Liso',
          usage: ['Decorativo'],
          chemicalFamily: 'Borosilicato',
          observations: 'Requiere curva de enfriamiento lenta para desarrollar el color rojo profundo.',
          status: 'published',
          recipe: {
            base: [
              { material: 'Frita de Boro', amount: 60 },
              { material: 'Cuarzo', amount: 20 },
              { material: 'Caolín', amount: 20 }
            ],
            additional: [
              { material: 'Óxido de Cobre', amount: 2 },
              { material: 'Carbonato de Bario', amount: 3 }
            ],
            totalBase: 100
          }
        },
        {
          name: 'Miel de Abeja Cristalino',
          code: 'Y-CR-FS-005',
          mainImage: 'https://picsum.photos/seed/honey-glaze/800/600',
          finish: 'Cristalino',
          color: 'Amarillo',
          texture: 'Liso',
          usage: ['Apto para vajilla / food safe'],
          chemicalFamily: 'Zinc',
          observations: 'Esmalte muy fluido. Usar platos de goteo.',
          status: 'published',
          recipe: {
            base: [
              { material: 'Frita Plúmbica', amount: 70 },
              { material: 'Sílice', amount: 20 },
              { material: 'Caolín', amount: 10 }
            ],
            additional: [
              { material: 'Óxido de Hierro Amarillo', amount: 4 },
              { material: 'Óxido de Zinc', amount: 2 }
            ],
            totalBase: 100
          }
        },
        {
          name: 'Cristalino Base Transparente',
          code: 'TR-BR-FS-006',
          mainImage: 'https://picsum.photos/seed/clear-glaze/800/600',
          finish: 'Brillante',
          color: 'Transparente',
          texture: 'Liso',
          usage: ['Apto para vajilla / food safe'],
          chemicalFamily: 'Borosilicato',
          observations: 'Base transparente universal para alta temperatura (Cono 6).',
          status: 'published',
          recipe: {
            base: [
              { material: 'Wollastonita', amount: 20 },
              { material: 'Frita Ferro 3134', amount: 20 },
              { material: 'Caolín EPK', amount: 20 },
              { material: 'Sílice 325', amount: 30 },
              { material: 'Gerstley Borate', amount: 10 }
            ],
            additional: [],
            totalBase: 100
          }
        }
      ];

      for (const example of examples) {
        await addDoc(collection(db, 'glazes'), {
          ...example,
          authorId: auth.currentUser?.uid,
          authorName: auth.currentUser?.displayName || 'Admin',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      setMessage({ type: 'success', text: '6 Recetas de ejemplo creadas con éxito.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Error al crear ejemplos.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) return <div className="py-20 text-center text-[#636E72]">Cargando gestión de usuarios...</div>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-[#2D3436]" />
          <h3 className="text-lg font-semibold tracking-tight">Gestión de Usuarios y Permisos</h3>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={seedExamples}
            disabled={isSubmitting}
            className="flex items-center gap-2 rounded-xl border border-[#E4E4E2] px-4 py-2 text-sm font-medium text-[#636E72] hover:bg-[#F7F7F5] transition-all disabled:opacity-50"
          >
            <Database size={18} />
            Cargar Ejemplos
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-[#2D3436] px-4 py-2 text-sm font-medium text-white hover:bg-black transition-all"
          >
            <UserPlus size={18} />
            Asignar Rol a Nuevo Email
          </button>
        </div>
      </div>

      <div className="rounded-[32px] bg-white p-8 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#F4F4F2] text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">
                <th className="pb-4 pl-4">Usuario</th>
                <th className="pb-4">Email</th>
                <th className="pb-4">Rol Actual</th>
                <th className="pb-4 text-right pr-4">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F4F4F2]">
              {users.map((user) => (
                <tr key={user.uid} className="group hover:bg-[#F7F7F5]">
                  <td className="py-4 pl-4">
                    <div className="flex items-center gap-3">
                      <img src={user.photoURL || `https://picsum.photos/seed/${user.uid}/40/40`} className="h-9 w-9 rounded-full object-cover" alt="" />
                      <span className="font-medium">{user.displayName}</span>
                    </div>
                  </td>
                  <td className="py-4 text-[#636E72]">{user.email}</td>
                  <td className="py-4">
                    <span className={cn(
                      "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                      user.role === 'admin' ? "bg-purple-100 text-purple-700" :
                      user.role === 'editor' ? "bg-blue-100 text-blue-700" :
                      user.role === 'reviewer' ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"
                    )}>
                      {user.role}
                    </span>
                  </td>
                  <td className="py-4 text-right pr-4">
                    <select 
                      value={user.role}
                      onChange={(e) => handleRoleChange(user.uid, e.target.value as UserRole)}
                      className="rounded-lg border border-[#E4E4E2] bg-white px-3 py-1.5 text-xs outline-none focus:border-[#2D3436]"
                    >
                      <option value="collaborator">Colaborador</option>
                      <option value="editor">Editor Técnico</option>
                      <option value="reviewer">Revisor</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {invites.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Mail className="text-[#B2BEC3]" />
            <h4 className="text-sm font-bold uppercase tracking-widest text-[#B2BEC3]">Invitaciones Pendientes</h4>
          </div>
          <div className="rounded-[32px] bg-white p-8 shadow-sm border border-dashed border-[#E4E4E2]">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">
                    <th className="pb-4 pl-4">Email</th>
                    <th className="pb-4">Rol Pre-asignado</th>
                    <th className="pb-4 text-right pr-4">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F4F4F2]">
                  {invites.map((invite) => (
                    <tr key={invite.email}>
                      <td className="py-4 pl-4 font-medium">{invite.email}</td>
                      <td className="py-4">
                        <span className="rounded-full bg-gray-100 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-700">
                          {invite.role}
                        </span>
                      </td>
                      <td className="py-4 text-right pr-4">
                        <span className="text-[10px] font-medium text-[#B2BEC3]">Esperando primer ingreso...</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-[32px] bg-white p-8 shadow-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-xl font-semibold">Asignar Rol</h4>
                <button onClick={() => setIsAddModalOpen(false)} className="text-[#B2BEC3] hover:text-[#2D3436]">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-6">
                {message && (
                  <div className={cn(
                    "rounded-xl p-4 text-xs font-medium text-center",
                    message.type === 'success' ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {message.text}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Email del Usuario</label>
                  <input 
                    required
                    type="email"
                    value={newUser.email}
                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                    className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                    placeholder="ejemplo@correo.com"
                  />
                  <p className="text-[10px] text-[#636E72]">Si el usuario no ha ingresado nunca, se le asignará este rol al entrar.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Rol a Asignar</label>
                  <select 
                    value={newUser.role}
                    onChange={e => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                    className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                  >
                    <option value="collaborator">Colaborador</option>
                    <option value="editor">Editor Técnico</option>
                    <option value="reviewer">Revisor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>

                <button 
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#2D3436] py-3.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check size={18} />}
                  Actualizar Permisos
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="rounded-[32px] bg-[#2D3436] p-8 text-white shadow-sm">
          <h4 className="text-sm font-bold uppercase tracking-widest opacity-60">Roles y Permisos</h4>
          <div className="mt-6 space-y-4 text-xs leading-relaxed opacity-90">
            <p><strong>Administrador:</strong> Control total del sistema y usuarios.</p>
            <p><strong>Editor Técnico:</strong> Puede crear y editar cualquier ficha técnica.</p>
            <p><strong>Revisor:</strong> Valida fichas y añade comentarios técnicos.</p>
            <p><strong>Colaborador:</strong> Crea fichas propias y edita sus borradores.</p>
          </div>
        </div>
        <div className="rounded-[32px] bg-white p-8 shadow-sm border border-[#E4E4E2]">
          <h4 className="text-sm font-bold uppercase tracking-widest text-[#B2BEC3]">Seguridad del Taller</h4>
          <p className="mt-4 text-xs text-[#636E72] leading-relaxed">
            Los cambios de rol son instantáneos. Asegúrate de validar la identidad de los colaboradores antes de asignar permisos de edición global.
          </p>
        </div>
      </div>
    </div>
  );
}
