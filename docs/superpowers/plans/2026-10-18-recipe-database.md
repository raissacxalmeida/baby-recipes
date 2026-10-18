# Recipe Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve baby recipes from a database first and call OpenAI only when nothing suitable is left, saving every recipe OpenAI writes so it is never paid for twice.

**Architecture:** A new `catalogue_recipes` table holds seeded and AI-written recipes. Pure matching rules live in `src/shared/recipeMatch.js`; table access in `src/server/catalogue.js`; start-up seeding in `src/server/seedCatalogue.js`; `requestRecipe` in `src/server/recipeService.js` tries the catalogue before the existing OpenAI path. The client and `POST /api/recipe` contract do not change.

**Tech Stack:** Node 22 ESM, Postgres (PGlite in tests), vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-18-recipe-database-design.md` (seed: `docs/superpowers/specs/2026-10-18-recipe-database-seed/recipes-seed.json`)

## Global Constraints

- The existing client contract for `POST /api/recipe` does not change; no new UI.
- Catalogue recipes cost nothing: they never touch the daily limits (10 recipes, 30 OpenAI calls); the OpenAI path counts exactly as today.
- Recipe validation and safety stay in `src/server/recipe.js` and `src/server/safety.js`; call them, do not copy them.
- Nothing in the catalogue links to a user (no user id column).
- Every catalogue recipe is re-checked with `checkSafety` for the baby's age at serving time, seeded ones included.
- Meat, fish and egg are always main ingredients; otherwise an ingredient is main when it is not pantry and at least 10% of the recipe's non-pantry grams.
- The Docker image excludes `docs/`, so the seed file used at runtime lives under `src/`.
- Tests first; the full suite and `npm run build` pass; rebuild the app container with the `deploy-docker` skill at the end.
- `test/main.test.js` starts a real server on port 3000 (`config.js` reads `PORT: '0'` as 3000). While the app container is running, its 2 existing tests already fail on master with `EADDRINUSE`, and so will the one added in Task 3. Run `docker compose stop app` before running them; Task 5 starts the container again.
- End commit messages with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A recipe whose ingredients are all pantry items (no main ingredient) is never served, whatever the parent types (Task 1).
- Ingredients typed with capitals, plurals or punctuation ("Carrots, grated", " POTATOES ") still match (Task 1).
- A stored catalogue row that fails the safety or texture check for the baby's age is skipped, not served (Task 2).
- The avoid list sent to OpenAI never holds more than 30 catalogue titles and has no case or spacing duplicates (Task 4).
- A failing catalogue save never turns a good recipe into an error for the parent (Task 4).

## File Structure

- Create `src/shared/recipeMatch.js`: pure rules for main ingredients and matching.
- Modify `src/shared/recipeGroup.js`: export the protein word list.
- Modify `src/server/migrations.js`: migration 4 and `APP_TABLES`.
- Create `src/server/catalogue.js`: save, find suitable, list overlapping titles.
- Create `src/server/seedCatalogue.js` and `src/server/seed/baby-recipes.json`: the loader and the 49 recipes.
- Modify `src/server/main.js`: seed after migrations.
- Modify `src/server/generate.js`: extract `validateRequest`, `presentRecipe`; export `normalizeTitle`.
- Modify `src/server/userData.js`: `excludeTitles` also returns liked titles.
- Modify `src/server/recipeService.js`: catalogue first, save after OpenAI.
- Tests: `test/recipeMatch.test.js`, `test/catalogue.test.js`, `test/seedCatalogue.test.js`, plus additions to `test/generate.test.js`, `test/userData.test.js`, `test/recipeService.test.js`, `test/main.test.js`.

---

### Task 1: Matching rules

**Files:**
- Create: `src/shared/recipeMatch.js`
- Modify: `src/shared/recipeGroup.js` (add one export)
- Test: `test/recipeMatch.test.js`

**Interfaces:**
- Consumes: `isListed`, `parseIngredientList` from `src/shared/ingredients.js`.
- Produces:
  - `recipeGroup.js`: `export const PROTEIN_WORDS: string[]` (every fish and meat word plus `'egg'`).
  - `recipeMatch.js`: `export const PANTRY: string[]`; `export function mainIngredients(recipe: { ingredients: { name: string; grams: number }[] }): string[]` (names); `export function matchRecipe(recipe, list: string[]): { suitable: boolean; used: number; missing: number }` where `list` is already normalised by `parseIngredientList`, `used` is how many non-pantry ingredients the list covers, `missing` how many it does not, and `suitable` is true only when the recipe has at least one main ingredient and the list covers all of them.

- [ ] **Step 1: Write the failing tests** in `test/recipeMatch.test.js`, with a helper `r = (...pairs) => ({ ingredients: pairs.map(([name, grams]) => ({ name, grams })) })`:

```js
test('pantry items are never main', () => {
  expect(mainIngredients(r(['carrot', 150], ['rapeseed oil', 14], ['water', 100], ['apple juice', 45]))).toEqual(['carrot']);
});
test('meat, fish and egg are main however little there is', () => {
  expect(mainIngredients(r(['potato', 500], ['salmon', 20], ['egg', 5]))).toEqual(['potato', 'salmon', 'egg']);
});
test('other ingredients need 10% of the non-pantry grams', () => {
  expect(mainIngredients(r(['carrot', 100], ['onion', 9], ['oil', 50]))).toEqual(['carrot']);
  expect(mainIngredients(r(['carrot', 100], ['onion', 12]))).toEqual(['carrot', 'onion']);
});
test('every main must be listed; non-main may be missing', () => {
  const rec = r(['carrot', 150], ['potato', 100], ['onion', 12], ['rapeseed oil', 14]);
  expect(matchRecipe(rec, ['carrot', 'potato'])).toEqual({ suitable: true, used: 2, missing: 1 });
  expect(matchRecipe(rec, ['carrot']).suitable).toBe(false);
});
test('plain potato does not stand in for sweet potato', () => {
  const rec = r(['sweet potato', 250], ['water', 100]);
  expect(matchRecipe(rec, ['carrot', 'potato']).suitable).toBe(false);
  expect(matchRecipe(rec, ['sweet potato']).suitable).toBe(true);
});
test('a recipe with no main ingredient is never suitable', () => {
  expect(matchRecipe(r(['water', 100], ['rapeseed oil', 14]), ['water', 'oil', 'banana']).suitable).toBe(false);
});
test('capitals, plurals and punctuation still match', () => {
  const list = parseIngredientList(['Carrots,', ' POTATOES ']);
  expect(matchRecipe(r(['carrot', 150], ['potato', 100]), list).suitable).toBe(true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/recipeMatch.test.js`
Expected: FAIL, module `recipeMatch.js` not found.

- [ ] **Step 3: Implement** `PROTEIN_WORDS` in `recipeGroup.js`, and `PANTRY`, `mainIngredients`, `matchRecipe` in `recipeMatch.js`. `PANTRY` starts as: oil, butter, water, juice, stock, broth, tea, tomato paste, cinnamon, vanilla, turmeric, coriander, paprika, ginger, curry, thyme, rosemary, marjoram, parsley, basil, cocoa, carob, yeast, fennel seeds, celery leaves, garlic, lemon, salt (do not add `pepper`: it is also bell pepper). Pantry and protein tests use `isListed(name, words)`. Compound foods: a module constant `COMPOUND_FOODS = ['sweet potato']`; a recipe ingredient whose name contains one is covered only by a list item that contains that same compound food, never by its last word.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/recipeMatch.test.js test/recipeGroup.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: add rules for matching recipes to ingredients`

---

### Task 2: Catalogue table and queries

**Files:**
- Modify: `src/server/migrations.js` (append migration 4; add `'catalogue_recipes'` to `APP_TABLES`)
- Modify: `src/server/generate.js` (export the existing `normalizeTitle`)
- Create: `src/server/catalogue.js`
- Test: `test/catalogue.test.js`

**Interfaces:**
- Consumes: `matchRecipe` (Task 1), `checkSafety` from `src/server/safety.js`, `normalizeTitle(title: string): string` from `generate.js`.
- Produces in `catalogue.js`:
  - `type Stored = { title: string; basePortions: number; ingredients: { name: string; grams: number }[]; steps: string[]; texture: string; allergens: string[] }`
  - `saveToCatalogue(db, recipe: Stored & { id?: string }, opts: { ageFromMonths: number; source: 'seed' | 'ai'; sourceId?: string }): Promise<boolean>` returns true when a row was inserted; ignores `inList` and `id`; a repeated normalised title or `sourceId` inserts nothing.
  - `findSuitable(db, { ageMonths: number; ingredients: string[]; seen: string[] }): Promise<Stored | null>` returns the best suitable recipe.
  - `overlappingTitles(db, { ingredients: string[]; limit?: number }): Promise<string[]>` (default limit 30) returns original titles that share at least one non-pantry ingredient with the list, most shared first, then by title; no age filter.
- Table `catalogue_recipes`: `id uuid pk default gen_random_uuid()`, `title_key text not null unique`, `source text not null check (source in ('seed','ai'))`, `source_id text unique`, `age_from_months int not null check (age_from_months >= 6)`, `data jsonb not null`, `created_at timestamptz not null default now()`.

- [ ] **Step 1: Write the failing tests** in `test/catalogue.test.js` (use `createTestDb`, `db.reset()` in `beforeEach`; helper `rec(title, ...pairs)` builds a mashed recipe with steps `['Mash it.']`):

```js
test('a repeated title is not saved twice and returns false', async () => {
  expect(await saveToCatalogue(db, rec('Banana mash', ['banana', 100]), { ageFromMonths: 6, source: 'ai' })).toBe(true);
  expect(await saveToCatalogue(db, rec(' banana  MASH', ['pear', 100]), { ageFromMonths: 6, source: 'ai' })).toBe(false);
  expect((await db.query('select count(*)::int as n from catalogue_recipes')).rows[0].n).toBe(1);
});
test('inList and id are not stored', async () => {
  await saveToCatalogue(db, { ...rec('Banana mash', ['banana', 100]), id: 'x' }, { ageFromMonths: 6, source: 'ai' });
  const { data } = (await db.query('select data from catalogue_recipes')).rows[0];
  expect(data.id).toBeUndefined();
  expect(data.ingredients[0].inList).toBeUndefined();
});
test('findSuitable respects the baby age', async () => {
  await saveToCatalogue(db, rec('Banana mash', ['banana', 100]), { ageFromMonths: 9, source: 'ai' });
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: [] })).toBeNull();
  expect((await findSuitable(db, { ageMonths: 9, ingredients: ['banana'], seen: [] })).title).toBe('Banana mash');
});
test('findSuitable skips seen titles whatever their case or spacing', async () => {
  await saveToCatalogue(db, rec('Banana mash', ['banana', 100]), { ageFromMonths: 6, source: 'ai' });
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: ['BANANA  mash'] })).toBeNull();
});
test('findSuitable prefers more ingredients used, then fewer missing, then title', async () => {
  const save = (t, ...p) => saveToCatalogue(db, rec(t, ...p), { ageFromMonths: 6, source: 'ai' });
  await save('B plain', ['banana', 100]);
  await save('A plain', ['banana', 100]);
  await save('Banana and pear', ['banana', 100], ['pear', 100]);
  await save('Banana with onion', ['banana', 100], ['onion', 12]);
  const args = { ageMonths: 8, ingredients: ['banana', 'pear'], seen: [] };
  const order = [];
  for (let t = await findSuitable(db, args); t; t = await findSuitable(db, args)) { order.push(t.title); args.seen.push(t.title); }
  expect(order).toEqual(['Banana and pear', 'A plain', 'B plain', 'Banana with onion']);
});
test('a stored row that fails the safety check is skipped', async () => {
  await saveToCatalogue(db, rec('Banana mash', ['banana', 100]), { ageFromMonths: 6, source: 'ai' });
  await db.query(`update catalogue_recipes set data = jsonb_set(data, '{steps}', '["Stir in honey."]')`);
  expect(await findSuitable(db, { ageMonths: 8, ingredients: ['banana'], seen: [] })).toBeNull();
});
test('a texture not allowed at the age is skipped', async () => {
  await saveToCatalogue(db, rec('Banana puree', ['banana', 100], { texture: 'puree' }), { ageFromMonths: 6, source: 'ai' });
  expect(await findSuitable(db, { ageMonths: 10, ingredients: ['banana'], seen: [] })).toBeNull();
  expect((await findSuitable(db, { ageMonths: 12, ingredients: ['banana'], seen: [] })).title).toBe('Banana puree');
});
test('overlappingTitles lists titles sharing an ingredient, most shared first, capped by limit', async () => {
  const save = (t, ...p) => saveToCatalogue(db, rec(t, ...p), { ageFromMonths: 6, source: 'ai' });
  await save('Both', ['banana', 100], ['pear', 100]);
  await save('One', ['banana', 100], ['oat', 100]);
  await save('None', ['carrot', 100]);
  expect(await overlappingTitles(db, { ingredients: ['banana', 'pear'] })).toEqual(['Both', 'One']);
  expect(await overlappingTitles(db, { ingredients: ['banana', 'pear'], limit: 1 })).toEqual(['Both']);
});
```
(`rec(title, ...pairs)` takes an optional trailing options object, such as `{ texture: 'puree' }`, that overrides recipe fields.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/catalogue.test.js`
Expected: FAIL (relation `catalogue_recipes` / module missing).

- [ ] **Step 3: Implement** the migration and `catalogue.js`. `findSuitable` selects rows with `age_from_months <= ageMonths`, drops seen titles by `normalizeTitle`, drops rows where `checkSafety(data, ageMonths)` is non-empty, keeps `matchRecipe(data, ingredients).suitable`, sorts by `used` desc, `missing` asc, title asc, and returns `data`. Matching is done in JS on the filtered rows (the catalogue is small).

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/catalogue.test.js test/db.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: add the recipe catalogue table and queries`

---

### Task 3: Seed the catalogue

**Files:**
- Create: `src/server/seed/baby-recipes.json` (copy of the spec's `recipes-seed.json`, unchanged)
- Create: `src/server/seedCatalogue.js`
- Modify: `src/server/main.js` (call it after `migrate(db)`)
- Test: `test/seedCatalogue.test.js`, `test/main.test.js`

**Interfaces:**
- Consumes: `saveToCatalogue`, `findSuitable` (Task 2), `validateRecipe`, `checkSafety`.
- Produces: `loadSeed(): SeedRecipe[]` (reads the JSON next to the module); `seedCatalogue(db, recipes = loadSeed()): Promise<{ added: number; skipped: number; rejected: string[] }>` where `rejected` holds `sourceId`s. A seed recipe is rejected, not loaded, and logged with `console.warn` when `validateRecipe` throws or `checkSafety(recipe, ageFromMonths)` is non-empty. Already-present titles or `sourceId`s count as skipped.
- `startMain` seeds after migrating; a seeding error is logged with `console.error` and does not stop start-up.

- [ ] **Step 1: Write the failing tests** in `test/seedCatalogue.test.js`:

```js
test('loads all 49 cookbook recipes', async () => {
  expect(await seedCatalogue(db)).toEqual({ added: 49, skipped: 0, rejected: [] });
});
test('running it again adds nothing', async () => {
  await seedCatalogue(db);
  expect(await seedCatalogue(db)).toEqual({ added: 0, skipped: 49, rejected: [] });
});
test('it never overwrites a recipe saved from OpenAI with the same title', async () => {
  await saveToCatalogue(db, rec('Sweet Potato Purée', ['sweet potato', 300]), { ageFromMonths: 6, source: 'ai' });
  expect((await seedCatalogue(db)).added).toBe(48);
  expect((await db.query("select data from catalogue_recipes where title_key = 'sweet potato purée'")).rows[0].data.ingredients[0].grams).toBe(300);
});
test('a seed recipe that fails the safety check is rejected', async () => {
  const bad = { ...loadSeed()[0], steps: ['Add salt.'] };
  expect(await seedCatalogue(db, [bad])).toEqual({ added: 0, skipped: 0, rejected: [bad.sourceId] });
});
```
Add one table-driven test over the spec's pinned examples against the seeded catalogue. A helper `allSuitable(args)` calls `findSuitable` repeatedly, adding each returned title to `seen`, until null. Rows `[ingredients, ageMonths, mustInclude, mustNotInclude]`:
  - `['carrot','potato'], 6` includes `Carrot and Potato Purée`, excludes `Sweet Potato Purée`
  - `['carrot'], 6` excludes `Carrot and Potato Purée`
  - `['sweet potato'], 7` includes `Sweet Potato Purée`
  - `['salmon','zucchini','potato','tomato'], 6` includes `Zucchini and Salmon Purée`
  - `['salmon','zucchini'], 6` excludes `Zucchini and Salmon Purée`
  - `['potato','carrot','beef','apple juice'], 6` includes `Vegetable, Potato and Beef Purée`, excludes `Squash, Potato and Beef Purée`
  - `['apple','banana','pear','dried fig'], 8` includes `Cooked Fruit Mix`
  - every row: no result has `ageFromMonths` above the baby's age (check via the seed JSON) and no `finger-food` recipe is returned below 12 months (run the 10-month case with `['carrot','potato','zucchini','egg','peas','polenta','oat drink']`).

In `test/main.test.js` add: `startMain` leaves 49 rows in `catalogue_recipes`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/seedCatalogue.test.js test/main.test.js`
Expected: FAIL, module missing.

- [ ] **Step 3: Implement** `seedCatalogue.js` and the `main.js` call; copy the JSON file into `src/server/seed/`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/seedCatalogue.test.js test/main.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** `feat: seed the catalogue with 49 cookbook recipes at start-up`

---

### Task 4: Catalogue first, OpenAI second

**Files:**
- Modify: `src/server/generate.js`, `src/server/userData.js`, `src/server/recipeService.js`
- Test: `test/generate.test.js`, `test/userData.test.js`, `test/recipeService.test.js`

**Interfaces:**
- Consumes: `findSuitable`, `overlappingTitles`, `saveToCatalogue`, `normalizeTitle` (Task 2).
- Produces in `generate.js`:
  - `validateRequest({ birthdate, ingredients, exclude }, now): { ageMonths: number; list: string[] }` throws the same `AppError`s (`invalid-input`, `too-young`) in the same order as today; `generateRecipe` calls it and keeps its signature and behaviour.
  - `presentRecipe(recipe: Stored, list: string[]): { id: string; title; basePortions; ingredients: { name; grams; inList: boolean }[]; steps; texture; allergens }` (id made from the title as today); `generateRecipe` uses it.
- `excludeTitles(db, userId)` in `userData.js` also returns the titles of the user's liked recipes.
- `requestRecipe(db, user, ingredients, { callModel, now })` keeps its signature.

- [ ] **Step 1: Write the failing tests.**
  `test/generate.test.js`: `validateRequest` returns `{ ageMonths: 7, list: ['banana'] }` for `input()` at the file's `now`; it throws `too-young` for a 4-month-old and `invalid-input` for `[]` ingredients; `presentRecipe` adds the id `banana-mash` and `inList` flags.
  `test/userData.test.js`: `liked titles are excluded too` (like a recipe, then `excludeTitles` returns its title).
  `test/recipeService.test.js` (a `catalogue(title, ...pairs, ageFromMonths = 6)` helper saves a banana recipe with `saveToCatalogue`; `db.reset()` already runs in `beforeEach`):

```js
test('a matching catalogue recipe is served with no model call and no usage', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  const cm = model(raw('Other'));
  const recipe = await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(recipe).toMatchObject({ id: 'banana-mash', title: 'Banana mash' });
  expect(recipe.ingredients[0].inList).toBe(true);
  expect(cm).not.toHaveBeenCalled();
  expect(await usageToday(db, user.id, now())).toEqual({ recipes: 0, calls: 0 });
  expect(await excludeTitles(db, user.id)).toEqual(['Banana mash']);
});
test('the daily limits do not block catalogue recipes, only the OpenAI path', async () => {
  await db.query("insert into usage (user_id, day, recipes, calls) values ($1, '2026-10-15', 10, 30)", [user.id]);
  await catalogue('Banana mash', ['banana', 100]);
  await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now }); // served
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'limit-reached' });
});
test('a catalogue recipe is served once per parent', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await requestRecipe(db, user, ['banana'], { callModel: model(raw('Other')), now });
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now })).title).toBe('Other');
  expect(cm).toHaveBeenCalledTimes(1);
  const other = await signUp('bo@example.com'); await setBirthdate(db, other.id, '2026-03-14', now());
  expect((await requestRecipe(db, other, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
});
test('liked and disliked catalogue titles are skipped', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await like(db, user.id, { ...presentRecipe(raw('Banana mash'), ['banana']) });
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, user, ['banana'], { callModel: cm, now })).title).toBe('Other');
});
test('invalid ingredients and a too-young baby are rejected before any lookup', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  await expect(requestRecipe(db, user, [], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'invalid-input' });
  await setBirthdate(db, user.id, '2026-07-14', now());
  await expect(requestRecipe(db, user, ['banana'], { callModel: model(raw()), now })).rejects.toMatchObject({ code: 'too-young' });
});
test('the admin gets catalogue recipes and leaves no usage row', async () => {
  await catalogue('Banana mash', ['banana', 100]);
  expect((await requestRecipe(db, admin, ['banana'], { callModel: model(raw('Other')), now })).title).toBe('Banana mash');
  expect((await db.query('select * from usage where user_id = $1', [admin.id])).rows).toHaveLength(0);
});
test('the model is told which catalogue titles overlap, without duplicates', async () => {
  await catalogue('Banana oat mash', ['banana', 100], ['oat', 60]); // not suitable: oat is not listed
  await addShown(db, user.id, 'Banana Mash', now());
  await catalogue('Banana mash', ['banana', 100]);
  const cm = model(raw('Other'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect([...cm.mock.calls[0][0].exclude].sort()).toEqual(['banana mash', 'banana oat mash']);
});
test('at most 30 catalogue titles are sent to the model', async () => {
  for (let i = 0; i < 35; i++) await catalogue(`Banana recipe ${String(i).padStart(2, '0')}`, ['banana', 100], ['oat', 60]);
  const cm = model(raw('Other'));
  await requestRecipe(db, user, ['banana'], { callModel: cm, now });
  expect(cm.mock.calls[0][0].exclude).toHaveLength(30);
});
test('a recipe from OpenAI is saved and served to the next parent for free', async () => {
  await requestRecipe(db, user, ['banana'], { callModel: model(raw()), now });
  const row = (await db.query('select source, age_from_months, data from catalogue_recipes')).rows[0];
  expect(row).toMatchObject({ source: 'ai', age_from_months: 7 });
  expect(row.data.ingredients[0].inList).toBeUndefined();
  const other = await signUp('bo@example.com'); await setBirthdate(db, other.id, '2026-03-14', now());
  const cm = model(raw('Other'));
  expect((await requestRecipe(db, other, ['banana'], { callModel: cm, now })).title).toBe('Banana mash');
  expect(cm).not.toHaveBeenCalled();
});
test('a failing catalogue save does not fail the request', async () => {
  const flaky = { ...db, query: (t, p) => (/insert into catalogue_recipes/.test(t) ? Promise.reject(new Error('disk full')) : db.query(t, p)) };
  expect((await requestRecipe(flaky, user, ['banana'], { callModel: model(raw()), now })).title).toBe('Banana mash');
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/generate.test.js test/userData.test.js test/recipeService.test.js`
Expected: the new tests FAIL; the existing ones in these files still PASS.

- [ ] **Step 3: Implement** the `generate.js` extraction and the `userData.js` change (union the user's liked titles into `excludeTitles`).

- [ ] **Step 4: Implement `requestRecipe`** in `recipeService.js` in this order: (1) the existing birthdate check; (2) `validateRequest` with `exclude: []`; (3) `seen = await excludeTitles(...)`; (4) `findSuitable`, and when it returns a recipe, `addShown` then return `presentRecipe(stored, list)` with no reservation; (5) otherwise the existing reserve, guarded-call and release logic, with `exclude` set to `seen` plus `overlappingTitles(...)`, de-duplicated by `normalizeTitle` and cut to the parent's titles plus 30 catalogue titles; (6) after `generateRecipe` succeeds, `saveToCatalogue(db, recipe, { ageFromMonths: ageMonths, source: 'ai' })` inside a try/catch that logs with `console.error` and carries on, then `addShown`.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run test/generate.test.js test/userData.test.js test/recipeService.test.js test/dataRoutes.test.js`
Expected: PASS, including the unchanged existing tests.

- [ ] **Step 6: Commit** `feat: serve recipes from the catalogue before calling OpenAI`

---

### Task 5: Verify and deploy

**Files:** none new.

- [ ] **Step 1: Run the whole suite**

Run: `npx vitest run`
Expected: everything passes. (If the app container is running, 2 tests in `test/main.test.js` fail with `EADDRINUSE` on port 3000; see the Global Constraints note. Stop the container first with `docker compose stop app`; step 3 starts it again.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 3: Deploy** with the `deploy-docker` skill.

- [ ] **Step 4: Check the database**

Run: `docker compose exec -T db psql -U baby babyrecipes -c "select source, count(*) from catalogue_recipes group by source"`
Expected: one row, `seed | 49`.

- [ ] **Step 5: Try it in the app** with a baby of at least 6 months and the ingredients `carrot, potato`: the recipe is "Carrot and Potato Purée", and the "recipes today" counter does not move. Ask for another until the catalogue runs out; only then does the counter move.

- [ ] **Step 6: Commit** nothing; report the results.
