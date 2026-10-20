# Language switch: what happens to ingredients typed in another language

Audit for task 7 of the language switch plan. Nothing in the code was changed.

## Finding for the owner

**There is a gap.** If a parent types an ingredient in German, Portuguese or Spanish, nothing checks the typed word itself, and the safety checks only know English words. The one thing that usually saves it is that the AI is asked to write the recipe in English, so a typed "Honig" most likely comes back as "honey" and is caught. If the AI keeps the foreign word in the recipe ("Honig", "mel", "miel"), then no check recognises it and the recipe is shown. Allergens have the same limit: they come from the AI's own list plus English keywords. This was not widened or fixed, as agreed; typed ingredients stay English-only and the app tells non-English users to type them in English.

## What runs on typed text and what runs on the recipe

| Step | Runs on | A non-English word such as "Honig" |
|---|---|---|
| `parseIngredientList` ([ingredients.js](../../../src/shared/ingredients.js)) | typed text | Lower-cased, split on spaces, and an English plural rule strips a trailing "s" (`huevos` becomes `huevo`). Nothing else. |
| `validateRequest` ([generate.js](../../../src/server/generate.js)) | typed text | Checks only the number of items (30) and their length (50). No safety check. |
| Catalogue search: `findSuitable` and `matchRecipe` ([catalogue.js](../../../src/server/catalogue.js), [recipeMatch.js](../../../src/shared/recipeMatch.js)) | typed text against the English catalogue | A catalogue recipe is chosen only if every main ingredient of it is covered by a typed word. "Kartoffel" covers nothing, so no stored recipe matches and the request goes to the AI. A non-English word cannot pick a wrong stored recipe. Every stored recipe has already passed `checkSafety`. |
| The AI prompt ([openai.js](../../../src/server/openai.js)) | typed text | The typed words are passed as written ("Mainly use these ingredients: honig"). The prompt asks for the recipe in English and says never to use honey, salt, sugar or cow's milk under 12 months. |
| `checkSafety` ([safety.js](../../../src/server/safety.js)) | the generated recipe (title, ingredient names, steps) | Matches English words only. "honey" is caught and the recipe is thrown away and retried (and after the attempts run out the parent gets "Could not make a safe recipe"). "honig" is not caught. |
| `detectAllergens` ([safety.js](../../../src/server/safety.js)) | the generated recipe's ingredient names plus the AI's own allergen list | English keywords only (`peanut`, `milk`, `egg`...). A foreign ingredient name adds no allergen unless the AI lists it. |
| `presentRecipe` / `isListed`, ingredient emoji | typed text against the recipe | A recipe ingredient "potato" never matches a typed "Kartoffel", so every ingredient is marked "not in your list" and gets the default emoji. This is cosmetic. |

## What this means for the app

- English typed words behave exactly as before.
- Non-English typed words never choose a stored recipe, so they are always answered by the AI.
- The safety outcome depends on the AI writing English ingredient names. That holds in the normal case; it is not guaranteed.
- The note near the ingredient box in non-English languages should say that matching and safety checks only understand English, not just "please type in English". Wording used: "Please type ingredients in English. Recipe matching and safety checks only understand English."

## For a later project, not this one

Translating what is typed into English before any check (or adding word lists for the three languages to `safety.js`) would close the gap. It would also make matching, emoji and the "not in your list" mark work.
