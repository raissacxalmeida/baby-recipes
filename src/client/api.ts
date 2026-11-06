import type { Language, TranslatedLanguage } from '../shared/types.js';
import type {
  AdminOverview, ApiBaby, ApiRecipe, ApiState, ApiUser, BabyInput, IssuedLink, LinkOwner, Ok,
  RecipeTranslation, Session, SharedItem,
} from './apiTypes.js';
import { getLanguage, hasKey, t } from './i18n/index.js';

// What a failed request throws: the status and the server's code, and the i18n key and values so a screen
// can word the error again after a language switch.
export type ApiError = Error & { status?: number; code?: string; key?: string; params?: Record<string, unknown> };

// A catch clause holds `unknown`. Every request fails with an ApiError, so this is where a caught value is read as one.
export const asApiError = (caught: unknown): ApiError => caught as ApiError;

// The part of fetch's answer that is read; a test can hand back a plain object.
export interface FetchResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}
export type FetchImpl = (url: string, init: RequestInit) => Promise<FetchResponse>;

// What the server's error answers carry (see AppError).
interface ErrorBody {
  error?: string;
  message?: string;
  key?: string;
  params?: Record<string, unknown>;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

// Every call the browser makes. `withBaby` hands back a copy bound to one baby, so a screen holds the instance of the
// baby it shows and a request still in flight keeps its own baby after the parent switches.
export interface Api {
  session(): Promise<Session | null>;
  login(email: string, password: string): Promise<ApiUser>;
  logout(): Promise<Ok>;
  invite(token: string): Promise<LinkOwner>;
  signup(token: string, password: string): Promise<ApiUser>;
  resetInfo(token: string): Promise<LinkOwner>;
  reset(token: string, password: string): Promise<Ok>;
  state(): Promise<ApiState>;
  // Deprecated: the birthdate belongs to a baby now (addBaby, updateBaby). Task 6 removes this.
  setBirthdate(birthdate: string): Promise<Ok>;
  setLanguage(language: Language): Promise<Ok>;
  suggest(ingredients: string[]): Promise<ApiRecipe>;
  translateTitles(language: TranslatedLanguage, titles: string[]): Promise<Record<string, string>>;
  translateRecipe(language: TranslatedLanguage, recipe: ApiRecipe): Promise<RecipeTranslation>;
  like(recipe: ApiRecipe): Promise<Ok>;
  unlike(recipeId: string): Promise<Ok>;
  dislike(recipe: ApiRecipe): Promise<Ok>;
  restore(recipeId: string): Promise<Ok>;
  listShared(): Promise<SharedItem[]>;
  share(recipeId: string): Promise<Ok>;
  unshare(recipeId: string): Promise<Ok>;
  likeShared(sharedId: string): Promise<Ok>;
  unlikeShared(sharedId: string): Promise<Ok>;
  babies(): Promise<{ babies: ApiBaby[]; lastBabyId: string | null }>;
  addBaby(input: BabyInput): Promise<ApiBaby>;
  updateBaby(babyId: string, input: BabyInput): Promise<Ok>;
  removeBaby(babyId: string): Promise<Ok>;
  setLastBaby(babyId: string): Promise<Ok>;
  withBaby(babyId: string | null): Api;
  deleteAccount(): Promise<Ok>;
  admin: {
    overview(): Promise<AdminOverview>;
    createInvite(email: string): Promise<IssuedLink>;
    revokeInvite(inviteId: string): Promise<Ok>;
    reset(userId: string): Promise<IssuedLink>;
    remove(userId: string): Promise<Ok>;
  };
}

// With a `babyId`, every request names that baby in the X-Baby-Id header; the baby-scoped routes read it there.
export function createApi(fetchImpl: FetchImpl = (url, init) => fetch(url, init), babyId: string | null = null): Api {
  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res: FetchResponse;
    try {
      res = await fetchImpl(path, {
        method,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'fetch',
          ...(babyId ? { 'X-Baby-Id': babyId } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw Object.assign(new Error(t('err.network')), { key: 'err.network' });
    }
    // res.json() is untyped: a success carries the shape the caller names, a failure the ErrorBody fields.
    const data = (await res.json().catch(() => ({}))) as ErrorBody & T;
    if (!res.ok) {
      // The server's English message is the fallback for a key this browser has no text for.
      const message = data.key && hasKey(data.key) ? t(data.key, data.params) : data.message ?? t('err.generic');
      // The error keeps its key and values so the screen can word it again after a language switch.
      const key = data.key && hasKey(data.key) ? data.key : data.message ? undefined : 'err.generic';
      throw Object.assign(new Error(message), { status: res.status, code: data.error, key, params: data.params });
    }
    return data;
  }
  const id = (value: string) => encodeURIComponent(value);

  return {
    async session(): Promise<Session | null> {
      try {
        return await request<Session>('GET', '/api/session');
      } catch (err) {
        if (err instanceof Error && 'status' in err && err.status === 401) return null;
        throw err;
      }
    },
    login: async (email: string, password: string): Promise<ApiUser> => (await request<Session>('POST', '/api/login', { email, password })).user,
    logout: () => request<Ok>('POST', '/api/logout', {}),
    invite: (token: string) => request<LinkOwner>('GET', `/api/invite/${id(token)}`),
    signup: async (token: string, password: string): Promise<ApiUser> => (await request<Session>('POST', '/api/signup', { token, password })).user,
    resetInfo: (token: string) => request<LinkOwner>('GET', `/api/reset/${id(token)}`),
    reset: (token: string, password: string) => request<Ok>('POST', '/api/reset', { token, password }),
    state: () => request<ApiState>('GET', '/api/state'),
    // Deprecated: the birthdate belongs to a baby now. Task 6 removes this with its last caller.
    setBirthdate: (birthdate: string) => request<Ok>('PUT', '/api/birthdate', { birthdate }),
    setLanguage: (language: Language) => request<Ok>('PUT', '/api/language', { language }),
    // Ingredients are typed in the language showing, so the server is told which one.
    suggest: async (ingredients: string[]): Promise<ApiRecipe> =>
      (await request<{ recipe: ApiRecipe }>('POST', '/api/recipe', { ingredients, language: getLanguage() })).recipe,
    translateTitles: async (language: TranslatedLanguage, titles: string[]): Promise<Record<string, string>> =>
      (await request<{ titles: Record<string, string> }>('POST', '/api/translate/titles', { language, titles })).titles,
    translateRecipe: async (language: TranslatedLanguage, recipe: ApiRecipe): Promise<RecipeTranslation> =>
      (await request<{ translation: RecipeTranslation }>('POST', '/api/translate/recipe', { language, recipe })).translation,
    like: (recipe: ApiRecipe) => request<Ok>('POST', '/api/liked', { recipe }),
    unlike: (recipeId: string) => request<Ok>('DELETE', `/api/liked/${id(recipeId)}`),
    dislike: (recipe: ApiRecipe) => request<Ok>('POST', '/api/disliked', { recipe }),
    restore: (recipeId: string) => request<Ok>('POST', `/api/disliked/${id(recipeId)}/restore`, {}),
    listShared: async (): Promise<SharedItem[]> => (await request<{ recipes: SharedItem[] }>('GET', '/api/shared')).recipes,
    share: (recipeId: string) => request<Ok>('POST', '/api/shared', { id: recipeId }),
    unshare: (recipeId: string) => request<Ok>('DELETE', `/api/shared/${id(recipeId)}`),
    likeShared: (sharedId: string) => request<Ok>('POST', `/api/shared/${id(sharedId)}/like`, {}),
    unlikeShared: (sharedId: string) => request<Ok>('DELETE', `/api/shared/${id(sharedId)}/like`),
    babies: () => request<{ babies: ApiBaby[]; lastBabyId: string | null }>('GET', '/api/babies'),
    addBaby: async (input: BabyInput): Promise<ApiBaby> => (await request<{ baby: ApiBaby }>('POST', '/api/babies', input)).baby,
    updateBaby: (babyId: string, input: BabyInput) => request<Ok>('PUT', `/api/babies/${id(babyId)}`, input),
    removeBaby: (babyId: string) => request<Ok>('DELETE', `/api/babies/${id(babyId)}`),
    setLastBaby: (babyId: string) => request<Ok>('PUT', '/api/last-baby', { id: babyId }),
    withBaby: (other: string | null): Api => createApi(fetchImpl, other),
    deleteAccount: () => request<Ok>('DELETE', '/api/account'),
    admin: {
      overview: () => request<AdminOverview>('GET', '/api/admin/overview'),
      createInvite: (email: string) => request<IssuedLink>('POST', '/api/admin/invites', { email }),
      revokeInvite: (inviteId: string) => request<Ok>('DELETE', `/api/admin/invites/${id(inviteId)}`),
      reset: (userId: string) => request<IssuedLink>('POST', `/api/admin/people/${id(userId)}/reset`, {}),
      remove: (userId: string) => request<Ok>('DELETE', `/api/admin/people/${id(userId)}`),
    },
  };
}
