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
      throw new Error('Could not reach the server');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.message ?? 'Something went wrong'), { status: res.status, code: data.error });
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
    suggest: async (ingredients) => (await request('POST', '/api/recipe', { ingredients })).recipe,
    like: (recipe) => request('POST', '/api/liked', { recipe }),
    unlike: (recipeId) => request('DELETE', `/api/liked/${id(recipeId)}`),
    dislike: (recipe) => request('POST', '/api/disliked', { recipe }),
    restore: (recipeId) => request('POST', `/api/disliked/${id(recipeId)}/restore`, {}),
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
