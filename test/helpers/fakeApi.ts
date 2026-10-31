import { vi, type Mock } from 'vitest';
import { groupFor } from '../../src/shared/recipeGroup.js';
import type { Api } from '../../src/client/api.js';
import type { ApiRecipe, ApiUser, SharedItem } from '../../src/client/apiTypes.js';

const LIMIT = 10;

// Every function of the Api as a vi.fn with the same signature, so a test can both call it and read its calls,
// and the fake still type-checks as an Api: a method added to or changed on the real one fails here.
type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : Mocked<T[K]>;
};

// Tests may leave out `language`: the fake then hands the user back without it, where the server sends null.
export type FakeUser = Omit<ApiUser, 'language'> & Partial<Pick<ApiUser, 'language'>>;

export interface FakeState {
  user: FakeUser | null;
  birthdate: string | null;
  liked: ApiRecipe[];
  disliked: ApiRecipe[];
  shown: string[];
  used: number;
  queue: ApiRecipe[];
  shared: SharedItem[];
  copied: Set<string>;
}

export type FakeApi = Mocked<Api> & { state_: FakeState };

// Overrides replace whole methods, so each must have the real method's type.
export type Overrides = Partial<Omit<Api, 'admin'>> & { admin?: Partial<Api['admin']> };

export interface FakeApiOptions {
  user?: FakeUser | null;
  birthdate?: string | null;
  recipes?: ApiRecipe[];
  shared?: SharedItem[];
  overrides?: Overrides;
}

// The fake leaves `language` unset on a user a test made without one; the client reads undefined and null alike
// (isLanguage), so the user is handed back, or to a screen, as the Api's type.
export const asUser = (user: FakeUser): ApiUser => user as ApiUser;
const ok = { ok: true } as const;

