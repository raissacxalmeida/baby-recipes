# Translate recipes and typed ingredients

## Why

The language switch (`2026-10-20-language-switch-design.md`) translated the whole interface into English, Portuguese, Spanish and German, but left recipe content in English on purpose. A parent who switches to Portuguese now sees a Portuguese app around an English recipe: English title, ingredient names and steps. They also have to type ingredients in English. The owner wants both to follow the chosen language.

## Goals

- When the app is in Portuguese, Spanish or German, every recipe a parent sees shows its **title, ingredient names and steps** in that language. This covers a recipe just generated, a catalogue recipe (the 49 built-in ones and the stored AI ones), the parent's liked and disliked recipes, and the community (shared) recipes.
- Switching language changes recipes the parent already has, not only new ones. A recipe saved while the app was in English shows in Portuguese after the switch.
- The translating is done by OpenAI (the same service that already writes recipes).
- A recipe is translated the first time anyone opens it in a language that has no translation yet. The parent waits a moment (a second or two is accepted). The translation is then kept and shared by everyone who views that recipe in that language, so each recipe is translated at most once per language.
- **Typed ingredients are written in the language the app is showing.** They are turned into English before anything else looks at them. Matching against stored recipes, the safety checks, ingredient emoji and the "not in your list" mark keep working.
- A typed word the app cannot make sense of is **skipped**: the recipe is made without it, and no error is shown for that word.

## Non-goals

- Asking OpenAI to write the recipe in the user's language in the first place. Recipes are still created in English.
- Translating the labels that are already part of the interface: food groups, texture words, allergen names, "N months". They stay as they are.
- A language beyond the four, or review of the translations by native speakers (the owner shipped the interface translations without it and the same applies here).
- Translating the brand name or tagline.
- Letting a parent edit a translation.

## Anti-goals

- **Weakening any safety behaviour.** The safety checks (`checkSafety`), allergen detection (`detectAllergens`), the age checks, recipe matching and food grouping keep running on the **English** recipe and the **English** version of the typed ingredients. They must never run on, or be satisfied by, translated text. A translation must not be able to hide a problem the English recipe has.
- A dangerous typed word getting through because it was mistranslated. Skipping an unrecognised word is the safe direction (it is left out of the recipe). The design must not turn an unrecognised word into some other ingredient silently; if the model is not sure, it drops the word.
- A half-translated recipe **on the recipe screen**: a Portuguese title above English steps or ingredients. The recipe screen shows the whole recipe in the chosen language or the whole recipe in English. (Titles in the Liked, Shared and Home lists are translated separately; see decision 6. The recipe screen must use that same title translation, so a title never differs between the list and the recipe.)
- Charging the parent's daily recipe allowance, or changing the allowance rules, because of translation.
- Losing the English original. Saved and shared recipes keep their English data; a translation is something added next to it.

## Decisions made with the owner

1. OpenAI does the translating.
2. Translation happens on first view and is then stored; waiting for it is acceptable (no need for translations to be ready ahead of time).
3. Switching language re-shows existing recipes in the new language.
4. Typed ingredients are written in the app's language (this reverses decision 4 of the language-switch design, which kept typed ingredients English-only and showed a note; that note must be removed or reworded to match).
5. A typed word that cannot be understood is skipped, not reported.
6. **Titles are translated separately from the full recipe**, so the Liked, Shared and Home lists show every title in the chosen language right after a switch, without the parent opening each recipe first. The titles for a list are translated together in one batched call, stored on their own, and reused when the full recipe is translated. A parent may therefore see a recipe's title in Portuguese in a list and then wait a moment on the recipe screen for the steps and ingredients (the whole recipe screen still switches together, never partly).

## Constraints and what the code looks like

(From a read of the code on 2026-10-24.)

- A recipe is one JSON object: `id` (made from the English title in `presentRecipe`, `src/server/generate.js`), `title`, `basePortions`, `ingredients[{name, grams}]`, `steps[]`, `texture`, `allergens[]`. Ingredients also carry `inList` when served.
- It is stored in several places, each holding its own copy of the English text:
  - `catalogue_recipes` (`data`, `title_key` unique) — the 49 seed recipes (`src/server/seed/baby-recipes.json`, about 123 distinct ingredient names) plus every AI recipe saved by `saveToCatalogue`. Served to any parent by `findSuitable` before OpenAI is called (`src/server/recipeService.js`).
  - `recipes` (per user, `data`, `status` liked/disliked, `copied_from`) — what the browser sent when a parent liked or disliked a recipe (`src/server/userData.js`). Returned by `GET /api/state` as `liked` and `disliked`.
  - `shared_recipes` (`data`) — a snapshot of a liked recipe; returned by `listShared`.
  - `shown` (titles) — used to avoid showing the same recipe twice, and sent to the AI as titles not to reuse.
