import { useState, useEffect, useRef } from 'react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { Glaze, RecipeItem, GlazeStatus } from '../types';
import { STATUS_LABELS } from '../constants';
import { motion } from 'motion/react';
import { Save, Plus, Trash2, Calculator, Info, Image as ImageIcon, AlertCircle, Loader2 as Spinner, Upload } from 'lucide-react';
import { cn } from '../lib/utils';

interface GlazeFormProps {
  glazeId: string | null;
  onCancel: () => void;
  onSuccess: () => void;
}

const CATEGORIES = {
  finish: [
    { label: 'Brillante', code: 'BR' },
    { label: 'Mate', code: 'MT' },
    { label: 'Satinado', code: 'ST' },
    { label: 'Opaco', code: 'OP' },
    { label: 'Translúcido', code: 'TR' },
    { label: 'Cristalino', code: 'CR' },
    { label: 'Moteado', code: 'SP' },
    { label: 'Texturizado', code: 'TX' },
    { label: 'Reactivo', code: 'RV' }
  ],
  color: [
    { label: 'Blanco', code: 'B' },
    { label: 'Negro', code: 'N' },
    { label: 'Gris', code: 'G' },
    { label: 'Azul', code: 'A' },
    { label: 'Verde', code: 'V' },
    { label: 'Rojo', code: 'R' },
    { label: 'Marrón', code: 'M' },
    { label: 'Amarillo', code: 'Y' },
    { label: 'Naranja', code: 'O' },
    { label: 'Púrpura', code: 'P' },
    { label: 'Tierra / terracota', code: 'T' },
    { label: 'Crema / beige', code: 'C' },
    { label: 'Transparente', code: 'TR' }
  ],
  usage: [
    { label: 'Apto para vajilla / food safe', code: 'FS' },
    { label: 'Decorativo', code: 'DC' }
  ],
  texture: ['Liso', 'Sedoso', 'Rugoso', 'Arenoso', 'Moteado', 'Craquelado', 'Lava / volcánico', 'Piel de naranja', 'Escurrido controlado'],
  application: ['Inmersión', 'Vertido', 'Pincel', 'Aerógrafo', 'Pulverizado', 'Capa única', 'Multicapa'],
  family: ['Borosilicato', 'Feldespático', 'Litio', 'Zinc', 'Magnesio', 'Cenizas', 'Alta alúmina', 'Baja expansión']
};

const RAW_MATERIALS = [
  "Sílice", "Caolín EPK", "Caolín Grolleg", "Caolín calcinado", "Arcilla de bola", 
  "Arcilla inglesa", "Bentonita", "Feldespato potásico", "Feldespato sódico", 
  "Nefelina sienita", "Carbonato cálcico", "Dolomita", "Talco", "Wollastonita", 
  "Carbonato de magnesio", "Carbonato de bario", "Carbonato de estroncio", 
  "Carbonato de litio", "Espodumena", "Petalita", "Borato de calcio", "Colemanita", 
  "Ulexita", "Frita 3110", "Frita 3134", "Frita CQ003", "Frita 3195", "Frita 3124", 
  "Frita 3249", "Frita 3269", "Óxido de zinc", "Alúmina hidratada", "Óxido de estaño", 
  "Zircon", "Óxido de zirconio", "Dióxido de titanio", "Rutilo", "Ceniza de hueso", 
  "Fosfato tricálcico", "Óxido de hierro", "Óxido rojo", "Óxido negro", "Óxido de cobre", 
  "Carbonato de cobre", "Óxido de cobalto", "Carbonato de cobalto", "Óxido de manganeso", 
  "Dióxido de manganeso", "Óxido de níquel", "Óxido de cromo", "Óxido de vanadio", 
  "Ilmenita", "Carbonato de manganeso", "Carbonato de níquel", "Carbonato de hierro", 
  "Nitrato de cobalto", "Nitrato de cobre", "Silicato de sodio", "Epsom (sulfato de magnesio)", 
  "Chamota fina", "Arena silícea fina", "Chamota molida", "Chamota refractaria fina", 
  "Ceniza vegetal tamizada", "Ceniza de madera", "Fluorita", "Bórax", "Ácido bórico", 
  "Sulfato de bario", "Óxido de molibdeno", "Óxido de titanio anatasa", "Carburo de silicio"
];