// In-memory Api with the same rules as the server, so screen tests need no network.
// `shared` seeds the community page with items shaped like the server's: { id, recipe, group, ageMonths, likes, mine, liked }.
export function createFakeApi({ user = null, birthdate = null, recipes = [], shared = [], overrides = {} }: FakeApiOptions = {}): FakeApi {
  const state: FakeState = {
    user, birthdate, liked: [], disliked: [], shown: [], used: 0, queue: [...recipes], shared: [...shared], copied: new Set(),
  };
  const by = (list: ApiRecipe[], id: string) => list.filter((r) => r.id !== id);
  const unshareOwn = (recipeId: string) => { state.shared = state.shared.filter((s) => !(s.mine && s.recipe.id === recipeId)); };
  const takeLikeBack = (recipeId: string) => {
    const item = state.shared.find((s) => !s.mine && s.liked && s.recipe.id === recipeId);
    if (item) Object.assign(item, { liked: false, likes: item.likes - 1 });
  };

  const api: FakeApi = {
    state_: state,
    session: vi.fn<Api['session']>(async () => (state.user ? { user: asUser(state.user) } : null)),
    login: vi.fn<Api['login']>(async (email, password) => {
      if (password !== 'a long enough password') throw Object.assign(new Error('Wrong email or password'), { status: 401 });
      state.user = { email, isAdmin: email.startsWith('admin') };
      return asUser(state.user);
    }),
    logout: vi.fn<Api['logout']>(async () => { state.user = null; return ok; }),
    invite: vi.fn<Api['invite']>(async () => ({ email: 'ana@example.com' })),
    signup: vi.fn<Api['signup']>(async () => { state.user = { email: 'ana@example.com', isAdmin: false }; return asUser(state.user); }),
    resetInfo: vi.fn<Api['resetInfo']>(async () => ({ email: 'ana@example.com' })),
    reset: vi.fn<Api['reset']>(async () => ok),
    state: vi.fn<Api['state']>(async () => ({
      birthdate: state.birthdate,
      liked: [...state.liked],
      disliked: [...state.disliked],
      sharedIds: state.shared.filter((s) => s.mine).map((s) => s.recipe.id),
      copiedIds: [...state.copied],
      usage: state.user?.isAdmin ? null : { recipesToday: state.used, limit: LIMIT, resetsAt: '2026-10-16T00:00:00.000Z' },
    })),
    setBirthdate: vi.fn<Api['setBirthdate']>(async (d) => { state.birthdate = d; return ok; }),
    setLanguage: vi.fn<Api['setLanguage']>(async (language) => { if (state.user) state.user = { ...state.user, language }; return ok; }),
    suggest: vi.fn<Api['suggest']>(async () => {
      const skip = new Set([...state.shown, ...state.disliked.map((r) => r.title)]);
      const next = state.queue.find((r) => !skip.has(r.title));
      if (!next) throw new Error('No more recipes');
      state.used += 1;
      state.shown.push(next.title);
      return next;
    }),
    translateTitles: vi.fn<Api['translateTitles']>(async (language, titles) => Object.fromEntries(titles.map((title) => [title, `${language}:${title}`]))),
    translateRecipe: vi.fn<Api['translateRecipe']>(async (language, recipe) => ({
      title: `${language}:${recipe.title}`,
      ingredients: recipe.ingredients.map((i) => `${language}:${i.name}`),
      steps: recipe.steps.map((step) => `${language}:${step}`),
    })),
    like: vi.fn<Api['like']>(async (r) => {
      state.liked = [...by(state.liked, r.id), r];
      state.disliked = by(state.disliked, r.id);
      state.copied.delete(r.id);
      return ok;
    }),
    unlike: vi.fn<Api['unlike']>(async (id) => {
      state.liked = by(state.liked, id);
      unshareOwn(id);
      if (state.copied.delete(id)) takeLikeBack(id);
      return ok;
    }),
    dislike: vi.fn<Api['dislike']>(async (r) => {
      state.disliked = [...by(state.disliked, r.id), r];
      state.liked = by(state.liked, r.id);
      state.copied.delete(r.id);
      unshareOwn(r.id);
      return ok;
    }),
    listShared: vi.fn<Api['listShared']>(async () => state.shared.map((s) => ({ ...s }))),
    share: vi.fn<Api['share']>(async (recipeId) => {
      const recipe = state.liked.find((r) => r.id === recipeId);
      if (!recipe) throw Object.assign(new Error('Like the recipe first, then share it'), { status: 404 });
      if (state.copied.has(recipeId)) throw Object.assign(new Error('This recipe came from the community already'), { status: 409 });
      if (state.shared.some((s) => s.mine && s.recipe.id === recipeId)) return ok;
      state.shared.push({
        id: `mine-${recipeId}`, recipe, group: groupFor(recipe), ageMonths: 8, likes: 0, mine: true, liked: false,
      });
      return ok;
    }),
    unshare: vi.fn<Api['unshare']>(async (recipeId) => { unshareOwn(recipeId); return ok; }),
    likeShared: vi.fn<Api['likeShared']>(async (sharedId) => {
      const item = state.shared.find((s) => s.id === sharedId);
      if (!item) throw Object.assign(new Error('That recipe is not available'), { status: 404 });
      if (item.mine) throw Object.assign(new Error('You shared this one'), { status: 400 });
      if (item.liked) return ok;
      Object.assign(item, { liked: true, likes: item.likes + 1 });
      if (!state.liked.some((r) => r.id === item.recipe.id)) {
        state.liked = [...state.liked, item.recipe];
        state.copied.add(item.recipe.id);
      }
      return ok;
    }),
    unlikeShared: vi.fn<Api['unlikeShared']>(async (sharedId) => {
      const item = state.shared.find((s) => s.id === sharedId);
      if (!item || !item.liked) return ok;
      Object.assign(item, { liked: false, likes: item.likes - 1 });
      if (state.copied.delete(item.recipe.id)) state.liked = by(state.liked, item.recipe.id);
      return ok;
    }),
    restore: vi.fn<Api['restore']>(async (id) => {
      const found = state.disliked.find((r) => r.id === id);
      state.disliked = by(state.disliked, id);
      if (found) state.shown = state.shown.filter((t) => t !== found.title);
      return ok;
    }),
    deleteAccount: vi.fn<Api['deleteAccount']>(async () => { state.user = null; return ok; }),
    admin: {
      overview: vi.fn<Api['admin']['overview']>(async () => ({ invites: [], people: [], limit: LIMIT })),
      createInvite: vi.fn<Api['admin']['createInvite']>(async (email) => ({ link: `http://my-mac.local:3000/invite/${email}` })),
      revokeInvite: vi.fn<Api['admin']['revokeInvite']>(async () => ok),
      reset: vi.fn<Api['admin']['reset']>(async () => ({ link: 'http://my-mac.local:3000/reset/abc' })),
      remove: vi.fn<Api['admin']['remove']>(async () => ok),
      // An override has the real method's type; the tests pass vi.fn() ones (or, once, a plain function they never
      // read calls from), so it is kept under the Mock type the tests read calls through.
      ...(overrides.admin as Partial<FakeApi['admin']>),
    },
  };
  const { admin: _ignored, ...rest } = overrides;
  // As above: each override replaces the method of the same name.
  return Object.assign(api, rest as Partial<FakeApi>);
}
