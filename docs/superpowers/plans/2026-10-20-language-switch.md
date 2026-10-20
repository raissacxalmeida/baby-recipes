# Language Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every visitor switch the whole interface between English, Portuguese, Spanish and German from the page footer, with the choice saved on their account.

**Architecture:** A small purpose-built translation module (`src/client/i18n/`) holds a module-level current language, a `t(key, params)` function and one flat catalog per language. Only `App` subscribes to language changes, so a switch re-renders the whole tree without remounting any screen. Server errors gain a stable `key` and `params` next to the English `message`; the client translates by key and falls back to the English message. `users.language` (nullable) stores the account choice, exposed on the session user and set with `PUT /api/language`.

**Tech Stack:** React 18, Vite, Vitest + Testing Library (jsdom), plain Node `http` server, Postgres (pglite in tests). No new dependency (`Intl.PluralRules` and `Intl.NumberFormat` cover plurals and numbers).

**Spec:** `docs/superpowers/specs/2026-10-20-language-switch-design.md`

## Global Constraints

- Languages and codes: English `en`, Portuguese `pt`, Spanish `es`, German `de`. Native names in the switch: `English`, `Português`, `Español`, `Deutsch`.
- The switch is a row of those names in the existing footer in `src/client/App.jsx`, current one in bold, shown on every page (logged in, logged out, `/admin`, `/invite/…`, `/reset/…`). Not in the menu, not a header button.
- Account language wins on login. An existing account with no saved language keeps the language the interface is showing and that gets saved. A failed save never shows an error.
- First visit: stored browser choice, else the first browser language (primary subtag) among the four, else English.
- `<html lang>` follows the chosen language.
- Brand name "Tiny Pantry", the page title and the tagline "recipes for little eaters" stay English in every language. `Logo.jsx` does not change.
- Recipe titles, ingredient names and steps stay English. The fixed labels (food groups, allergen names, "N months") are translated.
- Amounts use the language's decimal mark (`1,5 kg` in pt/es/de, `1.5 kg` in en). Admin dates stay ISO.
- Counted wording and every sentence with a value in it is one whole catalog entry with `{slots}`. Plural entries are `{ one, other }` objects using the `{count}` slot.
- Nothing in `safety.js`, `recipeMatch.js`, `ingredients.js`, `ingredientEmoji.js` or `recipeGroup.js`'s matching words changes.
- Typed ingredients stay English-only. In a non-English language a note near the ingredient box says to type them in English.
- Translations are written by the implementer and ship without native review. Portuguese is Brazilian, Spanish is neutral, German and Spanish use the informal "you" (du / tú). These register choices are the planner's call.
- Rule for components: any component that renders text calls `t()` at render time (never at module load) and is never wrapped in `React.memo`, so the `App`-level re-render updates it.
- Every commit message ends with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work stays on branch `BR-3`; do not push.
- English stays the default. The existing ~25 test files assert English text and must keep passing unchanged except where a task says otherwise.

## Review Focus

1. Switching language mid-task must not lose state: a typed ingredient, a recipe's chosen portions, an open menu.
2. `localStorage` that throws (private window, blocked) must not break the app or the switch.
3. An account language the client does not know (for example `"xx"`) must be ignored, not crash or blank the UI.
4. A failed `PUT /api/language` must be silent.
5. A server error whose `key` the client has no entry for must show the English `message`, never a raw key.
6. The footer switch must also appear on `/invite/…`, `/reset/…` and `/admin`.

---

## File Structure

- `src/shared/languages.js` (new): language codes, names, `isLanguage`. Used by client and server.
- `src/client/i18n/translate.js` (new): pure `createTranslator`. No globals.
- `src/client/i18n/catalogs.js` (new): `{ en, pt, es, de }` from the four catalog files.
- `src/client/i18n/en.js`, `pt.js`, `es.js`, `de.js` (new): flat key → string | `{one, other}`.
- `src/client/i18n/index.js` (new): current-language store, `t`, `hasKey`, `setLanguage`, `getLanguage`, `useLanguage`, `detectLanguage`.
- `src/client/components/LanguageSwitch.jsx` (new): the footer row.
- Server: `errors.js`, `server.js`, `migrations.js`, `sessions.js`, `routes/auth.js`, `routes/data.js`, `userData.js`, plus the files that throw user-visible errors (listed in Task 3).
- Client: `api.js`, `App.jsx`, `MainApp.jsx`, `components/Menu.jsx`, `components/ui/confirm-dialog.jsx`, every file in `screens/`.
- Tests: new `test/i18n*.test.*`, `test/language*.test.*`, `test/helpers/i18n.js`; existing tests touched only where a task says so.

---

### Task 1: Translation core, catalogs skeleton, completeness tests

