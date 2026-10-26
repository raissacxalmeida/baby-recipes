import { getLanguage, hasKey, t } from './i18n/index.js';

export function createApi(fetchImpl = (...args) => fetch(...args)) {
  async function request(method, path, body) {
    let res;
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
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // The server's English message is the fallback for a key this browser has no text for.
      const message = data.key && hasKey(data.key) ? t(data.key, data.params) : data.message ?? t('err.generic');
      // The error keeps its key and values so the screen can word it again after a language switch.
      const key = data.key && hasKey(data.key) ? data.key : data.message ? undefined : 'err.generic';
      throw Object.assign(new Error(message), { status: res.status, code: data.error, key, params: data.params });
    }
    return data;
  }
  const id = (value) => encodeURIComponent(value);

  return {
    async session() {
      try {
        return await request('GET', '/api/session');
      } catch (err) {
        if (err.status === 401) return null;
        throw err;
      }
    },
    login: async (email, password) => (await request('POST', '/api/login', { email, password })).user,
    logout: () => request('POST', '/api/logout', {}),
    invite: (token) => request('GET', `/api/invite/${id(token)}`),
    signup: async (token, password) => (await request('POST', '/api/signup', { token, password })).user,
    resetInfo: (token) => request('GET', `/api/reset/${id(token)}`),
    reset: (token, password) => request('POST', '/api/reset', { token, password }),
    state: () => request('GET', '/api/state'),
    setBirthdate: (birthdate) => request('PUT', '/api/birthdate', { birthdate }),
    setLanguage: (language) => request('PUT', '/api/language', { language }),
    // Ingredients are typed in the language showing, so the server is told which one.
    suggest: async (ingredients) => (await request('POST', '/api/recipe', { ingredients, language: getLanguage() })).recipe,
    translateTitles: async (language, titles) => (await request('POST', '/api/translate/titles', { language, titles })).titles,
    translateRecipe: async (language, recipe) => (await request('POST', '/api/translate/recipe', { language, recipe })).translation,
    like: (recipe) => request('POST', '/api/liked', { recipe }),
    unlike: (recipeId) => request('DELETE', `/api/liked/${id(recipeId)}`),
    dislike: (recipe) => request('POST', '/api/disliked', { recipe }),
    restore: (recipeId) => request('POST', `/api/disliked/${id(recipeId)}/restore`, {}),
    listShared: async () => (await request('GET', '/api/shared')).recipes,
    share: (recipeId) => request('POST', '/api/shared', { id: recipeId }),
    unshare: (recipeId) => request('DELETE', `/api/shared/${id(recipeId)}`),
    likeShared: (sharedId) => request('POST', `/api/shared/${id(sharedId)}/like`, {}),
    unlikeShared: (sharedId) => request('DELETE', `/api/shared/${id(sharedId)}/like`),
    deleteAccount: () => request('DELETE', '/api/account'),
    admin: {
      overview: () => request('GET', '/api/admin/overview'),
      createInvite: (email) => request('POST', '/api/admin/invites', { email }),
      revokeInvite: (inviteId) => request('DELETE', `/api/admin/invites/${id(inviteId)}`),
      reset: (userId) => request('POST', `/api/admin/people/${id(userId)}/reset`, {}),
      remove: (userId) => request('DELETE', `/api/admin/people/${id(userId)}`),
    },
  };
}
