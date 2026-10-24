# Recipe and Typed-Ingredient Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In Portuguese, Spanish and German the app shows recipe titles, ingredient names and steps in the chosen language, and parents type ingredients in that language.

**Architecture:** English stays the stored original and the only text the safety checks, matching, grouping and emoji ever read. A new server module asks OpenAI (through a second injected function, `callTranslate`) for translations, stores them in two new tables keyed by English text, and serves them through two new endpoints (batched titles, one full recipe); typed ingredients are turned into English inside the existing recipe request. The browser keeps the English recipe object and overlays a translation on screen.

**Tech Stack:** Node `http` server, Postgres via `pg` (PGlite in tests), React 18 + Vite, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-24-recipe-translation-design.md](../specs/2026-10-24-recipe-translation-design.md). Also read the interface audit [2026-10-20-language-switch-ingredient-audit.md](../specs/2026-10-20-language-switch-ingredient-audit.md).

## Global Constraints

- Translated languages are `pt`, `es`, `de`. `en` never calls OpenAI for translation and behaves exactly as today.
- English stays the original: translated text is never written into `recipes.data`, `shared_recipes.data`, `catalogue_recipes.data` or `shown`, and is never passed to `checkSafety`, `detectAllergens`, `matchRecipe`, `groupFor`, `ingredientEmoji` or `isListed`.
- A translation is keyed by a hash of the English recipe text (title, ingredient names, steps), never by the recipe `id`. Titles are keyed by the English title text.
- The recipe screen shows the whole recipe in the chosen language or the whole recipe in English, never mixed. List titles are translated separately (batched) and the recipe screen must show that same title.
- A failed translation shows the English recipe with no error; nothing is stored for a failure, so the next view retries.
- Translation never uses the daily recipe allowance (`reserveRecipe`) or the model call allowance (`reserveCall`). A new per-day `translations` counter (limit 100, admins exempt) bounds OpenAI cost; it is reserved only when an OpenAI call is actually made and released if that call fails.
- A typed word the model cannot place is dropped silently. If every word is dropped the existing "Add at least one ingredient" error (`err.ingredientsNeeded`) is shown. If the typed-ingredient translation call fails the request fails (`err.translationFailed`); it never goes ahead with untranslated words.
- Only text the server already holds is translated: a title must exist in `catalogue_recipes`, the caller's `recipes`, or `shared_recipes`; unknown titles are not sent to OpenAI.
- Interface text lives in `src/client/i18n/{en,pt,es,de}.js`, one key in all four files; the catalog tests enforce parity. Write the Portuguese, Spanish and German in the tone of the surrounding entries.
- The brand name and tagline are never translated. No new dependency.
- The Docker container must be rebuilt at the end (`deploy-docker` skill).

## Review Focus

- A Portuguese parent of a 7-month-old types "mel" (honey): the translator returns "honey", the request goes on, and the English recipe check still rejects any honey recipe (Task 5).
- Every typed word is unplaceable (`null` for all): no recipe call, no recipe allowance used, `err.ingredientsNeeded` (Task 5).
- The translator returns the wrong number of titles, steps or ingredients, or an empty string: treated as a failure, nothing stored (Tasks 3, 5).
- A liked copy posted with a known title but changed steps gets its own key and cannot change the stored translation of the original; an unknown title is refused without calling the translator (Tasks 3, 4).
- The language is switched twice quickly, or the translation of the first language arrives after the second was chosen: the late answer is ignored (Task 6).

---

## File Structure

- Create `src/server/translations.js` — translation store reads and writes, validation of translator output, quota use. One responsibility: turn English text into stored translations.
- Create `src/server/routes/translate.js` — two endpoints.
- Create `src/client/localize.js` — pure overlay helpers.
- Create `src/client/useRecipeTranslation.js` — hook for the recipe on screen.
- Create `test/helpers/fakeTranslate.js` — fake `callTranslate`.
- Modify `src/server/{migrations,usage,openai,server,main,recipeService}.js`, `src/server/routes/{index,data}.js`, `src/shared/{languages,ingredients}.js`, `src/client/{api.js,MainApp.jsx}`, `src/client/screens/{HomeScreen,RecipeScreen,LikedScreen,SharedScreen}.jsx`, the four i18n catalogs, and the tests named per task.

