# Baby-friendly Recipe Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A localhost React website where the author enters the baby's birthday once, lists the ingredients she has, and gets one age-safe recipe (grams/kg), with portion scaling, like/dislike feedback and a liked-recipes page.

**Architecture:** A small Node HTTP server serves the built React app (`dist/`) and one endpoint, `POST /api/recipe`, which asks the OpenAI API for a structured recipe, validates it, and enforces age-based safety rules in code (retrying up to 3 times). Portion scaling, formatting, ingredient matching and age maths are pure ES modules in `src/shared/`, imported by both the server and the React app (Vite bundles them). Browser `localStorage` holds birthday, liked, disliked and shown recipes.

**Tech Stack:** Node.js (installed: v19.2.0; Vite 5 and Vitest 2 declare `^18 || >=20`, so expect an engines warning; if install or tests fail because of it, the fix is upgrading Node to 20+), ES modules (`"type": "module"`), React 18, Vite 5 with `@vitejs/plugin-react`, Vitest 2 with `jsdom` and `@testing-library/react`, built-in `fetch`. No UI library, no router, no state library, no TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-14-baby-recipes-design.md`. This plan chooses React and Vite for the front end (the spec leaves the framework to the builder; the author asked for React).

## Global Constraints

- Quantities are grams and kilograms only: `g` below 1000, `kg` from 1000 up (e.g. `250 g`, `1.5 kg`). Liquids are given in grams (1 ml = 1 g). No cups, spoons, oz or ml.
- Interface, recipes and safety word lists are English.
- OpenAI API only. The key is read from `OPENAI_API_KEY` (env var or `.env`), never sent to the browser, never committed (`.env` is git-ignored).
- Server listens on `127.0.0.1` only. No login, no accounts, no database server.
- Under 6 months: no recipe suggested and no AI call. A future or invalid birthday is rejected.
- Under 12 months: never honey, salt, sugar, or cow's milk (as an ingredient).
- Texture by age: 6-8 months `puree` or `mashed`; 9-11 months `mashed` or `soft-pieces`; 12+ months any of `puree`, `mashed`, `soft-pieces`, `finger-food`.
- Always rejected (any age under 36 months): popcorn, whole nuts, whole grapes.
- Failed recipes: at most 3 AI attempts per request, then an error; failed attempts are not counted as shown.
- Portion change, viewing liked recipes and restoring disliked recipes never call the AI.
- Disliked recipes are hidden from future suggestions (recipe only, not its ingredients) and can be restored.
- Unlisted ingredients are marked "not in your list"; the page shows a "not medical advice" note.
- Recipe and user text is rendered as React text children; `dangerouslySetInnerHTML` is never used.

## Review Focus

- Birthday today, in the future, or unparseable (`""`, `"31/02/2026"`): rejected with a message, never shown as age 0 or negative.
- Typed ingredients with capitals, plurals, extra spaces, duplicates or empty entries (`" Tomatoes "`, `"tomato"`, `""`): normalised to one entry each; `tomatoes` matches recipe ingredient `tomato`.
- Portion edge cases: 1 portion is the minimum, 12 the maximum; 1000 g shows `1 kg`; scaling 3 portions down to 1 and back gives the original amounts (always scale from the stored base, never compound rounding).
- The AI returns broken JSON, a wrong unit, honey for a 7-month-old, a repeated or disliked title, or the key is missing: the app retries (max 3) then shows a readable error, never a crash or an unsafe recipe.
- `localStorage` holds corrupted JSON, or recipe text contains `<img onerror=...>`: the app starts at the birthday screen instead of crashing, and the text shows literally.

---

## File Structure

- `package.json`, `.gitignore` (`.env`, `node_modules/`, `dist/`), `.env.example` (`OPENAI_API_KEY=`), `vite.config.js` (React plugin, dev proxy `/api` to `http://127.0.0.1:3000`, Vitest `environment: 'jsdom'`).
- `index.html` (Vite entry, `<div id="root">`, loads `/src/client/main.jsx`).
- `src/shared/age.js`, `src/shared/units.js`, `src/shared/ingredients.js`: pure helpers used by server and browser.
- `src/server/recipe.js`, `safety.js`, `openai.js`, `generate.js`, `server.js`.
- `src/client/store.js` (localStorage), `src/client/api.js` (fetch wrapper), `src/client/main.jsx`, `src/client/App.jsx` (screen switching), `src/client/screens/` (`SetupScreen.jsx`, `TooYoungScreen.jsx`, `HomeScreen.jsx`, `RecipeScreen.jsx`, `LikedScreen.jsx`), `src/client/style.css`.
- `test/**/*.test.js(x)`, one per module or screen.

