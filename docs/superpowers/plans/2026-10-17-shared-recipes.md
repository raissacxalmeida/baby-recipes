# Shared Recipes Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let parents share a liked recipe (and unshare it) from the Liked page, and browse, filter by group, open and like recipes other parents shared on a new "Community recipes" page.

**Architecture:** Two new tables (`shared_recipes`, `shared_likes`) plus a `saved_from_shared` flag on `recipes`; a server module `sharedRecipes.js` for the rules; five new routes in `routes/data.js`; a pure grouping module in `src/shared/` used by the server at share time; one new client screen wired into `MainApp.jsx` through optional props.

**Tech Stack:** Node server with Postgres (PGlite in tests), React 18, Tailwind v3 with the existing `src/client/components/ui/*`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-17-shared-recipes-design.md` (read it first; the numbers below, such as "item 6", refer to its Behaviour list).

## Global Constraints

- Plain JavaScript (`.js`/`.jsx`), ES modules, no new dependencies.
- English UI, plain parent-friendly wording. Emoji only inside `<Emoji>` so accessible names stay plain.
- Screen work follows `.claude/skills/add-screen/SKILL.md` (reuse `Button`, `Card`, `Badge`, `Notice`, `Emoji`; token colours only; no opacity suffix on tokens; user text gets `wrap-anywhere` and `min-w-0` in flex rows; errors via `Notice kind="error"`).
- New behaviour on existing screens arrives as optional props, so existing renders and tests keep working.
- The API never returns who shared a recipe: no user id, no email, in any response.
- Shared recipe text is rendered as plain text only.
- The server shares a recipe from the parent's own saved copy; the browser sends only an id.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `feat/shared-recipes`.
- **Pending edits.** `src/client/MainApp.jsx`, `src/client/screens/LikedScreen.jsx`, `test/feedback.test.jsx` and `test/limits.test.jsx` already carry the author's uncommitted edits (the back button now reads "New recipe"). Create the branch with `git switch -c feat/shared-recipes` so they come along, never discard or reformat them, and ask the author before the first commit that touches those files whether to include their edits in it.

## Review Focus

1. Two parents each share a differently-built recipe with the same title (so the same recipe id): both show up, and like/open/unshare act on the right one. [Task 2, Task 3]
2. A parent who already has an own recipe with the shared recipe's id likes it, then takes the like back: their own recipe is not deleted. [Task 2]
3. A sharer unshares, removes the recipe from Liked, or is removed as a person while others have liked it: counts and the card vanish, the likers' saved copies stay (account removal also deletes the likes that person gave). [Task 2]
4. Every response from the shared endpoints is checked for the sharer's id and email, and a stranger's recipe id cannot be shared. [Task 3]
5. A very long unbroken title, a group that loses its last recipe while selected, and an empty page do not break the layout or leave a dead chip. [Task 4]

---

### Task 1: Recipe groups

**Files:**
- Create: `src/shared/recipeGroup.js`
- Test: `test/recipeGroup.test.js`

**Interfaces:**
- Produces: `GROUPS: Array<{ name: string, emoji: string }>` in the fixed chip order (the "All" chip is not in this list): Fish 🐟, Meat 🍗, Eggs 🥚, Vegetables 🥕, Fruit 🍎, Grains 🍚, Legumes 🫘, Cake 🍰, Soup 🍲, Other 🥣; `groupFor(recipe: { title: string, ingredients: Array<{ name: string, grams: number }> }): string` returning one of the `name`s.

- [ ] **Step 1: Write the failing tests** in `test/recipeGroup.test.js`, each calling `groupFor` with a small recipe object:
  - `Banana oat cake` with banana 100 g, oats 60 g → `Cake`; `Lentil stew` → `Soup`; `Chicken soup` (chicken 80 g, carrot 100 g) → `Soup` (dish type beats ingredient); `Carrot cake soup` → `Cake` (Cake wins ties).
  - `Salmon with sweet potato mash` (sweet potato 200 g, salmon 50 g) → `Fish`; `Chicken and carrot bites` (carrot 150 g, chicken 60 g) → `Meat` (fish/meat win however little there is).
  - `Banana porridge` (banana 100 g, oats 40 g) → `Fruit`; `Rice with peas` (rice 50 g, peas 120 g) → `Legumes`; `Omelette` (egg 100 g) → `Eggs`; `Pasta` (pasta 100 g) → `Grains`; `Carrots` (CARROTS 100 g, upper case, plural) → `Vegetables`.
  - Water, oil, butter and salt never decide: `Water dish` (water 500 g, carrot 20 g) → `Vegetables`; only ignored ingredients, no ingredients, or an unknown ingredient (`dragon fruit`) → `Other`.
  - `GROUPS.map((g) => g.name)` equals the ten names in the order above.
- [ ] **Step 2:** Run `npx vitest run test/recipeGroup.test.js`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `GROUPS` and `groupFor(recipe)`** in `src/shared/recipeGroup.js`. Match with `isListed` from `src/shared/ingredients.js` (it already handles plurals, case and whole words) against keyword lists kept in this one file. Order of checks: title against Cake words (cake, muffin, cupcake), then Soup words (soup, broth, stew); then any ingredient in the Fish list, then the Meat list; then ignore water/oil/butter/salt, take the heaviest remaining ingredient by `grams`, and map it through the Eggs, Vegetables, Fruit, Grains, Legumes lists; otherwise `Other`. Fill each list with the common baby-food words (for example fish: fish, salmon, cod, tuna, trout, haddock, hake; meat: chicken, beef, pork, turkey, lamb, veal, meat, mince).
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** `src/shared/recipeGroup.js test/recipeGroup.test.js` with message `feat: group recipes by dish type or main ingredient`.

---

### Task 2: Tables and sharing rules on the server

**Files:**
- Modify: `src/server/migrations.js` (append a third migration; add `'shared_recipes', 'shared_likes'` to `APP_TABLES`), `src/server/userData.js`
- Create: `src/server/sharedRecipes.js`
- Test: `test/sharedRecipes.test.js` (new), `test/userData.test.js` (extend)

**Interfaces:**
- Consumes: `groupFor` (Task 1), `ageInMonths` from `src/shared/age.js`, `AppError` codes `invalid-input | not-found | conflict`, `isUuid` from `src/server/users.js`.
- Schema (migration 3): `recipes.saved_from_shared boolean not null default false`; `shared_recipes(id uuid pk default gen_random_uuid(), user_id uuid not null → users on delete cascade, recipe_id text not null, data jsonb not null, grp text not null, baby_months int not null, created_at timestamptz not null default now(), unique (user_id, recipe_id))`; `shared_likes(shared_id uuid → shared_recipes on delete cascade, user_id uuid → users on delete cascade, primary key (shared_id, user_id))`.
- Produces, all in `sharedRecipes.js`, all `async`, first two arguments `(db, userId, ...)`:
  - `shareRecipe(db, userId, recipeId, now: Date): Promise<void>`: idempotent. `not-found` if the id is not in the user's liked recipes; `conflict` if that liked recipe has `saved_from_shared`; `invalid-input` if the user has no birthdate. Stores the saved recipe data, `groupFor(data)` and `ageInMonths(birthdate, now)`.
  - `unshareRecipe(db, userId, recipeId): Promise<void>`: removes the share and its likes; never fails when nothing is shared.
  - `listShared(db, userId): Promise<Array<{ id: string, recipe: object, group: string, ageMonths: number, likes: number, mine: boolean, liked: boolean }>>`: `id` is the shared row's uuid; ordered by likes descending, then newest first; `likes` counts other parents only (the sharer cannot like their own); no user ids or emails anywhere.
  - `likeShared(db, userId, sharedId): Promise<void>`: `not-found` for an unknown or non-uuid id; `invalid-input` for your own share; idempotent. Adds the like and saves a copy into the liker's recipes as liked with `saved_from_shared = true`. If they already hold that recipe id as liked, keep theirs untouched; if it is currently disliked, replace it with the liked copy.
  - `unlikeShared(db, userId, sharedId): Promise<void>`: removes the like, and deletes the liker's recipe with that id only if it is liked and `saved_from_shared`.
- Changes to `userData.js`: `getState` also returns `sharedIds: string[]` (recipe ids the user shares) and `copiedIds: string[]` (liked recipes with `saved_from_shared`); `save()` (used by `like`/`dislike`) resets `saved_from_shared` to false so a recipe the parent generates themselves becomes theirs; `unlike(db, userId, id)` becomes a transaction that deletes the liked row, unshares that recipe id for the user, and, only if the deleted row was `saved_from_shared`, deletes that user's `shared_likes` on shared recipes with that `recipe_id`.

- [ ] **Step 1: Write failing tests** in `test/sharedRecipes.test.js` (set-up like `test/userData.test.js`: two or three accounts via `createInvite`/`acceptInvite`, `setBirthdate`, `like`):
  - share then `listShared` for another user shows the recipe with `ageMonths` equal to the baby's age on the share date, the group from `groupFor`, `likes: 0`, `mine: false`; for the sharer `mine: true`. `JSON.stringify` of the result contains neither the sharer's user id nor email.
  - share twice stores one; sharing an id that is not liked, or that is only disliked, is `not-found`; sharing without a birthdate is `invalid-input`; sharing a saved copy is `conflict`.
  - ordering: the recipe with more likes comes first; equal likes, newest first.
  - like adds the count and a liked copy marked `copiedIds` in the liker's `getState`; liking your own is `invalid-input`; unknown and non-uuid ids are `not-found`; liking twice counts once; `liked: true` for the liker.
  - unlike removes the count and the copy; **Review Focus 2:** a parent who already liked their own recipe with the same id likes the shared one (own data kept, `copiedIds` empty), then unlikes: their own recipe is still in `liked`.
  - a disliked recipe with the shared id is replaced by the liked copy on like.
  - **Review Focus 1:** two parents each like and share a recipe with id `banana-mash` but different steps; `listShared` returns two entries with different `id`s and the right steps; liking one leaves the other's count at 0.
  - **Review Focus 3:** unshare removes the entry and likes, and the liker still has the copy in `liked`; `unlike` (Liked page Remove) by the sharer unshares; `unlike` of a saved copy by a liker drops their like count; `removeUser` of a sharer removes the shares, and `removeUser` of a liker removes only their likes.
  - `getState` returns `sharedIds` after sharing; `like()` of the same id by its owner clears `saved_from_shared`.
- [ ] **Step 2:** Run `npx vitest run test/sharedRecipes.test.js test/userData.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the migration, `APP_TABLES` entries, `sharedRecipes.js` and the `userData.js` changes exactly as specified above. Use `db.transaction` for like/unlike (like + copy) and for the new `unlike`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS for the whole suite (the existing `getState` tests use `toMatchObject`, so the new fields do not break them).
- [ ] **Step 5: Commit** the changed server files and tests with `feat: store shared recipes and likes`.

