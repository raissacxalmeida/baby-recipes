import { matchRecipe } from '../shared/recipeMatch.js';
import { normalizeTitle } from './generate.js';
import { checkSafety } from './safety.js';

const MAX_OVERLAPPING = 30;

// Only the recipe itself is stored: no id (made from the title when served) and no per-parent inList flags.
const toStored = (r) => ({
  title: r.title,
  basePortions: r.basePortions,
  ingredients: r.ingredients.map(({ name, grams }) => ({ name, grams })),
  steps: r.steps,
  texture: r.texture,
  allergens: r.allergens,
});

const byTitle = (a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0);

export async function saveToCatalogue(db, recipe, { ageFromMonths, source, sourceId = null }) {
  const stored = toStored(recipe);
  const { rows } = await db.query(
    `insert into catalogue_recipes (title_key, source, source_id, age_from_months, data)
     values ($1, $2, $3, $4, $5) on conflict do nothing returning id`,
    [normalizeTitle(stored.title), source, sourceId, ageFromMonths, JSON.stringify(stored)],
  );
  return rows.length > 0;
}

export async function findSuitable(db, { ageMonths, ingredients, seen }) {
  const seenKeys = new Set(seen.map(normalizeTitle));
  const { rows } = await db.query('select data from catalogue_recipes where age_from_months <= $1', [ageMonths]);
  const candidates = rows
    .map((r) => r.data)
    .filter((data) => !seenKeys.has(normalizeTitle(data.title)) && checkSafety(data, ageMonths).length === 0)
    .map((data) => ({ data, ...matchRecipe(data, ingredients) }))
    .filter((m) => m.suitable)
    .sort((a, b) => b.used - a.used || a.missing - b.missing || byTitle(a.data, b.data));
  return candidates[0]?.data ?? null;
}

export async function overlappingTitles(db, { ingredients, limit = MAX_OVERLAPPING }) {
  const { rows } = await db.query('select data from catalogue_recipes');
  return rows
    .map((r) => ({ data: r.data, used: matchRecipe(r.data, ingredients).used }))
    .filter((m) => m.used > 0)
    .sort((a, b) => b.used - a.used || byTitle(a.data, b.data))
    .slice(0, limit)
    .map((m) => m.data.title);
}
