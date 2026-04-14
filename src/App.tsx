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

type View = 'dashboard' | 'repository' | 'create' | 'detail' | 'admin' | 'settings';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedGlazeId, setSelectedGlazeId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

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
    { id: 'settings', label: 'Configuración', icon: Settings },
  ];

  const filteredNavItems = navItems.filter(item => !item.roles || (profile && item.roles.includes(profile.role)));

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
          <h2 className="text-xl font-semibold tracking-tight">
            {navItems.find(i => i.id === currentView)?.label || 'Detalle'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden md:block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#B2BEC3]" />
              <input 
                type="text" 
                placeholder="Buscar esmaltes..." 
                className="h-10 w-64 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] pl-10 pr-4 text-sm outline-none transition-all focus:border-[#2D3436] focus:bg-white"
              />
            </div>
            <button className="flex h-10 items-center gap-2 rounded-xl border border-[#E4E4E2] px-4 text-sm font-medium hover:bg-[#F7F7F5]">
              <Filter size={16} />
              Filtros
            </button>
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
              {currentView === 'dashboard' && <Dashboard onNavigate={(view, id) => { setCurrentView(view); if(id) setSelectedGlazeId(id); }} />}
              {currentView === 'repository' && (
                <GlazeList 
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
              {currentView === 'settings' && (
                <div className="rounded-[24px] bg-white p-10 shadow-sm">
                  <h3 className="text-lg font-semibold">Configuración</h3>
                  <p className="mt-2 text-[#636E72]">Próximamente: Gestión de categorías y preferencias del taller.</p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