---

### Task 3: Routes, API client and fake API

**Files:**
- Modify: `src/server/routes/data.js`, `src/client/api.js`, `test/helpers/fakeApi.js`
- Test: `test/sharedRoutes.test.js` (new, built on `startTestServer` like `test/dataRoutes.test.js`), `test/clientApi.test.js` (extend)

**Interfaces:**
- Consumes: Task 2 functions.
- Produces routes (all `access: 'user'`): `GET /api/shared` → `{ recipes }` (from `listShared`); `POST /api/shared` body `{ id: string }` → `{ ok: true }` (`invalid-input` if `id` is not a string); `DELETE /api/shared/:recipeId` → ok; `POST /api/shared/:sharedId/like` → ok; `DELETE /api/shared/:sharedId/like` → ok. `now()` from the handler context is passed to `shareRecipe`.
- Produces client methods on `createApi`: `listShared(): Promise<Array<SharedItem>>` (the `recipes` array), `share(recipeId)`, `unshare(recipeId)`, `likeShared(sharedId)`, `unlikeShared(sharedId)`, with `encodeURIComponent` on path parts like the existing methods.
- Produces on the fake API (`createFakeApi`): same five `vi.fn` methods working on an in-memory `state.shared` list seeded through a new `shared` option (items shaped like `SharedItem`), plus `sharedIds` and `copiedIds` in the `state()` result. Behaviour mirrors the server rules in Task 2: `share` rejects ids not liked or already copied; `likeShared` copies the recipe into `liked` (skipping if an own copy exists), adds 1 to `likes`, sets `liked: true`; `unlikeShared` reverses it; `unshare` removes the item; `unlike` also unshares and drops a copy's like.

