export type UserRole = 'admin' | 'editor' | 'collaborator' | 'reviewer';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  createdAt: any;
}

export type GlazeStatus = 'draft' | 'pending' | 'validated' | 'published' | 'archived';

export interface RecipeItem {
  material: string;
  amount: number;
}

export interface Recipe {
  base: RecipeItem[];
  additional: RecipeItem[];
  totalBase: number;
}

export interface Glaze {
  id?: string;
  name: string;
  code: string;
  mainImage: string;
  gallery: string[];
  finish: string;
  color: string;
  texture: string;
  usage: string[];
  applicationMethod: string[];
  chemicalFamily: string;
  observations: string;
  recipe: Recipe;
  temperature: string;
  clayBody: string;
  firingType: string;
  atmosphere: string;
  status: GlazeStatus;
  authorId: string;
  authorName: string;
  createdAt: any;
  updatedAt: any;
  isValidated: boolean;
  inventoryLevel?: number;
  copies?: GlazeCopy[];
  techSpecs?: TechSpecs;
  preparation?: PreparationData;
  firingCurve?: FiringCurve;
  analysis?: AnalysisData;
  application?: ApplicationData;
  safety?: SafetyData;
}

export interface GlazeCopy extends Omit<Glaze, 'id' | 'createdAt' | 'updatedAt' | 'copies'> {
  copyId: string;
  sourceCode: string;
  createdAt: any;
  updatedAt: any;
}

export interface Comment {
  id?: string;
  glazeId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: any;
}

export interface TechSpecs {
  cone?: string;
  targetTemperature?: number;
  atmosphere?: string;
  clayBodyType?: string;
  applicationMethods?: string[];
  characteristics?: string;
}

export interface PreparationData {
  mixingOrder?: string;
  initialWater?: string;
  sieving?: string;
  resting?: string;
  suspensionTips?: string;
}

export interface FiringSegment {
  index: number;
  rate?: number;
  targetTemperature?: number;
  soak?: number;
  soakUnit?: string;
  notes?: string;
}

export interface FiringCurve {
  name?: string;
  program?: string;
  finalTemperature?: number;
  finalSoak?: number;
  finalSoakUnit?: string;
  cooling?: string;
  essentialParameters?: string;
  additionalNotes?: string;
  segments?: FiringSegment[];
}

export interface AnalysisData {
  chemicalBehavior?: string;
  rawMaterialFunctions?: string;
  defects?: string;
  adjustments?: string;
  generalNotes?: string;
}

export interface ApplicationPhoto {
  url: string;
  caption?: string;
}

export interface ApplicationData {
  layers?: string;
  techniques?: string[];
  behaviorOnClays?: string;
  recommendations?: string;
  photos?: ApplicationPhoto[];
}

export type FoodSafetyStatus =
  | 'No evaluado'
  | 'En proceso de evaluación'
  | 'Evaluado mediante ensayos'
  | 'No recomendado para contacto alimentario';

export interface SafetyData {
  handlingPrecautions?: string;
  glazeLimitations?: string;
  foodSafetyInfo?: string;
  foodContactStatus?: FoodSafetyStatus;
  additionalSafetyNotes?: string;
}
