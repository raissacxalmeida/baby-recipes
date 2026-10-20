import { AppError } from './errors.js';
import { findSuitable, overlappingTitles, saveToCatalogue } from './catalogue.js';
import { generateRecipe, presentRecipe, validateRequest } from './generate.js';
import { addShown, excludeTitles, getState } from './userData.js';
import { nextReset, releaseRecipe, reserveCall, reserveRecipe } from './usage.js';

function limitError(now) {
  const time = nextReset(now).toISOString().slice(11, 16);
  return new AppError('limit-reached', `Daily limit reached. It resets at ${time} UTC`, { key: 'err.limitReached', params: { time } });
}

export async function requestRecipe(db, user, ingredients, { callModel, now }) {
  const state = await getState(db, user.id);
  if (!state.birthdate) throw new AppError('invalid-input', "Set your baby's birthday first", { key: 'err.birthdayFirst' });
  const { ageMonths, list } = validateRequest({ birthdate: state.birthdate, ingredients, exclude: [] }, now);
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
      { birthdate: state.birthdate, ingredients, exclude },
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