- [ ] **Step 1: Write failing tests.** `test/sharedRoutes.test.js`: all five routes are 401 without a cookie; full flow with two logged-in parents (like in `dataRoutes.test.js`: set birthdays, `POST /api/liked`, share, the other parent lists, likes, the sharer lists and sees `likes: 1`, unlike, unshare); **Review Focus 4:** every body from `GET /api/shared` stringified contains neither parent's email nor user id, and sharing a recipe id that only another parent has liked is 404; `POST /api/shared` with no `id` is 400. `test/clientApi.test.js`: one test per new method checking URL, verb, body, and that `listShared` returns the `recipes` array.
- [ ] **Step 2:** Run `npx vitest run test/sharedRoutes.test.js test/clientApi.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the five routes, the five client methods, and the fake-API behaviour above.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: shared recipes API`.

---

### Task 4: The "Community recipes" screen

**Files:**
- Create: `src/client/screens/SharedScreen.jsx`
- Test: `test/shared.screen.test.jsx`

**Interfaces:**
- Consumes: `GROUPS` from `src/shared/recipeGroup.js`, `SharedItem` shape from Task 2.
- Produces: default export `SharedScreen({ recipes, group, onGroup, onOpen, onToggleLike, onBack })` where `group` is `'All'` or a group name, `onGroup(name)`, `onOpen(item)`, `onToggleLike(item)`, `onBack()`. Copy template: `LikedScreen` for structure (back ghost button "New recipe" with `←`, `h1` "Community recipes" with 🌍 in `<Emoji>`).
- Behaviour: chips are `Button`s with `aria-pressed`; "All" first, then only groups present in `recipes`, in `GROUPS` order. If the selected `group` has no recipes any more, show all (treat as All). Each card (`Card`): title (`wrap-anywhere`), group emoji + name, age `Badge variant="warm"` reading `{ageMonths} mo`, a like count `{n} like(s)`, an `Open {title}` button, and either a like button (`aria-label` `Like {title}`, `aria-pressed={item.liked}`) or, when `mine`, a "Shared by you" `Badge` and no like button. Empty `recipes` shows `Notice` "Nothing has been shared yet."