**Files:**
- Create: `src/shared/languages.js`, `src/client/i18n/translate.js`, `src/client/i18n/catalogs.js`, `src/client/i18n/index.js`, `src/client/i18n/en.js`, `pt.js`, `es.js`, `de.js`
- Modify: `test/setup.jsdom.js`
- Test: `test/i18n.test.js`, `test/i18nDom.test.jsx`, `test/i18nCatalog.test.js`, `test/helpers/i18n.js`

**Interfaces:**
- Produces:
  - `src/shared/languages.js`: `LANGUAGES = ['en','pt','es','de']`, `LANGUAGE_NAMES = { en:'English', pt:'Português', es:'Español', de:'Deutsch' }`, `DEFAULT_LANGUAGE = 'en'`, `isLanguage(value): boolean`.
  - `translate.js`: `createTranslator(catalogs, fallback = 'en') => (language, key, params = {}) => string`. Looks the key up in `catalogs[language]`, then `catalogs[fallback]`, else returns the key. A `{one, other}` entry is chosen with `new Intl.PluralRules(language).select(Number(params.count))`, falling back to `other`. `{name}` slots are replaced with `String(params[name])`; a slot with no param is left as written.
  - `index.js`: `t(key, params?)`, `hasKey(key)` (true if the key is in the English catalog), `getLanguage()`, `setLanguage(language)`, `useLanguage()` (hook, returns the current code), `detectLanguage({ stored, languages }) => code`.
  - `setLanguage`: ignores unsupported values; stores to `localStorage` key `language` inside try/catch; sets `document.documentElement.lang` when `document` exists; notifies subscribers. The initial language is `detectLanguage({ stored: localStorage 'language' (try/catch), languages: navigator.languages ?? [] })`, with `<html lang>` set at load but nothing written to storage.
  - `test/helpers/i18n.js`: `englishLeft(root, language, prefixes) => string[]`: the English catalog values for keys starting with any of `prefixes` (skipping plural entries, entries with `{slots}`, and keys whose `language` value equals the English value) that still appear as text content or as an `aria-label` anywhere under `root`. Used by later tasks to catch hard-coded English.
- Seed keys for this task (all four catalogs): `common.loading` "Loading...", `common.cancel` "Cancel", `language.label` "Language", `age.months` `{one:'{count} month', other:'{count} months'}`.
- Pinned translations: `age.months` pt `{one:'{count} mês', other:'{count} meses'}`, es `{one:'{count} mes', other:'{count} meses'}`, de `{one:'{count} Monat', other:'{count} Monate'}`; `language.label` de "Sprache", pt "Idioma", es "Idioma".

- [ ] **Step 1: Write the failing tests**

`test/i18n.test.js` (node env):
  - `detectLanguage({ stored: 'de', languages: ['pt-BR'] })` is `'de'`.
  - `detectLanguage({ stored: null, languages: ['fr-FR', 'pt-BR', 'en'] })` is `'pt'`.
  - `detectLanguage({ stored: 'xx', languages: ['fr'] })` is `'en'`; `detectLanguage({})` is `'en'`.
  - `createTranslator({ en: { a: 'Hi {name}', n: { one: '{count} cat', other: '{count} cats' }, only: 'Only en' }, pt: { a: 'Oi {name}' } })`: `('pt','a',{name:'Ana'})` is `'Oi Ana'`; `('pt','only')` is `'Only en'` (falls back to English); `('en','n',{count:1})` is `'1 cat'`; `('en','n',{count:3})` is `'3 cats'`; `('en','missing')` is `'missing'`; `('en','a')` is `'Hi {name}'`.
  - The real `t('age.months', { count: 1 })` and `{ count: 8 }` after `setLanguage` to each language give the pinned strings above ('1 month', '8 months', '1 mês', '8 meses', '1 mes', '8 meses', '1 Monat', '8 Monate').

`test/i18nDom.test.jsx` (jsdom): `setLanguage('de')` sets `document.documentElement.lang` to `'de'` and `localStorage.getItem('language')` to `'de'`; `setLanguage('xx')` changes nothing; with `Storage.prototype.setItem` stubbed to throw, `setLanguage('pt')` still changes `getLanguage()`; a tiny component using `useLanguage()` re-renders when `setLanguage` is called inside `act`.

`test/i18nCatalog.test.js` (node env), over `catalogs.js`:
  - every language has exactly the same key set as `en`;
  - no entry is an empty string;
  - for each key, the set of `{slot}` names is identical in all four languages (for plural entries, across `one` and `other`), and plural entries have both `one` and `other` in every language, with `{count}` in both;
  - every literal key used as `t('…')` in `src/client/**/*.{js,jsx}` exists in `en` (regex `/\bt\(\s*'([^']+)'/g` over the files);
  - every `key: '…'` literal in `src/server/**/*.js` and `src/shared/**/*.js` exists in `en`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run test/i18n.test.js test/i18nDom.test.jsx test/i18nCatalog.test.js`
Expected: FAIL (modules not found).

- [ ] **Step 3: Implement the files listed under Interfaces**

`index.js` builds one translator from `catalogs.js` and keeps `current` plus a listener set; `useLanguage` uses `useSyncExternalStore`. In `test/setup.jsdom.js` add an `afterEach` that clears `localStorage` (guarded for the node environment) and calls `setLanguage('en')`, then clears `localStorage` again, so tests never leak a language.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run test/i18n.test.js test/i18nDom.test.jsx test/i18nCatalog.test.js`
Expected: PASS. Then `npm test`: everything else still passes.

