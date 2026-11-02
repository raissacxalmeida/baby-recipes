import { matchRecipe } from '../shared/recipeMatch.js';
import { normalizeTitle } from './generate.js';
import { checkSafety } from './safety.js';
import type { CatalogueRecipeRow, Db, StoredRecipe } from './types.js';

const MAX_OVERLAPPING = 30;

// The data column is jsonb, so it comes back unknown. Only toStored writes it, so this is the stored shape.
const storedData = (row: Pick<CatalogueRecipeRow, 'data'>): StoredRecipe => row.data as StoredRecipe;

// Only the recipe itself is stored: no id (made from the title when served) and no per-parent inList flags.
const toStored = (r: StoredRecipe): StoredRecipe => ({
  title: r.title,
  basePortions: r.basePortions,
  ingredients: r.ingredients.map(({ name, grams }) => ({ name, grams })),
  steps: r.steps,
  texture: r.texture,
  allergens: r.allergens,
});

const byTitle = (a: StoredRecipe, b: StoredRecipe): number => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

export async function saveToCatalogue(
  db: Db,
  recipe: StoredRecipe,
  { ageFromMonths, source, sourceId = null }: { ageFromMonths: number; source: CatalogueRecipeRow['source']; sourceId?: string | null },
): Promise<boolean> {
  const stored = toStored(recipe);
  const { rows } = await db.query<Pick<CatalogueRecipeRow, 'id'>>(
    `insert into catalogue_recipes (title_key, source, source_id, age_from_months, data)
     values ($1, $2, $3, $4, $5) on conflict do nothing returning id`,
    [normalizeTitle(stored.title), source, sourceId, ageFromMonths, JSON.stringify(stored)],
  );
  return rows.length > 0;
}

export async function findSuitable(
  db: Db,
  { ageMonths, ingredients, seen }: { ageMonths: number; ingredients: readonly string[]; seen: string[] },
): Promise<StoredRecipe | null> {
  const seenKeys = new Set(seen.map(normalizeTitle));
  const { rows } = await db.query<Pick<CatalogueRecipeRow, 'data'>>('select data from catalogue_recipes where age_from_months <= $1', [ageMonths]);
  const candidates = rows
    .map(storedData)
    .filter((data) => !seenKeys.has(normalizeTitle(data.title)) && checkSafety(data, ageMonths).length === 0)
    .map((data) => ({ data, ...matchRecipe(data, ingredients) }))
    .filter((m) => m.suitable)
    .sort((a, b) => b.used - a.used || a.missing - b.missing || byTitle(a.data, b.data));
  return candidates[0]?.data ?? null;
}

export async function overlappingTitles(
  db: Db,
  { ingredients, limit = MAX_OVERLAPPING }: { ingredients: readonly string[]; limit?: number },
): Promise<string[]> {
  const { rows } = await db.query<Pick<CatalogueRecipeRow, 'data'>>('select data from catalogue_recipes');
  return rows
    .map(storedData)
    .map((data) => ({ data, used: matchRecipe(data, ingredients).used }))
    .filter((m) => m.used > 0)
    .sort((a, b) => b.used - a.used || byTitle(a.data, b.data))
    .slice(0, limit)
    .map((m) => m.data.title);
}
