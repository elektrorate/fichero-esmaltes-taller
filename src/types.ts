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
}

export interface Comment {
  id?: string;
  glazeId: string;
  authorId: string;
  authorName: string;
  text: string;
  createdAt: any;
}