- [ ] **Step 1: Write failing tests** rendering `SharedScreen` directly with props (find by role/label/text): chips appear for present groups only, in fixed order, with All first; clicking a chip calls `onGroup`; passing `group="Fish"` shows only fish cards and `aria-pressed` on that chip; unknown selected group shows everything (**Review Focus 5**); empty list shows the note and only the back button; card shows `8 mo`, `1 like` / `3 likes`; like button calls `onToggleLike` with the item and reflects `aria-pressed`; a `mine` card has "Shared by you" and no like button; Open calls `onOpen`; a 120-character title without spaces renders and its element has class `wrap-anywhere`.
- [ ] **Step 2:** Run `npx vitest run test/shared.screen.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement `SharedScreen`** as specified.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5: Commit** with `feat: shared recipes screen`.

---

### Task 5: Wire it into the app

**Files:**
- Modify: `src/client/MainApp.jsx`, `src/client/screens/LikedScreen.jsx`, `src/client/screens/HomeScreen.jsx`
- Test: `test/shared.test.jsx` (new, uses `startApp` from `test/helpers/app.jsx`), `test/screens.test.jsx` or the existing Liked/Home tests (extend for the new optional props)

**Interfaces:**
- Consumes: `SharedScreen` (Task 4), client API methods and fake API (Task 3), `state.sharedIds` / `state.copiedIds`.
- Produces: `HomeScreen` optional prop `onShowShared` (outline button "Community recipes" with 🌍 in `<Emoji>`, placed right after the Liked button); `LikedScreen` optional props `sharedIds = []`, `copiedIds = []`, `onShare(recipe)`, `onUnshare(recipe)`: each liked row gets `Share {title}` (or `Unshare {title}` when its id is in `sharedIds`) as an outline button between Open and Remove, and no share button for ids in `copiedIds` or when `onShare` is missing; the row may wrap to a second line at 375px. `MainApp` gets a `'shared'` screen with state for the fetched list and the selected group; opening a shared card shows the recipe screen without the feedback buttons and its back button reads "Back to community recipes" and returns to the shared screen with the same group selected (replace the `fromLiked` boolean by an origin of home, liked or shared). After like/unlike/share/unshare, refetch the shared list (when on that screen) and `state()`.

- [ ] **Step 1: Write failing tests.** `test/shared.test.jsx` with `startApp({ overrides or options })` extended as needed to seed `shared` items and liked recipes:
  - Liked page: Share on "Banana mash" calls `api.share` with its id and the button becomes `Unshare Banana mash`; Unshare calls `api.unshare` and it becomes Share again; a recipe in `copiedIds` has no share button.
  - Home → "Community recipes" opens the screen with the seeded items; choosing a chip filters; liking a card updates its count and the recipe appears on the Liked page; liking again takes it back and it leaves the Liked page.
  - Opening a shared card shows ingredients with portion buttons, no "Baby liked it" / "Give me another"; "Back to community recipes" returns with the chip still selected.
  - Existing tests for Home and Liked still pass unchanged (no new props passed).
- [ ] **Step 2:** Run `npx vitest run test/shared.test.jsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the three file changes as specified. Fetch the shared list each time the shared screen is entered.
- [ ] **Step 4:** Run `npx vitest run`. Expected: PASS for the whole suite.
- [ ] **Step 5: Commit** with `feat: share from the liked page and browse shared recipes`, after settling the pending-edits question in Global Constraints.

---

### Task 6: Verify and deploy

**Files:** none new.

- [ ] **Step 1:** Run `npx vitest run`. Expected: all pass, none skipped.
- [ ] **Step 2:** Run `npm run build`. Expected: succeeds.
- [ ] **Step 3: Phone check** per the add-screen skill (375px `<iframe>` harness with the fake API; do not commit it): the shared page with many chips, a 120-character title, the Liked page row with Open, Unshare and Remove, and the empty states. Nothing scrolls sideways.
- [ ] **Step 4:** Use the `deploy-docker` skill to rebuild the app container, then open the running app, share a liked recipe with one account, and see it on the shared page from a second account.
- [ ] **Step 5:** Report to the author what was verified and what was not.
