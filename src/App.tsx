import { useState, useEffect } from 'react';
import { auth, db, googleProvider, OperationType, handleFirestoreError } from './lib/firebase';
import { onAuthStateChanged, signInWithPopup, signOut, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { UserProfile, UserRole } from './types';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Database, 
  PlusCircle, 
  Users, 
  Settings, 
  LogOut, 
  Search, 
  Filter, 
  ChevronRight,
  Menu,
  X,
  Loader2
} from 'lucide-react';
import { cn } from './lib/utils';

// Components
import Dashboard from './components/Dashboard';
import GlazeList from './components/GlazeList';
import GlazeForm from './components/GlazeForm';
import GlazeDetail from './components/GlazeDetail';
import AdminPanel from './components/AdminPanel';
import SettingsPanel from './components/SettingsPanel';

export interface GlazeFilters {
  color?: string;
  finish?: string;
  texture?: string;
  chemicalFamily?: string;
  status?: string;
}

const FILTER_OPTIONS = {
  colors: ['Blanco', 'Negro', 'Azul', 'Rojo', 'Amarillo', 'Verde', 'Naranja', 'Morado', 'Marrón', 'Gris', 'Transparente'],
  finishes: ['Brillante', 'Mate', 'Satinado', 'Metálico', 'Opaco', 'Translúcido', 'Transparente', 'Cristalino', 'Texturizado'],
  textures: ['Liso', 'Sedoso', 'Rugoso', 'Arenoso', 'Moteado', 'Craquelado', 'Lava / volcánico', 'Piel de naranja', 'Escurrido controlado'],
  families: ['Borosilicato', 'Feldespático', 'Litio', 'Zinc', 'Magnesio', 'Cenizas', 'Alta alúmina', 'Baja expansión'],
  statuses: [{ value: 'published', label: 'Validado / Publicado' }, { value: 'pending', label: 'En Pruebas' }, { value: 'draft', label: 'Borrador' }]
};

