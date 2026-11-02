# TypeScript Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert every file under `src` and `test` from JavaScript to strict TypeScript with no behavior change.

**Architecture:** One branch (`BR-5`), converted in dependency order: tooling, shared, server, client, tests, cleanup. `tsc` is the type-checker (`noEmit`) and the server compiler; Vite and Vitest keep transpiling TypeScript themselves. While the migration runs, `allowJs` lets typed and untyped files import each other so the type-check is green at every commit. The last task removes it.

**Tech Stack:** TypeScript 5, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg`, existing Vite 5, Vitest 2, React 18, `pg`, PGlite.

**Spec:** `docs/superpowers/specs/2026-10-31-typescript-migration-design.md`

## Global Constraints

- No behavior change; no refactor, rename or restructure while converting. A real bug found is written down (final report) and left alone.
- `"strict": true` from the first commit. No blanket `any`, `@ts-ignore`, `@ts-nocheck`. A narrow commented `as`, or `@ts-expect-error`, only at a genuinely untyped edge (for example a test double).
- No new dependencies beyond `typescript` and `@types/*` dev dependencies. No runtime validation library.
- Tests keep their assertions. Allowed test edits: type annotations, and file locators (import paths, file extensions in path lists, glob patterns).
- Imports keep their explicit `.js` / `.jsx` specifiers (`./auth.js`, `@/components/ui/card.jsx`). TypeScript resolves them to `.ts` / `.tsx`, and the compiled server needs `.js` in them.
- Nothing may depend on Node running `.ts` directly. Dockerfile stays on `node:22`; the owner's machine runs Node 19.
- The container must keep running `CMD ["node", "src/server/main.js"]` (asserted by `test/deploy.test.js`). The compiled server is copied into the image at `/app/src`, mirroring the source layout.
- The shared types live in `src/shared`; the server and client import them from there.
- Work on `BR-5`; do not push.

## Review Focus

1. **Compiled server finds its files.** `main.js` locates `dist` with `../..`, and `seedCatalogue.js` reads `./seed/baby-recipes.json` next to itself. Expected: compiled output started with plain `node` serves the client build and seeds the catalogue. Pinned in Task 5, step 5.
2. **Silent-pass tests.** `test/i18nCatalog.test.js` scans `src` by extension, and `test/branding.test.js` and the catalog test read `src/server/openai.js` and `safety.js` by name. If the locators are not updated they scan nothing and pass. Expected: the same keys are found as before. Pinned in Task 7, step 4.
3. **Specifier resolution in four tools.** `./x.js` must resolve to `x.ts` in `tsc`, Vite, Vitest and the compiled server; `x.jsx` to `x.tsx` likewise. Pinned in Task 2, step 3.
4. **Production image has no dev dependencies.** The compiled server must import only packages in `dependencies` (`pg`). Pinned in Task 5, step 5 (run it in the image).
5. **Test globs.** `vite.config.js` assigns jsdom to `test/**/*.test.jsx`; after renaming to `.test.tsx` a stale glob would run component tests in the node environment. Pinned in Task 7, step 3.

## Baseline (recorded while writing this plan)

`npx vitest run` on master: 66 files, 671 tests, 668 pass. The 3 failures are all in `test/main.test.js` with `EADDRINUSE 0.0.0.0:3000`, because the app's own Docker container is running on port 3000 on the owner's machine. They are not caused by the code. "Same as before" means: same 671 tests, and the same 3 failures while that container is up (all 671 passing if it is stopped).

## File Structure

- `tsconfig.json`: one config for editor and type-check, `noEmit`, covers `src` and `test`. Declares the `@/*` alias. Replaces `jsconfig.json`.
- `tsconfig.server.json`: extends the above; emits only `src/server` and `src/shared` to `dist-server/` (`rootDir: src`, `noEmit: false`, tests excluded).
- `src/shared/types.ts`: new. The shared data types (see Task 2).
- `src/server/types.ts`: new. `Db`, `Tx`, `Config` and other server-only types (see Task 3).
- Every other `.js` becomes `.ts`, and every `.jsx` becomes `.tsx`, in place. Use `git mv` so history follows.

---

### Task 1: Tooling

**Files:**
- Modify: `package.json`, `.gitignore`, `.dockerignore` (no change expected), `components.json`
- Create: `tsconfig.json`, `tsconfig.server.json`
- Delete: `jsconfig.json`

**Interfaces:**
- Produces: npm scripts `typecheck` (`tsc --noEmit`) and `build:server` (`tsc -p tsconfig.server.json` then copy `src/server/seed` to `dist-server/server/seed`). `dist-server/` is git-ignored.

- [ ] **Step 1:** On `BR-5`, run `npx vitest run` once and confirm it matches the Baseline above. This is the reference for every later "same as before".
- [ ] **Step 2:** Install dev dependencies: `typescript`, `@types/node` (matching 22), `@types/react@18`, `@types/react-dom@18`, `@types/pg`.
- [ ] **Step 3:** Write `tsconfig.json`: `strict`, `jsx: react-jsx`, `module: ESNext`, `moduleResolution: Bundler`, `target: ES2022`, `noEmit`, `allowJs: true` with `checkJs: false` (temporary, removed in Task 9), `skipLibCheck`, `paths: { "@/*": ["./src/client/*"] }`, `include: ["src", "test", "vite.config.js"]`. Write `tsconfig.server.json` as described in File Structure.
- [ ] **Step 4:** Add the two scripts. Change `start` to `vite build && npm run build:server && node dist-server/server/main.js`. Change `components.json` `"tsx"` to `true`. Add `dist-server/` to `.gitignore`.
- [ ] **Step 5:** Delete `jsconfig.json`. Run `npm run typecheck` (expect exit 0, nothing to report), `npm run build:server` (expect `dist-server/server/main.js` and `dist-server/server/seed/baby-recipes.json` to exist), and `npx vitest run test/utils.test.js` (expect pass).
- [ ] **Step 6:** Commit `build: add TypeScript tooling`.

### Task 2: Shared code

**Files:**
- Rename to `.ts`: all 8 files in `src/shared` (`age`, `ingredientEmoji`, `ingredients`, `languages`, `recipeGroup`, `recipeMatch`, `recipeShape`, `units`)
- Create: `src/shared/types.ts`

**Interfaces:**
- Produces, exported from `src/shared/types.ts`: `Language` (the union `'en' | 'pt' | 'es' | 'de'`, derived from `LANGUAGES` declared `as const`), `Ingredient` (`{ name: string; grams: number }`), `Recipe` (exactly the fields `isRecipe` checks: `id`, `title`, `basePortions`, `ingredients: Ingredient[]`, `steps: string[]`, `allergens: string[]`; add other fields the code reads, optional where it treats them as optional), `GroupName` (the names in `recipeGroup`). `isRecipe` becomes `(r: unknown): r is Recipe`; `isLanguage` becomes `(v: unknown): v is Language`.

- [ ] **Step 1:** Rename the 8 files with `git mv`, add `src/shared/types.ts`, and type all exports. Read how the server and client use each export before choosing parameter types; do not widen to `any`.
- [ ] **Step 2:** `npm run typecheck`: expect exit 0.
- [ ] **Step 3:** Prove specifier resolution (Review Focus 3) with `languages.ts` and its importers: run `npx vitest run test/language.test.js test/recipeGroup.test.js test/recipeMatch.test.js test/ingredients.test.js test/age.test.js test/units.test.js test/ingredientEmoji.test.js` (expect pass), `npm run build` (expect success), and `npm run build:server` then `node -e "import('./dist-server/shared/languages.js').then(m => console.log(m.LANGUAGES))"` (expect `[ 'en', 'pt', 'es', 'de' ]`). If any of the four tools cannot resolve `./x.js` to `x.ts`, stop and fix the config here, before converting more.
- [ ] **Step 4:** Commit `refactor: convert shared code to TypeScript`.

### Task 3: Server core (database, accounts, limits)

**Files:**
- Rename to `.ts`: `errors`, `config`, `db`, `migrate`, `migrations`, `auth`, `sessions`, `users`, `usage`, `safety` (all `src/server/*.js`)
- Create: `src/server/types.ts`

**Interfaces:**
- Produces, from `src/server/types.ts`: `Queryable` (`{ query<R = Row>(text: string, params?: unknown[]): Promise<{ rows: R[] }> }`), `Db` (`Queryable` plus `transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>`, `close(): Promise<void> | void`), `Config` (the fields `loadConfig` returns and `startTestServer` supplies), and row types for each table in `migrations.ts` (`UserRow`, `InviteRow`, `SessionRow`, and so on, named after the table). Both `pg.Pool` results and PGlite results must satisfy `Db`.
- `AppError` keeps its constructor `(code: string, message: string, info?: { key?: string; params?: Record<string, unknown> })`.

- [ ] **Step 1:** Rename the files, write `types.ts`, and type each module's exports with `Db` / row types. Type queries by passing the row type to `query<UserRow>(...)`.
- [ ] **Step 2:** `npm run typecheck`: expect exit 0.
- [ ] **Step 3:** `npx vitest run test/auth.test.js test/config.test.js test/db.test.js test/people.test.js test/safety.test.js test/sessions.test.js test/usage.test.js test/users.test.js test/errorKeys.test.js`: expect pass. (`test/db.test.js` uses PGlite, which checks that it satisfies `Db`.)
- [ ] **Step 4:** Commit `refactor: convert server core to TypeScript`.

### Task 4: Server domain (recipes, catalogue, translation, model calls)

**Files:**
- Rename to `.ts`: `recipe`, `recipeService`, `generate`, `openai`, `translations`, `catalogue`, `seedCatalogue`, `sharedRecipes`, `userData`

**Interfaces:**
- Consumes: `Db`, `Queryable`, `Config`, row types (Task 3); `Recipe`, `Language` (Task 2).
- Produces: `ModelCall` and `TranslateCall` types (the shapes of the injected `callModel` and `callTranslate` functions that `createServer` and `startTestServer` already pass), exported from `src/server/types.ts`.

- [ ] **Step 1:** Rename the files and type them. Type the model and translator responses at the point they are parsed (`JSON.parse` returns `unknown` here; narrow with the existing checks such as `isRecipe`, not with casts).
- [ ] **Step 2:** `npm run typecheck`: expect exit 0.
- [ ] **Step 3:** `npx vitest run test/catalogue.test.js test/generate.test.js test/recipe.test.js test/recipeService.test.js test/seedCatalogue.test.js test/sharedRecipes.test.js test/userData.test.js test/translations.test.js test/translator.test.js test/translationStore.test.js`: expect pass.
- [ ] **Step 4:** Commit `refactor: convert server recipe code to TypeScript`.

### Task 5: Server HTTP layer, entry points and Docker

**Files:**
- Rename to `.ts`: `server`, `main`, `cli`, `routes/{index,auth,data,admin,translate}`
- Modify: `Dockerfile`, `README.md` (only if its server commands change; they should not)

**Interfaces:**
- Consumes: all earlier server types.
- Produces: a `Route` type in `src/server/types.ts` for the entries of the `routes` array, with typed request, params and body access.

- [ ] **Step 1:** Rename and type the files. `server.ts` request bodies arrive as JSON: type them `unknown` and narrow before use.
- [ ] **Step 2:** `npm run typecheck`: expect exit 0.
- [ ] **Step 3:** `npx vitest run test/adminRoutes.test.js test/dataRoutes.test.js test/server.test.js test/sharedRoutes.test.js test/translateRoutes.test.js test/translationFlow.test.js test/cli.test.js test/main.test.js`: expect pass, except the 3 known `test/main.test.js` port failures if the app container is running.
- [ ] **Step 4:** Update the `Dockerfile`: the build stage also runs the type-check and `npm run build:server` (after `npm run build`); the final stage replaces `COPY src ./src` with `COPY --from=build /app/dist-server ./src`. `CMD`, `USER node` and `npm ci --omit=dev` stay as they are. The type-check must run in the build stage so a type error fails the image build.
- [ ] **Step 5:** Verify Review Focus 1 and 4. Run `docker compose build app`, then start the stack and confirm `docker compose ps` shows `app` healthy, `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/session` prints `401`, and `curl -s http://localhost:3000/ | head -c 200` returns the built `index.html`. Then `docker compose exec app ls src/server/seed` shows `baby-recipes.json`, and `docker compose exec app node src/server/cli.js` prints the CLI's usage text rather than a module error.
- [ ] **Step 6:** Commit `refactor: convert server entry points to TypeScript; compile in Docker`.

### Task 6: Client logic (api, i18n, helpers)

**Files:**
- Rename to `.ts`: `src/client/api.js`, `localize.js`, `useRecipeTranslation.js`, `lib/utils.js`, `i18n/{catalogs,de,en,es,index,pt,translate}.js`
- Create: `src/client/apiTypes.ts` (or add to `src/shared/types.ts` if the server also returns them; builder's choice)

**Interfaces:**
- Produces: `Api = ReturnType<typeof createApi>`, exported from `api.ts`; `ApiError` (`Error & { status?: number; code?: string; key?: string; params?: Record<string, unknown> }`); response types for session, state, admin overview and invites, matching what `src/server/routes/*.ts` actually return. `t(key: CatalogKey, params?)` where `CatalogKey` is derived from the English catalog (`keyof typeof en`), so a misspelled key fails the type-check.

- [ ] **Step 1:** Rename and type. Derive the catalog key type from `en.ts`; check that `de`, `es` and `pt` have the same keys through the type (`satisfies Record<CatalogKey, ...>`), without changing their contents.
- [ ] **Step 2:** `npm run typecheck`: expect exit 0. Calls to `t('...')` with dynamic keys (for example `` `group.${name}` ``) need a narrow cast or template-literal key type; keep each minimal and commented.
- [ ] **Step 3:** `npx vitest run test/i18n.test.js test/i18nCatalog.test.js test/clientApi.test.js test/localize.test.js test/useRecipeTranslation.test.jsx test/utils.test.js test/language.test.js`: expect pass.
- [ ] **Step 4:** Commit `refactor: convert client logic to TypeScript`.

### Task 7: Client UI (components, screens, app)

**Files:**
- Rename to `.tsx`: everything in `src/client/components`, `src/client/screens`, `App.jsx`, `MainApp.jsx`, `main.jsx`
- Modify: `index.html` (the script tag points at `main.jsx`)

**Interfaces:**
- Consumes: `Api`, `ApiError`, response types, `Recipe`, `Language`, `CatalogKey`.
- Produces: an exported props type per screen and component (`HomeScreenProps` and so on). Optional props such as `onShowX` stay optional so existing renders keep working.

- [ ] **Step 1:** Rename and type. Use `React.ComponentProps<...>` for the shadcn wrappers and keep `class-variance-authority` variants typed with `VariantProps`.
- [ ] **Step 2:** Update `index.html` to `/src/client/main.tsx`. `npm run build`: expect success.
- [ ] **Step 3:** `npm run typecheck`: expect exit 0.
- [ ] **Step 4:** Run the component tests while they are still `.jsx`: `npx vitest run test/screens.test.jsx test/app.test.jsx test/ui.test.jsx test/menu.test.jsx test/home.test.jsx`: expect pass.
- [ ] **Step 5:** Commit `refactor: convert client UI to TypeScript`.

### Task 8: Tests

**Files:**
- Rename: every `test/**/*.js` to `.ts`, every `test/**/*.jsx` to `.tsx` (including `test/helpers/*` and `test/setup.jsdom.js`)
- Modify: `vite.config.js` (test globs and `setupFiles`), plus the file locators listed below

**Interfaces:**
- Consumes: all production types. Test doubles are typed as `Api`, `Db` and `ModelCall` / `TranslateCall`, so a drift between a fake and the real thing fails the type-check. `fakeApi` returns `Api`.

- [ ] **Step 1:** Rename all test files with `git mv` and add types. Helpers first (`test/helpers/*`), then the tests that import them.
- [ ] **Step 2:** Update file locators only: in `vite.config.js` change `environmentMatchGlobs` to `['test/**/*.test.tsx', 'jsdom']` and `setupFiles` to `./test/setup.jsdom.ts`.
- [ ] **Step 3:** Pin Review Focus 5: run `npx vitest run test/screens.test.tsx` and confirm it passes (it would fail with `document is not defined` if the glob were stale).
- [ ] **Step 4:** Pin Review Focus 2. Update the locators in `test/i18nCatalog.test.ts` (extension lists `['.js', '.jsx']` and `['.js']` become `['.ts', '.tsx']` and `['.ts']`; `src/server/safety.js` becomes `safety.ts`), `test/branding.test.ts` (`openai.js` becomes `openai.ts`) and any other test that reads a source file by name (`grep -rn "src/" test | grep -E "readFileSync|literalsIn"`). Then confirm the scan still finds what it found before: temporarily log `used.length` and `sent.length` in the two catalog tests before and after, expect the same numbers, then remove the logging.
- [ ] **Step 5:** `npm run typecheck`: expect exit 0. `npx vitest run`: expect the Baseline result (671 tests, the same 3 `main.test` failures if the container is up).
- [ ] **Step 6:** Commit `refactor: convert tests to TypeScript`.