Scripts: `"test": "vitest run"`, `"dev": "vite"` (run the server separately with `node src/server/server.js` for the API), `"build": "vite build"`, `"start": "vite build && node src/server/server.js"`.

Shared types (all tasks):

```js
// Recipe as returned by the server and stored in the browser
// { id: string, title: string, basePortions: number,
//   ingredients: { name: string, grams: number, inList: boolean }[],
//   steps: string[], texture: 'puree'|'mashed'|'soft-pieces'|'finger-food',
//   allergens: string[] }
```

---

### Task 1: Project setup, age and units

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `vite.config.js`, `src/shared/age.js`, `src/shared/units.js`
- Test: `test/age.test.js`, `test/units.test.js`

**Interfaces:**
- Produces:
  - `ageInMonths(birthdate: string, now: Date): number` (`birthdate` is `YYYY-MM-DD`; returns completed months; throws `RangeError` with message containing `birthday` for invalid, future or same-day dates).
  - `formatAmount(grams: number): string`: whole grams below 1000 (`"250 g"`), kg from 1000 with up to 2 decimals, trailing zeros trimmed (`"1 kg"`, `"1.5 kg"`).
  - `scaleRecipe(recipe: Recipe, portions: number): Recipe`: returns a copy with each `grams` multiplied by `portions / recipe.basePortions`, rounded to whole grams, and `basePortions = portions`. Throws `RangeError` if `portions` is not an integer from 1 to 12.
  - `ageLabel(months: number): string`: `"8 months"`, `"1 month"`, `"14 months"`.

- [ ] **Step 1: Set up the project.** `npm init`-style `package.json` with `"type": "module"` and the scripts listed above; `npm install react react-dom` and `npm install -D vite@5 @vitejs/plugin-react vitest@2 jsdom @testing-library/react@16`; `.gitignore`, `.env.example`, `vite.config.js` as described.
- [ ] **Step 2: Write failing tests** (Vitest `test`/`expect`):

```js
test('8 months old', () => expect(ageInMonths('2026-02-14', new Date('2026-10-14'))).toBe(8));
test('day before the month completes', () => expect(ageInMonths('2026-02-15', new Date('2026-10-14'))).toBe(7));
test.each(['2027-01-01', '2026-10-14', '31/02/2026', '2026-02-31', ''])('rejects %s', (d) =>
  expect(() => ageInMonths(d, new Date('2026-10-14'))).toThrow(/birthday/));
test('formatAmount', () => {
  expect(formatAmount(250)).toBe('250 g'); expect(formatAmount(999)).toBe('999 g');
  expect(formatAmount(1000)).toBe('1 kg'); expect(formatAmount(1500)).toBe('1.5 kg');
});
test('scaleRecipe doubles amounts', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'oats', grams: 30, inList: true }] };
  expect(scaleRecipe(r, 4).ingredients[0].grams).toBe(60);
});
test('scaleRecipe from the base is lossless', () => {
  const r = { basePortions: 2, ingredients: [{ name: 'banana', grams: 100, inList: true }] };
  expect(scaleRecipe(r, 3).ingredients[0].grams).toBe(150);
  expect(scaleRecipe(r, 2).ingredients[0].grams).toBe(100);
});
test.each([0, 13, 1.5])('scaleRecipe rejects %s portions', (n) => expect(() => scaleRecipe({ basePortions: 2, ingredients: [] }, n)).toThrow(RangeError));
test('ageLabel', () => { expect(ageLabel(1)).toBe('1 month'); expect(ageLabel(8)).toBe('8 months'); });
```

- [ ] **Step 3: Run `npm test`.** Expected: FAIL, modules not found.
- [ ] **Step 4: Implement `src/shared/age.js` and `src/shared/units.js`.** Parse `YYYY-MM-DD` strictly (reject dates that roll over, such as Feb 31).
- [ ] **Step 5: Run `npm test`.** Expected: all PASS.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: project setup, age and unit helpers"`