type View = 'dashboard' | 'repository' | 'create' | 'detail' | 'admin' | 'settings' | 'inventory-alerts';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedGlazeId, setSelectedGlazeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<GlazeFilters>({});
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);

  const [loginError, setLoginError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          const email = firebaseUser.email?.toLowerCase();
          const isAdminEmail = email === 'erick@kgbycia.com';

          if (userDoc.exists()) {
            const existingProfile = userDoc.data() as UserProfile;
            // Force admin role if email matches, even if it was changed in DB
            if (isAdminEmail && existingProfile.role !== 'admin') {
              const updatedProfile = { ...existingProfile, role: 'admin' as UserRole };
              await setDoc(doc(db, 'users', firebaseUser.uid), updatedProfile);
              setProfile(updatedProfile);
            } else {
              setProfile(existingProfile);
            }
          } else {
            // Check for pre-authorized invite
            let role: UserRole = 'collaborator';
            if (email) {
              const inviteDoc = await getDoc(doc(db, 'invites', email));
              if (inviteDoc.exists()) {
                role = inviteDoc.data().role;
              }
            }

            // Create default profile
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'Usuario',
              photoURL: firebaseUser.photoURL || '',
              role: isAdminEmail ? 'admin' : role,
              createdAt: serverTimestamp(),
            };
            await setDoc(doc(db, 'users', firebaseUser.uid), newProfile);
            setProfile(newProfile);

            // Clean up invite if it existed
            if (email) {
              try {
                await deleteDoc(doc(db, 'invites', email));
              } catch (e) {
                console.error('Error deleting invite:', e);
              }
            }
          }
          setLoginError(null);
        } catch (error) {
          console.error('Error fetching profile:', error);
          setLoginError('Error al cargar el perfil. Por favor, intenta de nuevo.');
          // handleFirestoreError(error, OperationType.GET, 'users');
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setLoginError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/popup-blocked') {
        setLoginError('El navegador bloqueó la ventana emergente. Por favor, permite las ventanas emergentes para este sitio.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignore
      } else {
        setLoginError('Hubo un problema al iniciar sesión. Por favor, intenta de nuevo.');
      }
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setCurrentView('dashboard');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#F7F7F5]">
        <Loader2 className="h-8 w-8 animate-spin text-[#2D3436]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen w-full flex-col items-center justify-center bg-[#F7F7F5] px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md space-y-8 rounded-[24px] bg-white p-10 shadow-sm"
        >
          <div className="text-center">
            <h1 className="font-sans text-3xl font-semibold tracking-tight text-[#2D3436]">
              Repositorio de Esmaltes
            </h1>
            <p className="mt-2 text-sm text-[#636E72]">
              Accede a tu laboratorio cerámico digital
            </p>
          </div>

          {loginError && (
            <div className="rounded-xl bg-red-50 p-4 text-center text-xs font-medium text-red-600">
              {loginError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="flex w-full items-center justify-center gap-3 rounded-xl bg-[#2D3436] py-3.5 text-sm font-medium text-white transition-all hover:bg-[#000] active:scale-[0.98]"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="h-5 w-5" alt="Google" />
            Continuar con Google
          </button>
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'repository', label: 'Repositorio', icon: Database },
    { id: 'create', label: 'Nueva Ficha', icon: PlusCircle },
    { id: 'admin', label: 'Administración', icon: Users, roles: ['admin'] as UserRole[] },
    { id: 'settings', label: 'Inventario', icon: Settings },
  ];

  const filteredNavItems = navItems.filter(item => !item.roles || (profile && item.roles.includes(profile.role)));
  const headerTitle = currentView === 'inventory-alerts'
    ? 'Inventario en Alerta'
    : navItems.find(i => i.id === currentView)?.label || 'Detalle';

  return (
    <div className="flex h-screen w-full bg-[#F7F7F5] text-[#2D3436]">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 280 : 80 }}
        className="relative flex flex-col border-r border-[#E4E4E2] bg-white transition-all duration-300 ease-in-out"
      >
        <div className="flex h-20 items-center justify-between px-6">
          {isSidebarOpen && (
            <span className="font-sans text-lg font-semibold tracking-tight">Esmaltes.</span>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="rounded-lg p-1.5 hover:bg-[#F4F4F2]"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {filteredNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id as View);
                if (item.id === 'create') setSelectedGlazeId(null);
              }}
              className={cn(
                "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
                currentView === item.id 
                  ? "bg-[#F4F4F2] text-[#2D3436]" 
                  : "text-[#636E72] hover:bg-[#F7F7F5] hover:text-[#2D3436]"
              )}
            >
              <item.icon size={20} className={cn(currentView === item.id ? "text-[#2D3436]" : "text-[#B2BEC3]")} />
              {isSidebarOpen && <span>{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className="border-t border-[#E4E4E2] p-4">
          <div className={cn("flex items-center gap-3", !isSidebarOpen && "justify-center")}>
            <img 
              src={profile?.photoURL || "https://picsum.photos/seed/user/40/40"} 
              className="h-9 w-9 rounded-full object-cover ring-2 ring-[#F4F4F2]" 
              alt="Profile" 
            />
            {isSidebarOpen && (
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">{profile?.displayName}</p>
                <p className="truncate text-xs text-[#636E72] capitalize">{profile?.role}</p>
              </div>
            )}
            {isSidebarOpen && (
              <button onClick={handleLogout} className="rounded-lg p-1.5 text-[#636E72] hover:bg-[#F4F4F2] hover:text-red-500">
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="sticky top-0 z-10 flex h-20 items-center justify-between border-b border-[#E4E4E2] bg-white/80 px-8 backdrop-blur-md">
          <h2 className="text-xl font-semibold tracking-tight">{headerTitle}</h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B2BEC3]" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar esmaltes..." 
                className="h-10 w-64 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] pl-10 pr-4 text-sm outline-none transition-all focus:border-[#2D3436] focus:bg-white"
              />
            </div>
            <button 
              onClick={() => setIsFilterMenuOpen(!isFilterMenuOpen)}
              className={cn(
                "flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-all relative",
                isFilterMenuOpen || Object.keys(activeFilters).length > 0 
                  ? "border-[#2D3436] bg-[#2D3436] text-white" 
                  : "border-[#E4E4E2] hover:bg-[#F7F7F5] bg-white text-[#2D3436]"
              )}
            >
              <Filter size={16} />
              Filtros
              {Object.keys(activeFilters).length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                  {Object.keys(activeFilters).length}
                </span>
              )}
            </button>
            <AnimatePresence>
              {isFilterMenuOpen && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-8 top-20 z-50 w-80 rounded-[24px] border border-[#E4E4E2] bg-white p-6 shadow-xl"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold tracking-tight">Filtros Activos</h3>
                    <button onClick={() => setIsFilterMenuOpen(false)} className="text-[#B2BEC3] hover:text-[#2D3436]">
                      <X size={18} />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Color</label>
                      <select 
                        value={activeFilters.color || ''}
                        onChange={(e) => {
                          const newFilters = { ...activeFilters };
                          if (e.target.value) newFilters.color = e.target.value;
                          else delete newFilters.color;
                          setActiveFilters(newFilters);
                        }}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436]"
                      >
                        <option value="">Cualquier Color</option>
                        {FILTER_OPTIONS.colors.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Acabado</label>
                      <select 
                        value={activeFilters.finish || ''}
                        onChange={(e) => {
                          const newFilters = { ...activeFilters };
                          if (e.target.value) newFilters.finish = e.target.value;
                          else delete newFilters.finish;
                          setActiveFilters(newFilters);
                        }}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436]"
                      >
                        <option value="">Cualquier Acabado</option>
                        {FILTER_OPTIONS.finishes.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Textura</label>
                      <select 
                        value={activeFilters.texture || ''}
                        onChange={(e) => {
                          const newFilters = { ...activeFilters };
                          if (e.target.value) newFilters.texture = e.target.value;
                          else delete newFilters.texture;
                          setActiveFilters(newFilters);
                        }}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436]"
                      >
                        <option value="">Cualquier Textura</option>
                        {FILTER_OPTIONS.textures.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Familia Química</label>
                      <select 
                        value={activeFilters.chemicalFamily || ''}
                        onChange={(e) => {
                          const newFilters = { ...activeFilters };
                          if (e.target.value) newFilters.chemicalFamily = e.target.value;
                          else delete newFilters.chemicalFamily;
                          setActiveFilters(newFilters);
                        }}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436]"
                      >
                        <option value="">Cualquier Familia</option>
                        {FILTER_OPTIONS.families.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Estado</label>
                      <select 
                        value={activeFilters.status || ''}
                        onChange={(e) => {
                          const newFilters = { ...activeFilters };
                          if (e.target.value) newFilters.status = e.target.value;
                          else delete newFilters.status;
                          setActiveFilters(newFilters);
                        }}
                        className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-3 py-2 text-sm outline-none focus:border-[#2D3436]"
                      >
                        <option value="">Todos los Registros</option>
                        {FILTER_OPTIONS.statuses.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="mt-6 border-t border-[#F4F4F2] pt-4">
                     <button 
                      onClick={() => setActiveFilters({})}
                      className="w-full rounded-xl py-2 text-sm font-medium text-[#636E72] hover:bg-[#F4F4F2] transition-all"
                    >
                      Limpiar Filtros
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        <div className="p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView + (selectedGlazeId || '')}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {currentView === 'dashboard' && (
                <Dashboard
                  onNavigate={(view, id) => {
                    setCurrentView(view as View);
                    if (id) setSelectedGlazeId(id);
                  }}
                />
              )}
              {currentView === 'repository' && (
                <GlazeList 
                  searchQuery={searchQuery}
                  activeFilters={activeFilters}
                  onSelect={(id) => { setSelectedGlazeId(id); setCurrentView('detail'); }} 
                  onEdit={(id) => { setSelectedGlazeId(id); setCurrentView('create'); }}
                />
              )}
              {currentView === 'inventory-alerts' && (
                <GlazeList
                  searchQuery={searchQuery}
                  activeFilters={activeFilters}
                  highlightInventoryAlerts
                  onSelect={(id) => { setSelectedGlazeId(id); setCurrentView('detail'); }}
                  onEdit={(id) => { setSelectedGlazeId(id); setCurrentView('create'); }}
                />
              )}
              {currentView === 'create' && (
                <GlazeForm 
                  glazeId={selectedGlazeId} 
                  onCancel={() => setCurrentView('repository')} 
                  onSuccess={() => setCurrentView('repository')}
                />
              )}
              {currentView === 'detail' && selectedGlazeId && (
                <GlazeDetail 
                  id={selectedGlazeId} 
                  onEdit={() => setCurrentView('create')}
                  onBack={() => setCurrentView('repository')}
                />
              )}
              {currentView === 'admin' && <AdminPanel />}
              {currentView === 'settings' && <SettingsPanel />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
