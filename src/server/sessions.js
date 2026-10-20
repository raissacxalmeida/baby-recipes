import { AppError } from './errors.js';
import { hashPassword, hashToken, newToken, verifyPassword } from './auth.js';

const MINUTE = 60000;
const DAY = 86400000;
const WINDOW_MS = 15 * MINUTE;
const LOCK_MS = 15 * MINUTE;
const MAX_FAILURES = 10;
const SESSION_DAYS = 30;
const MAX_EMAIL = 254;
const WRONG = 'Wrong email or password';

let dummyHash;
const getDummyHash = async () => (dummyHash ??= await hashPassword('dummy password for timing'));

// Counts the attempt before the password is checked, under a per-email lock, so a burst of
// parallel guesses cannot all slip past the limit.
async function reserveAttempt(db, email, now) {
  await db.transaction(async (tx) => {
    await tx.query('select pg_advisory_xact_lock(hashtext($1))', [email]);
    const row = (await tx.query(
      'select failures, first_failure_at, locked_until from login_attempts where email = $1', [email],
    )).rows[0];
    if (row?.locked_until && new Date(row.locked_until) > now) {
      throw new AppError('locked', 'Too many attempts. Try again in 15 minutes');
    }
    const lockOver = Boolean(row?.locked_until);
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

// Signs the person in: new session, last login time, and a clean lockout record.
export async function startSession(db, user, now) {
  const token = newToken();
  await db.transaction(async (tx) => {
    await tx.query('delete from login_attempts where email = $1', [user.email]);
    await tx.query('update users set last_login_at = $2 where id = $1', [user.id, now]);
    await tx.query(
      'insert into sessions (user_id, token_hash, expires_at, created_at) values ($1, $2, $3, $4)',
      [user.id, hashToken(token), new Date(now.getTime() + SESSION_DAYS * DAY), now],
    );
  });
  return token;
}

export async function login(db, { email, password }, now) {
  const e = String(email ?? '').trim().toLowerCase();
  if (e.length > MAX_EMAIL || e.includes('\u0000')) throw new AppError('unauthorized', WRONG);
  await reserveAttempt(db, e, now);
  const user = (await db.query(
    'select id, email, password_hash, is_admin, language from users where email = $1', [e],
  )).rows[0];
  const given = String(password ?? '');
  const ok = user
    ? await verifyPassword(given, user.password_hash)
    : (await verifyPassword(given, await getDummyHash()), false);
  if (!ok) throw new AppError('unauthorized', WRONG);
  const token = await startSession(db, user, now);
  return { token, user: { id: user.id, email: user.email, isAdmin: user.is_admin, language: user.language } };
}

export async function sessionUser(db, token, now) {
  if (typeof token !== 'string' || !token) return null;
  const { rows } = await db.query(
    `select u.id, u.email, u.is_admin, u.language from sessions s join users u on u.id = s.user_id
     where s.token_hash = $1 and s.expires_at > $2`,
    [hashToken(token), now],
  );
  return rows.length
    ? { id: rows[0].id, email: rows[0].email, isAdmin: rows[0].is_admin, language: rows[0].language }
    : null;
}

export async function logout(db, token) {
  await db.query('delete from sessions where token_hash = $1', [hashToken(String(token))]);
}