---

### Task 2: Ingredient matching and recipe validation

**Files:**
- Create: `src/shared/ingredients.js`, `src/server/recipe.js`
- Test: `test/ingredients.test.js`, `test/recipe.test.js`

**Interfaces:**
- Produces:
  - `normalizeIngredient(s: string): string`: trim, lowercase, collapse spaces, singularise each word (`ies`→`y`, `oes`→`o`, trailing `s` removed unless it ends in `ss`).
  - `parseIngredientList(raw: string[]): string[]`: normalise, drop empties, drop duplicates, keep order.
  - `isListed(recipeIngredientName: string, list: string[]): boolean`: true if any normalised list item appears as whole words inside the normalised name.
  - `validateRecipe(raw: unknown): { title, basePortions, ingredients: { name, grams }[], steps, texture, aiAllergens: string[] }` throws `Error` naming the bad field. Requires non-empty `title`, integer `basePortions` 1-12, `ingredients` array (1+) of `{ name: non-empty string, grams: number > 0 }`, `steps` array (1+) of non-empty strings, `texture` in the 4 allowed values, `allergens` array of strings (may be empty; returned as `aiAllergens`). Ingredients carry no `inList` here; `generate` adds it.

- [ ] **Step 1: Write failing tests:** `parseIngredientList([' Tomatoes ', 'tomato', '', 'Sweet  Potatoes'])` equals `['tomato', 'sweet potato']`; `isListed('ripe tomatoes', ['tomato'])` true; `isListed('olive oil', ['tomato'])` false; `isListed('potatoes', ['sweet potato'])` false; `validateRecipe` accepts a full valid object; throws `/grams/` for `grams: '100 ml'`; throws `/texture/` for `texture: 'chunky'`; throws `/steps/` for `steps: []`; throws for `basePortions: 0`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement both modules** with the signatures above.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: ingredient matching and recipe validation"`

---

### Task 3: Safety rules

**Files:**
- Create: `src/server/safety.js`
- Test: `test/safety.test.js`

**Interfaces:**
- Consumes: the validated recipe from Task 2.
- Produces:
  - `checkSafety(recipe: { title, ingredients, steps, texture }, ageMonths: number): string[]`: list of problem messages, empty when safe. Scans ingredient names, steps and title as lowercase text, matching words and their plural or `-ed` forms (`salt`, `salts`, `salted`).
    - Under 12 months: `honey`, `salt`, `sugar`, `syrup`, and `milk` unless the name contains `breast` or `formula`.
    - Under 36 months: `popcorn`, `whole nut(s)`, `whole grape(s)`.
    - Texture must be allowed for the age (Global Constraints).
  - `detectAllergens(recipe: { ingredients, aiAllergens?: string[] }): string[]`: sorted union of AI-reported allergens and keyword hits: `peanut`, `tree nut` (almond, walnut, cashew, hazelnut), `egg`, `milk`, `wheat`, `soy`, `fish`, `shellfish`, `sesame`.

- [ ] **Step 1: Write failing tests:** honey in ingredients at 7 months → problem mentioning `honey`; the same at 13 months → `[]`; `"pinch of salt"` in a step at 10 months → problem; `"salted butter"` at 10 months → problem; `"breast milk"` at 7 months → `[]`; `"milk"` at 7 months → problem; popcorn at 30 months → problem; texture `finger-food` at 7 months → problem; `soft-pieces` at 10 months → `[]`; `detectAllergens` returns `['egg']` for ingredient `eggs`, and includes an AI-reported `'sesame'`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `checkSafety` and `detectAllergens`.** Keep rule lists as constants at the top of the file.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: baby safety rules"`

---

### Task 4: OpenAI call and recipe generation

**Files:**
- Create: `src/server/openai.js`, `src/server/generate.js`
- Test: `test/generate.test.js`