- [ ] **Step 5: Commit**

```bash
git add src/shared/languages.js src/client/i18n test/setup.jsdom.js test/i18n.test.js test/i18nDom.test.jsx test/i18nCatalog.test.js test/helpers/i18n.js
git commit -m "feat: add the translation core and the language catalogs"
```

---

### Task 2: Save the language on the account

**Files:**
- Modify: `src/server/migrations.js` (append one migration), `src/server/sessions.js` (`login`, `sessionUser`), `src/server/routes/auth.js` (`publicUser`), `src/server/routes/data.js`, `src/server/userData.js`, `src/client/api.js`, `test/helpers/fakeApi.js`
- Test: `test/language.test.js`

**Interfaces:**
- Consumes: `isLanguage` from `src/shared/languages.js`.
- Produces:
  - Column `users.language text` (nullable) with `check (language in ('en','pt','es','de'))`, added as a new last entry of the migrations array.
  - `sessionUser` and `login` return user objects with `language` (`string | null`); `publicUser` returns `{ email, isAdmin, language }` with `language` as `null` when unset. Also true for the user object returned by `acceptInvite` (signup response).
  - `setLanguage(db, userId, language): Promise<void>` in `userData.js`; throws `AppError('invalid-input', 'Choose a supported language')` when `!isLanguage(language)`.
  - `PUT /api/language` (`access: 'user'`, body `{ language }`, replies `{ ok: true }`).
  - Client: `api.setLanguage(language)` → `PUT /api/language`. The fake api gets `setLanguage: vi.fn(async (language) => { if (state.user) state.user = { ...state.user, language }; })`.

- [ ] **Step 1: Write the failing tests** in `test/language.test.js` using `startTestServer` (pattern of `test/dataRoutes.test.js`):
  - A new user's `GET /api/session` body is `{ user: { email, isAdmin: false, language: null } }`.
  - `PUT /api/language { language: 'de' }` → 200 `{ ok: true }`; then `GET /api/session` has `language: 'de'`; a fresh `POST /api/login` for that user also returns `language: 'de'`.
  - `PUT /api/language { language: 'fr' }` → 400 with `error: 'invalid-input'`; the saved language is unchanged.
  - `PUT /api/language` without a cookie → 401.
  - The signup response (`POST /api/signup`) has `user.language: null`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/language.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement** the migration, selects, `publicUser`, `setLanguage`, route and `api.setLanguage`, and the fake. Update existing tests that `toEqual` a session or login user without `language` (find with `grep -rn "isAdmin: false }" test`).

