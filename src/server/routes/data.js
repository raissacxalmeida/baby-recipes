import { AppError } from '../errors.js';
import { requestRecipe } from '../recipeService.js';
import {
  likeShared, listShared, shareRecipe, unlikeShared, unshareRecipe,
} from '../sharedRecipes.js';
import {
  dislike, getState, like, restore, setBirthdate, unlike,
} from '../userData.js';
import { LIMITS, nextReset, usageToday } from '../usage.js';
import { removeUser } from '../users.js';

const ok = () => ({ body: { ok: true } });

export const dataRoutes = [
  {
    method: 'GET', pattern: '/api/state', access: 'user',
    async handler({ db, user, now }) {
      const state = await getState(db, user.id);
      const usage = user.isAdmin
        ? null
        : {
          recipesToday: (await usageToday(db, user.id, now())).recipes,
          limit: LIMITS.recipes,
          resetsAt: nextReset(now()).toISOString(),
        };
      return { body: { ...state, usage } };
    },
  },
  {
    method: 'PUT', pattern: '/api/birthdate', access: 'user',
    async handler({ db, user, body, now }) {
      await setBirthdate(db, user.id, body.birthdate, now());
      return ok();
    },
  },
  {
    method: 'POST', pattern: '/api/recipe', access: 'user',
    async handler({ db, user, body, now, callModel }) {
      const recipe = await requestRecipe(db, user, body.ingredients, { callModel, now });
      return { body: { recipe } };
    },
  },
  {
    method: 'POST', pattern: '/api/liked', access: 'user',
    async handler({ db, user, body }) {
      await like(db, user.id, body.recipe);
      return ok();
    },
  },
  {
    method: 'DELETE', pattern: '/api/liked/:id', access: 'user',
    async handler({ db, user, params }) {
      await unlike(db, user.id, params.id);
      return ok();
    },
  },
  {
    method: 'POST', pattern: '/api/disliked', access: 'user',
    async handler({ db, user, body }) {
      await dislike(db, user.id, body.recipe);
      return ok();
    },
  },
  {
    method: 'POST', pattern: '/api/disliked/:id/restore', access: 'user',
    async handler({ db, user, params }) {
      await restore(db, user.id, params.id);
      return ok();
    },
  },
  {
    method: 'GET', pattern: '/api/shared', access: 'user',
    async handler({ db, user }) {
      return { body: { recipes: await listShared(db, user.id) } };
    },
  },
  {
    method: 'POST', pattern: '/api/shared', access: 'user',
    async handler({ db, user, body, now }) {
      if (typeof body.id !== 'string') throw new AppError('invalid-input', 'Choose a recipe to share');
      await shareRecipe(db, user.id, body.id, now());
      return ok();
    },
  },
  {
    method: 'DELETE', pattern: '/api/shared/:recipeId', access: 'user',
    async handler({ db, user, params }) {
      await unshareRecipe(db, user.id, params.recipeId);
      return ok();
    },
  },
  {
    method: 'POST', pattern: '/api/shared/:sharedId/like', access: 'user',
    async handler({ db, user, params }) {
      await likeShared(db, user.id, params.sharedId);
      return ok();
    },
  },
  {
    method: 'DELETE', pattern: '/api/shared/:sharedId/like', access: 'user',
    async handler({ db, user, params }) {
      await unlikeShared(db, user.id, params.sharedId);
      return ok();
    },
  },
  {
    method: 'DELETE', pattern: '/api/account', access: 'user',
    async handler({ db, user }) {
      await removeUser(db, user.id);
      return { body: { ok: true }, clearSession: true };
    },
  },
];
