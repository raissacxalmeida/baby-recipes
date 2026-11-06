import { AppError } from './errors.js';
import { ageInMonths } from '../shared/age.js';
import { groupFor } from '../shared/recipeGroup.js';
import type { Recipe } from '../shared/types.js';
import { isUuid } from './users.js';
import type { Db, RecipeRow, SharedRecipeRow } from './types.js';

// A recipe someone shared, as the community list shows it. `recipe` is the stored jsonb.
export interface SharedListing {
  id: string;
  recipe: unknown;
  group: SharedRecipeRow['grp'];
  ageMonths: number;
  likes: number;
  mine: boolean;
  liked: boolean;
}

const notFound = (): AppError => new AppError('not-found', 'That recipe is not available', { key: 'err.recipeUnavailable' });

// Shares a recipe the baby liked; the card records that baby's age in months.
export async function shareRecipe(db: Db, userId: string, babyId: string, recipeId: unknown, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const saved = (await tx.query<Pick<RecipeRow, 'data' | 'copied_from'>>(
      "select data, copied_from from recipes where baby_id = $1 and id = $2 and status = 'liked'",
      [babyId, String(recipeId)],
    )).rows[0];
    if (!saved) throw new AppError('not-found', 'Like the recipe first, then share it', { key: 'err.likeFirst' });
    if (saved.copied_from) throw new AppError('conflict', 'This recipe came from the community already', { key: 'err.alreadyCommunity' });
    const baby = (await tx.query<{ birthdate: string | null }>(
      "select to_char(birthdate, 'YYYY-MM-DD') as birthdate from babies where id = $1 and user_id = $2", [babyId, userId],
    )).rows[0];
    if (!baby?.birthdate) throw new AppError('invalid-input', "Set your baby's birthday first", { key: 'err.birthdayFirst' });
    let months: number;
    try {
      months = ageInMonths(baby.birthdate, now);
    } catch (err) {
      // A caught value is untyped at this edge; ageInMonths throws a RangeError that carries an i18n key.
      const { message, key } = err as { message: string; key?: string };
      throw new AppError('invalid-input', message, { key });
    }
    await tx.query(
      `insert into shared_recipes (user_id, baby_id, recipe_id, data, grp, baby_months) values ($1, $2, $3, $4, $5, $6)
       on conflict (user_id, recipe_id) do nothing`,
      [userId, babyId, String(recipeId), JSON.stringify(saved.data), groupFor(saved.data as Recipe), months],
    );
  });
}

export async function unshareRecipe(db: Db, userId: string, recipeId: unknown): Promise<void> {
  await db.query('delete from shared_recipes where user_id = $1 and recipe_id = $2', [userId, String(recipeId)]);
}

// Never selects who shared a recipe, only whether it is the viewer's own.
export async function listShared(db: Db, userId: string): Promise<SharedListing[]> {
  const { rows } = await db.query<Pick<SharedRecipeRow, 'id' | 'data' | 'grp' | 'baby_months'> & { mine: boolean; likes: number; liked: boolean }>(
    `select s.id, s.data, s.grp, s.baby_months, s.user_id = $1 as mine,
       (select count(*)::int from shared_likes l where l.shared_id = s.id) as likes,
       exists (select 1 from shared_likes l where l.shared_id = s.id and l.user_id = $1) as liked
     from shared_recipes s
     order by likes desc, s.created_at desc, s.id`,
    [userId],
  );
  return rows.map((r) => ({
    id: r.id, recipe: r.data, group: r.grp, ageMonths: r.baby_months, likes: r.likes, mine: r.mine, liked: r.liked,
  }));
}

// The like is the account's; the copy is saved into the given baby's list.
export async function likeShared(db: Db, userId: string, babyId: string, sharedId: unknown): Promise<void> {
  if (!isUuid(sharedId)) throw notFound();
  await db.transaction(async (tx) => {
    const shared = (await tx.query<Pick<SharedRecipeRow, 'user_id' | 'data'>>('select user_id, data from shared_recipes where id = $1', [sharedId])).rows[0];
    if (!shared) throw notFound();
    if (shared.user_id === userId) throw new AppError('invalid-input', 'You shared this one', { key: 'err.ownShared' });
    await tx.query('insert into shared_likes (shared_id, user_id) values ($1, $2) on conflict do nothing', [sharedId, userId]);
    // A liked recipe with the same id is the parent's own and is kept; a disliked one is replaced.
    await tx.query(
      `insert into recipes (baby_id, id, data, status, copied_from) values ($1, $2, $3, 'liked', $4)
       on conflict (baby_id, id) do update
         set data = $3, status = 'liked', copied_from = $4, updated_at = now()
         where recipes.status = 'disliked'`,
      [babyId, (shared.data as Recipe).id, JSON.stringify(shared.data), sharedId],
    );
  });
}

// Takes back the account's like and the copy it saved, in whichever of the account's babies holds it.
export async function unlikeShared(db: Db, userId: string, sharedId: unknown): Promise<void> {
  if (!isUuid(sharedId)) return;
  await db.transaction(async (tx) => {
    const shared = (await tx.query<Pick<SharedRecipeRow, 'data'>>('select data from shared_recipes where id = $1', [sharedId])).rows[0];
    await tx.query('delete from shared_likes where shared_id = $1 and user_id = $2', [sharedId, userId]);
    if (shared) {
      await tx.query(
        `delete from recipes r using babies b
         where b.id = r.baby_id and b.user_id = $1 and r.id = $2 and r.status = 'liked' and r.copied_from = $3`,
        [userId, (shared.data as Recipe).id, sharedId],
      );
    }
  });
}