- [ ] **Step 4: Run `npm test`** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server src/client/api.js test
git commit -m "feat: save the chosen language on the account"
```

---

### Task 3: Translatable server errors

**Files:**
- Modify: `src/server/errors.js`, `src/server/server.js`, `src/client/api.js`, `src/shared/age.js`, and the throwers: `users.js`, `sessions.js`, `generate.js`, `recipeService.js`, `sharedRecipes.js`, `userData.js`, `routes/data.js`, `openai.js`
- Modify: `src/client/i18n/{en,pt,es,de}.js`, `test/adminRoutes.test.js:33`
- Test: `test/errorKeys.test.js`, `test/clientApi.test.js`

**Interfaces:**
- Consumes: `t`, `hasKey`, `setLanguage` from `src/client/i18n/index.js`.
- Produces:
  - `new AppError(code, message, info = {})` where `info` is `{ key?: string, params?: object }`; sets `this.key` and `this.params`.
  - Error JSON becomes `{ error, message }` plus `key` (and `params` when present) only when the error has a key.
  - `ageInMonths` throws a `RangeError` that also carries `key` (`'err.birthdayFormat'`, `'err.birthdayFuture'`). Every place that rewraps `err.message` from it into an `AppError` (`userData.setBirthdate`, `generate.validateRequest`, `sharedRecipes.shareRecipe`) passes `{ key: err.key }`.
  - `api.js`: a failed request throws an `Error` whose `message` is `t(data.key, data.params)` when `data.key` is present and `hasKey(data.key)`, else `data.message`, else `t('err.generic')`; the error also carries `key`. The two fallbacks become `t('err.network')` ("Could not reach the server") and `t('err.generic')`.
- Keys (add to all four catalogs; the English text is the current server message):

| Key | English | Params |
|---|---|---|
| `err.generic` | Something went wrong | |
| `err.network` | Could not reach the server | |
| `err.notFound` | Not found | |
| `err.notLoggedIn` | Please log in | |
| `err.notAllowed` | Not allowed | |
| `err.email` | Enter a valid email address | |
| `err.passwordShort` | Use a password with at least {min} characters | `min` |
| `err.emailTaken` | That email already has an account | |
| `err.invitePending` | That email already has a pending invite | |
| `err.inviteInvalid` | This invite link is not valid | |
| `err.adminExists` | An admin already exists | |
| `err.inviteMissing` | Invite not found | |
| `err.personMissing` | Person not found | |
| `err.resetInvalid` | This reset link is not valid | |
| `err.adminProtected` | The admin cannot be removed | |
| `err.wrongLogin` | Wrong email or password | |
| `err.locked` | Too many attempts. Try again in 15 minutes | |
| `err.ingredientsLimit` | Use at most {maxItems} ingredients of {maxLength} characters each | `maxItems`, `maxLength` |
| `err.ingredientsNeeded` | Add at least one ingredient | |
| `err.tooYoung` | Solid foods usually start around 6 months, so no recipe is suggested yet | |
| `err.generationFailed` | Could not make a safe recipe. Please try again | |
| `err.birthdayFirst` | Set your baby's birthday first | |
| `err.limitReached` | Daily limit reached. It resets at {time} UTC | `time` (HH:MM) |
| `err.recipeUnavailable` | That recipe is not available | |
| `err.likeFirst` | Like the recipe first, then share it | |
| `err.alreadyCommunity` | This recipe came from the community already | |
| `err.ownShared` | You shared this one | |
| `err.recipeInvalid` | That recipe is not valid | |
| `err.chooseRecipe` | Choose a recipe to share | |
| `err.language` | Choose a supported language | |
| `err.birthdayFormat` | Enter a valid birthday as YYYY-MM-DD | |
| `err.birthdayFuture` | The birthday must be before today | |
| `err.openaiKey` | OPENAI_API_KEY is not set | |
| `err.openaiUnreachable` | Could not reach OpenAI | |
| `err.openaiRejected` | OpenAI rejected the request (status {status}). | `status` |

Technical messages with no useful translation (`Request too large`, `Missing X-Requested-With header`, the two JSON-body messages, `Ingredients and excluded titles must be lists of text`, the recipe-validation messages from `recipe.js`) get no key and keep showing in English. The `OpenAI rejected…` hint about `OPENAI_API_KEY` stays English-only in the server message; the keyed text omits it. The `Choose a supported language` error from Task 2 gets `{ key: 'err.language' }` here.

- Pinned translations: `err.wrongLogin` de "Falsche E-Mail-Adresse oder falsches Passwort"; `err.passwordShort` de "Verwende ein Passwort mit mindestens {min} Zeichen".

- [ ] **Step 1: Write the failing tests**
  - `test/errorKeys.test.js` (server, `startTestServer`): a wrong-password login is 401 with body exactly `{ error: 'unauthorized', message: 'Wrong email or password', key: 'err.wrongLogin' }`; an invite signup with a 5-character password is 400 with `key: 'err.passwordShort'` and `params: { min: 10 }`; the `PUT /api/birthdate` with `'not-a-date'` is 400 with `key: 'err.birthdayFormat'`; an error with no key (`POST /api/liked` without the `X-Requested-With` header) has no `key` property.
  - `test/clientApi.test.js` additions: after `setLanguage('de')`, a 401 reply `{ error:'unauthorized', message:'Wrong email or password', key:'err.wrongLogin' }` makes `login` reject with message `'Falsche E-Mail-Adresse oder falsches Passwort'` and `code: 'unauthorized'`; a 400 reply with key `err.passwordShort` and `params: {min: 10}` gives `'Verwende ein Passwort mit mindestens 10 Zeichen'`; a reply with `key: 'err.unknownFromNewerServer'` and `message: 'Plain English'` rejects with `'Plain English'`; a thrown network failure under `de` gives the German `err.network`.
  - Update `test/adminRoutes.test.js:33` to expect `{ error: 'forbidden', message: 'Not allowed', key: 'err.notAllowed' }`.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/errorKeys.test.js test/clientApi.test.js` → FAIL.

- [ ] **Step 3: Implement.** Give every user-reachable message in the table its `{ key, params }` at its throw site. The catalog completeness test from Task 1 will fail until each `key: '…'` literal exists in all four catalogs, so it drives completeness.

- [ ] **Step 4: Run `npm test`** — Expected: PASS (fix any other existing test that compares a whole error body).

- [ ] **Step 5: Commit**

```bash
git add src test
git commit -m "feat: send translatable keys with server errors"
```

---

### Task 4: The footer switch and account sync

**Files:**
- Create: `src/client/components/LanguageSwitch.jsx`
- Modify: `src/client/App.jsx`
- Test: `test/languageSwitch.test.jsx`

