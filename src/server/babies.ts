import { AppError } from './errors.js';
import { isUuid } from './users.js';
import { checkBirthdate } from './userData.js';
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
