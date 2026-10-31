import { AppError } from './errors.js';
import { ageInMonths } from '../shared/age.js';
import { isLanguage } from '../shared/languages.js';
import { isRecipe } from '../shared/recipeShape.js';
import type { Recipe } from '../shared/types.js';
import type { Db, RecipeRow, ShownRow, SharedRecipeRow } from './types.js';

const MAX_SHOWN = 50;
const MAX_RECIPE_BYTES = 20000;

function checkRecipe(recipe: unknown): asserts recipe is Recipe {
  if (!isRecipe(recipe) || JSON.stringify(recipe).length > MAX_RECIPE_BYTES) {
    throw new AppError('invalid-input', 'That recipe is not valid', { key: 'err.recipeInvalid' });
  }
}

// What the browser gets for /api/state (before the usage block is added). The recipes are the stored jsonb.
export interface UserState {
  birthdate: string | null;
  liked: unknown[];
  disliked: unknown[];
  sharedIds: string[];
  copiedIds: string[];
}

export async function getState(db: Db, userId: string): Promise<UserState> {
  const user = await db.query<{ birthdate: string | null }>("select to_char(birthdate, 'YYYY-MM-DD') as birthdate from users where id = $1", [userId]);
  const recipes = await db.query<Pick<RecipeRow, 'id' | 'data' | 'status' | 'copied_from'>>(
    'select id, data, status, copied_from from recipes where user_id = $1 order by updated_at, id', [userId],
  );
  const shared = await db.query<Pick<SharedRecipeRow, 'recipe_id'>>('select recipe_id from shared_recipes where user_id = $1 order by created_at, id', [userId]);
  const by = (status: RecipeRow['status']): unknown[] => recipes.rows.filter((r) => r.status === status).map((r) => r.data);
  return {
    birthdate: user.rows[0]?.birthdate ?? null,
    liked: by('liked'),
    disliked: by('disliked'),
    sharedIds: shared.rows.map((r) => r.recipe_id),
    copiedIds: recipes.rows.filter((r) => r.status === 'liked' && r.copied_from).map((r) => r.id),
  };
}

export async function setBirthdate(db: Db, userId: string, birthdate: unknown, now: Date): Promise<void> {
  try {
    // Anything but text is no birthday: null gets the same error as a malformed date.
    ageInMonths(typeof birthdate === 'string' ? birthdate : null, now);
  } catch (err) {
    // A caught value is untyped at this edge; ageInMonths throws a RangeError that carries an i18n key.
    const { message, key } = err as { message: string; key?: string };
    throw new AppError('invalid-input', message, { key });
  }
  await db.query('update users set birthdate = $2::date where id = $1', [userId, birthdate]);
}

export async function setLanguage(db: Db, userId: string, language: unknown): Promise<void> {
  if (!isLanguage(language)) throw new AppError('invalid-input', 'Choose a supported language', { key: 'err.language' });
  await db.query('update users set language = $2 where id = $1', [userId, language]);
}

async function save(db: Db, userId: string, recipe: unknown, status: RecipeRow['status']): Promise<Recipe> {
  checkRecipe(recipe);
  await db.query(
    `insert into recipes (user_id, id, data, status) values ($1, $2, $3, $4)
     on conflict (user_id, id) do update set data = $3, status = $4, copied_from = null, updated_at = now()`,
    [userId, recipe.id, JSON.stringify(recipe), status],
  );
  return recipe;
}

export async function like(db: Db, userId: string, recipe: unknown): Promise<void> {
  await save(db, userId, recipe, 'liked');
}
export async function dislike(db: Db, userId: string, recipe: unknown): Promise<void> {
  const saved = await save(db, userId, recipe, 'disliked');
  // A recipe that is no longer liked cannot stay shared.
  await db.query('delete from shared_recipes where user_id = $1 and recipe_id = $2', [userId, saved.id]);
}

// Removing a liked recipe also unshares it, and takes back the like if it was saved from the community.
export async function unlike(db: Db, userId: string, id: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx.query<Pick<RecipeRow, 'copied_from'>>(
      "delete from recipes where user_id = $1 and id = $2 and status = 'liked' returning copied_from",
      [userId, String(id)],
    );
    if (!removed.rows.length) return;
    await tx.query('delete from shared_recipes where user_id = $1 and recipe_id = $2', [userId, String(id)]);
    if (removed.rows[0].copied_from) {
      await tx.query('delete from shared_likes where user_id = $1 and shared_id = $2', [userId, removed.rows[0].copied_from]);
    }
  });
}

export async function restore(db: Db, userId: string, id: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx.query<{ title: string }>(
      "delete from recipes where user_id = $1 and id = $2 and status = 'disliked' returning data->>'title' as title",
      [userId, String(id)],
    );
    if (removed.rows.length) {
      await tx.query('delete from shown where user_id = $1 and title = $2', [userId, removed.rows[0].title]);
    }
  });
}

export async function addShown(db: Db, userId: string, title: unknown, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into shown (user_id, title, shown_at) values ($1, $2, $3)
       on conflict (user_id, title) do update set shown_at = $3`,
      [userId, String(title), now],
    );
    await tx.query(
      `delete from shown where user_id = $1 and title not in
       (select title from shown where user_id = $1 order by shown_at desc, title limit ${MAX_SHOWN})`,
      [userId],
    );
  });
}

export async function excludeTitles(db: Db, userId: string): Promise<string[]> {
  const { rows } = await db.query<Pick<ShownRow, 'title'>>(
    `select title from shown where user_id = $1
     union select data->>'title' from recipes where user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.title).sort();
}
