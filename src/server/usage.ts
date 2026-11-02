import { AppError } from './errors.js';
import type { Db, UsageRow } from './types.js';

type UsageColumn = 'recipes' | 'calls' | 'translations';

export const LIMITS = { recipes: 10, calls: 30, translations: 100 };

const day = (now: Date): string => now.toISOString().slice(0, 10);

// Column names come from fixed constants below, never from input.
async function reserve(db: Db, userId: string, now: Date, column: UsageColumn, limit: number): Promise<boolean> {
  const { rows } = await db.query<Pick<UsageRow, UsageColumn>>(
    `insert into usage (user_id, day, ${column}) values ($1, $2::date, 1)
     on conflict (user_id, day) do update set ${column} = usage.${column} + 1 where usage.${column} < $3
     returning ${column}`,
    [userId, day(now), limit],
  );
  return rows.length > 0;
}

export const reserveRecipe = (db: Db, userId: string, now: Date): Promise<boolean> => reserve(db, userId, now, 'recipes', LIMITS.recipes);
export const reserveCall = (db: Db, userId: string, now: Date): Promise<boolean> => reserve(db, userId, now, 'calls', LIMITS.calls);

export const reserveTranslation = (db: Db, userId: string, now: Date): Promise<boolean> => reserve(db, userId, now, 'translations', LIMITS.translations);

// Column names come from fixed constants below, never from input.
async function release(db: Db, userId: string, now: Date, column: UsageColumn): Promise<void> {
  await db.query(
    `update usage set ${column} = greatest(${column} - 1, 0) where user_id = $1 and day = $2::date`,
    [userId, day(now)],
  );
}

export const releaseRecipe = (db: Db, userId: string, now: Date): Promise<void> => release(db, userId, now, 'recipes');
export const releaseTranslation = (db: Db, userId: string, now: Date): Promise<void> => release(db, userId, now, 'translations');

export async function usageToday(db: Db, userId: string, now: Date): Promise<{ recipes: number; calls: number }> {
  const { rows } = await db.query<Pick<UsageRow, 'recipes' | 'calls'>>(
    'select recipes, calls from usage where user_id = $1 and day = $2::date', [userId, day(now)],
  );
  return { recipes: rows[0]?.recipes ?? 0, calls: rows[0]?.calls ?? 0 };
}

export function nextReset(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

export function limitError(now: Date): AppError {
  const time = nextReset(now).toISOString().slice(11, 16);
  return new AppError('limit-reached', `Daily limit reached. It resets at ${time} UTC`, { key: 'err.limitReached', params: { time } });
}
