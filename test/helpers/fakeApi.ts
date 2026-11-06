import { vi, type Mock } from 'vitest';
import { groupFor } from '../../src/shared/recipeGroup.js';
import type { Api } from '../../src/client/api.js';
import type { ApiBaby, ApiRecipe, ApiUser, SharedItem } from '../../src/client/apiTypes.js';

const LIMIT = 10;
// The same cap the server holds (MAX_BABIES in src/server/babies.ts).
const MAX_BABIES = 5;

// Every function of the Api as a vi.fn with the same signature, so a test can both call it and read its calls,
// and the fake still type-checks as an Api: a method added to or changed on the real one fails here.
type Mocked<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? Mock<(...args: A) => R> : Mocked<T[K]>;
};

// Tests may leave out `language`: the fake then hands the user back without it, where the server sends null.
export type FakeUser = Omit<ApiUser, 'language'> & Partial<Pick<ApiUser, 'language'>>;

// What belongs to one baby: their lists, the titles already shown, and which liked recipes came from the community.
interface BabyData {
  liked: ApiRecipe[];
  disliked: ApiRecipe[];
  shown: string[];
  copied: Set<string>;
}

// `liked`, `disliked`, `shown`, `copied` and `birthdate` are the selected baby's (the first one until withBaby picks
// another); with no baby, `birthdate` is null and the lists throw, as the server's baby routes refuse a request
// without a baby. `used`, `queue` and `shared` belong to the account.
export interface FakeState {
  user: FakeUser | null;
  babies: ApiBaby[];
  lastBabyId: string | null;
  selectedBabyId: string | null;
  readonly birthdate: string | null;
  liked: ApiRecipe[];
  disliked: ApiRecipe[];
  shown: string[];
  readonly copied: Set<string>;
  used: number;
  queue: ApiRecipe[];
  shared: SharedItem[];
}

export type FakeApi = Mocked<Api> & { state_: FakeState };

// Overrides replace whole methods, so each must have the real method's type.
export type Overrides = Partial<Omit<Api, 'admin'>> & { admin?: Partial<Api['admin']> };

