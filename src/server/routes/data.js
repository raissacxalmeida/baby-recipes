import { requestRecipe } from '../recipeService.js';
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
    method: 'DELETE', pattern: '/api/account', access: 'user',
    async handler({ db, user }) {
      await removeUser(db, user.id);
      return { body: { ok: true }, clearSession: true };
    },
  },
];
