import { readFileSync } from 'node:fs';
import { saveToCatalogue } from './catalogue.js';
import { validateRecipe } from './recipe.js';
import { checkSafety } from './safety.js';

export const loadSeed = () => JSON.parse(readFileSync(new URL('./seed/baby-recipes.json', import.meta.url), 'utf8'));

// Adds the recipes that are missing; never overwrites or removes one already saved.
// A recipe that fails validation or the safety check for its own age is logged and left out.
export async function seedCatalogue(db, recipes = loadSeed()) {
  let added = 0;
  let skipped = 0;
  const rejected = [];
  for (const recipe of recipes) {
    try {
      const valid = validateRecipe(recipe);
      if (!Number.isInteger(recipe.ageFromMonths) || recipe.ageFromMonths < 6) {
        throw new Error('ageFromMonths must be a whole number of at least 6');
      }
      const problems = checkSafety(valid, recipe.ageFromMonths);
      if (problems.length > 0) throw new Error(problems.join('; '));
    } catch (err) {
      console.warn(`Seed recipe ${recipe.sourceId} was not loaded: ${err.message}`);
      rejected.push(recipe.sourceId);
      continue;
    }
    const inserted = await saveToCatalogue(db, recipe, {
      ageFromMonths: recipe.ageFromMonths, source: 'seed', sourceId: recipe.sourceId,
    });
    if (inserted) added++;
    else skipped++;
  }
  return { added, skipped, rejected };
}
