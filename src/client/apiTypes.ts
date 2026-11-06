// What /api/* answers with, as the browser reads it. The server builds these in src/server/routes/*.ts; its own
// types for them keep stored recipes as `unknown` (they are jsonb), so the client states them here with a real Recipe.
import type { GroupName, Ingredient, Language, Recipe } from '../shared/types.js';

// An ingredient as shown: `inList` marks the ones the parent typed (set by the server); `original` is the English
// name kept when localizeRecipe lays a translated name over it.
export type ApiIngredient = Ingredient & { inList?: boolean; original?: string };
export type ApiRecipe = Omit<Recipe, 'ingredients'> & { ingredients: ApiIngredient[] };

// The signed-in person (GET /api/session, POST /api/login, POST /api/signup).
export interface ApiUser {
  email: string;
  isAdmin: boolean;
  language: Language | null;
}
export interface Session {
  user: ApiUser;
}

// GET /api/invite/:token and GET /api/reset/:token: whose link it is.
export interface LinkOwner {
  email: string;
}

// Today's recipe allowance; null in the state of an admin, who has none.
export interface Usage {
  recipesToday: number;
  limit: number;
  resetsAt: string;
}

// One baby of the account (GET /api/babies). The name and birthdate are null for a baby made before names existed.
export interface ApiBaby {
  id: string;
  name: string | null;
  birthdate: string | null;
}

// What a baby is added or changed with (POST /api/babies, PUT /api/babies/:id).
export interface BabyInput {
  name: string;
  birthdate: string;
}

// GET /api/state; the birthdate is the selected baby's.
export interface ApiState {
  birthdate: string | null;
  liked: ApiRecipe[];
  disliked: ApiRecipe[];
  sharedIds: string[];
  copiedIds: string[];
  usage: Usage | null;
}

// One recipe in the community list (GET /api/shared).
export interface SharedItem {
  id: string;
  recipe: ApiRecipe;
  group: GroupName;
  ageMonths: number;
  likes: number;
  mine: boolean;
  liked: boolean;
}

// POST /api/translate/recipe: the recipe's text in another language, laid over the English recipe for display.
export interface RecipeTranslation {
  title: string;
  ingredients: string[];
  steps: string[];
}

// GET /api/admin/overview
export interface AdminInvite {
  id: string;
  email: string;
  status: 'used' | 'expired' | 'pending';
  daysLeft: number | null;
  createdAt: string;
}
export interface AdminPerson {
  id: string;
  email: string;
  isAdmin: boolean;
  joinedAt: string;
  lastLoginAt: string | null;
  recipesToday: number | null;
}
export interface AdminOverview {
  invites: AdminInvite[];
  people: AdminPerson[];
  limit: number;
}

// POST /api/admin/invites and POST /api/admin/people/:id/reset: the link to hand over.
export interface IssuedLink {
  link: string;
}

// What every write that has nothing to report answers.
export interface Ok {
  ok: true;
}
