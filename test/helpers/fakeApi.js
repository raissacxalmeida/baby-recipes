import { vi } from 'vitest';

const LIMIT = 10;

// In-memory Api with the same rules as the server, so screen tests need no network.
export function createFakeApi({ user = null, birthdate = null, recipes = [], overrides = {} } = {}) {
  const state = { user, birthdate, liked: [], disliked: [], shown: [], used: 0, queue: [...recipes] };
  const by = (list, id) => list.filter((r) => r.id !== id);

  const api = {
    state_: state,
    session: vi.fn(async () => (state.user ? { user: state.user } : null)),
    login: vi.fn(async (email, password) => {
      if (password !== 'a long enough password') throw Object.assign(new Error('Wrong email or password'), { status: 401 });
      state.user = { email, isAdmin: email.startsWith('admin') };
      return state.user;
    }),
    logout: vi.fn(async () => { state.user = null; }),
    invite: vi.fn(async () => ({ email: 'ana@example.com' })),
    signup: vi.fn(async () => { state.user = { email: 'ana@example.com', isAdmin: false }; return state.user; }),
    resetInfo: vi.fn(async () => ({ email: 'ana@example.com' })),
    reset: vi.fn(async () => {}),
    state: vi.fn(async () => ({
      birthdate: state.birthdate,
      liked: [...state.liked],
      disliked: [...state.disliked],
      usage: state.user?.isAdmin ? null : { recipesToday: state.used, limit: LIMIT, resetsAt: '2026-10-16T00:00:00.000Z' },
    })),
    setBirthdate: vi.fn(async (d) => { state.birthdate = d; }),
    suggest: vi.fn(async () => {
      const skip = new Set([...state.shown, ...state.disliked.map((r) => r.title)]);
      const next = state.queue.find((r) => !skip.has(r.title));
      if (!next) throw new Error('No more recipes');
      state.used += 1;
      state.shown.push(next.title);
      return next;
    }),
    like: vi.fn(async (r) => { state.liked = [...by(state.liked, r.id), r]; state.disliked = by(state.disliked, r.id); }),
    unlike: vi.fn(async (id) => { state.liked = by(state.liked, id); }),
    dislike: vi.fn(async (r) => { state.disliked = [...by(state.disliked, r.id), r]; state.liked = by(state.liked, r.id); }),
    restore: vi.fn(async (id) => {
      const found = state.disliked.find((r) => r.id === id);
      state.disliked = by(state.disliked, id);
      if (found) state.shown = state.shown.filter((t) => t !== found.title);
    }),
    deleteAccount: vi.fn(async () => { state.user = null; }),
    admin: {
      overview: vi.fn(async () => ({ invites: [], people: [] })),
      createInvite: vi.fn(async (email) => ({ link: `http://my-mac.local:3000/invite/${email}` })),
      revokeInvite: vi.fn(async () => {}),
      reset: vi.fn(async () => ({ link: 'http://my-mac.local:3000/reset/abc' })),
      remove: vi.fn(async () => {}),
      ...overrides.admin,
    },
  };
  const { admin: _ignored, ...rest } = overrides;
  return Object.assign(api, rest);
}
