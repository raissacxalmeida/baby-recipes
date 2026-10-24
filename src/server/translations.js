import { createHash } from 'node:crypto';
import { AppError } from './errors.js';
import { isTranslatedLanguage } from '../shared/languages.js';
import { isRecipe } from '../shared/recipeShape.js';
import { limitError, releaseTranslation, reserveTranslation } from './usage.js';

const MAX_TITLES = 100;
const MAX_TITLE_LENGTH = 120;
const MAX_RECIPE_CHARS = 20000;

const invalid = () => new AppError('invalid-input', 'That recipe is not valid', { key: 'err.recipeInvalid' });
const malformed = () => new AppError('upstream-error', 'Could not translate that. Please try again', { key: 'err.translationFailed' });
const isText = (v) => typeof v === 'string' && v.trim() !== '';

function checkLanguage(language) {
  if (!isTranslatedLanguage(language)) throw new AppError('invalid-input', 'Choose a supported language', { key: 'err.language' });
}

// The key a recipe's translation is stored under: its English text, nothing the browser can choose.
export const recipeHash = (recipe) =>
  createHash('sha256').update(JSON.stringify([recipe.title, recipe.ingredients.map((i) => i.name), recipe.steps])).digest('hex');

// Only text the server already holds is translated: the catalogue, this person's own recipes and the community's.
async function knownTitles(db, user, titles) {
  const { rows } = await db.query(
    `select distinct t as title from (
       select data->>'title' as t from catalogue_recipes
       union all select data->>'title' from recipes where user_id = $1
       union all select data->>'title' from shared_recipes
     ) known where t = any($2::text[])`,
    [user.id, titles],
  );
  return rows.map((r) => r.title);
}

// An OpenAI call uses one translation from the day's allowance, given back if the call or its answer fails.
async function counted(db, user, now, work) {
  if (user.isAdmin) return work();
  if (!(await reserveTranslation(db, user.id, now()))) throw limitError(now());
  try {
    return await work();
  } catch (err) {
    await releaseTranslation(db, user.id, now());
    throw err;
  }
}

async function storedTitles(db, language, titles) {
  const { rows } = await db.query(
    'select title, translated from title_translations where language = $1 and title = any($2::text[])',
    [language, titles],
  );
  return Object.fromEntries(rows.map((r) => [r.title, r.translated]));
}

async function storeTitles(db, language, pairs) {
  for (const [title, translated] of pairs) {
    await db.query(
      'insert into title_translations (title, language, translated) values ($1, $2, $3) on conflict do nothing',
      [title, language, translated],
    );
  }
}

export async function translateTitles(db, user, language, titles, { callTranslate, now }) {
  checkLanguage(language);
  if (!Array.isArray(titles) || titles.length > MAX_TITLES || !titles.every((t) => isText(t) && t.length <= MAX_TITLE_LENGTH)) {
    throw invalid();
  }
  const known = await knownTitles(db, user, [...new Set(titles)]);
  if (known.length === 0) return {};
  const done = await storedTitles(db, language, known);
  const missing = known.filter((title) => !(title in done));
  if (missing.length > 0) {
    const translated = await counted(db, user, now, async () => {
      const answer = await callTranslate({ kind: 'titles', language, titles: missing });
      if (!Array.isArray(answer) || answer.length !== missing.length || !answer.every(isText)) throw malformed();
      return answer.map((t) => t.trim());
    });
    await storeTitles(db, language, missing.map((title, n) => [title, translated[n]]));
    Object.assign(done, await storedTitles(db, language, missing));
  }
  return done;
}

export async function translateRecipe(db, user, language, recipe, { callTranslate, now }) {
  checkLanguage(language);
  if (!isRecipe(recipe) || JSON.stringify(recipe).length > MAX_RECIPE_CHARS) throw invalid();
  if ((await knownTitles(db, user, [recipe.title])).length === 0) {
    throw new AppError('not-found', 'That recipe is not available', { key: 'err.recipeUnavailable' });
  }
  const hash = recipeHash(recipe);
  const found = await db.query('select data from recipe_translations where recipe_hash = $1 and language = $2', [hash, language]);
  if (found.rows.length > 0) return found.rows[0].data;

  const english = { title: recipe.title, ingredients: recipe.ingredients.map((i) => i.name), steps: recipe.steps };
  const answer = await counted(db, user, now, async () => {
    const result = await callTranslate({ kind: 'recipe', language, recipe: english });
    const sameCount = (list, expected) => Array.isArray(list) && list.length === expected.length && list.every(isText);
    if (!result || !isText(result.title) || !sameCount(result.ingredients, english.ingredients) || !sameCount(result.steps, english.steps)) {
      throw malformed();
    }
    return result;
  });
  // The title in a list and on the recipe screen must be the same words: the stored title translation wins.
  await storeTitles(db, language, [[recipe.title, answer.title.trim()]]);
  const title = (await storedTitles(db, language, [recipe.title]))[recipe.title];
  const data = { title, ingredients: answer.ingredients.map((i) => i.trim()), steps: answer.steps.map((s) => s.trim()) };
  await db.query(
    'insert into recipe_translations (recipe_hash, language, data) values ($1, $2, $3) on conflict do nothing',
    [hash, language, JSON.stringify(data)],
  );
  return data;
}
