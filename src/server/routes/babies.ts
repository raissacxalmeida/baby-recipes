import type { Route } from '../types.js';
import {
  addBaby, getLastBabyId, listBabies, removeBaby, setLastBaby, updateBaby,
} from '../babies.js';

const ok = (): { body: { ok: true } } => ({ body: { ok: true } });

export const babyRoutes: Route[] = [
  {
    method: 'GET', pattern: '/api/babies', access: 'user',
    async handler({ db, user }) {
      return { body: { babies: await listBabies(db, user.id), lastBabyId: await getLastBabyId(db, user.id) } };
    },
  },
  {
    method: 'POST', pattern: '/api/babies', access: 'user',
    async handler({ db, user, body, now }) {
      return { body: { baby: await addBaby(db, user.id, { name: body.name, birthdate: body.birthdate }, now()) } };
    },
  },
  {
    method: 'PUT', pattern: '/api/babies/:id', access: 'user',
    async handler({ db, user, params, body, now }) {
      await updateBaby(db, user.id, params.id, { name: body.name, birthdate: body.birthdate }, now());
      return ok();
    },
  },
  {
    method: 'DELETE', pattern: '/api/babies/:id', access: 'user',
    async handler({ db, user, params }) {
      await removeBaby(db, user.id, params.id);
      return ok();
    },
  },
  {
    method: 'PUT', pattern: '/api/last-baby', access: 'user',
    async handler({ db, user, body }) {
      await setLastBaby(db, user.id, body.id);
      return ok();
    },
  },
];