**Interfaces:**
- Consumes: `ageInMonths`, `parseIngredientList`, `isListed`, `validateRecipe`, `checkSafety`, `detectAllergens`.
- Produces:
  - `callModel(input: { ageMonths: number, ingredients: string[], exclude: string[] }, opts: { apiKey: string, fetchImpl?: typeof fetch }): Promise<unknown>`: `POST https://api.openai.com/v1/chat/completions` with JSON-schema structured output, model `gpt-4o-mini` (one constant), prompt asks for grams only, English, age-appropriate texture, base portions 1-4, a title not in `exclude`, and mainly the given ingredients. Returns the parsed JSON of the first message. Throws `AppError('missing-key')` when `apiKey` is empty.
  - `class AppError extends Error { code: 'missing-key'|'too-young'|'invalid-input'|'generation-failed' }` exported from `generate.js`.
  - `generateRecipe(input: { birthdate: string, ingredients: string[], exclude: string[] }, deps: { callModel: (i: { ageMonths, ingredients, exclude }) => Promise<unknown>, now: () => Date }): Promise<Recipe>`:
    1. `invalid-input` if birthday invalid or the parsed ingredient list is empty.
    2. `too-young` if age is under 6 months; `callModel` not called.
    3. Up to 3 attempts: call, `validateRecipe`, `checkSafety`, reject a title found (case-insensitively, spaces collapsed) in `exclude`. A thrown `missing-key` is rethrown immediately.
    4. On success return the recipe with `id` (lowercase title, non-alphanumerics to `-`), `inList` per ingredient, and `allergens` from `detectAllergens`.
    5. After 3 failures throw `generation-failed`.

- [ ] **Step 1: Write failing tests** with a fake `callModel` (count calls): valid raw → recipe with `inList` true for `banana`, false for `olive oil`; birthday giving 5 months → `too-young`, 0 calls; first response with honey at 7 months then a valid one → recipe returned, 2 calls; three invalid responses (one is `{}`) → `generation-failed`, 3 calls; title in `exclude` differing in case/spacing → retried; `ingredients: ['  ']` → `invalid-input`; `callModel` throwing `missing-key` → rethrown after 1 call. `callModel` tests with a fake `fetchImpl`: request has `Authorization: Bearer test-key`, the key is not in the body; an empty `apiKey` throws `missing-key` without calling fetch.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `openai.js` and `generate.js`.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: recipe generation with retries and safety checks"`

---

### Task 5: HTTP server

**Files:**
- Create: `src/server/server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `generateRecipe`, `AppError`, `callModel`.
- Produces:
  - `createServer(deps: { generate: (input: { birthdate, ingredients, exclude }) => Promise<Recipe>, staticDir: string }): http.Server`.
    - `POST /api/recipe` with JSON `{ birthdate, ingredients, exclude }` → `200 { recipe }`; `AppError` codes map to `400 invalid-input`, `422 too-young`, `502 generation-failed`, `500 missing-key`, each as `{ error: code, message: string }`; any other error → `500` with a generic message (no stack); malformed JSON or body over 100 KB → `400`.
    - Any other `GET` serves files from `staticDir` (`/` → `index.html`, correct content types for html, js, css), `404` when missing. Path traversal (`/../package.json`, `/..%2fpackage.json`) → `404`.
  - `loadEnv(path: string): void`: reads `KEY=value` lines from a file into `process.env` when not already set; missing file is fine.
  - Running `node src/server/server.js` calls `loadEnv('.env')`, then listens on `127.0.0.1:3000` serving `dist/`, and logs the URL.

- [ ] **Step 1: Write failing tests** (start on port 0 with a temp `staticDir` containing `index.html`, use `fetch`): valid POST with a fake `generate` returns 200 and the recipe; `generate` throwing `AppError('too-young')` → 422 with `error: 'too-young'`; unknown error → 500 without a stack trace in the body; invalid JSON → 400; `GET /` → 200 `text/html` with the temp file's content; a missing file → 404; both traversal URLs → 404; `loadEnv` reads a temp file and does not override an existing variable.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `server.js` with `node:http`.** Resolve file paths against `staticDir` and reject anything that escapes it.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Manual check (needs a real key; skip and ledger if none is available):** put the key in `.env`, run `node src/server/server.js`, then `curl -s -X POST localhost:3000/api/recipe -H 'content-type: application/json' -d '{"birthdate":"2026-02-14","ingredients":["banana","oats"],"exclude":[]}'`. Expected: a JSON recipe with amounts in grams.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: http server and recipe endpoint"`

---

### Task 6: Browser storage and API client

