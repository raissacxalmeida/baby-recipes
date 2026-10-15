import { AppError } from './errors.js';
import { hashPassword, hashToken, newToken } from './auth.js';

const DAY = 86400000;
const INVITE_DAYS = 7;
export const MIN_PASSWORD = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (s) => typeof s === 'string' && UUID.test(s);

export function normalizeEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw new AppError('invalid-input', 'Enter a valid email address');
  return e;
}

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw new AppError('invalid-input', `Use a password with at least ${MIN_PASSWORD} characters`);
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
    throw new AppError('conflict', 'That email already has an account');
  }
  const pending = await db.query(
    'select 1 from invites where email = $1 and used_at is null and expires_at > $2', [e, now],
  );
  if (pending.rows.length) throw new AppError('conflict', 'That email already has a pending invite');
  return insertInvite(db, e, false, now);
}

export async function getInvite(db, token, now) {
  const { rows } = await db.query(
    'select email from invites where token_hash = $1 and used_at is null and expires_at > $2',
    [hashToken(String(token)), now],
  );
  if (!rows.length) throw new AppError('not-found', 'This invite link is not valid');
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
    if (!used.rows.length) throw new AppError('not-found', 'This invite link is not valid');
    const { email, is_admin: isAdmin } = used.rows[0];
    if (isAdmin && (await tx.query('select 1 from users where is_admin')).rows.length) {
      throw new AppError('conflict', 'An admin already exists');
    }
    const created = await tx.query(
      `insert into users (email, password_hash, is_admin, created_at) values ($1, $2, $3, $4)
       on conflict (email) do nothing returning id`,
      [email, passwordHash, isAdmin, now],
    );
    if (!created.rows.length) throw new AppError('conflict', 'That email already has an account');
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
  if (!deleted.rows.length) throw new AppError('not-found', 'Invite not found');
}

export async function createAdmin(db, email, now) {
  const e = normalizeEmail(email);
  const admin = (await db.query('select id, email from users where is_admin')).rows[0];
  if (admin) throw new AppError('conflict', 'An admin already exists');
  if ((await db.query('select 1 from users where email = $1', [e])).rows.length) {
    throw new AppError('conflict', 'That email already has an account');
  }
  await db.query('delete from invites where is_admin and used_at is null');
  const { token } = await insertInvite(db, e, true, now);
  return { kind: 'invite', token };
}
