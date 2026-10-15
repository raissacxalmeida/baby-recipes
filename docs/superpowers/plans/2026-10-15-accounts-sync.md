# Accounts, Sync and Docker Hosting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invite-only accounts with server-side data (Postgres), an admin page for invites, resets and removals, and a Docker Compose setup for running everything on the author's computer over her home network.

**Architecture:** The existing Node server grows a JSON API on top of a small `Db` interface (`pg` Pool in production, in-process PGlite in tests, same SQL). Service modules (`users`, `sessions`, `userData`, `usage`, `recipeService`) hold the rules and take `db` and `now` as parameters; a table-driven router in `server.js` maps HTTP to them. The React app drops `localStorage` and talks to the API through one injectable `api` object, with screens for login, invite sign-up, password reset, the existing recipe flow, and `/admin`.

**Tech Stack:** Node.js (local v19.2.0; container image Node 20), ES modules, `pg`, `@electric-sql/pglite` (dev), `yaml` (dev, compose test), React 18, Vite 5, Vitest 2, Postgres 16, Docker Compose, bash scripts.

**Spec:** `docs/superpowers/specs/2026-10-15-accounts-sync-design.md` (extends `2026-10-14-baby-recipes-design.md`). Docker and a real Postgres are not installed on the build machine: everything runs against PGlite here; the `pg` adapter, `Dockerfile` and `compose.yaml` cannot be executed during the build and are checked by tests of their text and by the author's first `docker compose up`.

## Global Constraints

- Invite-only: no public sign-up. Invites last 7 days and work once; resets last 24 hours; sessions 30 days; minimum password length 10.
- Passwords: salted `crypto.scrypt` hashes only. Invite, reset and session tokens: 32 random bytes (base64url); only their SHA-256 hash is stored; links are shown once.
- Session cookie `session`: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, `Secure` only when `COOKIE_SECURE=true`.
- Plain HTTP on a trusted home network is accepted by the author; no HTTPS in scope.
- Exactly one admin; created only by the `create-admin` command. The admin is exempt from daily limits and cannot be removed, cannot delete their own account, and has no Reset/Remove on their own row.
- Limits per non-admin account per UTC day: 10 recipes shown, 30 OpenAI calls. Reserve atomically before calling OpenAI. The recipe slot is released if the request ends without a recipe; call slots are never released.
- Login lockout per email only: 10 failures in 15 minutes locks that email for 15 minutes, a correct password is refused while locked, success clears the counter, a completed reset clears it.
- Invite and reset links are `${PUBLIC_URL}/invite/<token>` and `${PUBLIC_URL}/reset/<token>`; `PUBLIC_URL` is required.
- `ALLOWED_HOSTS` (comma separated host names, no ports) defaults to the `PUBLIC_URL` host name plus `localhost` and `127.0.0.1`; other `Host` headers get 403.
- Every non-GET `/api` request must send `X-Requested-With: fetch`, otherwise 400.
- Removing a person deletes the account, its data, sessions, resets and any invite for that email immediately; the email can be invited again.
- Postgres is never published to the host network; data lives in a named volume; secrets only in `.env` (git-ignored); `.env.example` lists every variable without secret values.
- Backups: a script writes a dump to `backups/` and keeps the last 7; a script restores a chosen dump.
- Date columns are read as text (`to_char(col, 'YYYY-MM-DD')`), never as JS `Date`, so timezones cannot shift them.
- Tokens, passwords, reset or invite links and the API key are never logged or returned except the link shown once to the admin.
- Same recipe rules as before: grams/kg only, safety rules enforced in code, text rendered as React children (never `dangerouslySetInnerHTML`).

## Review Focus

- Another account's data: user A acting on user B's recipe ids, the state of B, or a non-admin calling `/api/admin/*`: refused or invisible, never changed.
- Token misuse: expired, revoked, already-used or garbage invite and reset links; two sign-ups with the same invite at the same time (exactly one wins); an invite for an email that already has an account or a pending invite.
- A removed person: their cookie stops working at once; re-inviting the same email creates a clean new account; their pending invite and reset links die.
- Limits under pressure: two simultaneous requests at 9 of 10 (exactly one succeeds); a failed generation does not use a recipe slot but does use call slots; the UTC day rollover; the admin is never limited.
- Lockout: the 11th attempt with the right password during a lockout is refused; unknown emails behave exactly like wrong passwords; after 15 minutes login works again.

---

## File Structure

- `src/server/db.js` (`Db` interface, `createPgDb`), `migrations.js` (SQL), `migrate.js`, `config.js`, `auth.js` (hashing, tokens), `users.js`, `sessions.js`, `userData.js`, `usage.js`, `recipeService.js`, `server.js` (router, HTTP, main), `cli.js`; existing `generate.js` gets a small change.
- `src/shared/recipeShape.js` (`isRecipe`, moved from the old client store).
- `src/client/api.js` (replaced), `App.jsx` (rewritten), `main.jsx`, `screens/` (existing screens adjusted; new `LoginScreen`, `SignupScreen`, `ResetScreen`, `AdminScreen`, `AccountBar`); `store.js` is deleted.
- `test/helpers/db.js`, `test/helpers/http.js`, `test/helpers/fakeApi.js`; one test file per module.
- `Dockerfile`, `compose.yaml`, `.env.example`, `.dockerignore`, `scripts/backup.sh`, `scripts/restore.sh`, `README.md` (runbook).

