import type { Language, TranslatedLanguage } from '../shared/types.js';
import type {
  AdminOverview, ApiRecipe, ApiState, ApiUser, IssuedLink, LinkOwner, Ok,
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

export function createApi(fetchImpl: FetchImpl = (url, init) => fetch(url, init)) {
  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    let res: FetchResponse;
    try {
      res = await fetchImpl(path, {
        method,
        credentials: 'same-origin',
        headers: {
          'X-Requested-With': 'fetch',
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

export type Api = ReturnType<typeof createApi>;
