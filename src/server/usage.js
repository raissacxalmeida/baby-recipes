export const LIMITS = { recipes: 10, calls: 30 };

const day = (now) => now.toISOString().slice(0, 10);

// Column names come from fixed constants below, never from input.
async function reserve(db, userId, now, column, limit) {
  const { rows } = await db.query(
    `insert into usage (user_id, day, ${column}) values ($1, $2::date, 1)
     on conflict (user_id, day) do update set ${column} = usage.${column} + 1 where usage.${column} < $3
     returning ${column}`,
    [userId, day(now), limit],
  );
  return rows.length > 0;
}

export const reserveRecipe = (db, userId, now) => reserve(db, userId, now, 'recipes', LIMITS.recipes);
export const reserveCall = (db, userId, now) => reserve(db, userId, now, 'calls', LIMITS.calls);

export async function releaseRecipe(db, userId, now) {
  await db.query(
    'update usage set recipes = greatest(recipes - 1, 0) where user_id = $1 and day = $2::date',
    [userId, day(now)],
  );
}

export async function usageToday(db, userId, now) {
  const { rows } = await db.query(
    'select recipes, calls from usage where user_id = $1 and day = $2::date', [userId, day(now)],
  );
  return { recipes: rows[0]?.recipes ?? 0, calls: rows[0]?.calls ?? 0 };
}

export function nextReset(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}
