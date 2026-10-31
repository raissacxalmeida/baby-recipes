import type { GroupName, Ingredient, Language } from '../shared/types.js';

export type Row = Record<string, unknown>;

// What both pg and PGlite give back for a query: the rows, typed by the caller.
export interface Queryable {
  query<R = Row>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void> | void;
}

export interface Config {
  databaseUrl: string;
  openaiKey: string;
  publicUrl: string;
  allowedHosts: string[];
  cookieSecure: boolean;
  port: number;
}

// The languages recipe text is translated into (every language but English).
export type TranslatedLanguage = Exclude<Language, 'en'>;

// One row type per table in migrations.ts. Timestamps and dates arrive as Date, uuids as string.
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  birthdate: Date | null;
  created_at: Date;
  last_login_at: Date | null;
  language: Language | null;
}

export interface InviteRow {
  id: string;
  email: string;
  token_hash: string;
  is_admin: boolean;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

export interface ResetRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  used_at: Date | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  created_at: Date;
}

export interface RecipeRow {
  user_id: string;
  id: string;
  data: unknown;
  status: 'liked' | 'disliked';
  updated_at: Date;
  copied_from: string | null;
}

export interface ShownRow {
  user_id: string;
  title: string;
  shown_at: Date;
}

export interface UsageRow {
  user_id: string;
  day: Date;
  recipes: number;
  calls: number;
  translations: number;
}

export interface LoginAttemptRow {
  email: string;
  failures: number;
  first_failure_at: Date;
  locked_until: Date | null;
}

export interface SharedRecipeRow {
  id: string;
  user_id: string;
  recipe_id: string;
  data: unknown;
  grp: GroupName;
  baby_months: number;
  created_at: Date;
}

export interface SharedLikeRow {
  shared_id: string;
  user_id: string;
}

export interface CatalogueRecipeRow {
  id: string;
  title_key: string;
  source: 'seed' | 'ai';
  source_id: string | null;
  age_from_months: number;
  data: unknown;
  created_at: Date;
}

export interface TitleTranslationRow {
  title: string;
  language: TranslatedLanguage;
  translated: string;
}

export interface RecipeTranslationRow {
  recipe_hash: string;
  language: TranslatedLanguage;
  data: unknown;
}

// The signed-in person as the server hands them around.
export interface SessionUser {
  id: string;
  email: string;
  isAdmin: boolean;
  language: Language | null;
}

// The parts of a recipe the safety checks read; a full Recipe satisfies it.
export interface SafetyRecipe {
  title: string;
  ingredients: Pick<Ingredient, 'name'>[];
  steps: string[];
  texture?: string;
  // Allergens the model named, when it did; detectAllergens adds the ones it finds itself.
  aiAllergens?: string[];
}