---

### Task 1: Storage and quota

**Files:**
- Modify: `src/server/migrations.js`, `src/server/usage.js`, `src/server/recipeService.js`, `src/shared/languages.js`
- Test: `test/usage.test.js`, `test/translationStore.test.js` (create)

**Interfaces:**
- Produces: tables `title_translations(title, language, translated)` and `recipe_translations(recipe_hash, language, data jsonb)`, both language-checked to `pt|es|de`; column `usage.translations`. In `usage.js`: `LIMITS.translations = 100`, `reserveTranslation(db, userId, now): Promise<boolean>`, `releaseTranslation(db, userId, now): Promise<void>`, and `limitError(now): AppError` (moved from `recipeService.js`, same message and key `err.limitReached`). In `languages.js`: `TRANSLATED_LANGUAGES = ['pt','es','de']` and `isTranslatedLanguage(value): boolean`.

- [ ] **Step 1: Write the failing tests**
  - `test/usage.test.js`: change the limits test to `expect(LIMITS).toEqual({ recipes: 10, calls: 30, translations: 100 })`; add `100 translation reservations succeed and the 101st fails`; `releaseTranslation frees one slot and never goes below zero`; `translation reservations do not change the recipe or call counts` (`usageToday` stays `{ recipes: 0, calls: 0 }`).
  - `test/translationStore.test.js`: inserting `('Banana mash','pt','Papa de banana')` into `title_translations` works and a second identical insert with `on conflict do nothing` leaves one row; inserting language `'en'` or `'fr'` into either table rejects; `recipe_translations` stores and returns a jsonb `{title, ingredients, steps}`; `truncate` through `db.reset()` empties both (so `APP_TABLES` includes them).
- [ ] **Step 2: Run** `npx vitest run test/usage.test.js test/translationStore.test.js` — expect FAIL (unknown exports, missing tables).
- [ ] **Step 3: Implement.** Append one migration to `MIGRATIONS` with the two `create table` statements and `alter table usage add column translations int not null default 0`; add both tables to `APP_TABLES`. In `usage.js` add the limit and the two functions using the existing `reserve` helper and a release mirroring `releaseRecipe`; move `limitError` here from `recipeService.js` (it needs `AppError` and `nextReset`) and import it back in `recipeService.js`. Add the language constants.
- [ ] **Step 4: Run** the two test files plus `npx vitest run test/recipeService.test.js test/db.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: translation tables and a daily translation allowance`.

---

### Task 2: The translator call and its wiring

**Files:**
- Modify: `src/server/openai.js`, `src/server/server.js`, `src/server/main.js`, `test/helpers/http.js`
- Test: `test/translator.test.js` (create)

**Interfaces:**
- Consumes: existing `AppError` codes `missing-key`, `upstream-error`.
- Produces: `callTranslate(task, { apiKey, fetchImpl = fetch })` in `openai.js`, where `task` is one of
  - `{ kind: 'ingredients', language, items: string[] }` → resolves `(string | null)[]`
  - `{ kind: 'titles', language, titles: string[] }` → resolves `string[]`
  - `{ kind: 'recipe', language, recipe: { title: string, ingredients: string[], steps: string[] } }` → resolves `{ title, ingredients, steps }`

  It returns the model's parsed values unchecked. `createServer({ ..., callTranslate })` hands `callTranslate` to every route handler in its context object. `startTestServer` returns `setTranslator(fn)` and passes `callTranslate: (task) => translator(task)` to `createServer`.