**Files:**
- Create: `src/client/store.js`, `src/client/api.js`
- Test: `test/store.test.js`, `test/api.test.js`

**Interfaces:**
- Consumes: `ageInMonths` from `src/shared/age.js`.
- Produces:
  - `createStore(storage: Pick<Storage, 'getItem'|'setItem'>)` with: `getBirthdate(): string | null`, `setBirthdate(d: string): void`, `getLiked(): Recipe[]`, `like(recipe: Recipe): void` (no duplicate ids; replaces), `unlike(id: string): void`, `getDisliked(): Recipe[]`, `dislike(recipe: Recipe): void`, `restore(id: string): void`, `getShownTitles(): string[]`, `addShown(title: string): void`, `excludeTitles(): string[]` (shown plus disliked). Corrupted JSON or a throwing `getItem` yields empty defaults, never an exception. Liking removes the recipe from disliked and vice versa; `restore` removes it from disliked only.
  - `startScreen(store, now: Date): 'setup' | 'too-young' | 'home'` (exported from `store.js`): `setup` if no birthdate or an invalid/future one; `too-young` under 6 months; else `home`.
  - `fetchRecipe(body: { birthdate, ingredients, exclude }, fetchImpl?: typeof fetch): Promise<Recipe>` in `api.js`: POSTs to `/api/recipe`; on a non-200 throws `Error` whose message is the server's `message`; on a network failure throws `Error('Could not reach the server')`.

- [ ] **Step 1: Write failing tests** with an in-memory fake storage: round-trip birthdate; `like` twice stores one; `dislike` of a liked recipe moves it; `restore` leaves it neither liked nor disliked; `getItem` returning `'{not json'` → `getLiked()` is `[]`; `getItem` that throws → defaults; `startScreen` returns `setup` for `'banana'` and for a future date, `too-young` for 4 months, `home` for 8; `excludeTitles` merges shown and disliked; `fetchRecipe` with a fake fetch returning 422 `{ message: 'Too young' }` rejects with `/Too young/`; a rejecting fetch → `/Could not reach/`.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement `store.js` and `api.js`.** Storage keys prefixed `baby-recipes:`.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: browser store and api client"`

---

### Task 7: React app: setup, ingredients and recipe with portions

**Files:**
- Create: `index.html`, `src/client/main.jsx`, `src/client/App.jsx`, `src/client/style.css`, `src/client/screens/SetupScreen.jsx`, `TooYoungScreen.jsx`, `HomeScreen.jsx`, `RecipeScreen.jsx`
- Test: `test/screens.test.jsx`, `test/app.test.jsx`

**Interfaces:**
- Consumes: `createStore`, `startScreen`, `fetchRecipe`, `parseIngredientList`, `scaleRecipe`, `formatAmount`, `ageLabel`, `ageInMonths`.
- Produces:
  - `App({ store, fetchRecipe, now }: { store: Store, fetchRecipe: typeof fetchRecipe, now?: () => Date })` default export of `App.jsx`: holds the current screen (`setup | too-young | home | recipe | liked`), the ingredient list and the current recipe in React state. `main.jsx` renders `<App store={createStore(localStorage)} fetchRecipe={fetchRecipe} />`. Dependencies are props so tests can inject fakes.
  - `SetupScreen({ onSave(birthdate: string): void })`: date input and Continue; shows the `ageInMonths` error message when the date is invalid or in the future.
  - `TooYoungScreen({ onChangeBirthday(): void })`: says solid foods usually start around 6 months.
  - `HomeScreen({ ageText: string, ingredients: string[], onChange(list: string[]): void, onSuggest(): void, loading: boolean, error: string | null, onShowLiked(): void })`: text input + Add (also Enter) feeding `parseIngredientList`, chips with remove buttons, Suggest button disabled when the list is empty or `loading`, error text with the button re-enabled.
  - `RecipeScreen({ recipe: Recipe })` shows title, a portions stepper (minus/plus, 1-12, minus disabled at 1, plus at 12), ingredients via `formatAmount(scaleRecipe(recipe, n))` where `recipe` is the stored base and `n` is state, a `not in your list` tag for `inList: false`, a warning listing `allergens` when non-empty, numbered steps, and a `not medical advice` note. Task 8 adds the buttons.
