# Migrating baby-recipes from JavaScript to TypeScript

## Intent

The project is plain JavaScript: about 150 files, with a React client (`src/client`), a Node server (`src/server`), code shared by both (`src/shared`) and a Vitest suite (`test`). The owner wants TypeScript because it is safer: mistakes such as a wrong recipe shape passed between server and client, a misspelled field, or an unexpected result from a translation call should be caught by the compiler before the app runs.

## Goals

- Every source file and every test file is TypeScript (`.ts` / `.tsx`). No `.js` or `.jsx` is left under `src` or `test`. Config files at the repo root (`vite.config`, `tailwind.config`, `postcss.config`) may stay as they are or become `.ts` at the builder's choice.
- Strict type-checking (`"strict": true`) from the first commit, with a project-wide `tsc --noEmit` that passes with zero errors.
- The data that crosses the client/server boundary (recipe, ingredient, user, session, language, API request and response shapes) is typed once, in `src/shared`, and both sides use those types.
- The server is compiled by `tsc` to plain JavaScript, and the Docker image runs that output.
- The whole change is done in one pass on branch `BR-5`: a big switch, not a gradual move.

## Non-goals

- No behavior change. No refactoring, renaming, restructuring or "improving" code while converting. A real bug found on the way is noted and left for a separate task.
- No new dependencies beyond TypeScript itself and the `@types/*` packages the compiler needs. No switch of test runner, bundler, UI library or database driver.
- No change to what any test checks. Tests get types; their assertions stay as they are.
- No runtime validation library (zod and the like). The hand-written checks such as `isRecipe` stay; they may become type guards.

## Anti-goals (what makes this a failure even if it compiles)

- Anything breaks: the app, the tests, the build, or the Docker container.
- Types silenced instead of written: blanket `any`, `@ts-ignore`, `@ts-nocheck`, or loosening `strict` to get green. A narrow, commented `as` cast or `@ts-expect-error` at a genuinely untyped edge (for example a test double) is acceptable. Each should be rare and explain itself.
- Tests edited so they pass, rather than types added to them.

## Constraints

- **The server has no build step today.** `npm start` runs `vite build && node src/server/main.js`, and the Dockerfile copies `src` and runs `node src/server/main.js`. TypeScript means a server compile step, which touches `package.json` scripts, the Dockerfile, and the `docker compose exec app node src/server/cli.js ...` command in the README.
- **Paths in compiled output.** `src/server/main.js` finds the client build with `path.resolve(dirname, '../..')` + `dist`, and `seedCatalogue.js` reads `./seed/baby-recipes.json` next to itself. Compiling to a different folder depth or without copying the JSON would break production silently. The tests do not necessarily catch this, so the Docker check matters.
- **Shared code runs in two places.** `src/shared` is imported by the browser (through Vite) and by the server (through the compiled output). It must compile for both.
- **Import style.** Files import each other with explicit extensions (`./auth.js`, `@/components/ui/card.jsx`). The `@` alias maps to `src/client`; it is declared in both `vite.config.js` and `jsconfig.json` and must be declared in `tsconfig` too. Extensions in imports must resolve correctly under TypeScript and in Vite, Vitest and the compiled server.
- **Node versions.** The Dockerfile uses `node:22`. The owner's machine runs Node 19. The chosen setup must work on both, so nothing may depend on Node's built-in `.ts` support.
- **Database rows are untyped.** The server uses raw `pg` queries. Row types are written by hand where queries are made. PGlite (used by the tests) must still satisfy the same interface.
- **Tests that read project files.** `test/deploy.test.js` parses `compose.yaml` and other files, and `test/main.test.js` imports `startMain`. Both must keep working after the layout changes.
- **Docs and project skills mention paths and extensions.** `README.md` and `.claude/skills/{add-screen,deploy-docker}` refer to `.jsx` files, `src/server/` and `test/<name>.test.jsx`. They must be updated so they stay true. In particular, the deploy-docker skill decides whether to take a backup based on changes under `src/server/`.
- Work happens on `BR-5` and is not pushed by the migration itself.

## What was decided with the owner

- **One big switch**, not a gradual migration, covering the whole project including tests.
- **Compile the server** with a build step rather than relying on Node running `.ts` directly.
- **Done means:** the full test suite passes, the type-check has zero errors, `npm run build` works, and the Docker container builds, starts and serves the app. The owner named nothing beyond this.

## My calls (not discussed with the owner; they can overrule these)

- Strict mode on from the start, since there is no mixed state to ease into.
- The tests are converted too (my reading of "whole project"; the owner said "big switch").
- Install `typescript` and the `@types` packages as dev dependencies. Let `tsc` be the type-checker and the server compiler. Vite and Vitest keep transpiling TypeScript themselves without type-checking, so the type-check runs as its own npm script.
- Add the type-check to the project's normal checks (an npm script, and part of the Docker build so a type error cannot ship).
- Replace `jsconfig.json` with `tsconfig.json`. Whether this is one config or several (client, server, tests) is up to the builder.
- `components.json` (the shadcn config) has `"tsx": false`; it should say `true` so newly generated components match.

## Left to the builder

- The tsconfig layout, the server output folder and how the Dockerfile and `npm start` use it.
- The exact types: where each type lives in `src/shared`, which API response shapes get names, how to type the database rows, and how to type the fake API and database helpers used by the tests.
- The order of work inside the single branch, and how many commits to split it into. Each commit should leave tests green where practical, because that makes a regression easy to locate.
- Whether the root config files become `.ts`.
- Which compiler options to set beyond `strict`.

## How to verify

1. `npm test` passes, with the same number of tests as before the migration.
2. The type-check script exits with zero errors.
3. `npm run build` succeeds.
4. The server compile output starts with plain `node` (no TypeScript tooling) and serves `/api/session` and the built client.
5. `docker compose build` and `docker compose up` give a healthy container (the repo's `deploy-docker` skill covers this).
6. `git ls-files src test | grep -E '\.jsx?$'` prints nothing.
