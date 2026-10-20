# Language switch: English, Portuguese, Spanish, German

## Why

The site is English only. Every user, whether logged in or not, should be able to pick a language at any time and have the site's content change to it. This replaces the line "The site is for English readers" in the branding design (`2026-10-20-tiny-pantry-branding-design.md`).

## Goals

- A language switch offering **English, Portuguese, Spanish and German**, available to every visitor on every page, logged in or out.
- Choosing a language changes the whole interface immediately, with no page reload.
- All text we write ourselves is translated: screens, buttons, labels, dialogs, notices, the footer note, and the error messages the server sends.
- The fixed labels that recipes use are part of the interface and are translated: food groups (Fish, Meat and so on), texture words, allergen names, and age wording ("N months").
- The chosen language is saved on the user's account and follows them across devices.

## Non-goals

- **Recipe content is not translated in this project.** Recipe titles, ingredient names and steps, whether built-in (the 49 seeded recipes), AI-generated, saved or shared, stay in English. A German user sees a German app around English recipes. The owner accepted this for a first version. Translating recipe content is a later, separate project.
- The AI is not asked to write recipes in the user's language.
- Right-to-left languages, and any language beyond the four.
- Translating the brand name "Tiny Pantry" or its tagline.

## Anti-goals (what would make this a failure even if it works)

- Weakening any safety behaviour. Allergen detection, the too-young check and the honey/salt style checks work on English words in recipe data and must keep working exactly as they do now. Nothing may make them run on, or be bypassed by, non-English text. See "Known risk" below.
- A language that is half-switched: some screens, dialogs or error messages left in English while the rest changed (other than recipe content, which is expected to stay English).
- Translation text that reads as obviously machine-built, such as sentences assembled from fragments that are wrong in another language ("Baby is {age} old").

## Decisions made with the owner

1. The switch is a row of language names in the **footer** (`src/client/App.jsx`, the existing footer shown on every page), with the current language shown in bold, for example: **English** · Português · Español · Deutsch. It is not in the menu and not a header button.
2. The choice is **saved on the user's account**. **When a logged-out visitor has chosen a language and then logs in, the language saved on the account wins** and the interface switches to it.
3. Recipes may stay in English at first (see non-goals).
4. **Typed ingredients stay English-only for now.** Matching, the built-in recipe search, ingredient emoji and the safety checks are not changed to understand other languages. Instead, a short note near the "What's in the fridge?" ingredient box tells the user, in their language, to type ingredients in English. The safety logic is untouched.
5. **Ship the translations without waiting for native-speaker review.** All four languages go live together once built and tested. No per-language hiding is needed. The owner may have the text reviewed after release; keep the text easy to correct (one place per language, no strings scattered in code).

## Behaviour (my calls, for the owner to check)

- **First visit, logged out:** start in the browser's language if it is one of the four, otherwise English. Picking a language while logged out is remembered in that browser.
- **Existing accounts have no saved language.** After their next login, they keep whichever language the interface is showing, and that is saved to the account then. This includes a language the visitor explicitly picked in the footer before logging in: an explicit pick is never silently switched back. (My call.)
- **New accounts** (invite signup) save the language showing on the signup page.
- **Logged in:** choosing a language saves it to the account straight away. If the save fails, the interface still switches and the user is not shown an error.
- **The footer is rendered on every page already**, so the switch is one small component there. Keep it easy to reach on long screens, but do not make it sticky unless that looks fine.
- **Page language tag:** `<html lang>` follows the chosen language (it is hard-coded `en` in `index.html`).
- **Brand and tagline:** the name stays "Tiny Pantry" in every language and the page title stays "Tiny Pantry". The tagline "recipes for little eaters" also stays in English in every language, as the owner decided, so `Logo.jsx` needs no change.
- **Numbers:** amounts follow the language's decimal mark (`1,2 kg` in Portuguese, Spanish and German, `1.2 kg` in English). Dates shown in the admin page stay in the ISO form they use now.
- **Plurals and sentences:** all counted wording ("1 portion" / "N portions", "N likes", "Pending (N days left)", ages) and all sentences with a value in them (email addresses, ages, times) are translated as whole sentences with the value as a slot, never built from pieces. German, Spanish and Portuguese have different plural and word-order needs from English.
- **Translations:** I (Claude) will write the Portuguese, Spanish and German text. The owner decided to ship without native-speaker review (decision 5); a review afterwards is welcome.