- English is also what logic reads: `safety.js`, `recipeMatch.js`, `ingredients.js` (an English plural rule), `recipeGroup.js`, `ingredientEmoji.js`, and `inList` in `presentRecipe`. The audit `2026-10-20-language-switch-ingredient-audit.md` lists exactly which step runs on typed text and which on the recipe, and names this project as the later fix.
- Typed ingredients go through `validateRequest` and `parseIngredientList` (`src/server/generate.js`, `src/shared/ingredients.js`), then to `findSuitable` and the model prompt, in `requestRecipe`. That is the one place typed words enter the server.
- Where recipes are shown on screen: `RecipeScreen`, `LikedScreen`, `SharedScreen`, `HomeScreen` (typed ingredient chips and emoji). Screen titles use `recipe.title` and `i.name` directly, and the interface text comes from `src/client/i18n/`.
- The language is known on the server: the user's saved `language` (set through `PUT /api/language`) and the language the browser is showing. `Accept`-style handling for logged-out visitors is already in place from the language-switch work. Recipes need a logged-in user, so the saved language is available on those requests.
- OpenAI is called through `callModel` in `src/server/openai.js` (model `gpt-4o-mini`, JSON schema output, 30 s timeout, error codes `missing-key`, `upstream-error`). Daily limits live in `src/server/usage.js` (`reserveRecipe`, `reserveCall`).
- Tests are Vitest with `pglite` standing in for Postgres. Schema changes are hand-written migrations in `src/server/migrations.js`.
- The Docker container must be rebuilt after the work (the `deploy-docker` skill).

## My calls (for the owner to check)

- **Where translations live:** in a store separate from the English recipe data, keyed so that a catalogue recipe, a liked copy and a shared copy of the same English recipe use the same translation. The recipe's English `id` or a hash of its English text are the obvious keys; the builder chooses.
- **Translation key:** a hash of the English recipe text (title, ingredient names, steps), not the recipe `id`. The liked copy a browser sends is client-supplied, so keying by `id` would let a tampered copy put wrong text into the shared translations.
- **Typed ingredients:** the browser sends the language it is showing with the recipe request. Quota and refund handling for the typed-ingredient translation call follows the existing upstream-error path in `requestRecipe`.
- **Fallback:** if the translation fails (OpenAI unreachable, timeout, bad output, or the English recipe is not recognisable), the parent sees the English recipe, with no error. Nothing is stored for a failed translation, so the next view tries again.
- **Translation does not use the parent's daily allowance.** Because each recipe is translated at most once per language and the result is shared, the cost is bounded by the number of recipes. The builder should still make sure a burst of opens cannot run up unbounded calls: a list's titles are one batched call (decision 6), and full recipes are translated one per open, never the whole list at once.
- **What is translated:** title, each ingredient name, and each step. Amounts, texture, allergen list and the `id` are not translated.
- **Translated text is never stored back into `recipes`, `shared_recipes` or the catalogue's English `data`,** and is never sent to the safety checks, matching, or the `shown` list.
- **Typed ingredients:** one OpenAI call turns the typed list into English names, dropping words it cannot place. When the app is in English the call is skipped and behaviour is exactly as today. If the call fails, the request fails with the existing upstream-error message rather than going ahead with untranslated words (the safety checks would not understand them).
- **After translation, an empty list** gives the existing "add at least one ingredient" message.
- **The "type in English" note** near the ingredient box is removed or changed so it no longer tells parents to type in English.

## Left to the builder

- The storage design for translations (a table keyed by recipe and language, or another shape), the migration, and how a client asks for a recipe in a language (a new endpoint, a language parameter on the existing ones, or translating inside the server's responses).
- How the browser handles the wait: showing the English text first and swapping when ready, or a short loading state. The anti-goal above (no half-translated recipe) applies either way.
- The OpenAI prompt and output schema for both translations, and how a translation is checked for the right shape (same number of ingredients and steps as the English recipe).
- How the batched title translation is shaped: its own store and key, how big a batch may be (the Liked and Shared lists have no fixed size), and what a list shows for a title whose batch call fails (my call: the English title, with no error).
- The `ingredientEmoji` and `inList` behaviour for typed words once they are English.
- Tests: translation is stored and reused, a failed translation falls back to English, the safety checks still run on English, non-English typed words are matched after translation, and a skipped word does not appear in the recipe.