**Interfaces:**
- Consumes: `setLanguage`, `getLanguage`, `useLanguage`, `t` from `i18n/index.js`; `LANGUAGES`, `LANGUAGE_NAMES`, `isLanguage`; `api.setLanguage` (Task 2).
- Produces: `<LanguageSwitch />` (default export): a `<nav aria-label={t('language.label')}>` with one `<button type="button" lang={code}>` per language showing its native name; the current one has `aria-current="true"` and `font-bold`. Clicking calls `onChange(code)`.
  - Props: `{ onChange }`.
- `App` calls `useLanguage()` once (so every language change re-renders the tree). `App` renders `<LanguageSwitch onChange={choose} />` inside the existing `<footer>`, under the disclaimer line, on every page. `choose(code)` calls `setLanguage(code)` and, when a user is logged in, `api.setLanguage(code).catch(() => {})`.
- A `useEffect` on `session.user` (and only when it is set): if `isLanguage(user.language)` then `setLanguage(user.language)`; otherwise `api.setLanguage(getLanguage()).catch(() => {})`.

- [ ] **Step 1: Write the failing tests** in `test/languageSwitch.test.jsx` (render `App` with `createFakeApi`, as in `test/helpers/app.jsx`):
  - Logged out: a `nav` named "Language" holds buttons `English`, `Português`, `Español`, `Deutsch`; `English` has `aria-current="true"`.
  - Logged out: clicking `Deutsch` makes `getLanguage()` `'de'`, `localStorage.getItem('language')` `'de'`, `document.documentElement.lang` `'de'`, the nav's accessible name `Sprache`, and the fake `api.setLanguage` is not called.
  - Logged in with `user.language: 'es'` while `localStorage` says `'de'`: after the session loads, `getLanguage()` is `'es'`.
  - Logged in with `user.language: null` while the interface shows `'de'`: `api.setLanguage` is called once with `'de'` and the language stays `'de'`.
  - Logged in: clicking `Português` calls `api.setLanguage('pt')`. With `api.setLanguage` rejecting, `getLanguage()` is still `'pt'` and no `role="alert"` element appears.
  - Logged in with `user.language: 'xx'`: treated like unset (`api.setLanguage` called with the current language, nothing thrown).
  - The nav is present at `path="/invite/tok"`, `path="/reset/tok"` and, for an admin user, `path="/admin"`.
  - With `Storage.prototype.setItem` throwing, clicking `Deutsch` still switches.
  - Logging out leaves `getLanguage()` unchanged.

- [ ] **Step 2: Run to verify they fail** — `npx vitest run test/languageSwitch.test.jsx` → FAIL.
- [ ] **Step 3: Implement** the component and the `App` changes.
- [ ] **Step 4: Run `npx vitest run test/languageSwitch.test.jsx` then `npm test`** → PASS.
- [ ] **Step 5: Commit**

```bash
git add src/client test/languageSwitch.test.jsx
git commit -m "feat: add the language switch to the footer"
```

---

### Task 5: Translate the logged-out pages and `App` text

**Files:**
- Modify: `src/client/App.jsx`, `screens/LoginScreen.jsx`, `screens/SignupScreen.jsx`, `screens/ResetScreen.jsx`, `src/client/i18n/{en,pt,es,de}.js`
- Test: `test/i18nAuth.test.jsx`

**Interfaces:**
- Consumes: `t`; `err.passwordShort` from Task 3 (replace the two hard-coded `MIN_PASSWORD` messages with `t('err.passwordShort', { min: MIN_PASSWORD })`).
- Keys (English; add all four languages):

| Key | English |
|---|---|
| `auth.sessionEnded` | Your session ended. Please log in again. |
| `auth.email` | Email |
| `auth.password` | Password |
| `footer.disclaimer` | This is not medical advice. Check with your paediatrician if unsure. |
| `login.title` | Log in |
| `login.submit` | Log in |
| `signup.invalidTitle` | Invite |
| `signup.title` | Create your account |
| `signup.invitedAs` | You were invited as {email}. |
| `signup.choosePassword` | Choose a password |
| `signup.checking` | Checking your invite... |
| `signup.submit` | Create account |
| `reset.title` | Reset password |
| `reset.changedTitle` | Password changed |
| `reset.toLogin` | Go to log in |
| `reset.forEmail` | New password for {email}. |
| `reset.newPassword` | New password |
| `reset.submit` | Change password |
| `reset.checking` | Checking your link... |

`common.loading` (Task 1) replaces the two "Loading..." literals. Existing tests find the login form by the English labels, so under `en` the rendered text must be identical to today's.

- Pinned translations: `login.title` pt "Entrar", es "Iniciar sesión", de "Anmelden".