## Constraints and what the current code looks like

(From a read of the code on 2026-10-20.)

- **Stack:** React 18 with Vite, no router (screens are state in `MainApp.jsx`), a plain Node `http` server with routes in `src/server/routes/`, Postgres through `pg` with hand-written migrations in `src/server/migrations.js`. Tests are Vitest, with `pglite` standing in for Postgres.
- **Interface text** is about 150–200 literal strings across about 15 client files (`App.jsx`, `MainApp.jsx`, `components/Menu.jsx`, `components/Logo.jsx`, `components/ui/confirm-dialog.jsx`, and everything in `screens/`). It includes `aria-label`s and strings built with values in them. There is no i18n library or setup today.
- **Server messages:** the server returns `{error: code, message}` and the client shows `message` as is. Many different messages share one code (`invalid-input`, `conflict`, `not-found`), so the code alone cannot pick a translation. Messages come from `users.js`, `sessions.js`, `server.js`, `generate.js`, `recipeService.js`, `sharedRecipes.js`, `userData.js`, `routes/data.js` and `openai.js`, and a few from `src/shared/age.js`, which is used by both client and server. Some contain values (a password length, a reset time).
- **Account:** the `users` table has no language column. The session endpoint returns only `{email, isAdmin}` (`routes/auth.js`, `publicUser`). Birthday is the only per-user setting today and is saved by `PUT /api/birthdate`, which is the pattern to follow.
- **Labels from fixed lists** live in code: `GROUPS` in `src/shared/recipeGroup.js` (the names are used both as display text and as stored keys, so the key and the label must be separated), texture values, and the allergen names in `safety.js`.
- **Tests:** about 25 test files check exact English text and aria-labels (including the brand and tagline in `test/branding.test.js` and `test/logo.test.jsx`). They must keep passing, either by rendering in English by default or by being updated.
- **No emails are sent.** Invite and reset links are shown to the admin to pass on by hand, so there is no text to translate outside the web app. Server messages are always a reply to a request, so the language to use is the request's or the logged-in user's saved one (builder's choice).
- **Deploy:** the Docker container must be rebuilt after the work (the `deploy-docker` skill).

## Known risk the builder must check

Users will type ingredients into the "What's in the fridge?" box. Safety logic and ingredient matching use English keyword lists (`safety.js`, `recipeMatch.js`, `ingredients.js`, `ingredientEmoji.js`). A German user might type "Honig" or a Portuguese user "mel". The owner decided (decision 4) not to change this logic now and to show an "type ingredients in English" note instead. Typed ingredients go to the AI as written, and the safety checks run on the generated English recipe. The builder should still look at which checks run on **user-typed** text rather than on the generated recipe, and write down in the plan what happens to a non-English word, so the note's wording is accurate. If a check would silently pass a dangerous non-English ingredient *and* the generated recipe would not catch it, report that to the owner in the final summary; do not widen the scope to fix it.

## Left to the builder

- The translation mechanism: an established library (i18next or similar) or a small purpose-built one. Prefer what fits a small codebase with no router.
- How the server's messages become translated text: finer-grained codes, message keys with values, or the server replying in the request's language. The requirement is that every server error a user can see ends up in their language, including those with values in them, and that logs and tests can still rely on stable codes.
- File layout for the four languages, and how missing text falls back (to English, never to a blank or a raw key).
- Whether to add a test that every key exists in all four languages.
- The exact API for saving the language, following the birthday route.