### Task 9: Cleanup and final verification

**Files:**
- Modify: `tsconfig.json` (remove `allowJs` / `checkJs`), `README.md`, `.claude/skills/add-screen/SKILL.md`, `.claude/skills/deploy-docker/SKILL.md`, `test/theme.test.ts` (a comment mentioning `notice.jsx`)
- Optionally convert: `vite.config.js`, `tailwind.config.js`, `postcss.config.js` to `.ts` (builder's choice; skip if Tailwind or PostCSS cannot load them)

- [ ] **Step 1:** Remove `allowJs` and `checkJs` from `tsconfig.json`, and take `vite.config.js` out of `include` (or convert it to `.ts` first). `npm run typecheck`: expect exit 0.
- [ ] **Step 2:** Update docs and skills to say `.tsx` / `.ts`, `test/<name>.test.tsx` and the new commands (`npm run typecheck`, `npm run build:server`). Keep the deploy-docker rule about backups on changes under `src/server/`, and add `tsconfig*.json` to the list of files whose change triggers a rebuild if the skill lists such files.
- [ ] **Step 3:** Run every item in the spec's "How to verify" list: `npm test` (Baseline result), `npm run typecheck` (0 errors), `npm run build`, `npm run build:server` then `node dist-server/server/main.js` with a throwaway `DATABASE_URL` fails with the database error, not a module error, Docker stack healthy (Task 5 step 5 again on the final code), and `git ls-files src test | grep -E '\.jsx?$'` prints nothing.
- [ ] **Step 4:** `grep -rnE "@ts-ignore|@ts-nocheck|: any\b|as any" src test`: expect no hits, or each hit carries a one-line reason.
- [ ] **Step 5:** Commit `chore: finish TypeScript migration; update docs`.
