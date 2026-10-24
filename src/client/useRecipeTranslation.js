import { useEffect, useRef, useState } from 'react';
import { localizeRecipe } from './localize.js';

const keyOf = (language, recipe) => `${language}\n${recipe.id}\n${recipe.title}`;

// status: idle (English, or not on screen), pending (asked, waiting), ready (`recipe` is translated) or failed (`recipe` is English).
// Answers are kept under their own language and recipe, so one that arrives late is never shown for the wrong one.
export function useRecipeTranslation(api, recipe, language, enabled) {
  const answers = useRef(new Map());
  const [, rerender] = useState(0);
  const key = enabled && recipe && language !== 'en' ? keyOf(language, recipe) : null;

  useEffect(() => {
    if (!key) return;
    const known = answers.current.get(key);
    if (known && known.status !== 'failed') return;
    answers.current.set(key, { status: 'pending' });
    api.translateRecipe(language, recipe)
      .then((translation) => ({ status: 'ready', translation }), () => ({ status: 'failed' }))
      .then((answer) => {
        answers.current.set(key, answer);
        rerender((n) => n + 1);
      });
  }, [key]);

  if (!key) return { status: 'idle', recipe };
  const answer = answers.current.get(key);
  if (!answer || answer.status === 'pending') return { status: 'pending', recipe };
  if (answer.status === 'ready') return { status: 'ready', recipe: localizeRecipe(recipe, answer.translation) };
  return { status: 'failed', recipe };
}