Shared types:

```js
// Db: { query(text, params?): Promise<{ rows: object[] }>,
//       transaction(fn: (tx: { query }) => Promise<T>): Promise<T>, close(): Promise<void> }
// User:  { id: string, email: string, isAdmin: boolean }
// Recipe: as in the first design, plus { id, allergens } (unchanged)
// AppError codes (src/server/errors.js, status in server.js): invalid-input 400, unauthorized 401,
//   forbidden 403, not-found 404, conflict 409, too-young 422, locked 429, limit-reached 429,
//   missing-key 500, generation-failed 502, upstream-error 502
```

---

### Task 1: Database layer, migrations and test database

**Files:**
- Create: `src/server/db.js`, `src/server/migrations.js`, `src/server/migrate.js`, `test/helpers/db.js`
- Modify: `src/server/errors.js` (no change needed to the class; codes are documented above), `package.json`
- Test: `test/db.test.js`

**Interfaces:**
- Produces:
  - `createPgDb(connectionString: string): Db` using a `pg` Pool; `transaction` runs `BEGIN`/`COMMIT`/`ROLLBACK` on one client.
  - `migrate(db: Db): Promise<void>`: creates `schema_migrations(version int primary key)` and applies each entry of `MIGRATIONS` (array of SQL strings in `migrations.js`) not yet applied, each inside a transaction; safe to run twice.
  - `createTestDb(): Promise<Db & { reset(): Promise<void> }>` in `test/helpers/db.js`: a fresh PGlite instance, migrated; `reset()` truncates every app table; `close()` closes PGlite.
  - Tables (all ids `uuid default gen_random_uuid()` unless noted; timestamps `timestamptz`): `users(id, email text unique lowercase, password_hash, is_admin bool, birthdate date null, created_at, last_login_at null)`; `invites(id, email, token_hash unique, is_admin bool, expires_at, used_at null, created_at)`; `resets(id, user_id references users on delete cascade, token_hash unique, expires_at, used_at null)`; `sessions(id, user_id references users on delete cascade, token_hash unique, expires_at, created_at)`; `recipes(user_id references users on delete cascade, id text, data jsonb, status text check in ('liked','disliked'), updated_at, primary key (user_id, id))`; `shown(user_id references users on delete cascade, title text, shown_at, primary key (user_id, title))`; `usage(user_id references users on delete cascade, day date, recipes int default 0, calls int default 0, primary key (user_id, day))`; `login_attempts(email text primary key, failures int, first_failure_at, locked_until null)`.

- [ ] **Step 1:** `npm install pg` and `npm install -D @electric-sql/pglite yaml` (pglite and pg may already be installed; move pglite to devDependencies).
- [ ] **Step 2: Write failing tests** in `test/db.test.js` using `createTestDb`: `migrate` twice does not throw and `schema_migrations` has one row per migration; inserting a user then a `recipes` row, then deleting the user removes the recipe row (cascade); `db.transaction` rolls back when the callback throws (a row inserted inside is absent afterwards); `reset()` empties `users`; the atomic upsert `insert into usage ... on conflict (user_id, day) do update set recipes = usage.recipes + 1 where usage.recipes < $3 returning recipes` returns a row for the first 10 calls and no row for the 11th.
- [ ] **Step 3:** Run `npm test -- test/db.test.js`. Expected: FAIL, modules not found.
- [ ] **Step 4:** Implement `db.js`, `migrations.js`, `migrate.js`, `test/helpers/db.js`.
- [ ] **Step 5:** Run `npm test`. Expected: all PASS (old suite still green).
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: database layer, migrations and test database"`

---

### Task 2: Crypto helpers, invites, sign-up and admin creation

**Files:**
- Create: `src/server/auth.js`, `src/server/users.js`
- Test: `test/auth.test.js`, `test/users.test.js`

