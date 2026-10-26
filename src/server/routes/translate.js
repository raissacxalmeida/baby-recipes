import { translateRecipe, translateTitles } from '../translations.js';

export const translateRoutes = [
  {
    method: 'POST', pattern: '/api/translate/titles', access: 'user',
    async handler({ db, user, body, now, callTranslate }) {
      return { body: { titles: await translateTitles(db, user, body.language, body.titles, { callTranslate, now }) } };
    },
  },
  {
    method: 'POST', pattern: '/api/translate/recipe', access: 'user',
    async handler({ db, user, body, now, callTranslate }) {
      return { body: { translation: await translateRecipe(db, user, body.language, body.recipe, { callTranslate, now }) } };
    },
  },
];
