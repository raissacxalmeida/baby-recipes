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
    'select data, status from recipes where user_id = $1 order by updated_at, id', [userId],
  );
  const by = (status) => recipes.rows.filter((r) => r.status === status).map((r) => r.data);
  return { birthdate: user.rows[0]?.birthdate ?? null, liked: by('liked'), disliked: by('disliked') };
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
     on conflict (user_id, id) do update set data = $3, status = $4, updated_at = now()`,
    [userId, recipe.id, JSON.stringify(recipe), status],
  );
}

export const like = (db, userId, recipe) => save(db, userId, recipe, 'liked');
export const dislike = (db, userId, recipe) => save(db, userId, recipe, 'disliked');

export async function unlike(db, userId, id) {
  await db.query("delete from recipes where user_id = $1 and id = $2 and status = 'liked'", [userId, String(id)]);
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
