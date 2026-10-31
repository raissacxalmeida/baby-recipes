import { useEffect, useRef, useState } from 'react';
import type { Language } from '../shared/types.js';
import type { Api } from './api.js';
import type { ApiRecipe, RecipeTranslation } from './apiTypes.js';
import { localizeRecipe } from './localize.js';

const keyOf = (language: Language, recipe: ApiRecipe): string => `${language}\n${recipe.id}\n${recipe.title}`;

type Answer = { status: 'pending' } | { status: 'failed' } | { status: 'ready'; translation: RecipeTranslation };

// status: idle (English, or not on screen), pending (asked, waiting), ready (`recipe` is translated) or failed (`recipe` is English).
// Answers are kept under their own language and recipe, so one that arrives late is never shown for the wrong one.
export function useRecipeTranslation(
  api: Pick<Api, 'translateRecipe'>,
  recipe: ApiRecipe | null | undefined,
  language: Language,
  enabled: boolean,
): { status: 'idle' | 'pending' | 'ready' | 'failed'; recipe: ApiRecipe | null | undefined } {
  const answers = useRef(new Map<string, Answer>());
  const [, rerender] = useState(0);
  const key = enabled && recipe && language !== 'en' ? keyOf(language, recipe) : null;

  useEffect(() => {
    // `language !== 'en'` always holds when there is a key; it lets the compiler know the language is a translated one.
    if (!key || !recipe || language === 'en') return;
    const known = answers.current.get(key);
    if (known && known.status !== 'failed') return;
    answers.current.set(key, { status: 'pending' });
    api.translateRecipe(language, recipe)
      .then((translation): Answer => ({ status: 'ready', translation }), (): Answer => ({ status: 'failed' }))
      .then((answer) => {
        answers.current.set(key, answer);
        rerender((n) => n + 1);
      });
  }, [key]);

  if (!key) return { status: 'idle', recipe };
  const answer = answers.current.get(key);
  if (!answer || answer.status === 'pending') return { status: 'pending', recipe };
  if (answer.status === 'ready' && recipe) return { status: 'ready', recipe: localizeRecipe(recipe, answer.translation) };
  return { status: 'failed', recipe };
}
