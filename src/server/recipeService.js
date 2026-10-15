import { AppError } from './errors.js';
import { generateRecipe } from './generate.js';
import { addShown, excludeTitles, getState } from './userData.js';
import { nextReset, releaseRecipe, reserveCall, reserveRecipe } from './usage.js';

const limitMessage = (now) =>
  `Daily limit reached. It resets at ${nextReset(now).toISOString().slice(11, 16)} UTC`;

export async function requestRecipe(db, user, ingredients, { callModel, now }) {
  const state = await getState(db, user.id);
  if (!state.birthdate) throw new AppError('invalid-input', "Set your baby's birthday first");
  const started = now();
  if (!user.isAdmin && !(await reserveRecipe(db, user.id, started))) {
    throw new AppError('limit-reached', limitMessage(started));
  }
  try {
    const exclude = await excludeTitles(db, user.id);
    const guarded = async (input) => {
      if (!user.isAdmin && !(await reserveCall(db, user.id, now()))) {
        throw new AppError('limit-reached', limitMessage(now()));
      }
      return callModel(input);
    };
    const recipe = await generateRecipe(
      { birthdate: state.birthdate, ingredients, exclude },
      { callModel: guarded, now },
    );
    await addShown(db, user.id, recipe.title, now());
    return recipe;
  } catch (err) {
    if (!user.isAdmin) await releaseRecipe(db, user.id, started);
    throw err;
  }
}
