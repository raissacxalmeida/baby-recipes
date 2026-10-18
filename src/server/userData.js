import { AppError } from './errors.js';
import { ageInMonths } from '../shared/age.js';
import { isRecipe } from '../shared/recipeShape.js';

const MAX_SHOWN = 50;
const MAX_RECIPE_BYTES = 20000;

function checkRecipe(recipe) {
  if (!isRecipe(recipe) || JSON.stringify(recipe).length > MAX_RECIPE_BYTES) {
    throw new AppError('invalid-input', 'That recipe is not valid');
  }
}

export async function getState(db, userId) {
  const user = await db.query("select to_char(birthdate, 'YYYY-MM-DD') as birthdate from users where id = $1", [userId]);
  const recipes = await db.query(
    'select id, data, status, copied_from from recipes where user_id = $1 order by updated_at, id', [userId],
  );
  const shared = await db.query('select recipe_id from shared_recipes where user_id = $1 order by created_at, id', [userId]);
  const by = (status) => recipes.rows.filter((r) => r.status === status).map((r) => r.data);
  return {
    birthdate: user.rows[0]?.birthdate ?? null,
    liked: by('liked'),
    disliked: by('disliked'),
    sharedIds: shared.rows.map((r) => r.recipe_id),
    copiedIds: recipes.rows.filter((r) => r.status === 'liked' && r.copied_from).map((r) => r.id),
  };
}

export async function setBirthdate(db, userId, birthdate, now) {
  try {
    ageInMonths(birthdate, now);
  } catch (err) {
    throw new AppError('invalid-input', err.message);
  }
  await db.query('update users set birthdate = $2::date where id = $1', [userId, birthdate]);
}

async function save(db, userId, recipe, status) {
  checkRecipe(recipe);
  await db.query(
    `insert into recipes (user_id, id, data, status) values ($1, $2, $3, $4)
     on conflict (user_id, id) do update set data = $3, status = $4, copied_from = null, updated_at = now()`,
    [userId, recipe.id, JSON.stringify(recipe), status],
  );
}

export const like = (db, userId, recipe) => save(db, userId, recipe, 'liked');
export async function dislike(db, userId, recipe) {
  await save(db, userId, recipe, 'disliked');
  // A recipe that is no longer liked cannot stay shared.
  await db.query('delete from shared_recipes where user_id = $1 and recipe_id = $2', [userId, recipe.id]);
}

// Removing a liked recipe also unshares it, and takes back the like if it was saved from the community.
export async function unlike(db, userId, id) {
  await db.transaction(async (tx) => {
    const removed = await tx.query(
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

export async function restore(db, userId, id) {
  await db.transaction(async (tx) => {
    const removed = await tx.query(
      "delete from recipes where user_id = $1 and id = $2 and status = 'disliked' returning data->>'title' as title",
      [userId, String(id)],
    );
    if (removed.rows.length) {
      await tx.query('delete from shown where user_id = $1 and title = $2', [userId, removed.rows[0].title]);
    }
  });
}

export async function addShown(db, userId, title, now) {
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

export async function excludeTitles(db, userId) {
  const { rows } = await db.query(
    `select title from shown where user_id = $1
     union select data->>'title' from recipes where user_id = $1 and status = 'disliked'`,
    [userId],
  );
  return rows.map((r) => r.title).sort();
}