**Interfaces:**
- Consumes: `Db`, `AppError`.
- Produces (`auth.js`): `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, stored: string): Promise<boolean>` (constant-time), `newToken(): string`, `hashToken(token: string): string`.
- Produces (`users.js`), every function takes `now: Date` last where time matters; emails are trimmed and lower-cased; a string without `@` is `invalid-input`:
  - `createInvite(db, email: string, now): Promise<{ id: string, token: string }>`: `conflict` if a user with that email exists or an unexpired, unused invite exists; expiry now + 7 days; never admin.
  - `getInvite(db, token, now): Promise<{ email: string }>`: `not-found` for unknown, used or expired.
  - `acceptInvite(db, { token, password }, now): Promise<User>`: password under 10 characters is `invalid-input`; creates the user (`is_admin` from the invite); marks the invite used with `update ... where used_at is null returning` so concurrent use has one winner and the loser gets `not-found`.
  - `listInvites(db, now): Promise<{ id, email, status: 'pending' | 'used' | 'expired', daysLeft: number | null, createdAt: string }[]>` newest first.
  - `revokeInvite(db, id): Promise<void>`: deletes a pending invite; `not-found` otherwise.
  - `createAdmin(db, email, now): Promise<{ kind: 'invite' | 'reset', token: string }>`: with no admin yet, deletes pending admin invites and creates an admin invite (`kind: 'invite'`); if the admin exists and `email` matches, creates a reset for them (`kind: 'reset'`, uses `createReset` from Task 4 via a late import, so implement Task 4's `createReset` first only if needed: in this task return `conflict` for the matching-admin case and add the reset branch in Task 4); a different email once an admin exists is `conflict`.

- [ ] **Step 1: Write failing tests.** `auth`: hash differs for the same password twice; `verifyPassword` true/false; `newToken` values are unique and 43 characters; `hashToken` is stable and not equal to the token. `users`: invite then `getInvite` gives the normalised email; `createInvite('Ana@Example.com')` then again `ana@example.com` is `conflict`; `getInvite` after 8 days and for `'garbage'` is `not-found`; `acceptInvite` with a 9-character password is `invalid-input`; accept creates a user who is not admin and a second accept is `not-found`; `Promise.all` of two accepts of one token yields exactly one fulfilled; an invite for an email that already has an account is `conflict`; `listInvites` shows `pending` with `daysLeft` 7 then `expired` after 8 days then `used` after accept; `revokeInvite` makes `getInvite` `not-found`; `createAdmin` with no admin gives `kind: 'invite'` and accepting it yields `isAdmin: true`; a second `createAdmin` with another email after that is `conflict`; no token or password hash appears in any returned list.
- [ ] **Step 2:** Run the two files. Expected: FAIL.
- [ ] **Step 3:** Implement `auth.js` and `users.js`. Add the `invalid-input`, `conflict`, `not-found` codes where used.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: invites, sign-up and admin creation"`

---

### Task 3: Sessions and login with lockout

**Files:**
- Create: `src/server/sessions.js`
- Test: `test/sessions.test.js`

**Interfaces:**
- Consumes: `verifyPassword`, `hashPassword`, `newToken`, `hashToken`, `User`.
- Produces:
  - `login(db, { email, password }, now): Promise<{ token: string, user: User }>`: wrong password and unknown email both throw `AppError('unauthorized', 'Wrong email or password')` (for an unknown email, still run one password verification against a fixed dummy hash); while `login_attempts.locked_until > now` throws `AppError('locked', 'Too many attempts. Try again in 15 minutes')` even for a correct password; the 10th failure within 15 minutes of the first sets `locked_until = now + 15 min`; a failure when the window (or a past lock) has expired starts a new count at 1; success deletes the row and sets `users.last_login_at`. Session expiry is now + 30 days.
  - `sessionUser(db, token, now): Promise<User | null>`: null for unknown or expired.
  - `logout(db, token): Promise<void>`.

- [ ] **Step 1: Write failing tests** (users made with `createInvite` + `acceptInvite`): good login returns a token that `sessionUser` resolves to the same email; wrong password and unknown email give the same message; 10 wrong attempts then the correct password is `locked`; the same after 16 minutes succeeds; 9 failures then success then 9 more failures is not locked (counter cleared); an unknown email locked for 10 attempts behaves identically (`locked`); `sessionUser` after 31 days is null; `logout` makes the token null; `email` case differences log in.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `sessions.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: sessions and login lockout"`

---

### Task 4: Resets, people list and removing accounts

**Files:**
- Modify: `src/server/users.js`
- Test: `test/people.test.js`

**Interfaces:**
- Consumes: Task 2 and 3 functions, `usage` table (counts read directly in SQL).
- Produces (in `users.js`):
  - `createReset(db, userId, now): Promise<{ token: string }>`: deletes that user's earlier pending resets; expiry now + 24 h; `not-found` for an unknown user.
  - `getReset(db, token, now): Promise<{ email: string }>`: `not-found` for unknown, used or expired.
  - `useReset(db, { token, password }, now): Promise<void>`: password under 10 is `invalid-input`; atomically marks the reset used, sets the new hash, deletes all the user's sessions, deletes the email's `login_attempts` row.
  - `listPeople(db, now): Promise<{ id, email, isAdmin, joinedAt: string, lastLoginAt: string | null, recipesToday: number | null }[]>` (`recipesToday` is null for the admin; day is the UTC day of `now`).
  - `removeUser(db, userId): Promise<void>`: `forbidden` for the admin, `not-found` for unknown; deletes the user (cascade) and every invite with that email.
  - `createAdmin` gains the branch: existing admin and matching email returns `{ kind: 'reset', token }` from `createReset`.

- [ ] **Step 1: Write failing tests:** reset round trip changes the password (old fails, new works via `login`) and kills an existing session; a second `useReset` with the same token is `not-found`; expired after 25 h is `not-found`; a new `createReset` invalidates the previous token; `useReset` on a locked email clears the lock; `listPeople` shows `recipesToday` 3 after three recipe reservations (insert into `usage` directly) and null for the admin; `removeUser` on a normal user deletes their recipes (insert one), sessions (old token gives null), pending reset and invites for that email, and the email can be invited and accepted again with a clean state; `removeUser` on the admin is `forbidden`; `removeUser` on a random uuid is `not-found`; `createAdmin` with the admin's email returns `kind: 'reset'` and that token works with `useReset`.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement the functions.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: resets, people list and account removal"`

---

### Task 5: Per-account data and daily usage

**Files:**
- Create: `src/shared/recipeShape.js`, `src/server/userData.js`, `src/server/usage.js`, `src/server/recipeService.js`
- Modify: `src/server/generate.js` (rethrow `limit-reached` immediately, like `missing-key`)
- Test: `test/userData.test.js`, `test/usage.test.js`, `test/recipeService.test.js`

**Interfaces:**
- Consumes: `ageInMonths`, `generateRecipe`, `User`.
- Produces:
  - `isRecipe(r: unknown): boolean` in `src/shared/recipeShape.js`: the same checks as the former client store (string `id`/`title`, integer `basePortions` 1-12, ingredients with string `name` and numeric `grams`, string `steps`, array `allergens`).
  - `userData.js`: `getState(db, userId): Promise<{ birthdate: string | null, liked: Recipe[], disliked: Recipe[] }>`; `setBirthdate(db, userId, birthdate: string, now): Promise<void>` (`invalid-input` unless `ageInMonths` accepts it); `like(db, userId, recipe)`, `dislike(db, userId, recipe)` (each moves the recipe between lists, no duplicates; `invalid-input` unless `isRecipe`); `unlike(db, userId, id)`; `restore(db, userId, id)` (deletes the disliked row and the `shown` row with that recipe's title); `addShown(db, userId, title, now)` (keeps only the latest 50 per user); `excludeTitles(db, userId): Promise<string[]>` (shown titles plus disliked titles, unique).
  - `usage.js`: `LIMITS = { recipes: 10, calls: 30 }`; `reserveRecipe(db, userId, now): Promise<boolean>` and `reserveCall(db, userId, now): Promise<boolean>` (single atomic upsert per Task 1's pattern, using the UTC day of `now`); `releaseRecipe(db, userId, now): Promise<void>` (decrement, never below 0); `usageToday(db, userId, now): Promise<{ recipes: number, calls: number }>`; `nextReset(now: Date): Date` (next UTC midnight).
  - `recipeService.js`: `requestRecipe(db, user: User, ingredients: string[], deps: { callModel, now: () => Date }): Promise<Recipe>`: `invalid-input` when the account has no birthdate; non-admin: `reserveRecipe` else `AppError('limit-reached', 'Daily limit reached. Resets at <HH:MM> UTC')`; runs `generateRecipe` with `{ birthdate, ingredients, exclude: excludeTitles }` and a `callModel` wrapper that, for non-admins, calls `reserveCall` before each attempt and throws `limit-reached` when refused; on any error releases the recipe slot (non-admin) and rethrows; on success `addShown` and returns the recipe.

- [ ] **Step 1: Write failing tests.** `userData`: round trip birthdate; invalid birthdate `invalid-input`; like twice stores one; dislike moves a liked recipe; restore leaves it in neither list and drops it from `excludeTitles`; `isRecipe`-failing object is `invalid-input`; two users never see each other's lists; `addShown` of 60 titles keeps 50. `usage`: 10 `reserveRecipe` calls true then false; `Promise.all` of 12 reserves yields exactly 10 true; next day (`now` + 1 day) allows again; `releaseRecipe` frees one slot and never goes below 0; `reserveCall` stops after 30. `recipeService` (fake `callModel`): normal user gets a recipe, `usageToday.recipes` is 1, title is in `excludeTitles`; no birthdate gives `invalid-input` with zero usage; too-young birthdate gives `too-young` and `recipes` back to 0; three unsafe answers give `generation-failed`, `recipes` 0 and `calls` 3; at 10 recipes used gives `limit-reached` without calling the model; the 31st call gives `limit-reached`; the admin is never limited (12 requests succeed, no `usage` row).
- [ ] **Step 2:** Run the three files. Expected: FAIL.
- [ ] **Step 3:** Implement the modules; update `generate.js` to rethrow `limit-reached`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: per-account data, daily limits and recipe service"`

---

### Task 6: Config and HTTP server with auth routes

**Files:**
- Create: `src/server/config.js`, `test/helpers/http.js`
- Modify: `src/server/server.js` (rewritten around a route table), `test/server.test.js` (rewritten)
- Test: `test/config.test.js`, `test/server.test.js`

**Interfaces:**
- Consumes: Tasks 1-5.
- Produces:
  - `loadConfig(env: Record<string, string | undefined>): { databaseUrl, openaiKey, publicUrl, allowedHosts: string[], cookieSecure: boolean, port: number }`: throws one `Error` listing every missing or invalid variable (`DATABASE_URL`, `PUBLIC_URL`); `PUBLIC_URL` must parse as an http(s) URL and is returned without a trailing slash; `ALLOWED_HOSTS` default and override per Global Constraints; `COOKIE_SECURE === 'true'`; `PORT` default 3000.
  - `createServer({ db, config, callModel, now = () => new Date(), staticDir }): http.Server` with: Host check (403), static file serving with path-traversal protection and **`index.html` fallback for any GET that is not a file and not `/api`**, JSON helpers, cookie parsing, error mapping from `AppError` codes to statuses (other errors: 500 generic, no stack), 100 KB body limit, `X-Requested-With: fetch` on non-GET `/api` requests (else 400). Route table entries `{ method, pattern, access: 'public' | 'user' | 'admin', handler }` where `handler({ db, user, params, body, now, config, callModel }) => { status?, body?, setSession?: string, clearSession?: true }`. Non-matching `/api` path is 404; `user` access without a valid session is 401; `admin` access by a non-admin is 403 with a generic body.
  - Routes in this task: `POST /api/login {email, password}` -> `{ user }` and sets the cookie; `POST /api/logout` clears it and deletes the session; `GET /api/session` -> `{ user }` or 401; `GET /api/invite/:token` -> `{ email }`; `POST /api/signup {token, password}` -> `{ user }` and signs in (cookie set); `GET /api/reset/:token` -> `{ email }`; `POST /api/reset {token, password}` -> `204`-style `{ ok: true }` (no sign-in).
  - `test/helpers/http.js`: `startTestServer(opts?)` returning `{ base, db, config, now (settable clock), call(method, path, body?, jar?) , close }` and a tiny cookie jar so tests can act as several users.

- [ ] **Step 1: Write failing tests.** `config`: missing `DATABASE_URL` and `PUBLIC_URL` both named in one error; `PUBLIC_URL=http://my-mac.local:3000/` becomes without the slash and its host name is in `allowedHosts` with `localhost`; `ALLOWED_HOSTS=a.test,b.test` overrides; `COOKIE_SECURE=true` and unset. `server`: existing tests kept (static `index.html`, a missing `/nope.js` is 404, both traversal URLs 404, raw `/../secret.txt` 404) plus the fallback serving `index.html` for extension-less paths such as `/admin` and `/invite/abc`; foreign `Host` is 403; POST without `X-Requested-With` is 400; full flow with a fresh admin: `createAdmin` + `acceptInvite` then `POST /api/login` returns the user and a `Set-Cookie` containing `HttpOnly` and `SameSite=Lax` and not `Secure`, and with `cookieSecure: true` containing `Secure`; `GET /api/session` with the cookie returns the user, without it is 401; logout then `GET /api/session` is 401; `POST /api/signup` with a valid invite token logs in; wrong password is 401 with the same body as an unknown email; the 11th failed attempt is 429; `GET /api/invite/garbage` is 404; reset link flow (`createReset` then `POST /api/reset`) changes the password; unknown errors give a generic 500 with no stack; invalid JSON is 400; body over 100 KB is 400; response bodies never contain `password_hash` or `token_hash`.
- [ ] **Step 2:** Run `npm test -- test/config.test.js test/server.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement `config.js`, `test/helpers/http.js` and the new `server.js` (keep `loadEnv`; `createServer`'s old signature is gone, so delete the old `POST /api/recipe` handler, Task 7 re-adds it).
- [ ] **Step 4:** Run `npm test`. Expected: PASS (client tests unaffected).
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: config and http server with auth routes"`

---

### Task 7: Data and recipe routes

**Files:**
- Modify: `src/server/server.js`
- Test: `test/dataRoutes.test.js`

**Interfaces:**
- Consumes: `userData`, `usage`, `recipeService`, `removeUser`, `startTestServer`.
- Produces (all `access: 'user'`):
  - `GET /api/state` -> `{ birthdate: string | null, liked, disliked, usage: { recipesToday: number, limit: number, resetsAt: string } | null }` (`usage` null for the admin).
  - `PUT /api/birthdate {birthdate}` -> `{ ok: true }`.
  - `POST /api/recipe {ingredients: string[]}` -> `{ recipe }` via `requestRecipe`; error codes map per the shared types (`limit-reached` 429 with the message).
  - `POST /api/liked {recipe}`, `DELETE /api/liked/:id`, `POST /api/disliked {recipe}`, `POST /api/disliked/:id/restore` -> `{ ok: true }`.
  - `DELETE /api/account` -> `{ ok: true }`, clears the cookie, removes the account; `forbidden` for the admin.

- [ ] **Step 1: Write failing tests** with two logged-in users A and B and a fake `callModel`: A sets a birthday, requests a recipe, `GET /api/state` shows `usage.recipesToday: 1`, `limit: 10`; B's state is empty and B's `DELETE /api/liked/<A's id>` changes nothing in A's list; A likes then dislikes then restores a recipe and the lists follow; a request without a birthday is 400; a baby under 6 months is 422 and `recipesToday` stays 0; 10 recipes then the 11th is 429; two parallel `POST /api/recipe` at 9 used leave exactly one success; `PUT /api/birthdate` with `2999-01-01` is 400; the admin's `GET /api/state` has `usage: null`; `DELETE /api/account` as a normal user then using the old cookie gives 401 and the email can be invited again; as the admin it is 403; every route is 401 without a cookie.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Add the routes.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: state, recipe and feedback routes"`

---

### Task 8: Admin routes and command line

**Files:**
- Modify: `src/server/server.js`
- Create: `src/server/cli.js`
- Test: `test/adminRoutes.test.js`, `test/cli.test.js`

**Interfaces:**
- Consumes: `users.js`, `config.publicUrl`.
- Produces:
  - Routes (`access: 'admin'`): `GET /api/admin/overview` -> `{ invites: [...], people: [...] }` (Task 2 and 4 list shapes); `POST /api/admin/invites {email}` -> `{ link }` where `link = ${publicUrl}/invite/${token}`; `DELETE /api/admin/invites/:id` -> `{ ok: true }`; `POST /api/admin/people/:id/reset` -> `{ link }` (`/reset/<token>`); `DELETE /api/admin/people/:id` -> `{ ok: true }`.
  - `runCli(argv: string[], deps: { db, config, now: () => Date, log: (line: string) => void }): Promise<number>` returning an exit code: `create-admin <email>` prints one link line (`/invite/...` for a first admin, `/reset/...` for the existing admin) or an error line and exit 1 for `conflict` or a missing email; unknown commands print usage and exit 1.
  - Running `node src/server/cli.js ...` loads `.env`, `loadConfig`, creates the pg db, `migrate`, `runCli`, closes the db, exits with the code.

- [ ] **Step 1: Write failing tests.** Admin routes with admin, normal user and anonymous clients: non-admin gets 403 and anonymous 401 on all five routes, and nothing changes; `POST /api/admin/invites` returns a link starting with `config.publicUrl` that works with `GET /api/invite/<token>`; the invite for an existing email is 409; `overview` lists it as `pending`; revoke removes it; `POST .../reset` gives a link whose token works with `POST /api/reset`; `DELETE /api/admin/people/:id` removes a person, their cookie then gets 401, and removing the admin's own id is 403; response bodies contain no `token_hash`. CLI: first `create-admin ana@example.com` logs a `/invite/` link and exit 0; accepting it makes an admin; the same email again logs a `/reset/` link; another email returns 1 and logs a message without any token; missing argument returns 1.
- [ ] **Step 2:** Run the files. Expected: FAIL.
- [ ] **Step 3:** Add the routes and `cli.js`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: admin routes and create-admin command"`

---

### Task 9: Server entry point

**Files:**
- Modify: `src/server/server.js` (the `if (import.meta.url === ...)` main block)
- Test: `test/main.test.js`

**Interfaces:**
- Consumes: `loadConfig`, `createPgDb`, `migrate`, `createServer`, `callModel`.
- Produces: `startMain(env, deps?: { createDb, now }): Promise<{ server: http.Server, db: Db }>`: loads config (after `loadEnv('.env')` in the CLI entry only), connects (retrying up to 30 times, 1 s apart, when the database is not ready), runs `migrate`, creates the server with the real `callModel` and `staticDir` `dist/`, listens on `0.0.0.0:PORT`. The entry block calls it and logs `Listening on <PUBLIC_URL>` (never any secret).

- [ ] **Step 1: Write failing tests** with an injected `createDb` returning a PGlite test db: `startMain` with a valid env resolves and serves `GET /api/session` as 401 on the chosen port (`PORT=0`); a missing `PUBLIC_URL` rejects with a message naming it; a `createDb` whose first two connection checks fail still succeeds on the third (use a short retry delay injected for the test).
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: server entry point with migrations on start"`

---

### Task 10: Client API and app shell with login, sign-up and reset

**Files:**
- Create: `test/helpers/fakeApi.js`, `src/client/screens/LoginScreen.jsx`, `SignupScreen.jsx`, `ResetScreen.jsx`, `AccountBar.jsx`
- Modify: `src/client/api.js` (replaced), `src/client/App.jsx`, `src/client/main.jsx`; **delete** `src/client/store.js`, `test/store.test.js`, `test/api.test.js`
- Test: `test/clientApi.test.js`, `test/auth.screens.test.jsx`

**Interfaces:**
- Produces:
  - `createApi(fetchImpl = fetch): Api` with every method listed below; each request uses `credentials: 'same-origin'`, header `X-Requested-With: fetch` and, for bodies, `Content-Type: application/json`; a non-2xx response throws an `Error` with the server's `message`, plus `.status` and `.code`; a network failure throws `Error('Could not reach the server')`. `session()` resolves `{ user }` or `null` on 401.
  - `Api = { session, login(email, password), logout(), invite(token), signup(token, password), resetInfo(token), reset(token, password), state(), setBirthdate(d), suggest(ingredients), like(recipe), unlike(id), dislike(recipe), restore(id), deleteAccount(), admin: { overview(), createInvite(email), revokeInvite(id), reset(userId), remove(userId) } }` (paths per Tasks 6-8).
  - `fakeApi(overrides?)` in `test/helpers/fakeApi.js`: an in-memory `Api` with the same method names and the same semantics as the server (like/dislike/restore, exclusion), a settable `user` (`null` = logged out), and `vi.fn()` spies, so screen tests need no network.
  - `App({ api, now?, path?, navigate? })`: `path` defaults to `location.pathname`, `navigate(path)` defaults to `history.pushState` plus state update. `/invite/<token>` shows `SignupScreen`, `/reset/<token>` shows `ResetScreen`, otherwise the app calls `api.session()`: `null` shows `LoginScreen`, a user shows the main app (Task 11). `AccountBar({ user, onLogout, onDelete, onAdmin })` shows the email, `Log out`, `Delete my account` (not for admins; confirmation text names the email) and an `Admin` link for admins.
  - `SignupScreen({ api, token, onDone })` shows the invited email (from `api.invite`), a password field with the 10-character rule, errors from the API as `role="alert"`, and a not-found message for a bad link; `ResetScreen` the same with `resetInfo`/`reset`, then a link back to login; `LoginScreen({ api, onLoggedIn })` shows the error message (including the lockout message).

- [ ] **Step 1: Write failing tests.** `clientApi` (fake `fetch`): `login` posts JSON with `X-Requested-With`; a 401 from `session()` gives `null`; a 429 body `{ error: 'locked', message }` throws an error with that message and `status` 429; network failure message; `suggest` posts `{ ingredients }`. Screens: logged-out `App` shows the login form; a wrong password shows the API message; a good login shows the main area (stub text is enough here); `/invite/abc` shows the invited email and, with a 9-character password, a visible error without calling `signup`; a bad invite shows a not-found message; a successful signup calls `onDone`; `/reset/abc` flow ends with a login link; logout returns to the login form; `Delete my account` asks for confirmation and only then calls `deleteAccount`; the admin sees the `Admin` link and a normal user does not.
- [ ] **Step 2:** Run the files. Expected: FAIL.
- [ ] **Step 3:** Implement `api.js`, the helper, the screens, the new `App` shell and `main.jsx` (`<App api={createApi()} />`). For this task the main area after login renders a placeholder that Task 11 replaces; delete `store.js` and its tests, and move the old App tests that reference `store` aside by rewriting them in Task 11 (mark them `test.skip` with the comment `rewritten in Task 11` until then).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: client api, login, sign-up and reset screens"`

---

### Task 11: Main app on the API

**Files:**
- Modify: `src/client/App.jsx`, `src/client/screens/HomeScreen.jsx`, `LikedScreen.jsx` (as needed); un-skip and rewrite `test/app.test.jsx`, `test/feedback.test.jsx` on `fakeApi`
- Test: `test/app.test.jsx`, `test/feedback.test.jsx`, `test/limits.test.jsx`

**Interfaces:**
- Consumes: `Api`, existing screens (`SetupScreen`, `TooYoungScreen`, `HomeScreen`, `RecipeScreen`, `LikedScreen`), `ageInMonths`.
- Produces: after login `App` loads `api.state()`; no birthdate shows `SetupScreen`, which calls `api.setBirthdate` and refreshes; under 6 months shows `TooYoungScreen`; `HomeScreen` gains the line `Recipes today: N of 10` when `state.usage` is not null; Suggest calls `api.suggest(ingredients)` (no `exclude`, the server decides); like, dislike (then another suggestion), unlike and restore call the matching `api` methods and then refresh `state`; the request counter, `go()` navigation, busy states and stale-response protection from the current `App` stay. A `limit-reached` or any other API error shows its message as `role="alert"` and keeps the ingredient chips. Nothing reads or writes `localStorage` any more.

- [ ] **Step 1: Rewrite the failing tests** for every behaviour the old app and feedback tests covered (setup, future birthday error, too-young screen with no `suggest` call, ingredient chips, suggest shows recipe, failed request keeps chips, Give me another, Baby liked it / didn't like it, liked list opens without a `suggest` call, Remove, Restore, old error not shown after navigating, late response ignored, liked disabled while busy) against `fakeApi`, plus: `Recipes today: 3 of 10` shown from state and hidden when `usage` is null; a `limit-reached` rejection shows its message; no test touches `localStorage` (assert `localStorage.length` stays 0).
- [ ] **Step 2:** Run the files. Expected: FAIL.
- [ ] **Step 3:** Implement the changes in `App.jsx` and the screens.
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS and build OK.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: main app on the server API"`

---

### Task 12: Admin page

**Files:**
- Create: `src/client/screens/AdminScreen.jsx`
- Modify: `src/client/App.jsx`, `src/client/style.css`
- Test: `test/admin.screen.test.jsx`

**Interfaces:**
- Consumes: `api.admin.*`.
- Produces: `AdminScreen({ api, me: User })` (route `/admin`, admin only; a non-admin sees `Not found`): email field + `Create invite`, then the link in a read-only field with a `Copy` button (uses `navigator.clipboard.writeText`; falls back to selecting the text) and the note that it is shown once; `Invites` table (email, status with days left, created, `Revoke` on pending, `Invite again` on expired); `People` table (email, joined, last login, `Recipes today: n of 10`, `Reset password`, `Remove`; the admin's own row has neither button and no figure); `Reset password` shows the reset link once with `Copy`; `Remove` shows a confirmation that names the person's email and only on confirm calls `api.admin.remove`; API errors (for example `conflict` for an existing email) show as `role="alert"`. After every action the overview reloads. All text is rendered as React children.

- [ ] **Step 1: Write failing tests** on `fakeApi`: the overview renders both tables; creating an invite shows the link once and a reload of the overview (new render) no longer shows it; a `conflict` error shows its message; `Revoke` calls `api.admin.revokeInvite` and the row disappears; `Reset password` shows a `/reset/` link; `Remove` does nothing until the confirmation naming `joao@example.com` is accepted, then calls `remove` with that id; the admin row has no `Reset password` or `Remove` button; a non-admin `me` renders `Not found` and calls nothing; an email containing `<img onerror=x>` renders as text with no `img` element.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Implement `AdminScreen` and route it from `App` (`/admin` when `user.isAdmin`).
- [ ] **Step 4:** Run `npm test` and `npm run build`. Expected: PASS and build OK.
- [ ] **Step 5: Commit** `git add -A && git commit -m "feat: admin page"`

---

### Task 13: Docker Compose, backups and runbook

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `compose.yaml`, `.env.example`, `scripts/backup.sh`, `scripts/restore.sh`, `README.md`
- Modify: `.gitignore` (add `backups/`)
- Test: `test/deploy.test.js`

**Interfaces:**
- Produces:
  - `Dockerfile`: multi-stage; build stage `node:20` runs `npm ci` and `npm run build`; runtime stage `node:20-alpine` with production dependencies only, `src/`, `dist/`, `package*.json`, runs as the non-root `node` user, `CMD ["node", "src/server/server.js"]`.
  - `compose.yaml`: service `db` (`postgres:16`, `POSTGRES_USER=baby`, `POSTGRES_DB=babyrecipes`, `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`, named volume `pgdata` at `/var/lib/postgresql/data`, `pg_isready` healthcheck, `restart: unless-stopped`, **no `ports`**); service `app` (`build: .`, `ports: ["3000:3000"]`, `depends_on: db: condition: service_healthy`, `restart: unless-stopped`, environment `DATABASE_URL=postgres://baby:${POSTGRES_PASSWORD}@db:5432/babyrecipes`, `OPENAI_API_KEY=${OPENAI_API_KEY:?...}`, `PUBLIC_URL=${PUBLIC_URL:?...}`, `ALLOWED_HOSTS`, `COOKIE_SECURE`, `PORT=3000`); top-level `volumes: pgdata`.
  - `.env.example`: `POSTGRES_PASSWORD=`, `OPENAI_API_KEY=`, `PUBLIC_URL=http://localhost:3000` (with a comment to change it to the computer's home-network address), `ALLOWED_HOSTS=`, `COOKIE_SECURE=false`.
  - `scripts/backup.sh`: `COMPOSE=${COMPOSE:-docker compose}`; writes `backups/babyrecipes-YYYYmmdd-HHMMSS.sql` from `$COMPOSE exec -T db pg_dump -U baby babyrecipes`; on failure deletes the partial file and exits non-zero without deleting any old backup; then keeps only the 7 newest `backups/*.sql`.
  - `scripts/restore.sh <file>`: refuses a missing file; asks for the word `yes` unless `--yes` is given; runs `$COMPOSE exec -T db psql -U baby babyrecipes` with `drop schema public cascade; create schema public;` and then the dump.
  - `README.md` runbook: first start (`cp .env.example .env`, edit, `docker compose up -d --build`), creating the admin (`docker compose exec app node src/server/cli.js create-admin you@example.com`, open the printed link), finding the computer's address for `PUBLIC_URL`, inviting people, backups (manual and a `cron` example) and restoring, updating (`git pull && docker compose up -d --build`), the warning that `docker compose down -v` deletes all data, the plain-HTTP note (only for a trusted home network), and that the site is up only while the computer and Docker are running.

- [ ] **Step 1: Write failing tests** in `test/deploy.test.js` (parse `compose.yaml` with `yaml`): `db` has no `ports`, uses a named volume that is declared at the top level, has a healthcheck and `restart`; `app` `depends_on.db.condition` is `service_healthy` and publishes `3000:3000`; the three required variables use the `:?` form; no secret value appears in `compose.yaml`, `Dockerfile` or `.env.example`; every variable `loadConfig` reads is in `.env.example`; `.gitignore` contains `.env` and `backups/`. Scripts with a stub `COMPOSE` executable in a temp dir (prints a fake dump for `pg_dump`, records `psql` input): `backup.sh` creates one file with the dump content; running it 9 times with distinct timestamps (stub or `sleep`-free by faking the date via an env `BACKUP_TIMESTAMP` override) leaves 7 files; a stub that fails `pg_dump` leaves no partial file and keeps old ones and exits non-zero; `restore.sh` with a missing file exits non-zero before calling the stub; with `--yes` the stub receives `drop schema public cascade` before the dump text.
- [ ] **Step 2:** Run the file. Expected: FAIL.
- [ ] **Step 3:** Create the files. Make the scripts executable.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Run `bash -n scripts/backup.sh scripts/restore.sh`. Expected: no output.
- [ ] **Step 5:** Record in the ledger that `docker compose up` could not be run on the build machine (no Docker); the README tells the author how to confirm the first start (`docker compose ps` shows both services healthy; open `PUBLIC_URL`).
- [ ] **Step 6: Commit** `git add -A && git commit -m "feat: docker compose, backups and runbook"`