- [ ] **Step 1: Write the failing test** `test/i18nAuth.test.jsx`: for each of `pt`, `es`, `de`, `setLanguage(lang)` then render (a) the login page, (b) `/invite/tok` with the fake `api.invite`, (c) `/reset/tok` and assert `englishLeft(container, lang, ['auth.', 'footer.', 'login.', 'signup.', 'reset.', 'common.loading'])` is `[]`; the `de` login heading is `Anmelden`; the footer disclaimer text of each language is the catalog value. A `de` signup with a 3-character password shows `Verwende ein Passwort mit mindestens 10 Zeichen`.
- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement** by moving the literals to `t()` calls.
- [ ] **Step 4: Run `npm test`** → PASS (existing auth tests unchanged).
- [ ] **Step 5: Commit** `git commit -m "feat: translate the logged-out pages"` (after `git add src test`).

---

### Task 6: Translate the menu, dialogs, birthday and too-young screens, `MainApp`

**Files:**
- Modify: `components/Menu.jsx`, `components/ui/confirm-dialog.jsx`, `screens/SetupScreen.jsx`, `screens/TooYoungScreen.jsx`, `MainApp.jsx` (its `BACK` labels become keys, resolved at render; "Loading..." and "Saved to liked recipes." become keys), `i18n/*`
- Test: `test/i18nMenu.test.jsx`

**Interfaces:**
- Keys:

| Key | English |
|---|---|
| `menu.button` | Menu |
| `menu.home` | Home |
| `menu.liked` | Liked recipes |
| `menu.community` | Community recipes |
| `menu.admin` | Admin |
| `menu.logout` | Log out |
| `menu.delete` | Delete my account |
| `menu.deleteTitle` | Delete your account? |
| `menu.deleteBody` | Delete the account {email} and all its saved data? This cannot be undone. |
| `menu.deleteConfirm` | Yes, delete my account |
| `setup.title` | Welcome |
| `setup.intro` | Tell me your baby's birthday so recipes fit their age. |
| `setup.birthday` | Baby's birthday |
| `setup.continue` | Continue |
| `tooYoung.title` | Not yet |
| `tooYoung.body` | Solid foods usually start around 6 months, so no recipes are suggested for now. |
| `tooYoung.change` | Change birthday |
| `recipe.backLiked` | Back to liked recipes |
| `recipe.backCommunity` | Back to community recipes |
| `recipe.saved` | Saved to liked recipes. |

`ConfirmDialog`'s "Cancel" becomes `t('common.cancel')`. `SetupScreen` shows `err.key ? t(err.key) : err.message` for age errors (keys `err.birthdayFormat`, `err.birthdayFuture` from Task 3).
- Pinned translations: `menu.button` pt "Menu", es "Menú", de "Menü".

- [ ] **Step 1: Write the failing test** `test/i18nMenu.test.jsx`: with `startApp()` after `setLanguage(lang)` for each of `pt`, `es`, `de`: open the menu and `englishLeft(document.body, lang, ['menu.', 'common.cancel'])` is `[]`; the menu button is named `Menü` in `de`; opening the delete-account dialog shows the translated title and no English `Cancel`. The setup screen (`startApp({ birthdate: null })`) in `de` has no English left for prefix `setup.`, and entering a future birthday shows the German `err.birthdayFuture`. The too-young screen (`birthdate: '2026-08-01'`, `now` is 2026-10-15) has no English left for prefix `tooYoung.`. Opening a liked recipe from the liked page in `de` shows the translated `recipe.backLiked`.
- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: translate the menu and account screens"`.

---

### Task 7: Audit what happens to ingredients typed in another language

**Files:**
- Create: `docs/superpowers/specs/2026-10-20-language-switch-ingredient-audit.md`

This task changes no code.

- [ ] **Step 1: Trace a typed ingredient** from `HomeScreen` through `parseIngredientList` (`src/shared/ingredients.js`), `validateRequest` and `findSuitable` (`src/server/catalogue.js`, `src/shared/recipeMatch.js`), the OpenAI prompt (`src/server/openai.js`), `checkSafety` and `detectAllergens` (`src/server/safety.js`), and `presentRecipe`/`isListed`. Note, for each, whether it runs on typed text or on the generated English recipe.
- [ ] **Step 2: Write the findings** (one short page): for a non-English word such as "Honig", "mel", "huevo", what the app does at each step; whether any safety rule could be skipped for it; and whether the generated recipe's own check would still catch the dangerous ingredient.
- [ ] **Step 3: If a dangerous non-English ingredient could pass every check, put that at the top of the audit document and in the final report to the owner (Task 10, step 7).** Do not change `safety.js` or anything else, and do not widen the scope to fix it. Then continue.
- [ ] **Step 4: Commit** `git add docs && git commit -m "docs: audit typed ingredients in other languages"`.

---

### Task 8: Translate Home, Recipe, Liked and Community screens