// Helper to remove accents for search
function normalizeString(str: string) {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function AutocompleteInput({ value, onChange, placeholder, wrapperClassName, inputClassName }: { value: string, onChange: (val: string) => void, placeholder: string, wrapperClassName?: string, inputClassName?: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredMaterials = value ? RAW_MATERIALS.filter(m => 
    normalizeString(m).toLowerCase().startsWith(normalizeString(value).toLowerCase())
  ) : [];

  return (
    <div className={`relative ${wrapperClassName || ''}`} ref={wrapperRef}>
      <input
        value={value}
        onChange={e => {
          onChange(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        className={inputClassName}
        placeholder={placeholder}
      />
      {isOpen && value && filteredMaterials.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border border-[#E4E4E2] bg-white p-1 shadow-lg">
          {filteredMaterials.map(m => (
            <li
              key={m}
              onClick={() => {
                onChange(m);
                setIsOpen(false);
              }}
              className="cursor-pointer rounded-lg px-3 py-2 text-left text-sm text-[#2D3436] hover:bg-[#F7F7F5]"
            >
              <span className="font-bold">{m.substring(0, value.length)}</span>
              <span>{m.substring(value.length)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function GlazeForm({ glazeId, onCancel, onSuccess }: GlazeFormProps) {
  const [loading, setLoading] = useState(false);
  const [calcMode, setCalcMode] = useState<'percent' | 'grams'>('grams');
  const [targetWeight, setTargetWeight] = useState(100);

  const [formData, setFormData] = useState<Partial<Glaze>>({
    name: '',
    code: '',
    mainImage: '',
    gallery: [],
    finish: 'Brillante',
    color: 'Blanco',
    texture: 'Liso',
    usage: ['Apto para vajilla / food safe'],
    applicationMethod: [],
    chemicalFamily: 'Borosilicato',
    observations: '',
    status: 'draft',
    recipe: {
      base: [{ material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }],
      additional: [{ material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }, { material: '', amount: 0 }],
      totalBase: 100
    }
  });

  const [variant, setVariant] = useState('');
  const [nextNumber, setNextNumber] = useState('001');

  useEffect(() => {
    if (!glazeId) {
      const q = query(collection(db, 'glazes'), orderBy('createdAt', 'desc'), limit(1));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const lastGlaze = snapshot.docs[0].data() as Glaze;
          const lastCode = lastGlaze.code || '';
          const match = lastCode.match(/-(\d{3})(?:-[A-Z])?$/);
          if (match) {
            const nextNum = parseInt(match[1]) + 1;
            setNextNumber(nextNum.toString().padStart(3, '0'));
          }
        }
      });
      return () => unsubscribe();
    }
  }, [glazeId]);

  useEffect(() => {
    const colorCode = CATEGORIES.color.find(c => c.label === formData.color)?.code || '';
    const finishCode = CATEGORIES.finish.find(f => f.label === formData.finish)?.code || '';
    const usageCode = formData.usage && formData.usage.length > 0 
      ? CATEGORIES.usage.find(u => u.label === formData.usage![0])?.code || ''
      : '';
    
    let generatedCode = `${colorCode}-${finishCode}-${usageCode}-${nextNumber}`;
    if (variant) {
      generatedCode += `-${variant.toUpperCase()}`;
    }
    
    if (formData.code !== generatedCode) {
      setFormData(prev => ({ ...prev, code: generatedCode }));
    }
  }, [formData.color, formData.finish, formData.usage, nextNumber, variant]);

  useEffect(() => {
    if (glazeId) {
      const fetchGlaze = async () => {
        try {
          const docRef = doc(db, 'glazes', glazeId);
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            const data = docSnap.data() as Glaze;
            setFormData(data);
            
            const codeParts = data.code.split('-');
            if (codeParts.length >= 4) {
              setNextNumber(codeParts[3]);
              if (codeParts.length === 5) {
                setVariant(codeParts[4]);
              }
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, 'glazes');
        }
      };
      fetchGlaze();
    }
  }, [glazeId]);

  const handleRecipeChange = (type: 'base' | 'additional', index: number, field: keyof RecipeItem, value: string | number) => {
    const newRecipe = { ...formData.recipe! };
    const items = [...newRecipe[type]];
    items[index] = { ...items[index], [field]: value };
    newRecipe[type] = items;
    setFormData({ ...formData, recipe: newRecipe });
  };

  const addRecipeRow = (type: 'base' | 'additional') => {
    const newRecipe = { ...formData.recipe! };
    newRecipe[type] = [...newRecipe[type], { material: '', amount: 0 }];
    setFormData({ ...formData, recipe: newRecipe });
  };

  const removeRecipeRow = (type: 'base' | 'additional', index: number) => {
    const newRecipe = { ...formData.recipe! };
    newRecipe[type] = newRecipe[type].filter((_, i) => i !== index);
    setFormData({ ...formData, recipe: newRecipe });
  };

  const calculateTotals = () => {
    const baseTotal = formData.recipe?.base.reduce((acc, item) => acc + (Number(item.amount) || 0), 0) || 0;
    const additionalTotal = formData.recipe?.additional.reduce((acc, item) => acc + (Number(item.amount) || 0), 0) || 0;
    return { baseTotal, additionalTotal };
  };

  const { baseTotal } = calculateTotals();

  const handleRescale = () => {
    if (baseTotal === 0) return;
    const factor = targetWeight / baseTotal;
    const newRecipe = { ...formData.recipe! };
    newRecipe.base = newRecipe.base.map(item => ({ ...item, amount: Number((item.amount * factor).toFixed(1)) }));
    newRecipe.additional = newRecipe.additional.map(item => ({ ...item, amount: Number((item.amount * factor).toFixed(1)) }));
    newRecipe.totalBase = targetWeight;
    setFormData({ ...formData, recipe: newRecipe });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, targetIdx?: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor selecciona un archivo de imagen válido.');
      return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress to 0.6 quality JPEG to keep size really small (~50-100KB)
        const base64String = canvas.toDataURL('image/jpeg', 0.6);

        if (targetIdx === undefined) {
          // Main image
          setFormData({ ...formData, mainImage: base64String });
        } else {
          // Gallery update or add
          const newGallery = [...(formData.gallery || [])];
          if (targetIdx === -1) {
            newGallery.push(base64String);
          } else {
            newGallery[targetIdx] = base64String;
          }
          setFormData({ ...formData, gallery: newGallery });
        }
      };
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = {
        ...formData,
        authorId: auth.currentUser?.uid,
        authorName: auth.currentUser?.displayName || 'Anónimo',
        updatedAt: serverTimestamp(),
        createdAt: formData.createdAt || serverTimestamp(),
      };

      if (glazeId) {
        await setDoc(doc(db, 'glazes', glazeId), data);
      } else {
        await addDoc(collection(db, 'glazes'), data);
      }
      onSuccess();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'glazes');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight">{glazeId ? 'Editar Esmalte' : 'Nueva Ficha Técnica'}</h3>
          <p className="text-sm text-[#636E72]">Completa los datos técnicos del laboratorio.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="rounded-xl border border-[#E4E4E2] px-6 py-2.5 text-sm font-medium hover:bg-white">
            Cancelar
          </button>
          <button 
            type="submit" 
            disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-[#2D3436] px-6 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"
          >
            {loading ? <Spinner className="h-4 w-4 animate-spin" /> : <Save size={18} />}
            Guardar Ficha
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        {/* Left Column: Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Nombre del Esmalte</label>
                <input 
                  required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                  placeholder="Ej. Azul Cobalto Profundo"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Código Generado</label>
                <div className="flex items-center gap-2">
                  <input 
                    readOnly
                    value={formData.code}
                    className="flex-1 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm font-mono font-bold text-[#2D3436] outline-none" 
                  />
                  <div className="group relative">
                    <Info size={16} className="text-[#B2BEC3]" />
                    <div className="absolute bottom-full right-0 mb-2 hidden w-48 rounded-lg bg-[#2D3436] p-2 text-[10px] text-white group-hover:block">
                      El código se genera automáticamente: COLOR-ACABADO-USO-NÚMERO-VARIANTE
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Color</label>
                <select 
                  value={formData.color}
                  onChange={e => setFormData({ ...formData, color: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.color.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Acabado</label>
                <select 
                  value={formData.finish}
                  onChange={e => setFormData({ ...formData, finish: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.finish.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Uso</label>
                <select 
                  value={formData.usage?.[0] || ''}
                  onChange={e => setFormData({ ...formData, usage: [e.target.value] })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.usage.map(c => <option key={c.label} value={c.label}>{c.label} ({c.code})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Variante (Opcional)</label>
                <input 
                  value={variant}
                  onChange={e => setVariant(e.target.value.toUpperCase().slice(0, 1))}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                  placeholder="Ej. A"
                  maxLength={1}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Textura</label>
                <select 
                  value={formData.texture}
                  onChange={e => setFormData({ ...formData, texture: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.texture.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Familia Química</label>
                <select 
                  value={formData.chemicalFamily}
                  onChange={e => setFormData({ ...formData, chemicalFamily: e.target.value })}
                  className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white"
                >
                  {CATEGORIES.family.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Observaciones</label>
              <textarea 
                value={formData.observations}
                onChange={e => setFormData({ ...formData, observations: e.target.value })}
                rows={4}
                className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-3 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                placeholder="Notas sobre el comportamiento, defectos o consejos..."
              />
            </div>
          </div>

          {/* Recipe Module */}
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-8">
            <div className="flex items-center justify-between border-b border-[#F4F4F2] pb-6">
              <div>
                <h4 className="text-lg font-semibold tracking-tight">Módulo de Receta</h4>
                <p className="text-xs text-[#636E72]">Cálculo inteligente de base y adicionales.</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl bg-[#F4F4F2] p-1">
                <button 
                  type="button"
                  onClick={() => setCalcMode('percent')}
                  className={cn("rounded-lg px-4 py-1.5 text-xs font-medium transition-all", calcMode === 'percent' ? "bg-white text-[#2D3436] shadow-sm" : "text-[#636E72]")}
                >
                  Porcentaje (%)
                </button>
                <button 
                  type="button"
                  onClick={() => setCalcMode('grams')}
                  className={cn("rounded-lg px-4 py-1.5 text-xs font-medium transition-all", calcMode === 'grams' ? "bg-white text-[#2D3436] shadow-sm" : "text-[#636E72]")}
                >
                  Gramos (g)
                </button>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Base Principal</h5>
                <button type="button" onClick={() => addRecipeRow('base')} className="text-[#636E72] hover:text-[#2D3436]"><Plus size={18} /></button>
              </div>
              <div className="space-y-2">
                {formData.recipe?.base.map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <AutocompleteInput 
                      value={item.material}
                      onChange={val => handleRecipeChange('base', idx, 'material', val)}
                      wrapperClassName="flex-1"
                      inputClassName="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="Materia prima"
                    />
                    <input 
                      type="number"
                      step="0.1"
                      value={item.amount}
                      onChange={e => handleRecipeChange('base', idx, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="0.0"
                    />
                    <button type="button" onClick={() => removeRecipeRow('base', idx)} className="text-[#B2BEC3] hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#F7F7F5] p-4">
                <span className="text-sm font-semibold">Total Base</span>
                <div className="flex items-center gap-4">
                  {baseTotal !== 100 && calcMode === 'percent' && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 uppercase">
                      <AlertCircle size={12} /> No suma 100%
                    </span>
                  )}
                  <span className="text-lg font-bold">{baseTotal.toFixed(1)}{calcMode === 'percent' ? '%' : 'g'}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-widest text-[#2D3436]">Adicionales (Colorantes, Opacificantes...)</h5>
                <button type="button" onClick={() => addRecipeRow('additional')} className="text-[#636E72] hover:text-[#2D3436]"><Plus size={18} /></button>
              </div>
              <div className="space-y-2">
                {formData.recipe?.additional.map((item, idx) => (
                  <div key={idx} className="flex gap-3">
                    <AutocompleteInput 
                      value={item.material}
                      onChange={val => handleRecipeChange('additional', idx, 'material', val)}
                      wrapperClassName="flex-1"
                      inputClassName="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="Materia prima"
                    />
                    <input 
                      type="number"
                      step="0.1"
                      value={item.amount}
                      onChange={e => handleRecipeChange('additional', idx, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2.5 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                      placeholder="0.0"
                    />
                    <button type="button" onClick={() => removeRecipeRow('additional', idx)} className="text-[#B2BEC3] hover:text-red-500"><Trash2 size={16} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#E4E4E2] p-6 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Calculator size={18} />
                Reescalado Proporcional
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#B2BEC3]">Nuevo Peso Total Base</p>
                  <div className="flex gap-2">
                    <input 
                      type="number"
                      value={targetWeight}
                      onChange={e => setTargetWeight(parseFloat(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[#E4E4E2] bg-[#F7F7F5] px-4 py-2 text-sm outline-none focus:border-[#2D3436] focus:bg-white" 
                    />
                    <button 
                      type="button"
                      onClick={handleRescale}
                      className="rounded-xl bg-[#2D3436] px-4 py-2 text-xs font-bold text-white hover:bg-black"
                    >
                      Ajustar
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-5">
                  {[100, 500, 1000, 2000].map(w => (
                    <button 
                      key={w} 
                      type="button" 
                      onClick={() => setTargetWeight(w)}
                      className="rounded-lg border border-[#E4E4E2] px-3 py-1 text-[10px] font-bold hover:bg-[#F7F7F5]"
                    >
                      {w >= 1000 ? `${w/1000}kg` : `${w}g`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Media & Status */}
        <div className="space-y-8">
          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Imagen Principal</h4>
              <label className="flex cursor-pointer items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#2D3436] hover:opacity-70 transition-all">
                <Upload size={14} />
                Subir Archivo
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={(e) => handleImageUpload(e)}
                />
              </label>
            </div>
            <div className="group relative aspect-square overflow-hidden rounded-2xl bg-[#F7F7F5] border-2 border-dashed border-[#E4E4E2] flex flex-col items-center justify-center text-[#B2BEC3] hover:border-[#2D3436] hover:text-[#2D3436] transition-all">
              {formData.mainImage ? (
                <img src={formData.mainImage} className="h-full w-full object-cover" alt="Preview" referrerPolicy="no-referrer" />
              ) : (
                <>
                  <ImageIcon size={40} strokeWidth={1} />
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-center">Sin imagen<br/>Sube archivo o pega URL abajo</p>
                </>
              )}
              <input 
                type="text" 
                placeholder="URL de la imagen..."
                value={formData.mainImage}
                onChange={e => setFormData({ ...formData, mainImage: e.target.value })}
                className="absolute bottom-4 left-4 right-4 rounded-lg border border-[#E4E4E2] bg-white/90 px-3 py-1.5 text-[10px] outline-none backdrop-blur-sm focus:border-[#2D3436] shadow-sm"
              />
            </div>
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Galería de Fotos ({formData.gallery?.length || 0})</h4>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {(formData.gallery || []).map((img, idx) => (
                <div key={idx} className="group relative aspect-square overflow-hidden rounded-2xl border border-[#E4E4E2] bg-[#F7F7F5] flex flex-col">
                  {img ? (
                    <img src={img} className="flex-1 h-full w-full object-cover" alt={`Gallery ${idx}`} referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-[#B2BEC3] pb-6 cursor-pointer hover:bg-white transition-all">
                      <label className="flex h-full w-full flex-col items-center justify-center cursor-pointer">
                        <Upload size={20} className="mb-1" />
                        <span className="text-[10px] uppercase font-bold">Examinar</span>
                        <input 
                          type="file" 
                          accept="image/*" 
                          className="hidden" 
                          onChange={(e) => handleImageUpload(e, idx)}
                        />
                      </label>
                    </div>
                  )}
                  <input 
                    type="text" 
                    placeholder="URL de imagen..."
                    value={img}
                    onChange={(e) => {
                       const newGallery = [...(formData.gallery || [])];
                       newGallery[idx] = e.target.value;
                       setFormData({ ...formData, gallery: newGallery });
                    }}
                    className="absolute bottom-2 left-2 right-2 rounded-lg border border-[#E4E4E2] bg-white/90 px-2 py-1.5 text-[10px] outline-none backdrop-blur-sm focus:border-[#2D3436]"
                  />
                  <div className="absolute inset-0 hidden flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm group-hover:flex">
                    <button 
                      type="button" 
                      onClick={() => {
                        const newGallery = [...(formData.gallery || [])];
                        newGallery.splice(idx, 1);
                        const oldMain = formData.mainImage;
                        if (oldMain) newGallery.push(oldMain);
                        setFormData({ ...formData, mainImage: img, gallery: newGallery });
                      }}
                      className="rounded-lg bg-white/90 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-[#2D3436] hover:scale-105 active:scale-95 transition-all"
                    >
                      Principal
                    </button>
                    <button 
                      type="button" 
                      onClick={() => {
                        const newGallery = formData.gallery?.filter((_, i) => i !== idx);
                        setFormData({ ...formData, gallery: newGallery });
                      }}
                      className="rounded-lg bg-red-500/90 p-2 text-white hover:bg-red-500 hover:scale-105 active:scale-95 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {(formData.gallery?.length || 0) < 8 ? (
                <button 
                  type="button" 
                  onClick={() => setFormData({ ...formData, gallery: [...(formData.gallery || []), ''] })} 
                  className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E4E4E2] text-[#B2BEC3] transition-all hover:border-[#2D3436] hover:text-[#2D3436] hover:bg-[#F4F4F2]"
                >
                  <Plus size={24} />
                  <span className="text-[10px] font-bold uppercase tracking-widest mt-1">Añadir Hueco</span>
                </button>
              ) : (
                <div className="flex aspect-square flex-col items-center justify-center rounded-2xl border border-[#E4E4E2] bg-[#F4F4F2] text-[#B2BEC3]">
                  <span className="text-[10px] font-bold uppercase tracking-widest px-4 text-center">Límite de Galería Alcanzado</span>
                </div>
              )}
            </div>
            {(formData.gallery?.length || 0) >= 4 && (
              <p className="text-[10px] text-amber-600 mt-2 font-medium">Nota: Guarda la ficha continuamente. Múltiples fotos consumen capacidad del documento gratis.</p>
            )}
          </div>

          <div className="rounded-[24px] bg-white p-8 shadow-sm space-y-6">
            <h4 className="text-xs font-bold uppercase tracking-widest text-[#B2BEC3]">Estado de la Ficha</h4>
            <div className="space-y-3">
              {(['draft', 'pending', 'validated', 'published'] as GlazeStatus[]).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFormData({ ...formData, status: s })}
                  className={cn(
                    "flex w-full items-center justify-between rounded-xl border px-4 py-3 text-xs font-bold uppercase tracking-widest transition-all",
                    formData.status === s ? "border-[#2D3436] bg-[#2D3436] text-white" : "border-[#E4E4E2] text-[#636E72] hover:bg-[#F7F7F5]"
                  )}
                >
                  {STATUS_LABELS[s]}
                  {formData.status === s && <CheckCircle size={14} />}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[24px] bg-[#2D3436] p-8 text-white shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest opacity-60">
              <Info size={14} />
              Consejo Técnico
            </div>
            <p className="text-sm leading-relaxed opacity-90">
              Recuerda que los adicionales no se suman al total base. El sistema los calcula de forma independiente para mantener la pureza de la fórmula.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}

function CheckCircle({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>;
}
