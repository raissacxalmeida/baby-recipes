# Multiple babies in one account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One account holds up to 5 babies; the app shows one baby at a time, the menu is split into per-baby pages and pages for everyone, and each baby's age, liked and disliked recipes and shown list are kept separately.

**Architecture:** A new `babies` table owns the data that hangs off `users` today (`recipes`, `shown`, birthdate). Every baby-scoped request names its baby in an `X-Baby-Id` header, which the server checks belongs to the signed-in account. The client binds a baby to an `Api` instance (`api.withBaby(id)`), and `MainApp` is remounted with `key={babyId}` on every switch. The daily limit, language and Community likes stay on the user. Three additive-then-destructive migrations keep each task's suite green.

**Tech Stack:** TypeScript (strict), Node `http` server with raw `pg` / PGlite, React 18, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-06-multiple-babies-design.md`

## Global Constraints

- Work on branch `BR-6`; never push. Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- TypeScript `strict`; `npm run typecheck` has zero errors at the end of Tasks 1 to 3 and 6 to 8. Tasks 4 and 5 change the client `Api` and `Menu` before `MainApp.tsx` and `App.tsx` are adapted (Task 6), so they may leave type errors in those two files and in `test/app.test.tsx` only. No `any`, `@ts-ignore`, or loosened config.
- All new text exists in `en`, `pt`, `es`, `de` (`src/client/i18n/*.ts`). `test/i18nCatalog.test.ts` enforces equal keys and slots, and that every `key: '...'` the server sends exists in English.
- The suggestion page is renamed **"Recipe ideas"** / **"Ideias de receitas"** / **"Ideas de recetas"** / **"Rezeptideen"**. The catalog key `menu.home` becomes `menu.ideas`; the internal screen id `'home'` and `HomeScreen` keep their names.
- Daily limit stays per account: 10 newly generated recipes and 30 model calls a day (`src/server/usage.ts` is not changed).
- A baby has a name (required, trimmed, 1 to 30 characters) and a birthdate. At most **5 babies** per account. Names need not be unique. The last remaining baby cannot be removed.
- No baby data beyond name and birthdate. No change to recipe generation, matching, translation or safety checks other than reading the selected baby's birthdate.
- Server error keys added: `err.babyName` (params `{ max }`), `err.babyLimit` (params `{ max }`), `err.babyLast`, `err.babyMissing`, `err.babyRequired`. Birthdate errors keep `err.birthdayFormat` / `err.birthdayFuture`.
- `src/server/` changes, so deployment goes through the `deploy-docker` skill (it takes a backup before the migrations run on live data).
- New screens follow the `add-screen` skill: `src/client/screens/<Name>Screen.tsx`, default export, props type exported, root `<section className="grid gap-4">`, `h1` heading, `ConfirmDialog` for destructive actions.

## Review Focus

- **A baby id from another account** (or a malformed one) on any baby-scoped route must be refused with `not-found` / `err.babyMissing`, never read or written. Pinned in Task 2.
- **Existing data in the migration:** a user with a birthdate and recipes, a user with recipes but no birthdate, and a user with nothing. Nothing is lost; the first baby has a null name. Pinned in Task 1 and extended in Tasks 2 and 3.
- **The same recipe in two babies' lists:** liked for one and disliked for the other, shared by one, copied from Community into both. Each action changes only the intended baby. Pinned in Tasks 2 and 3.
- **Removing a baby with Community ties:** their shared recipe nobody liked is deleted, one another parent liked stays, and the Community like behind a copy goes only if no sibling baby still holds a copy. Pinned in Task 3.
- **A very long unbroken baby name, and a baby with no name yet** in the menu and on the screens. Pinned in Tasks 5 and 6.

---

### Task 1: Babies table and baby management (server)

**Files:**
- Modify: `src/server/migrations.ts` (add migration 7, add `'babies'` to `APP_TABLES`), `src/server/migrate.ts`, `src/server/types.ts`, `src/server/routes/index.ts`, `src/client/i18n/{en,pt,es,de}.ts`
- Create: `src/server/babies.ts`, `src/server/routes/babies.ts`, `test/babies.test.ts`, `test/babyRoutes.test.ts`, `test/migrationBabies.test.ts`, `test/helpers/babies.ts`
- Modify: `test/helpers/db.ts`

**Interfaces:**
- Produces:
  - `migrate(db: Db, upTo?: number): Promise<void>` (runs only the first `upTo` migrations; default all) and `createTestDb(options?: { upTo?: number }): Promise<TestDb>`.
  - In `src/server/babies.ts`:
    - `interface Baby { id: string; name: string | null; birthdate: string | null }` (birthdate as `YYYY-MM-DD`)
    - `const MAX_BABIES = 5`, `const MAX_NAME = 30`
    - `listBabies(db: Queryable, userId: string): Promise<Baby[]>` (oldest first, by `created_at, id`)
    - `getLastBabyId(db: Queryable, userId: string): Promise<string | null>`
    - `addBaby(db: Db, userId: string, input: { name: unknown; birthdate: unknown }, now: Date): Promise<Baby>`
    - `updateBaby(db: Db, userId: string, babyId: unknown, input: { name: unknown; birthdate: unknown }, now: Date): Promise<void>`
    - `setLastBaby(db: Db, userId: string, babyId: unknown): Promise<void>`
    - `requireBaby(db: Queryable, userId: string, babyId: unknown): Promise<Baby>`
  - Routes (all `access: 'user'`): `GET /api/babies` → `{ babies: Baby[], lastBabyId: string | null }`; `POST /api/babies` `{ name, birthdate }` → `{ baby: Baby }`; `PUT /api/babies/:id` `{ name, birthdate }` → `{ ok: true }`; `PUT /api/last-baby` `{ id }` → `{ ok: true }`.
  - `test/helpers/babies.ts`: `addTestBaby(db: Db, userId: string, birthdate = '2026-02-14', name = 'Mia'): Promise<string>` returning the baby id (uses `addBaby` with `now = 2026-10-15T12:00:00Z`).

- [ ] **Step 1: Write the failing tests.** `test/migrationBabies.test.ts`: `createTestDb({ upTo: 6 })`, insert three users (via SQL): one with `birthdate '2026-02-14'`, two `recipes` rows and one `shown` row; one with no birthdate and no data; one with no birthdate but one `recipes` row. Then `migrate(db)` and assert `babies` has exactly two rows (users 1 and 3), user 1's baby has `name` null and `birthdate` `2026-02-14`, user 3's baby has null birthdate, and each of those users' `last_baby_id` is their baby while user 2's is null. `test/babies.test.ts` (users from `createInvite` + `acceptInvite`, as `test/userData.test.ts` does):
  - `adds a baby with a trimmed name and lists babies oldest first`
  - `rejects an empty, blank or 31-character name with err.babyName; accepts exactly 30; allows two babies with the same name`
  - `rejects 'banana' with err.birthdayFormat and a future date with err.birthdayFuture`
  - `refuses a sixth baby with code conflict, key err.babyLimit, params { max: 5 }`
  - `updateBaby changes name and birthdate, completes a baby whose name is null, and refuses another user's baby with err.babyMissing`
  - `requireBaby: undefined gives invalid-input err.babyRequired; a random uuid, a non-uuid string and another user's baby give not-found err.babyMissing`
  - `setLastBaby remembers a baby, refuses another user's baby, and getLastBabyId is null once that baby row is deleted`
  `test/babyRoutes.test.ts` (with `startTestServer`): every route is 401 without a cookie; `GET /api/babies` starts as `{ babies: [], lastBabyId: null }`; POST then GET lists the baby; PUT edits it; `PUT /api/last-baby` is reflected in the next GET; the admin can add babies too.
- [ ] **Step 2: Run** `npx vitest run test/migrationBabies.test.ts test/babies.test.ts test/babyRoutes.test.ts`. Expected: FAIL (missing module / table).
- [ ] **Step 3: Migration 7** appended to `MIGRATIONS` as single statements: `create table babies (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, name text, birthdate date, created_at timestamptz not null default now())`; an index on `babies (user_id)`; `alter table users add column last_baby_id uuid references babies(id) on delete set null`; `insert into babies (user_id, birthdate) select id, birthdate from users where birthdate is not null or exists (select 1 from recipes r where r.user_id = users.id) or exists (select 1 from shown s where s.user_id = users.id)`; `update users u set last_baby_id = b.id from babies b where b.user_id = u.id`. Add `BabyRow` to `types.ts` and `last_baby_id: string | null` to `UserRow`. `migrate` loops `i < upTo`.
- [ ] **Step 4: Implement `babies.ts`.** Reuse the birthdate check from `setBirthdate` in `userData.ts` (same `ageInMonths` call, same error mapping) as an exported `checkBirthdate(birthdate: unknown, now: Date): string`; `addBaby` does count and insert in one transaction. Wording of error messages follows the existing English style. Add the five error keys in all four catalogs (the `{max}` slot in `err.babyName` and `err.babyLimit`). Register `babyRoutes` in `routes/index.ts`.
- [ ] **Step 5: Run** the three test files plus `npm run typecheck` and `npx vitest run test/i18nCatalog.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: add babies table and baby management routes`.

---

### Task 2: Recipes, shown titles and suggestions belong to a baby

**Files:**
- Modify: `src/server/migrations.ts` (migration 8), `src/server/types.ts`, `src/server/userData.ts`, `src/server/recipeService.ts`, `src/server/sharedRecipes.ts`, `src/server/routes/data.ts`, `src/server/server.ts`
- Modify tests: `test/userData.test.ts`, `test/recipeService.test.ts`, `test/dataRoutes.test.ts`, `test/sharedRecipes.test.ts`, `test/sharedRoutes.test.ts`, `test/errorKeys.test.ts`, `test/server.test.ts`, `test/translationFlow.test.ts`, `test/migrationBabies.test.ts`, `test/helpers/http.ts`

**Interfaces:**
- Consumes: Task 1's `Baby`, `requireBaby`, `addTestBaby`.
- Produces:
  - `RouteContext.babyId: string | undefined`, read from the `x-baby-id` request header in `server.ts`.
  - `test/helpers/http.ts`: `addBaby(jar: Jar, options?: { name?: string; birthdate?: string }): Promise<{ id: string; headers: Record<string, string> }>` where `headers` is `{ 'X-Baby-Id': id }` to pass as the last argument of `call`. Defaults: name `'Mia'`, birthdate `'2026-03-14'`.
  - `userData.ts`: `getState(db: Db, userId: string, baby: Baby): Promise<UserState>` (same fields as today; `birthdate` comes from the baby; `sharedIds` are the account's shared recipe ids); `like(db, babyId: string, recipe: unknown)`, `dislike(db, userId: string, babyId: string, recipe: unknown)`, `unlike(db, userId: string, babyId: string, id: unknown)`, `restore(db, babyId: string, id: unknown)`, `addShown(db, babyId: string, title: unknown, now: Date)`, `excludeTitles(db, babyId: string)`. `setBirthdate` is deleted.
  - `recipeService.ts`: `requestRecipe(db, user: SessionUser, baby: Baby, ingredients, options)`; a baby with a null birthdate gives `err.birthdayFirst`.
  - `sharedRecipes.ts`: `shareRecipe(db, userId, babyId: string, recipeId, now)` reads the baby's liked recipe and the baby's birthdate for `baby_months`; `likeShared(db, userId, babyId: string, sharedId)` saves the copy into that baby's list; `unlikeShared(db, userId, sharedId)` removes the account-wide like and every copy (`copied_from = sharedId`, status liked) in the account's babies.
  - Routes needing the header (resolved with `requireBaby(db, user.id, babyId)`): `GET /api/state`, `POST /api/recipe`, `POST /api/liked`, `DELETE /api/liked/:id`, `POST /api/disliked`, `POST /api/disliked/:id/restore`, `POST /api/shared`, `POST /api/shared/:sharedId/like`. All other routes are unchanged. `PUT /api/birthdate` is removed.

- [ ] **Step 1: Write the failing tests.** Extend `test/migrationBabies.test.ts`: after the full migration, user 1's two recipes and shown row carry user 1's baby id, user 3's recipe carries user 3's baby id, `users.birthdate` no longer exists, and the same recipe id can be inserted for two different babies. Rewrite the server tests to create babies (`addTestBaby` / `addBaby`) in place of `setBirthdate` / `PUT /api/birthdate`, keeping every existing assertion. Add:
  - `userData`: `the same recipe is liked for one baby and disliked for the other`; `excludeTitles and addShown are per baby (a title shown to one baby is not excluded for the other)`; `restore only clears the dislike and shown title of its own baby`; `unlike of a Community copy keeps the Community like while a sibling baby still holds a copy, and removes it when the last copy goes`.
  - `recipeService`: `suggestions use the given baby's age` (one baby 8 months old, one under 6 months gets `too-young`); `a recipe shown to one baby can be suggested to the other`.
  - `dataRoutes`: `a baby-scoped route without the header is 400 with key err.babyRequired`; `another account's baby id is 404 err.babyMissing on every route in the list above`; `liked lists are separate per baby`; `two babies draw from one daily allowance` (generate 6 recipes with baby A and 4 with baby B, the next request is 429 `err.limitReached`); `state.birthdate is the selected baby's`.
  - `sharedRoutes`/`sharedRecipes`: `a Community like is saved into the selected baby's list and the heart (liked: true) shows for the account whichever baby is selected`; `unliking in Community removes the copy from whichever baby holds it`; `sharing records the sharing baby's age in months`.
  - `errorKeys`: the bad-birthday and daily-limit tests move to `POST /api/babies` and the header.
- [ ] **Step 2: Run** `npx vitest run` on the changed files. Expected: FAIL.
- [ ] **Step 3: Migration 8** as single statements: for `recipes` then `shown` — add `baby_id uuid references babies(id) on delete cascade`; set it from `(select b.id from babies b where b.user_id = t.user_id order by b.created_at, b.id limit 1)`; `alter column baby_id set not null`; `drop column user_id` (this drops the old primary key); `add primary key (baby_id, id)` for `recipes` and `(baby_id, title)` for `shown`. Then `alter table users drop column birthdate`. Update `RecipeRow`, `ShownRow`, `UserRow` types.
- [ ] **Step 4: Implement the interfaces above.** In `server.ts` put `babyId` (first value if the header repeats) into the shared route context. Move all `where user_id = ...` on `recipes` and `shown` to `baby_id`. `unlike` takes the Community like back only when no other baby of the account still has a copy with the same `copied_from`. `unshare` behavior on unlike/dislike stays account-wide in this task (Task 3 narrows it).
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: PASS (client tests are untouched; the fake API does not depend on the server).
- [ ] **Step 6: Commit** `feat: keep recipes and suggestions per baby`.

---

### Task 3: Sharing per baby and removing a baby

**Files:**
- Modify: `src/server/migrations.ts` (migration 9), `src/server/types.ts`, `src/server/sharedRecipes.ts`, `src/server/userData.ts`, `src/server/babies.ts`, `src/server/routes/babies.ts`
- Modify tests: `test/sharedRecipes.test.ts`, `test/babies.test.ts`, `test/babyRoutes.test.ts`, `test/migrationBabies.test.ts`, `test/server.test.ts` (account deletion)

**Interfaces:**
- Consumes: Task 2's functions and helpers.
- Produces:
  - `removeBaby(db: Db, userId: string, babyId: unknown): Promise<void>` in `babies.ts`.
  - `DELETE /api/babies/:id` → `{ ok: true }`.
  - `shared_recipes.baby_id` (nullable, `on delete set null`) records the baby that shared it.

- [ ] **Step 1: Write the failing tests.**
  - `migrationBabies`: a seeded shared recipe ends with `baby_id` equal to its owner's baby.
  - `sharedRecipes`: `one shared entry per recipe: a second baby sharing the same recipe changes nothing and the entry keeps the first baby`; `a baby unliking or disliking a recipe unshares only entries that baby shared`.
  - `babies` (removeBaby):
    - `the last baby cannot be removed: code conflict, key err.babyLast`
    - `removing a baby deletes their recipes and shown titles and leaves the other baby's untouched`
    - `their shared recipe that nobody else liked is deleted; one another parent liked stays in the community list with the owner's mine: true`
    - `Community likes behind the baby's copies are taken back, so listShared shows liked: false and the like count drops; the like stays when a sibling baby still holds a copy`
    - `a copy another parent saved from this baby's shared recipe is unaffected`
    - `last_baby_id becomes null when the last-used baby is removed`
    - `another account's baby id is not-found err.babyMissing`
  - `babyRoutes`: `DELETE /api/babies/:id` is 401 without a cookie, 200 with two babies, 409 for the only baby.
  - `server.test.ts`: deleting an account with two babies leaves no `babies`, `recipes` or `shown` rows for it.
- [ ] **Step 2: Run** the changed test files. Expected: FAIL.
- [ ] **Step 3: Migration 9:** `alter table shared_recipes add column baby_id uuid references babies(id) on delete set null`; `update shared_recipes s set baby_id = (select b.id from babies b where b.user_id = s.user_id order by b.created_at, b.id limit 1)`.
- [ ] **Step 4: Implement.** `shareRecipe` stores the sharing baby's id (conflict still does nothing). `dislike` and `unlike` delete only `shared_recipes` rows with `baby_id = babyId`. `removeBaby` runs in one transaction in this order: refuse if it is the account's only baby; delete this baby's shared recipes that have no `shared_likes`; for each of this baby's liked copies (`copied_from` not null) delete the account's `shared_likes` row unless a sibling baby has a copy of the same `copied_from`; delete the baby row (cascades its `recipes` and `shown`, nulls `shared_recipes.baby_id` and `users.last_baby_id`).
- [ ] **Step 5: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 6: Commit** `feat: share per baby and remove a baby`.

---

### Task 4: Client API, types and fake API

**Files:**
- Modify: `src/client/api.ts`, `src/client/apiTypes.ts`, `test/helpers/fakeApi.ts`, `test/clientApi.test.ts`, `test/fakeApi.shared.test.ts`, `test/helpers/app.tsx`

**Interfaces:**
- Consumes: the server routes from Tasks 1 to 3.
- Produces:
  - `apiTypes.ts`: `interface ApiBaby { id: string; name: string | null; birthdate: string | null }`, `interface BabyInput { name: string; birthdate: string }`. `ApiState` is unchanged (`birthdate` is the selected baby's).
  - `createApi(fetchImpl?: FetchImpl, babyId?: string | null): Api`. With a `babyId`, every request carries `X-Baby-Id`. New members of `Api`: `babies(): Promise<{ babies: ApiBaby[]; lastBabyId: string | null }>`, `addBaby(input: BabyInput): Promise<ApiBaby>`, `updateBaby(id: string, input: BabyInput): Promise<Ok>`, `removeBaby(id: string): Promise<Ok>`, `setLastBaby(id: string): Promise<Ok>`, `withBaby(id: string | null): Api` (a new instance bound to that baby). `setBirthdate` is removed. `Api` refers to itself through `withBaby`, so it needs an explicit named type instead of `ReturnType<typeof createApi>`.
  - Fake API: `createFakeApi({ ..., babies?: ApiBaby[], lastBabyId?: string | null })`. The existing `birthdate` option stays: a non-null value makes one baby `{ id: 'baby-1', name: 'Mia', birthdate }`, null makes none. Per-baby state (liked, disliked, shown, copied, birthdate) is kept per baby id; `shared`, `used` and `queue` stay account-wide. `withBaby(id)` selects that baby in the fake and returns the same fake. The fake enforces: the cap of 5, the last baby cannot be removed, Community like copies into the selected baby and the heart is account-wide. `state_` keeps `liked`, `disliked`, `shown`, `birthdate` as accessors for the selected baby so existing tests still read them.

- [ ] **Step 1: Write the failing tests** in `test/clientApi.test.ts`: `a bound instance sends X-Baby-Id on every request and the root instance sends none`; `two bound instances used at the same time each send their own baby` (the stale-request guarantee); `babies, addBaby, updateBaby, removeBaby and setLastBaby call GET /api/babies, POST /api/babies, PUT /api/babies/:id, DELETE /api/babies/:id and PUT /api/last-baby with the bodies from Task 1`. In `test/fakeApi.shared.test.ts`: `a baby's liked list is separate from its sibling's`; `the Community heart stays on when the other baby is selected`; `a sixth baby is refused and the last baby cannot be removed`.
- [ ] **Step 2: Run** `npx vitest run test/clientApi.test.ts test/fakeApi.shared.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces. Remove the `setBirthdate` expectations from `clientApi.test.ts`.
- [ ] **Step 4: Run** `npx vitest run test/clientApi.test.ts test/fakeApi.shared.test.ts`. Expected: PASS. (`npm run typecheck` will fail on `MainApp.tsx` and `app.test.tsx` until Task 6; list those errors and confirm they are the only ones.)
- [ ] **Step 5: Commit** `feat: client API and fake API for babies`.

---

### Task 5: Menu with a section per baby, and the new wording

**Files:**
- Modify: `src/client/components/Menu.tsx`, `src/client/i18n/{en,pt,es,de}.ts`, `test/menu.test.tsx`, `test/i18nMenu.test.tsx`
- Create: `test/menuBabies.test.tsx`

**Interfaces:**
- Consumes: `ApiBaby` from Task 4.
- Produces `MenuProps` (existing props stay unless listed):
  - `babies?: ApiBaby[]`, `babyId?: string | null`
  - `onIdeas?: (babyId: string) => void` (replaces `onHome`), `onLiked?: (babyId: string) => void`
  - `onAddBaby?: () => void`, `onEditBaby?: (babyId: string) => void`
  - Each baby renders as a `div role="group"` with `aria-label` equal to the baby's name (or the unnamed text): a header line with the name, the marker for the current baby, an edit button named `Edit <name>`, then its two page buttons. After the babies, an `Add a baby` button (only when `onAddBaby` is given), then a `For everyone` label with Community and Admin, then Log out and Delete. `aria-current="page"` goes only on the page button of the current baby on the current page, and on Community and Admin.
  - Catalog keys: `menu.ideas` (replaces `menu.home`), `menu.forEveryone`, `menu.addBaby`, `menu.editBaby` (`{name}`), `baby.unnamed`. English: "Recipe ideas", "For everyone", "Add a baby", "Edit {name}", "Your baby". The other three languages are written by the implementer.

- [ ] **Step 1: Write the failing tests** in `test/menuBabies.test.tsx`, rendering `Menu` directly: `two babies show a group each, named by the baby, with Recipe ideas and Liked recipes inside`; `only the current baby's page button on the current page is aria-current`; `a page under another baby calls the callback with that baby's id`; `Add a baby and Edit Mia call their callbacks; Add a baby is absent without onAddBaby`; `a baby with no name is called "Your baby"`; `a 60-character name without spaces renders in full and its element has the wrap-anywhere class`; `with no babies the menu has only the account actions and For everyone items`. Update `test/menu.test.tsx` and `test/i18nMenu.test.tsx`: "Home" becomes "Recipe ideas" (and its three translations), single-baby flows keep working through `startApp`.
- [ ] **Step 2: Run** `npx vitest run test/menuBabies.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** `Menu.tsx` and the catalog keys (remove `menu.home`). `MainApp.tsx`/`App.tsx` are adapted in Task 6, so this task leaves `typecheck` red only in those two files; confirm that.
- [ ] **Step 4: Run** `npx vitest run test/menuBabies.test.tsx test/i18nCatalog.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: menu sections per baby and Recipe ideas wording`.

---

### Task 6: Baby screen and the first baby

**Files:**
- Create: `src/client/screens/BabyScreen.tsx`, `src/client/useBabies.ts`, `test/baby.screen.test.tsx`
- Modify: `src/client/MainApp.tsx`, `src/client/App.tsx`, `src/client/screens/TooYoungScreen.tsx` (props unchanged), `src/client/i18n/{en,pt,es,de}.ts`, `test/app.test.tsx`, `test/helpers/app.tsx`, other client tests that touched the setup screen
- Delete: `src/client/screens/SetupScreen.tsx`

**Interfaces:**
- Consumes: Tasks 4 and 5.
- Produces:
  - `BabyScreen` props: `{ baby?: ApiBaby; first?: boolean; now?: () => Date; onSave: (input: BabyInput) => Promise<unknown> | void; onCancel?: () => void; onRemove?: () => Promise<unknown> | void }`. It shows a name field ("Baby's name") and the birthday field ("Baby's birthday"); the heading is "Welcome" when `first`, "Add a baby" without `baby`, otherwise "Edit baby"; a Cancel button only with `onCancel`; a Remove button with a `ConfirmDialog` only with `onRemove`. It checks the name (trimmed, 1 to 30 characters, key `err.babyName`) and the birthday (`ageInMonths`) before calling `onSave`, and shows server errors through `errorText`.
  - `useBabies(api: Api, enabled: boolean): { status: 'loading' | 'ready' | 'error'; error: ErrorInfo | null; babies: ApiBaby[]; babyId: string | null; select(id: string): void; add(input: BabyInput): Promise<ApiBaby>; edit(id: string, input: BabyInput): Promise<void>; remove(id: string): Promise<void> }`. It loads `api.babies()`, starts on `lastBabyId` when that baby is in the list, else the first baby, else `null`; `select` calls `api.setLastBaby` and ignores its failure; `add` selects the new baby; `remove` selects the first remaining baby.
  - `MainApp` props: `{ api, babies: ReturnType<typeof useBabies>, user, now, landOn, ... }` where `api` is already bound with `api.withBaby(babyId)`; `App` renders `<MainApp key={babyId ?? 'none'} />`. `LandOn` becomes `'liked' | 'shared' | 'edit' | null`.
  - New catalog keys (all four languages), replacing the reused `setup.*` ones: `baby.titleFirst` ("Welcome"), `baby.titleAdd`, `baby.titleEdit`, `baby.intro`, `baby.name`, `baby.birthday`, `baby.save`, `baby.cancel`, `baby.remove`, `baby.removeTitle`, `baby.removeBody` (`{name}`), `baby.removeConfirm`, plus `err.babyName` already added.
  - Behaviour: no baby → `BabyScreen first`; a baby with a null name or birthdate → `BabyScreen` in edit mode before anything else; the "Change birthday" button of the too-young page opens edit mode for the selected baby; saving an edit refreshes state and returns to the start screen for that baby's age.

- [ ] **Step 1: Write the failing tests.** `test/baby.screen.test.tsx` (screen rendered directly): `first mode shows Welcome and both fields`; `an empty or blank name shows the name error and does not call onSave`; `a 31-character name shows the error`; `a valid form calls onSave with the trimmed name and the birthday`; `edit mode is prefilled and a baby with no name shows an empty name field`; `Cancel and Remove appear only when their callbacks are given, and Remove asks to confirm`; `a 60-character unbroken name does not overflow the card` (field value is kept whole). Whole-app tests in `test/app.test.tsx`: `no baby shows Welcome; saving name and birthday shows Recipe ideas with the age`; `a baby under 6 months shows the too-young page and Change birthday opens edit mode`; `a server error on save is shown and the form stays`; `a baby with no name is asked for it before Recipe ideas`; `the app opens on the last-used baby, and on the first baby when that one is missing`.
- [ ] **Step 2: Run** `npx vitest run test/baby.screen.test.tsx test/app.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces, adapt `MainApp`'s start-screen logic (`'setup'` becomes `'baby'`) and the `Menu` wiring (`onIdeas`, `onLiked`, babies list) for the current baby only; the admin page menu in `App.tsx` gets the same `babies` props. Remove `SetupScreen` and the old `setup.*` keys.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS, zero type errors.
- [ ] **Step 5: Commit** `feat: baby screen and first baby flow`.

---

### Task 7: Several babies in the app

**Files:**
- Modify: `src/client/MainApp.tsx`, `src/client/App.tsx`
- Create: `test/multipleBabies.test.tsx`

**Interfaces:**
- Consumes: Task 6's `useBabies`, `BabyScreen`, `LandOn`.
- Produces:
  - `MainApp` prop `onPickBaby: (babyId: string, page: LandOn) => void` used by the menu when a page under another baby is tapped: `App` selects that baby, sets `landOn` (`null` means Recipe ideas), and the keyed `MainApp` remounts. Tapping a page under the current baby just calls `go()`.
  - Menu `onAddBaby` opens `BabyScreen` (add mode, with Cancel) and is absent at 5 babies; `onEditBaby(id)` selects that baby then opens edit mode (`landOn: 'edit'`); edit mode shows Remove when the account has 2 or more babies. Removing returns to the remaining baby's Recipe ideas.
  - The admin page menu offers the same baby sections; picking a page there goes to that baby's page (`land(page, babyId)` in `App`).

- [ ] **Step 1: Write the failing tests** in `test/multipleBabies.test.tsx` using `startApp({ babies: [...] })`:
  - `pages show the current baby's liked recipes, and a page under the other baby shows theirs`
  - `liking a recipe for one baby does not put it in the other's list, and a recipe one baby disliked can be suggested to the other`
  - `switching while a request is in flight does not write to the new baby` (override `like` to resolve late; the late result never appears under the new baby)
  - `Add a baby opens the add screen, saving lands on the new baby's Recipe ideas, and the menu now lists both; Cancel goes back`
  - `at five babies Add a baby is not in the menu`
  - `Edit opens the baby's details prefilled, saving updates the name in the menu and the age on Recipe ideas`
  - `Remove asks to confirm, removes the baby and lands on the remaining baby; the only baby has no Remove button`
  - `the Community heart set from one baby shows as liked from the other`
  - `from the admin page, Liked recipes under a baby opens that baby's liked page`
  - `a baby named with 60 characters and no spaces does not break the menu` (group still reachable by role)
- [ ] **Step 2: Run** `npx vitest run test/multipleBabies.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the interfaces. Guard `refresh()` and the list-title effects so a response for a baby that is no longer mounted is dropped.
- [ ] **Step 4: Run** `npm test` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: switch, add, edit and remove babies in the app`.

---

### Task 8: Documentation and final verification

**Files:**
- Modify: `README.md` (line 3 and the data paragraph near line 73: babies with names and birthdates, removing a baby, backups contain names)

- [ ] **Step 1:** Update the README wording so it says an account keeps one or more babies (name, birthday, liked and not-liked recipes, shown titles per baby), that removing a baby deletes its lists, and that backups contain names and birthdays.
- [ ] **Step 2: Run** `npm run typecheck`, `npm test`, `npm run build`, `npm run build:server`. Expected: all pass with zero errors.
- [ ] **Step 3:** Use the `deploy-docker` skill (it takes the backup, since `src/server/` changed and migrations 7 to 9 run on live data), then confirm in the running container that an existing account opens on its first baby and asks for a name.
- [ ] **Step 4: Commit** `docs: describe babies in the README`.
