import { AppError } from './errors.js';
import { hashPassword, hashToken, newToken, verifyPassword } from './auth.js';

const MINUTE = 60000;
const DAY = 86400000;
const WINDOW_MS = 15 * MINUTE;
const LOCK_MS = 15 * MINUTE;
const MAX_FAILURES = 10;
const SESSION_DAYS = 30;

let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword('dummy password for timing'));

async function recordFailure(db, email, now) {
  await db.transaction(async (tx) => {
    const row = (await tx.query(
      'select failures, first_failure_at, locked_until from login_attempts where email = $1', [email],
    )).rows[0];
    const lockOver = row?.locked_until && new Date(row.locked_until) <= now;
    const windowOver = row && now - new Date(row.first_failure_at) >= WINDOW_MS;
    const fresh = !row || lockOver || windowOver;
    const failures = fresh ? 1 : row.failures + 1;
    const firstAt = fresh ? now : row.first_failure_at;
    const lockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + LOCK_MS) : null;
    await tx.query(
      `insert into login_attempts (email, failures, first_failure_at, locked_until) values ($1, $2, $3, $4)
       on conflict (email) do update set failures = $2, first_failure_at = $3, locked_until = $4`,
      [email, failures, firstAt, lockedUntil],
    );
  });
}

export async function login(db, { email, password }, now) {
  const e = String(email ?? '').trim().toLowerCase();
  const attempt = (await db.query('select locked_until from login_attempts where email = $1', [e])).rows[0];
  if (attempt?.locked_until && new Date(attempt.locked_until) > now) {
    throw new AppError('locked', 'Too many attempts. Try again in 15 minutes');
  }
  const user = (await db.query(
    'select id, email, password_hash, is_admin from users where email = $1', [e],
  )).rows[0];
  const ok = user
    ? await verifyPassword(String(password ?? ''), user.password_hash)
    : (await verifyPassword(String(password ?? ''), await getDummyHash()), false);
  if (!ok) {
    await recordFailure(db, e, now);
    throw new AppError('unauthorized', 'Wrong email or password');
  }
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.query('delete from login_attempts where email = $1', [e]);
    await tx.query('update users set last_login_at = $2 where id = $1', [user.id, now]);
    await tx.query(
      'insert into sessions (user_id, token_hash, expires_at, created_at) values ($1, $2, $3, $4)',
      [user.id, hashToken(token), new Date(now.getTime() + SESSION_DAYS * DAY), now],
    );
  });
  return { token, user: { id: user.id, email: user.email, isAdmin: user.is_admin } };
}

export async function sessionUser(db, token, now) {
  if (typeof token !== 'string' || !token) return null;
  const { rows } = await db.query(
    `select u.id, u.email, u.is_admin from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > $2`,
    [hashToken(token), now],
  );
  return rows.length ? { id: rows[0].id, email: rows[0].email, isAdmin: rows[0].is_admin } : null;
}

export async function logout(db, token) {
  await db.query('delete from sessions where token_hash = $1', [hashToken(String(token))]);
}
