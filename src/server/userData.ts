import { AppError } from './errors.js';
import type { Baby } from './babies.js';
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

// The selected baby's lists and birthdate; what the account has shared is account-wide.
export async function getState(db: Db, userId: string, baby: Baby): Promise<UserState> {
  const recipes = await db.query<Pick<RecipeRow, 'id' | 'data' | 'status' | 'copied_from'>>(
    'select id, data, status, copied_from from recipes where baby_id = $1 order by updated_at, id', [baby.id],
  );
  const shared = await db.query<Pick<SharedRecipeRow, 'recipe_id'>>('select recipe_id from shared_recipes where user_id = $1 order by created_at, id', [userId]);
  const by = (status: RecipeRow['status']): unknown[] => recipes.rows.filter((r) => r.status === status).map((r) => r.data);
  return {
    birthdate: baby.birthdate,
    liked: by('liked'),
    disliked: by('disliked'),
    sharedIds: shared.rows.map((r) => r.recipe_id),
    copiedIds: recipes.rows.filter((r) => r.status === 'liked' && r.copied_from).map((r) => r.id),
  };
}

export async function setLanguage(db: Db, userId: string, language: unknown): Promise<void> {
  if (!isLanguage(language)) throw new AppError('invalid-input', 'Choose a supported language', { key: 'err.language' });
  await db.query('update users set language = $2 where id = $1', [userId, language]);
}

async function save(db: Db, babyId: string, recipe: unknown, status: RecipeRow['status']): Promise<Recipe> {
  checkRecipe(recipe);
  await db.query(
    `insert into recipes (baby_id, id, data, status) values ($1, $2, $3, $4)
     on conflict (baby_id, id) do update set data = $3, status = $4, copied_from = null, updated_at = now()`,
    [babyId, recipe.id, JSON.stringify(recipe), status],
  );
  return recipe;
}

export async function like(db: Db, babyId: string, recipe: unknown): Promise<void> {
  await save(db, babyId, recipe, 'liked');
}
export async function dislike(db: Db, userId: string, babyId: string, recipe: unknown): Promise<void> {
  const saved = await save(db, babyId, recipe, 'disliked');
  // A recipe that is no longer liked cannot stay shared by this baby.
  await db.query('delete from shared_recipes where user_id = $1 and baby_id = $2 and recipe_id = $3', [userId, babyId, saved.id]);
}

// Removing a liked recipe also unshares it (if this baby shared it), and takes back the like if it was saved from the community
// and no other baby of the account still holds a copy of it.
export async function unlike(db: Db, userId: string, babyId: string, id: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx.query<Pick<RecipeRow, 'copied_from'>>(
      "delete from recipes where baby_id = $1 and id = $2 and status = 'liked' returning copied_from",
      [babyId, String(id)],
    );
    if (!removed.rows.length) return;
    await tx.query('delete from shared_recipes where user_id = $1 and baby_id = $2 and recipe_id = $3', [userId, babyId, String(id)]);
    if (removed.rows[0].copied_from) {
      await tx.query(
        `delete from shared_likes where user_id = $1 and shared_id = $2
         and not exists (select 1 from recipes r join babies b on b.id = r.baby_id
                         where b.user_id = $1 and r.copied_from = $2 and r.status = 'liked')`,
        [userId, removed.rows[0].copied_from],
      );
    }
  });
}

export async function restore(db: Db, babyId: string, id: unknown): Promise<void> {
  await db.transaction(async (tx) => {
    const removed = await tx.query<{ title: string }>(
      "delete from recipes where baby_id = $1 and id = $2 and status = 'disliked' returning data->>'title' as title",
      [babyId, String(id)],
    );
    if (removed.rows.length) {
      await tx.query('delete from shown where baby_id = $1 and title = $2', [babyId, removed.rows[0].title]);
    }
  });
}

export async function addShown(db: Db, babyId: string, title: unknown, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `insert into shown (baby_id, title, shown_at) values ($1, $2, $3)
       on conflict (baby_id, title) do update set shown_at = $3`,
      [babyId, String(title), now],
    );
    await tx.query(
      `delete from shown where baby_id = $1 and title not in
       (select title from shown where baby_id = $1 order by shown_at desc, title limit ${MAX_SHOWN})`,
      [babyId],
    );
  });
}

export async function excludeTitles(db: Db, babyId: string): Promise<string[]> {
  const { rows } = await db.query<Pick<ShownRow, 'title'>>(
    `select title from shown where baby_id = $1
     union select data->>'title' from recipes where baby_id = $1`,
    [babyId],
  );
  return rows.map((r) => r.title).sort();
}
