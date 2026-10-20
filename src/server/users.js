import { AppError } from './errors.js';
import { hashPassword, hashToken, newToken } from './auth.js';

const DAY = 86400000;
const INVITE_DAYS = 7;
const RESET_HOURS = 24;
export const MIN_PASSWORD = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s) => typeof s === 'string' && UUID.test(s);

export function normalizeEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (e.length > 254 || e.includes('\u0000') || !/^[^\s@]+@[^\s@]+$/.test(e)) {
    throw new AppError('invalid-input', 'Enter a valid email address', { key: 'err.email' });
  }
  return e;
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new AppError('invalid-input', `Use a password with at least ${MIN_PASSWORD} characters`, {
      key: 'err.passwordShort', params: { min: MIN_PASSWORD },
    });
  }
}

async function insertInvite(db, email, isAdmin, now) {
  const token = newToken();
  const { rows } = await db.query(
    `insert into invites (email, token_hash, is_admin, expires_at, created_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [email, hashToken(token), isAdmin, new Date(now.getTime() + INVITE_DAYS * DAY), now],
  );
  return { id: rows[0].id, token };
}

export async function createInvite(db, email, now) {
  const e = normalizeEmail(email);
  if ((await db.query('select 1 from users where email = $1', [e])).rows.length) {
    throw new AppError('conflict', 'That email already has an account', { key: 'err.emailTaken' });
  }
  const pending = await db.query(
    'select 1 from invites where email = $1 and used_at is null and expires_at > $2', [e, now],
  );
  if (pending.rows.length) throw new AppError('conflict', 'That email already has a pending invite', { key: 'err.invitePending' });
  return insertInvite(db, e, false, now);
}

export async function getInvite(db, token, now) {
  const { rows } = await db.query(
    'select email from invites where token_hash = $1 and used_at is null and expires_at > $2',
    [hashToken(String(token)), now],
  );
  if (!rows.length) throw new AppError('not-found', 'This invite link is not valid', { key: 'err.inviteInvalid' });
  return { email: rows[0].email };
}

export async function acceptInvite(db, { token, password }, now) {
  checkPassword(password);
  const passwordHash = await hashPassword(password);
  return db.transaction(async (tx) => {
    const used = await tx.query(
      `update invites set used_at = $2
       where token_hash = $1 and used_at is null and expires_at > $2
       returning email, is_admin`,
      [hashToken(String(token)), now],
    );
    if (!used.rows.length) throw new AppError('not-found', 'This invite link is not valid', { key: 'err.inviteInvalid' });
    const { email, is_admin: isAdmin } = used.rows[0];
    if (isAdmin && (await tx.query('select 1 from users where is_admin')).rows.length) {
      throw new AppError('conflict', 'An admin already exists', { key: 'err.adminExists' });
    }
    const created = await tx.query(
      `insert into users (email, password_hash, is_admin, created_at) values ($1, $2, $3, $4)
       on conflict (email) do nothing returning id`,
      [email, passwordHash, isAdmin, now],
    );
    if (!created.rows.length) throw new AppError('conflict', 'That email already has an account', { key: 'err.emailTaken' });
    await tx.query('delete from login_attempts where email = $1', [email]);
    return { id: created.rows[0].id, email, isAdmin };
  });
}

export async function listInvites(db, now) {
  const { rows } = await db.query(
    'select id, email, used_at, expires_at, created_at from invites order by created_at desc',
  );
  return rows.map((r) => {
    const status = r.used_at ? 'used' : new Date(r.expires_at) <= now ? 'expired' : 'pending';
    return {
      id: r.id,
      email: r.email,
      status,
      daysLeft: status === 'pending' ? Math.ceil((new Date(r.expires_at) - now) / DAY) : null,
      createdAt: new Date(r.created_at).toISOString(),
    };
  });
}

export async function revokeInvite(db, id) {
  const deleted = isUuid(id)
    ? await db.query('delete from invites where id = $1 and used_at is null returning id', [id])
    : { rows: [] };
  if (!deleted.rows.length) throw new AppError('not-found', 'Invite not found', { key: 'err.inviteMissing' });
}

export async function createAdmin(db, email, now) {
  const e = normalizeEmail(email);
  const admin = (await db.query('select id, email from users where is_admin')).rows[0];
  if (admin) {
    if (admin.email !== e) throw new AppError('conflict', 'An admin already exists', { key: 'err.adminExists' });
    const { token } = await createReset(db, admin.id, now);
    return { kind: 'reset', token };
  }
  if ((await db.query('select 1 from users where email = $1', [e])).rows.length) {
    throw new AppError('conflict', 'That email already has an account', { key: 'err.emailTaken' });
  }
  await db.query('delete from invites where is_admin and used_at is null');
  const { token } = await insertInvite(db, e, true, now);
  return { kind: 'invite', token };
}

export async function createReset(db, userId, now) {
  const exists = isUuid(userId) && (await db.query('select 1 from users where id = $1', [userId])).rows.length;
  if (!exists) throw new AppError('not-found', 'Person not found', { key: 'err.personMissing' });
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.query('delete from resets where user_id = $1 and used_at is null', [userId]);
    await tx.query(
      'insert into resets (user_id, token_hash, expires_at) values ($1, $2, $3)',
      [userId, hashToken(token), new Date(now.getTime() + RESET_HOURS * 3600000)],
    );
  });
  return { token };
}

export async function getReset(db, token, now) {
  const { rows } = await db.query(
    `select u.email from resets r join users u on u.id = r.user_id
     where r.token_hash = $1 and r.used_at is null and r.expires_at > $2`,
    [hashToken(String(token)), now],
  );
  if (!rows.length) throw new AppError('not-found', 'This reset link is not valid', { key: 'err.resetInvalid' });
  return { email: rows[0].email };
}

export async function useReset(db, { token, password }, now) {
  checkPassword(password);
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx) => {
    const used = await tx.query(
      `update resets set used_at = $2
       where token_hash = $1 and used_at is null and expires_at > $2 returning user_id`,
      [hashToken(String(token)), now],
    );
    if (!used.rows.length) throw new AppError('not-found', 'This reset link is not valid', { key: 'err.resetInvalid' });
    const userId = used.rows[0].user_id;
    const user = await tx.query('update users set password_hash = $2 where id = $1 returning email', [userId, passwordHash]);
    await tx.query('delete from sessions where user_id = $1', [userId]);
    await tx.query('delete from login_attempts where email = $1', [user.rows[0].email]);
  });
}

export async function listPeople(db, now) {
  const day = now.toISOString().slice(0, 10);
  const { rows } = await db.query(
    `select u.id, u.email, u.is_admin, u.created_at, u.last_login_at, coalesce(g.recipes, 0)::int as recipes
     from users u left join usage g on g.user_id = u.id and g.day = $1::date
     order by u.is_admin desc, u.created_at`,
    [day],
  );
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    isAdmin: r.is_admin,
    joinedAt: new Date(r.created_at).toISOString(),
    lastLoginAt: r.last_login_at ? new Date(r.last_login_at).toISOString() : null,
    recipesToday: r.is_admin ? null : r.recipes,
  }));
}

export async function removeUser(db, userId) {
  const user = isUuid(userId) ? (await db.query('select email, is_admin from users where id = $1', [userId])).rows[0] : null;
  if (!user) throw new AppError('not-found', 'Person not found', { key: 'err.personMissing' });
  if (user.is_admin) throw new AppError('forbidden', 'The admin cannot be removed', { key: 'err.adminProtected' });
  await db.transaction(async (tx) => {
    await tx.query('delete from invites where email = $1', [user.email]);
    await tx.query('delete from login_attempts where email = $1', [user.email]);
    await tx.query('delete from users where id = $1', [userId]);
  });
}