**Files:**
- Modify: `screens/HomeScreen.jsx`, `screens/RecipeScreen.jsx`, `screens/LikedScreen.jsx`, `screens/SharedScreen.jsx`, `MainApp.jsx` (replace `ageLabel(...)` with `t('age.months', { count })`), `src/shared/units.js`, `i18n/*`
- Modify: `test/units.test.js` (remove the `ageLabel` import and its test; `ageLabel` is deleted since nothing else uses it)
- Test: `test/i18nScreens.test.jsx`, `test/units.test.js`

**Interfaces:**
- Produces: `formatAmount(grams: number, language: string = 'en'): string` in `src/shared/units.js`, formatting with `Intl.NumberFormat(language, { maximumFractionDigits: 2 })`: `formatAmount(250,'pt')` is `'250 g'`, `(1000,'es')` is `'1 kg'`, `(1500,'en')` is `'1.5 kg'`, `(1500,'de')` is `'1,5 kg'`, `(1234,'de')` is `'1,23 kg'`. Existing `formatAmount` tests with one argument keep passing.
- Keys:

| Key | English |
|---|---|
| `common.open` | Open |
| `common.openLabel` | Open {title} |
| `home.title` | What's in the fridge? |
| `home.babyAge` | Baby is {age} old. |
| `home.ingredient` | Ingredient |
| `home.ingredientNote` | Please type ingredients in English. (Final wording follows the Task 7 audit; shown only when the language is not English.) |
| `home.add` | Add |
| `home.remove` | Remove {name} |
| `home.suggest` | Suggest a recipe |
| `home.usage` | Recipes today: {used} of {limit} |
| `recipe.allergens` | Allergens: {list} |
| `recipe.ingredients` | Ingredients |
| `recipe.fewer` | Fewer portions |
| `recipe.more` | More portions |
| `recipe.portions` | `{one:'{count} portion', other:'{count} portions'}` |
| `recipe.notInList` | not in your list |
| `recipe.steps` | Steps |
| `recipe.liked` | Baby liked it |
| `recipe.disliked` | Baby didn't like it |
| `recipe.another` | Give me another |
| `liked.title` | Liked recipes |
| `liked.none` | No liked recipes yet. |
| `liked.notLiked` | Not liked |
| `liked.nothing` | Nothing here. |
| `liked.share` / `liked.shareLabel` | Share / Share {title} |
| `liked.unshare` / `liked.unshareLabel` | Unshare / Unshare {title} |
| `liked.remove` / `liked.removeLabel` | Remove / Remove {title} |
| `liked.restore` / `liked.restoreLabel` | Restore / Restore {title} |
| `shared.title` | Community recipes |
| `shared.none` | Nothing has been shared yet. |
| `shared.months` | {count} mo |
| `shared.likes` | `{one:'{count} like', other:'{count} likes'}` |
| `shared.mine` | Shared by you |
| `shared.like` / `shared.likeLabel` | Like / Like {title} |
| `shared.liked` | Liked |
| `group.All`, `group.Fish`, `group.Meat`, `group.Eggs`, `group.Vegetables`, `group.Fruit`, `group.Grains`, `group.Legumes`, `group.Cake`, `group.Soup`, `group.Other` | the same words in English |
| `allergen.peanut`, `allergen.tree nut`, `allergen.egg`, `allergen.milk`, `allergen.wheat`, `allergen.soy`, `allergen.fish`, `allergen.shellfish`, `allergen.sesame` | the same words in English |

`RecipeScreen` shows allergens as `t('recipe.allergens', { list })` where `list` joins each allergen's `t('allergen.'+name)` when `hasKey('allergen.'+name)` and the raw name otherwise, with `', '`. `SharedScreen` keeps comparing the English group names internally and shows `t('group.'+name)`. `HomeScreen` renders the note under the ingredient field only when `getLanguage() !== 'en'`. Existing aria-label text under `en` stays identical (`Remove banana`, `Open Banana mash`, …). `RecipeScreen` calls `formatAmount(i.grams, getLanguage())`.
- Pinned translations: `allergen.milk` de "Milch", `allergen.sesame` de "Sesam"; `group.Fish` de "Fisch", `group.Vegetables` de "Gemüse".

- [ ] **Step 1: Write the failing tests**
  - `test/units.test.js`: the five `formatAmount` expectations above.
  - `test/i18nScreens.test.jsx`: for each of `pt`, `es`, `de`: walk Home (with the menu closed), a recipe page, the liked page (with one liked and one disliked recipe), and the community page (seeded `shared` with groups Fruit and Fish), asserting `englishLeft(document.body, lang, ['home.', 'recipe.', 'liked.', 'shared.', 'group.', 'common.open'])` is `[]` on each; in `de` a recipe whose `allergens` are `['milk','sesame','lupin']` shows `Allergene: Milch, Sesam, lupin` (so pin `recipe.allergens` de "Allergene: {list}"); a recipe with a 1500 g ingredient shows `1,5 kg` in `de` and `1.5 kg` in `en`; the portions label reads `1 porción` / `2 porciones` in `es` (pin `recipe.portions` es accordingly); the community "Fruit" chip reads `Obst` in `de` while clicking it still filters; the note appears under the ingredient box in `de` and not in `en`.
  - Switching language while on the recipe page keeps the chosen portions (`3 portions` → click `Deutsch` → `3 Portionen`), and switching while typing keeps the ingredient field's value.
