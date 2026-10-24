import { AppError } from './errors.js';
import { parseIngredientList } from '../shared/ingredients.js';
import { translateIngredients } from './translations.js';
import { findSuitable, overlappingTitles, saveToCatalogue } from './catalogue.js';
import { generateRecipe, presentRecipe, validateRequest } from './generate.js';
import { addShown, excludeTitles, getState } from './userData.js';
import { limitError, releaseRecipe, reserveCall, reserveRecipe } from './usage.js';

export async function requestRecipe(db, user, ingredients, { callModel, callTranslate, now, language = 'en' }) {
  const state = await getState(db, user.id);
  if (!state.birthdate) throw new AppError('invalid-input', "Set your baby's birthday first", { key: 'err.birthdayFirst' });
  const checked = validateRequest({ birthdate: state.birthdate, ingredients, exclude: [] }, now);
  const { ageMonths } = checked;
  // Words typed in another language become English here, before anything matches or checks them.
  const english = language === 'en' ? ingredients : await translateIngredients(db, user, language, ingredients, { callTranslate, now });
  const list = language === 'en' ? checked.list : parseIngredientList(english);
  if (list.length === 0) throw new AppError('invalid-input', 'Add at least one ingredient', { key: 'err.ingredientsNeeded' });
  const seen = await excludeTitles(db, user.id);

  // A recipe we already have costs nothing: no allowance is used and OpenAI is not called.
  const stored = await findSuitable(db, { ageMonths, ingredients: list, seen });
  if (stored) {
    await addShown(db, user.id, stored.title, now());
    return presentRecipe(stored, list);
  }

  const started = now();
  if (!user.isAdmin && !(await reserveRecipe(db, user.id, started))) {
    throw limitError(started);
  }
  try {
    const exclude = [...seen, ...(await overlappingTitles(db, { ingredients: list }))];
    const guarded = async (input) => {
      if (!user.isAdmin && !(await reserveCall(db, user.id, now()))) {
        throw limitError(now());
      }
      return callModel(input);
    };
    const recipe = await generateRecipe(
      { birthdate: state.birthdate, ingredients: english, exclude },
      { callModel: guarded, now },
    );
    try {
      await saveToCatalogue(db, recipe, { ageFromMonths: ageMonths, source: 'ai' });
    } catch (err) {
      console.error(`Could not save the recipe to the catalogue: ${err.message}`);
    }
    await addShown(db, user.id, recipe.title, now());
    return recipe;
  } catch (err) {
    if (!user.isAdmin) await releaseRecipe(db, user.id, started);
    throw err;
  }
}
