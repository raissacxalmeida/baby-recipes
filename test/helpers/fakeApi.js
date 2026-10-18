import { vi } from 'vitest';
import { groupFor } from '../../src/shared/recipeGroup.js';

const LIMIT = 10;

// In-memory Api with the same rules as the server, so screen tests need no network.
// `shared` seeds the community page with items shaped like the server's: { id, recipe, group, ageMonths, likes, mine, liked }.
export function createFakeApi({ user = null, birthdate = null, recipes = [], shared = [], overrides = {} } = {}) {
  const state = {
    user, birthdate, liked: [], disliked: [], shown: [], used: 0, queue: [...recipes], shared: [...shared], copied: new Set(),
  };
  const by = (list, id) => list.filter((r) => r.id !== id);
  const unshareOwn = (recipeId) => { state.shared = state.shared.filter((s) => !(s.mine && s.recipe.id === recipeId)); };
  const takeLikeBack = (recipeId) => {
    const item = state.shared.find((s) => !s.mine && s.liked && s.recipe.id === recipeId);
    if (item) Object.assign(item, { liked: false, likes: item.likes - 1 });
  };

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
      sharedIds: state.shared.filter((s) => s.mine).map((s) => s.recipe.id),
      copiedIds: [...state.copied],
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
    like: vi.fn(async (r) => {
      state.liked = [...by(state.liked, r.id), r];
      state.disliked = by(state.disliked, r.id);
      state.copied.delete(r.id);
    }),
    unlike: vi.fn(async (id) => {
      state.liked = by(state.liked, id);
      unshareOwn(id);
      if (state.copied.delete(id)) takeLikeBack(id);
    }),
    dislike: vi.fn(async (r) => {
      state.disliked = [...by(state.disliked, r.id), r];
      state.liked = by(state.liked, r.id);
      state.copied.delete(r.id);
      unshareOwn(r.id);
    }),
    listShared: vi.fn(async () => state.shared.map((s) => ({ ...s }))),
    share: vi.fn(async (recipeId) => {
      const recipe = state.liked.find((r) => r.id === recipeId);
      if (!recipe) throw Object.assign(new Error('Like the recipe first, then share it'), { status: 404 });
      if (state.copied.has(recipeId)) throw Object.assign(new Error('This recipe came from the community already'), { status: 409 });
      if (state.shared.some((s) => s.mine && s.recipe.id === recipeId)) return;
      state.shared.push({
        id: `mine-${recipeId}`, recipe, group: groupFor(recipe), ageMonths: 8, likes: 0, mine: true, liked: false,
      });
    }),
    unshare: vi.fn(async (recipeId) => { unshareOwn(recipeId); }),
    likeShared: vi.fn(async (sharedId) => {
      const item = state.shared.find((s) => s.id === sharedId);
      if (!item) throw Object.assign(new Error('That recipe is not available'), { status: 404 });
      if (item.mine) throw Object.assign(new Error('You shared this one'), { status: 400 });
      if (item.liked) return;
      Object.assign(item, { liked: true, likes: item.likes + 1 });
      if (!state.liked.some((r) => r.id === item.recipe.id)) {
        state.liked = [...state.liked, item.recipe];
        state.copied.add(item.recipe.id);
      }
    }),
    unlikeShared: vi.fn(async (sharedId) => {
      const item = state.shared.find((s) => s.id === sharedId);
      if (!item || !item.liked) return;
      Object.assign(item, { liked: false, likes: item.likes - 1 });
      if (state.copied.delete(item.recipe.id)) state.liked = by(state.liked, item.recipe.id);
    }),
    restore: vi.fn(async (id) => {
      const found = state.disliked.find((r) => r.id === id);
      state.disliked = by(state.disliked, id);
      if (found) state.shown = state.shown.filter((t) => t !== found.title);
    }),
    deleteAccount: vi.fn(async () => { state.user = null; }),
    admin: {
      overview: vi.fn(async () => ({ invites: [], people: [], limit: LIMIT })),
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
