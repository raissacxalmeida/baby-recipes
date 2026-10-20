import { login, logout, startSession } from '../sessions.js';
import { acceptInvite, getInvite, getReset, useReset } from '../users.js';

const publicUser = (u) => ({ email: u.email, isAdmin: u.isAdmin, language: u.language ?? null });

export const authRoutes = [
  {
    method: 'POST', pattern: '/api/login', access: 'public',
    async handler({ db, body, now }) {
      const { token, user } = await login(db, { email: body.email, password: body.password }, now());
      return { body: { user: publicUser(user) }, setSession: token };
    },
  },
  {
    method: 'POST', pattern: '/api/logout', access: 'public',
    async handler({ db, sessionToken }) {
      if (sessionToken) await logout(db, sessionToken);
      return { body: { ok: true }, clearSession: true };
    },
  },
  {
    method: 'GET', pattern: '/api/session', access: 'user',
    async handler({ user }) {
      return { body: { user: publicUser(user) } };
    },
  },
  {
    method: 'GET', pattern: '/api/invite/:token', access: 'public',
    async handler({ db, params, now }) {
      return { body: await getInvite(db, params.token, now()) };
    },
  },
  {
    method: 'POST', pattern: '/api/signup', access: 'public',
    async handler({ db, body, now }) {
      const created = await acceptInvite(db, { token: body.token, password: body.password }, now());
      const token = await startSession(db, created, now());
      return { body: { user: publicUser(created) }, setSession: token };
    },
  },
  {
    method: 'GET', pattern: '/api/reset/:token', access: 'public',
    async handler({ db, params, now }) {
      return { body: await getReset(db, params.token, now()) };
    },
  },
  {
    method: 'POST', pattern: '/api/reset', access: 'public',
    async handler({ db, body, now }) {
      await useReset(db, { token: body.token, password: body.password }, now());
      return { body: { ok: true } };
    },
  },
];