- [ ] **Step 1: Write the failing tests** (same fake-`fetchImpl` style as `test/generate.test.js`): for each of the three kinds, the request goes to the chat completions URL with the key only in the `Authorization` header, `response_format` is a strict `json_schema`, the user message contains the language name (`Portuguese`, `Spanish` or `German`) and every input string, and the parsed value comes back in the shapes above (the API's top-level object is `{items}`, `{titles}` or `{title, ingredients, steps}`; `callTranslate` unwraps `items` and `titles`); the `ingredients` prompt says to answer `null` for anything that is not clearly a food it can name in English; no key → `missing-key` and no fetch; non-OK status and network failure → `upstream-error`.
- [ ] **Step 2: Run** `npx vitest run test/translator.test.js` — expect FAIL.
- [ ] **Step 3: Implement.** Extract the fetch, timeout and error mapping of `callModel` into one internal function used by both `callModel` and `callTranslate` (existing `callModel` tests must still pass unchanged). Prompts say: keep the same number and order of items; translate meaning, not word for word; keep it natural for a baby-food recipe; never add or remove items. Wire `callTranslate` in `main.js` like `callModel` (`(task) => callTranslate(task, { apiKey: config.openaiKey })`), in `createServer`'s parameters and in the handler context in `handleApi`.
- [ ] **Step 4: Run** `npx vitest run test/translator.test.js test/generate.test.js test/server.test.js test/main.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: an OpenAI translator call, wired like the recipe model`.

---

### Task 3: Translating titles and whole recipes

**Files:**
- Create: `src/server/translations.js`, `test/helpers/fakeTranslate.js`
- Test: `test/translations.test.js` (create)

**Interfaces:**
- Consumes: Task 1 tables, `reserveTranslation`, `releaseTranslation`, `limitError`, `isTranslatedLanguage`; `isRecipe` from `src/shared/recipeShape.js`; `callTranslate` task shapes from Task 2.
- Produces in `translations.js`:
  - `recipeHash(recipe: { title, ingredients: {name}[], steps: string[] }): string` — sha256 hex of `JSON.stringify([title, names, steps])`.
  - `translateTitles(db, user, language, titles: string[], { callTranslate, now }): Promise<Record<string, string>>` — keys are the English titles that are known to the server; unknown titles are left out.
  - `translateRecipe(db, user, language, recipe, { callTranslate, now }): Promise<{ title: string, ingredients: string[], steps: string[] }>`.
  - Both throw `AppError('invalid-input', ..., { key: 'err.language' })` for a language outside `pt|es|de`, `AppError('invalid-input', ..., { key: 'err.recipeInvalid' })` for bad input (titles: array of at most 100 non-empty strings of at most 120 characters; recipe: fails `isRecipe` or over 20000 characters of JSON), `limitError` when the allowance is gone, and `AppError('upstream-error', 'Could not translate the recipe', { key: 'err.translationFailed' })` when the translator's answer is malformed. `translateRecipe` throws `AppError('not-found', ..., { key: 'err.recipeUnavailable' })` when the title is not known.
- Produces in `test/helpers/fakeTranslate.js`: `createFakeTranslator({ ingredients = {}, override } = {})` returning a `vi.fn` that answers `titles` with `` `${language}:${title}` ``, `recipe` with every text prefixed the same way, and `ingredients` with `ingredients[item.toLowerCase()] ?? null`; `override(task)`, when it returns something, replaces the answer.

- [ ] **Step 1: Write the failing tests** (`createTestDb`, users and catalogue rows set up as in `test/recipeService.test.js`):
  - `translateTitles` returns `{ 'Banana mash': 'pt:Banana mash' }` for a catalogue title, calls the translator once with only the missing titles, and a second call makes no translator call.
  - A title that exists nowhere is absent from the result and never reaches the translator; a title that only exists in another user's liked list is also unknown to this user.
  - A malformed answer (wrong length, or an empty string) rejects with `err.translationFailed`, stores nothing and leaves `usage.translations` where it was.
  - With the allowance used up, `translateTitles` rejects with `limit-reached`; an admin is never limited.
  - `translateRecipe` returns `{ title, ingredients, steps }` with equal counts to the English recipe, stores one row, and the second call hits the store (translator called once).
  - The returned title equals the stored title translation when `translateTitles` ran first, even when the translator's recipe answer carries a different title.
  - A copy with the same title but different steps gets a different row; the first recipe's stored translation is unchanged.
  - Unknown title → `not-found` and no translator call; recipe over 20000 characters → `invalid-input`; language `en` or `fr` → `err.language`.
  - After `translateRecipe`, `catalogue_recipes.data` and the user's `recipes.data` are byte-identical to before.
- [ ] **Step 2: Run** `npx vitest run test/translations.test.js` — expect FAIL.
- [ ] **Step 3: Implement.** Known-title check by one query over `catalogue_recipes`, the user's `recipes` and `shared_recipes` (`data->>'title' = any($n)`; confirm PGlite accepts an array parameter, else build placeholders). Reserve the allowance only when the translator is about to be called, release it on any failure, skip both for admins. In `translateRecipe`, after the model answers, insert its title into `title_translations` with `on conflict do nothing`, then read the title back and use that one.
- [ ] **Step 4: Run** `npx vitest run test/translations.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: translate titles and recipes, stored by English text`.

---

### Task 4: The two translation endpoints

**Files:**
- Create: `src/server/routes/translate.js`
- Modify: `src/server/routes/index.js`
- Test: `test/translateRoutes.test.js` (create)

**Interfaces:**
- Consumes: `translateTitles`, `translateRecipe` (Task 3); `callTranslate` in the handler context (Task 2).
- Produces: `POST /api/translate/titles` with body `{ language, titles }` → `{ titles: Record<string,string> }`; `POST /api/translate/recipe` with body `{ language, recipe }` → `{ translation: { title, ingredients, steps } }`. Both `access: 'user'`.

- [ ] **Step 1: Write the failing tests** (`startTestServer`, `t.setTranslator(createFakeTranslator())`):
  - Both routes are 401 without a cookie.
  - A logged-in parent with a catalogue title gets the translated map (200) and the translated recipe.
  - Unknown title on the recipe route → 404 body `{ key: 'err.recipeUnavailable' }`.
  - `language: 'en'` → 400 `err.language`; a failing translator → 502 and `usage.translations` unchanged.
- [ ] **Step 2: Run** `npx vitest run test/translateRoutes.test.js` — expect FAIL.
- [ ] **Step 3: Implement** the two routes as thin handlers over Task 3 and register them in `routes/index.js`.
- [ ] **Step 4: Run** `npx vitest run test/translateRoutes.test.js test/server.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: endpoints for translated titles and recipes`.

---

### Task 5: Typed ingredients in the app's language

**Files:**
- Modify: `src/server/translations.js`, `src/server/recipeService.js`, `src/server/routes/data.js`, `src/client/i18n/{en,pt,es,de}.js`
- Test: `test/translations.test.js`, `test/recipeService.test.js`, `test/dataRoutes.test.js`

**Interfaces:**
- Consumes: Task 3 module and helper.
- Produces: `translateIngredients(db, user, language, items: string[], { callTranslate, now }): Promise<string[]>` — English names, unplaceable words dropped; a returned string is kept only if non-empty after trimming and at most 50 characters. `requestRecipe(db, user, ingredients, { callModel, callTranslate, now, language = 'en' })`. New interface key `err.translationFailed` — English "Could not translate your ingredients. Please try again."

- [ ] **Step 1: Write the failing tests**
  - `translateIngredients`: `['batata', 'xyzzy']` with fake `{ batata: 'potato' }` → `['potato']`; one translator call; a wrong-length answer → `err.translationFailed` and the allowance released; no key (`missing-key`) is rethrown as is and released; an empty input list makes no call.
  - `requestRecipe` with `language: 'pt'` and `['batata']`: the model receives `ingredients: ['potato']` and the recipe's `inList` flag is true for `potato`.
  - Every word unplaceable → rejects `err.ingredientsNeeded`, `callModel` never called, `usage.recipes` still 0.
  - Review Focus: `['mel']` → `honey`; a model that answers a honey recipe three times ends in `generation-failed`, never a recipe.
  - Translation failure rejects with the translator's error, `callModel` never called, nothing counted.
  - `language: 'en'` (and the argument left out) never calls `callTranslate`.
  - A catalogue hit still works from the translated English list.
  - Route: `POST /api/recipe` with `{ ingredients: ['batata'], language: 'pt' }` returns the recipe; `language: 'xx'` → 400 `err.language`; a body without `language` behaves as English.
- [ ] **Step 2: Run** the three test files — expect FAIL.
- [ ] **Step 3: Implement.** In `requestRecipe`: run `validateRequest` on the typed words first (age, limits, not empty), then translate when `language !== 'en'`, then `parseIngredientList` the English words, throw `err.ingredientsNeeded` when empty, and use the English words for `findSuitable`, `overlappingTitles` and `generateRecipe`. The route reads `body.language` (default `'en'`, must satisfy `isLanguage`). Add the new key to all four catalogs.
- [ ] **Step 4: Run** `npx vitest run test/translations.test.js test/recipeService.test.js test/dataRoutes.test.js test/i18nCatalog.test.js test/errorKeys.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: typed ingredients are turned into English before matching and safety checks`.

---

### Task 6: Browser api, overlay helpers and the recipe hook

**Files:**
- Create: `src/client/localize.js`, `src/client/useRecipeTranslation.js`
- Modify: `src/client/api.js`, `test/helpers/fakeApi.js`
- Test: `test/localize.test.js`, `test/useRecipeTranslation.test.jsx` (create), `test/clientApi.test.js`

**Interfaces:**
- Produces:
  - `api.suggest(ingredients)` now posts `{ ingredients, language: getLanguage() }`; `api.translateTitles(language, titles): Promise<Record<string,string>>`; `api.translateRecipe(language, recipe): Promise<{title, ingredients, steps}>`. Fake api gets `translateTitles` and `translateRecipe` as `vi.fn`s returning `` `${language}:${text}` `` style values, like the Task 3 fake.
  - `localizeRecipe(recipe, translation): Recipe` — copy with the translated title, each ingredient `name` replaced and the English name kept as `original`, steps replaced; returns `recipe` untouched when counts differ or `translation` is missing.
  - `titleKey(language, title): string` (`` `${language}\n${title}` ``) and `titleIn(cache, language, title): string` (`cache[titleKey(...)] ?? title`).
  - `useRecipeTranslation(api, recipe, language, enabled): { status: 'idle' | 'pending' | 'ready' | 'failed', recipe }` — `idle` for `en`, no recipe, or not enabled; `pending` until the answer; `ready` with the localized recipe; `failed` with the English one. Answers are remembered per `language + id + title`; an answer for a language or recipe that is no longer current is ignored.

- [ ] **Step 1: Write the failing tests**
  - `localizeRecipe`: translated fields in place, `original` holds the English ingredient name, `inList`, `grams`, `id` and `texture` kept; count mismatch returns the same object.
  - `titleIn` falls back to the English title.
  - Hook (render with `renderHook`, fake api): `en` → `idle` and no api call; `pt` → `pending` then `ready` with translated steps; a rejecting api → `failed` with the English recipe; switching `pt`→`de` before the `pt` promise resolves ends with the `de` text; the same recipe and language asked twice calls the api once.
  - `clientApi.test.js`: update the `suggest` body assertion to include `language`; add the two new calls' method, path and body.
- [ ] **Step 2: Run** the three test files — expect FAIL.
- [ ] **Step 3: Implement** (`api.js` imports `getLanguage` from `./i18n/index.js`).
- [ ] **Step 4: Run** `npx vitest run test/localize.test.js test/useRecipeTranslation.test.jsx test/clientApi.test.js test/fakeApi.shared.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: browser api and helpers for translated recipes`.

---

### Task 7: Translated titles in the lists

**Files:**
- Modify: `src/client/MainApp.jsx`, `src/client/screens/LikedScreen.jsx`, `src/client/screens/SharedScreen.jsx`
- Test: `test/i18nScreens.test.jsx` (extend) or a new `test/listTitles.test.jsx`

**Interfaces:**
- Consumes: `api.translateTitles`, `titleKey`, `titleIn` (Task 6).
- Produces: `LikedScreen` and `SharedScreen` take `titleOf?: (title: string) => string` (default identity) and use it for every visible title and every `aria-label` that names a recipe. `MainApp` keeps a `titles` cache in state and, while the screen is `liked` or `shared` and the language is not English, asks `api.translateTitles(language, missing)` once for the English titles not yet cached (liked, disliked and community) and merges the answer; a rejection is ignored and the English titles stay.

- [ ] **Step 1: Write the failing tests** (fake api, `setLanguage('pt')`): after opening Liked, titles show as `pt:Banana mash` once `translateTitles` resolves and one call carried all titles; the Open button's aria-label uses the translated title; opening Shared translates `r.recipe.title`; a rejecting `translateTitles` leaves English titles and no error text; English language makes no call; switching language while on Liked fetches the new language's titles.
- [ ] **Step 2: Run** the test file — expect FAIL.
- [ ] **Step 3: Implement.** The effect depends on screen, language, `server` and `community`; the cache is a plain object in state keyed with `titleKey`.
- [ ] **Step 4: Run** `npx vitest run test/i18nScreens.test.jsx test/shared.screen.test.jsx test/screens.test.jsx test/app.test.jsx` — expect PASS.
- [ ] **Step 5: Commit** `feat: show liked and community titles in the chosen language`.

---

### Task 8: The recipe screen, the ingredient box and the old note

**Files:**
- Modify: `src/client/MainApp.jsx`, `src/client/screens/RecipeScreen.jsx`, `src/client/screens/HomeScreen.jsx`, `src/shared/ingredients.js`, `src/client/i18n/{en,pt,es,de}.js`
- Test: `test/i18nScreens.test.jsx`, `test/ingredients.test.js`, `test/languageFlow.test.jsx`

**Interfaces:**
- Consumes: `useRecipeTranslation`, `localizeRecipe` (Task 6).
- Produces: `normalizeIngredient(s, { plurals = true } = {})` and `parseIngredientList(raw, { plurals = true } = {})` — with `plurals: false` only the lower-casing, splitting and de-duplicating happen. New key `recipe.translating` — English "Translating the recipe…". The key `home.ingredientNote` is removed from all four catalogs.

- [ ] **Step 1: Write the failing tests**
  - `ingredients.test.js`: `parseIngredientList(['Feijoes', 'Feijoes'], { plurals: false })` → `['feijoes']`; the default still gives `['feijo']` for English rules (existing tests unchanged).
  - `i18nScreens.test.jsx`: replace the note test with one asserting no ingredient-note text shows in German or English; `HomeScreen` in `de` keeps the typed word unsingularised.
  - `languageFlow.test.jsx` (or a new test): in Portuguese, opening a liked recipe shows the translating notice, then the translated title, ingredient names and steps together; with a rejecting `translateRecipe` the English recipe shows with no error; the ingredient emoji for a translated ingredient still comes from the English name; Like on a freshly suggested recipe posts the **English** recipe object; switching language on the recipe screen swaps the text.
- [ ] **Step 2: Run** those files — expect FAIL.
- [ ] **Step 3: Implement.** `MainApp` calls `useRecipeTranslation(api, recipe, language, screen === 'recipe')` with the other hooks (before any early return), shows `<Notice>{t('recipe.translating')}</Notice>` in place of `RecipeScreen` while `pending`, and otherwise renders `RecipeScreen` with the hook's recipe; state keeps the English `recipe` for like and dislike. `RecipeScreen` uses `i.original ?? i.name` for `ingredientEmoji`. `HomeScreen` drops the note and parses typed words with `{ plurals: getLanguage() === 'en' }`.
- [ ] **Step 4: Run** `npx vitest run` for the three files and `test/i18nCatalog.test.js` — expect PASS.
- [ ] **Step 5: Commit** `feat: the recipe screen follows the chosen language; ingredients are typed in it`.

---

### Task 9: End to end, full suite and deploy

**Files:**
- Test: `test/translationFlow.test.js` (create)

- [ ] **Step 1: Write the test.** Against `startTestServer` with the fake translator and fake model, as one parent in `pt`: suggest with `['batata']` (translator turns it to `potato`, the model gets `potato`), translate the returned recipe, like it, fetch titles for the liked list, and assert the translated title from the titles call equals the translated recipe title and that `GET /api/state` still returns the English recipe.
- [ ] **Step 2: Run** `npx vitest run test/translationFlow.test.js` — expect PASS (it exercises code from Tasks 1–5); fix any gap it exposes.
- [ ] **Step 3: Run the whole suite** `npm test` and `npm run build` — expect all green.
- [ ] **Step 4: Commit** `test: translation end to end`.
- [ ] **Step 5: Rebuild the container** with the `deploy-docker` skill and confirm the app answers.
