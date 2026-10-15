import {
  createInvite, createReset, listInvites, listPeople, removeUser, revokeInvite,
} from '../users.js';
import { LIMITS } from '../usage.js';

export const adminRoutes = [
  {
    method: 'GET', pattern: '/api/admin/overview', access: 'admin',
    async handler({ db, now }) {
      return {
        body: {
          invites: await listInvites(db, now()),
          people: await listPeople(db, now()),
          limit: LIMITS.recipes,
        },
      };
    },
  },
  {
    method: 'POST', pattern: '/api/admin/invites', access: 'admin',
    async handler({ db, body, now, config }) {
      const { token } = await createInvite(db, body.email, now());
      return { body: { link: `${config.publicUrl}/invite/${token}` } };
    },
  },
  {
    method: 'DELETE', pattern: '/api/admin/invites/:id', access: 'admin',
    async handler({ db, params }) {
      await revokeInvite(db, params.id);
      return { body: { ok: true } };
    },
  },
  {
    method: 'POST', pattern: '/api/admin/people/:id/reset', access: 'admin',
    async handler({ db, params, now, config }) {
      const { token } = await createReset(db, params.id, now());
      return { body: { link: `${config.publicUrl}/reset/${token}` } };
    },
  },
  {
    method: 'DELETE', pattern: '/api/admin/people/:id', access: 'admin',
    async handler({ db, params }) {
      await removeUser(db, params.id);
      return { body: { ok: true } };
    },
  },
];