- [ ] **Step 2: Run to verify they fail** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: translate the recipe screens"`.

---

### Task 9: Translate the admin page

**Files:**
- Modify: `screens/AdminScreen.jsx`, `i18n/*`
- Test: `test/i18nAdmin.test.jsx`

**Interfaces:**
- Keys:

| Key | English |
|---|---|
| `admin.title` | Admin |
| `admin.notFound` | Not found |
| `admin.inviteSomeone` | Invite someone |
| `admin.inviteEmail` | Invite email |
| `admin.createInvite` | Create invite |
| `admin.invites` | Invites |
| `admin.people` | People |
| `admin.colEmail` / `admin.colStatus` / `admin.colCreated` / `admin.colJoined` / `admin.colLastLogin` / `admin.colRecipesToday` | Email / Status / Created / Joined / Last login / Recipes today |
| `admin.pending` | `{one:'Pending ({count} day left)', other:'Pending ({count} days left)'}` |
| `admin.used` / `admin.expired` / `admin.never` | Used / Expired / never |
| `admin.revoke` / `admin.revokeLabel` | Revoke / Revoke invite for {email} |
| `admin.inviteAgain` / `admin.inviteAgainLabel` | Invite again / Invite {email} again |
| `admin.resetPassword` / `admin.resetLabel` | Reset password / Reset password for {email} |
| `admin.remove` / `admin.removeLabel` | Remove / Remove {email} |
| `admin.removeTitle` | Remove this person? |
| `admin.removeBody` | Remove {email} and delete all their data? This cannot be undone. |
| `admin.removeConfirm` | Yes, remove |
| `admin.adminTag` | (admin) |
| `admin.inviteLink` / `admin.resetLink` | Invite link for {email} / Reset link for {email} |
| `admin.copy` / `admin.copied` | Copy / Copied |
| `admin.shownOnce` | Shown only once. Send it to {email} yourself. |
| `admin.usage` | {used} of {limit} |

The two `Table` `label` props use `admin.invites` and `admin.people`. Dates stay `iso.slice(0, 10)`. Under `en` the rendered text and accessible names are identical to today's.

- [ ] **Step 1: Write the failing test** `test/i18nAdmin.test.jsx`: using the setup of `test/admin.screen.test.jsx` (an admin user, an overview with one pending invite 3 days left, one used, one expired, and two people), for each of `pt`, `es`, `de`: `englishLeft(document.body, lang, ['admin.'])` is `[]`; in `de` the pending badge reads `Ausstehend (3 Tage übrig)` (pin `admin.pending` de `{one:'Ausstehend ({count} Tag übrig)', other:'Ausstehend ({count} Tage übrig)'}`) and 1 day left reads `Ausstehend (1 Tag übrig)`; a person who never logged in shows the translated `admin.never`; the remove dialog is translated.
- [ ] **Step 2: Run to verify it fails** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npm test`** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: translate the admin page"`.

---

### Task 10: End to end check, build and deploy

**Files:**
- Test: `test/languageFlow.test.jsx`
- Modify: `README.md` (only if it lists features: add the language switch in one line)

- [ ] **Step 1: Write the end to end test** `test/languageFlow.test.jsx` with the fake api: logged out, pick `Deutsch` (login heading is `Anmelden`), log in as a user whose `language` is `'pt'` (the page becomes Portuguese, `api.setLanguage` not called), open the menu and use the footer to pick `Español` (`api.setLanguage('es')` called, menu button reads `Menú`), log out (stays Spanish), reload the app tree from scratch with `localStorage` intact and see Spanish again.
- [ ] **Step 2: Run it** `npx vitest run test/languageFlow.test.jsx` → PASS (it is verification; if it fails, fix the cause in the owning task's code).
- [ ] **Step 3: Full verification** — `npm test` (all green) and `npm run build` (succeeds). Report both outputs, and the count of tests.
- [ ] **Step 4: Read the three non-English catalogs once end to end** for obvious mistakes (wrong word order around `{slots}`, formal/informal mixing, leftover English). Fix what you find.
- [ ] **Step 5: Commit** `git commit -m "test: cover the language switch end to end"`.
- [ ] **Step 6: Deploy** — use the `deploy-docker` skill so the container runs the new code, then open the app, switch through all four languages on the login page and, logged in, on the home, recipe, liked, community and menu views, and confirm the choice survives a reload and a second browser. Report anything that did not behave.
- [ ] **Step 7: Final report to the owner**: what shipped, the Task 7 audit finding in one paragraph, and the calls to check (Brazilian Portuguese, informal Spanish/German, the English-only ingredient note shown only in non-English languages).