export interface FakeApiOptions {
  user?: FakeUser | null;
  birthdate?: string | null;
  // The account's babies. Without it, a birthdate makes one baby { id: 'baby-1', name: 'Mia', birthdate }, and null makes none.
  babies?: ApiBaby[];
  lastBabyId?: string | null;
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
export function createFakeApi({
  user = null, birthdate = null, babies, lastBabyId = null, recipes = [], shared = [], overrides = {},
}: FakeApiOptions = {}): FakeApi {
  const initial = babies ?? (birthdate !== null ? [{ id: 'baby-1', name: 'Mia', birthdate }] : []);
  const data = new Map<string, BabyData>();
  const dataOf = (babyId: string): BabyData => {
    let found = data.get(babyId);
    if (!found) { found = { liked: [], disliked: [], shown: [], copied: new Set() }; data.set(babyId, found); }
    return found;
  };
  const selectedId = () => (state.babies.find((b) => b.id === state.selectedBabyId) ?? state.babies[0])?.id ?? null;
  // The same answer as the server's requireBaby for a request that names no baby.
  const babyRequired = () => Object.assign(new Error('Choose a baby first'), { status: 400, key: 'err.babyRequired' });
  const cur = (): BabyData => {
    const id = selectedId();
    if (id === null) throw babyRequired();
    return dataOf(id);
  };
  const state: FakeState = {
    user,
    babies: initial.map((b) => ({ ...b })),
    lastBabyId,
    selectedBabyId: null,
    get birthdate() { return state.babies.find((b) => b.id === selectedId())?.birthdate ?? null; },
    get liked() { return cur().liked; },
    set liked(value) { cur().liked = value; },
    get disliked() { return cur().disliked; },
    set disliked(value) { cur().disliked = value; },
    get shown() { return cur().shown; },
    set shown(value) { cur().shown = value; },
    get copied() { return cur().copied; },
    used: 0,
    queue: [...recipes],
    shared: [...shared],
  };
  const notFound = () => Object.assign(new Error('That baby is not available'), { status: 404 });
  const by = (list: ApiRecipe[], id: string) => list.filter((r) => r.id !== id);
  const unshareOwn = (recipeId: string) => { state.shared = state.shared.filter((s) => !(s.mine && s.recipe.id === recipeId)); };
  const holdsCopy = (recipeId: string) => [...data.values()].some((d) => d.copied.has(recipeId));
  // The account's Community like goes once no baby holds a copy saved from it.
  const takeLikeBack = (recipeId: string) => {
    if (holdsCopy(recipeId)) return;
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
      // The heart is the account's; the copy goes into the selected baby's list (unless it holds the same recipe as its own).
      if (!item.liked) Object.assign(item, { liked: true, likes: item.likes + 1 });
      if (!state.liked.some((r) => r.id === item.recipe.id)) {
        state.liked = [...state.liked, item.recipe];
        state.disliked = by(state.disliked, item.recipe.id);
        state.copied.add(item.recipe.id);
      }
      return ok;
    }),
    unlikeShared: vi.fn<Api['unlikeShared']>(async (sharedId) => {
      const item = state.shared.find((s) => s.id === sharedId);
      if (!item) return ok;
      if (item.liked) Object.assign(item, { liked: false, likes: item.likes - 1 });
      // The copy goes from whichever baby holds it.
      for (const d of data.values()) {
        if (d.copied.delete(item.recipe.id)) d.liked = by(d.liked, item.recipe.id);
      }
      return ok;
    }),
    restore: vi.fn<Api['restore']>(async (id) => {
      const found = state.disliked.find((r) => r.id === id);
      state.disliked = by(state.disliked, id);
      if (found) state.shown = state.shown.filter((t) => t !== found.title);
      return ok;
    }),
    babies: vi.fn<Api['babies']>(async () => ({ babies: state.babies.map((b) => ({ ...b })), lastBabyId: state.lastBabyId })),
    addBaby: vi.fn<Api['addBaby']>(async ({ name, birthdate: born }) => {
      if (state.babies.length >= MAX_BABIES) {
        throw Object.assign(new Error(`You can add up to ${MAX_BABIES} babies`), { status: 409 });
      }
      let n = state.babies.length + 1;
      while (state.babies.some((b) => b.id === `baby-${n}`)) n += 1;
      const baby = { id: `baby-${n}`, name, birthdate: born };
      state.babies.push(baby);
      return { ...baby };
    }),
    updateBaby: vi.fn<Api['updateBaby']>(async (babyId, { name, birthdate: born }) => {
      const baby = state.babies.find((b) => b.id === babyId);
      if (!baby) throw notFound();
      Object.assign(baby, { name, birthdate: born });
      return ok;
    }),
    removeBaby: vi.fn<Api['removeBaby']>(async (babyId) => {
      if (!state.babies.some((b) => b.id === babyId)) throw notFound();
      if (state.babies.length <= 1) throw Object.assign(new Error('You cannot remove your only baby'), { status: 409 });
      const gone = dataOf(babyId);
      state.babies = state.babies.filter((b) => b.id !== babyId);
      data.delete(babyId);
      // The likes behind the baby's saved copies go unless a sibling still holds a copy.
      for (const recipeId of gone.copied) takeLikeBack(recipeId);
      if (state.lastBabyId === babyId) state.lastBabyId = null;
      if (state.selectedBabyId === babyId) state.selectedBabyId = null;
      return ok;
    }),
    setLastBaby: vi.fn<Api['setLastBaby']>(async (babyId) => {
      if (!state.babies.some((b) => b.id === babyId)) throw notFound();
      state.lastBabyId = babyId;
      return ok;
    }),
    // One fake serves every baby: this picks the one the next calls are for, and hands the same fake back.
    withBaby: vi.fn<Api['withBaby']>((babyId) => { state.selectedBabyId = babyId; return api; }),
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