- Each recipe returned by the server is added with `store.addShown(recipe.title)` before it is displayed.

- [ ] **Step 1: Write failing tests** (Testing Library, jsdom):
  - `RecipeScreen`: for base 2 portions, `oats 30 g`, clicking plus twice shows `60 g`; clicking minus twice returns to `30 g`; 1000 g of banana at 2 portions shows `1 kg` and clicking plus shows `1.5 kg`; minus disabled at 1 portion; an ingredient with `inList: false` shows `not in your list`; `allergens: ['egg']` shows a warning containing `egg`; a title of `<img src=x onerror=alert(1)>` renders as literal text and `container.querySelector('img')` is `null`.
  - `HomeScreen` inside `App`: typing ` Tomatoes ` then `tomato` (Add) shows one chip `tomato`; empty input adds nothing; remove button deletes a chip; Suggest disabled with no chips.
  - `App`: with no birthdate shows the setup screen; saving a birthday 8 months ago shows `8 months` on Home; a birthday 3 months ago shows the too-young screen and the injected `fetchRecipe` mock is never called; storing `'banana'` as the birthdate starts at setup; a successful suggest shows the recipe and `store.getShownTitles()` contains its title; a rejecting `fetchRecipe` shows its message and keeps the ingredient chips.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the files.** Plain function components with `useState`; no routing library, no CSS framework. Keep `src/client/style.css` small and mobile-friendly.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Manual check (needs a real key):** `npm start`, open `http://localhost:3000`, enter a birthday 8 months ago, add `banana` and `oats`, get a recipe in g/kg, raise to 4 portions and confirm amounts double, lower back and confirm they match; with a birthday 3 months ago confirm no request reaches the server. If no key is available, run `npm run build` and confirm it succeeds and ledger the skip.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: react setup, ingredients and recipe screens"`

---

### Task 8: Feedback, liked list and restore

**Files:**
- Create: `src/client/screens/LikedScreen.jsx`
- Modify: `src/client/App.jsx`, `src/client/screens/RecipeScreen.jsx`, `src/client/style.css`
- Test: `test/feedback.test.jsx`

**Interfaces:**
- Consumes: `createStore` methods `like`, `unlike`, `dislike`, `restore`, `getLiked`, `getDisliked`, `excludeTitles`; `fetchRecipe`; `scaleRecipe`.
- Produces:
  - `RecipeScreen` gains props `onAnother(): void`, `onLiked(): void`, `onDisliked(): void` rendered as buttons `Give me another`, `Baby liked it`, `Baby didn't like it`. When opened from the liked list, `onAnother`, `onLiked` and `onDisliked` are omitted and the buttons are not shown.
  - `LikedScreen({ liked: Recipe[], disliked: Recipe[], onOpen(r: Recipe): void, onUnlike(id: string): void, onRestore(id: string): void, onBack(): void })`: liked list (title, Open, Remove) and a `Not liked` section (title, `Restore`).
  - `App` wiring: `Give me another` adds the current title to shown, requests a recipe with the same ingredients and `store.excludeTitles()`; `Baby liked it` calls `store.like`; `Baby didn't like it` calls `store.dislike` then requests another recipe; Home and Liked screens link to each other.

- [ ] **Step 1: Write failing tests** (Testing Library, injected `fetchRecipe` mock and a fake store): `Baby liked it` stores the recipe and it appears on the Liked screen after navigating there; opening a liked recipe shows it with portion buttons, no feedback buttons, and `fetchRecipe` not called again; `Baby didn't like it` calls `fetchRecipe` once more with `exclude` containing the disliked title; `Give me another` calls `fetchRecipe` with the previously shown titles in `exclude`; `Restore` on a disliked recipe removes it from `Not liked` and from `store.excludeTitles()`; `Remove` on a liked recipe removes it.
- [ ] **Step 2: Run `npm test`.** Expected: FAIL.
- [ ] **Step 3: Implement the screens and wiring.**
- [ ] **Step 4: Run `npm test`.** Expected: PASS (whole suite).
- [ ] **Step 5: Manual check (needs a real key):** like a recipe, reload, open Liked recipes, confirm it is there and scales with no server request; dislike another and confirm it is not suggested again for the same ingredients; restore it. If no key is available, ledger the skip.
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: feedback, liked recipes and restore"`
