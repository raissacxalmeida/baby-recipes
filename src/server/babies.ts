import { AppError } from './errors.js';
import { ageInMonths } from '../shared/age.js';
import { isUuid } from './users.js';
import type { Db, Queryable } from './types.js';

export const MAX_BABIES = 5;
export const MAX_NAME = 30;

// A baby as the browser gets it; the birthdate is plain YYYY-MM-DD text. The name is null for a baby made before names existed.
export interface Baby {
  id: string;
  name: string | null;
  birthdate: string | null;
}

interface BabyInput {
  name: unknown;
  birthdate: unknown;
}

const COLUMNS = "id, name, to_char(birthdate, 'YYYY-MM-DD') as birthdate";

const missing = (): AppError => new AppError('not-found', 'That baby is not available', { key: 'err.babyMissing' });

// The birthdate the body sent, or an invalid-input error carrying the key for what is wrong with it.
export function checkBirthdate(birthdate: unknown, now: Date): string {
  try {
    // The body value is untrusted: like the regex inside ageInMonths, this reads it as text (null and undefined as empty).
    ageInMonths(String(birthdate ?? ''), now);
  } catch (err) {
    // A caught value is untyped at this edge; ageInMonths throws a RangeError that carries an i18n key.
    const { message, key } = err as { message: string; key?: string };
    throw new AppError('invalid-input', message, { key });
  }
  return String(birthdate);
}

// The values to store: the trimmed name and the birthdate, or an invalid-input error carrying the key for what is wrong.
function checkInput(input: BabyInput, now: Date): { name: string; birthdate: string } {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > MAX_NAME) {
    throw new AppError('invalid-input', `Enter a name of 1 to ${MAX_NAME} characters`, { key: 'err.babyName', params: { max: MAX_NAME } });
  }
  return { name, birthdate: checkBirthdate(input.birthdate, now) };
}

export async function listBabies(db: Queryable, userId: string): Promise<Baby[]> {
  const { rows } = await db.query<Baby>(`select ${COLUMNS} from babies where user_id = $1 order by created_at, id`, [userId]);
  return rows;
}

// The baby the person used last, or null if they never chose one or that baby is gone.
export async function getLastBabyId(db: Queryable, userId: string): Promise<string | null> {
  const { rows } = await db.query<{ last_baby_id: string | null }>('select last_baby_id from users where id = $1', [userId]);
  return rows[0]?.last_baby_id ?? null;
}

export async function addBaby(db: Db, userId: string, input: BabyInput, now: Date): Promise<Baby> {
  const { name, birthdate } = checkInput(input, now);
  return db.transaction(async (tx) => {
    // Locking the account's row makes two simultaneous adds count one after the other.
    await tx.query('select id from users where id = $1 for update', [userId]);
    const { rows: count } = await tx.query<{ n: number }>('select count(*)::int as n from babies where user_id = $1', [userId]);
    if (count[0].n >= MAX_BABIES) {
      throw new AppError('conflict', `You can add up to ${MAX_BABIES} babies`, { key: 'err.babyLimit', params: { max: MAX_BABIES } });
    }
    const { rows } = await tx.query<Baby>(
      `insert into babies (user_id, name, birthdate) values ($1, $2, $3::date) returning ${COLUMNS}`,
      [userId, name, birthdate],
    );
    return rows[0];
  });
}

export async function requireBaby(db: Queryable, userId: string, babyId: unknown): Promise<Baby> {
  if (babyId === undefined || babyId === null) throw new AppError('invalid-input', 'Choose a baby first', { key: 'err.babyRequired' });
  if (!isUuid(babyId)) throw missing();
  const { rows } = await db.query<Baby>(`select ${COLUMNS} from babies where id = $1 and user_id = $2`, [babyId, userId]);
  if (!rows.length) throw missing();
  return rows[0];
}

export async function updateBaby(db: Db, userId: string, babyId: unknown, input: BabyInput, now: Date): Promise<void> {
  const baby = await requireBaby(db, userId, babyId);
  const { name, birthdate } = checkInput(input, now);
  await db.query('update babies set name = $3, birthdate = $4::date where id = $1 and user_id = $2', [baby.id, userId, name, birthdate]);
}

export async function setLastBaby(db: Db, userId: string, babyId: unknown): Promise<void> {
  const baby = await requireBaby(db, userId, babyId);
  await db.query('update users set last_baby_id = $2 where id = $1', [userId, baby.id]);
}

// Removes the baby with their lists. What they shared goes unless another parent liked it; the Community likes behind their saved copies go unless a sibling baby still holds a copy.
export async function removeBaby(db: Db, userId: string, babyId: unknown): Promise<void> {
  const baby = await requireBaby(db, userId, babyId);
  await db.transaction(async (tx) => {
    // Locking the account's row makes two simultaneous removals count one after the other.
    await tx.query('select id from users where id = $1 for update', [userId]);
    const { rows: count } = await tx.query<{ n: number }>('select count(*)::int as n from babies where user_id = $1', [userId]);
    if (count[0].n <= 1) throw new AppError('conflict', 'You cannot remove your only baby', { key: 'err.babyLast' });
    await tx.query(
      'delete from shared_recipes s where s.baby_id = $1 and not exists (select 1 from shared_likes l where l.shared_id = s.id)',
      [baby.id],
    );
    await tx.query(
      `delete from shared_likes l where l.user_id = $1
       and l.shared_id in (select copied_from from recipes where baby_id = $2 and status = 'liked' and copied_from is not null)
       and not exists (select 1 from recipes r join babies b on b.id = r.baby_id
                       where b.user_id = $1 and b.id <> $2 and r.copied_from = l.shared_id and r.status = 'liked')`,
      [userId, baby.id],
    );
    await tx.query('delete from babies where id = $1', [baby.id]);
  });
}
