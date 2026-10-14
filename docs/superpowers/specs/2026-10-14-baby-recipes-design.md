# Baby-friendly recipe website: design

## Intent

A personal website for one parent. The parent tells the site the baby's birthday once. Each time they cook, they type the ingredients they have and get one recipe that suits the baby's age. They can reject a recipe and get another, change the number of portions, and record whether the baby liked the food. They can look back at everything the baby liked.

Why: deciding what to cook for a baby from whatever is in the fridge is tiring, and age-appropriate food (textures, forbidden foods) is easy to get wrong.

## Users

One person (the author), on their laptop only (decided by the author). No other parents, no accounts, no sharing, no phone use.

## Flow

1. **First visit.** Enter the baby's birthday. It is stored in the browser. The site shows the age in months (for example "8 months").
2. **Home.** Input where the parent adds ingredients one at a time (chips, removable). A "Suggest a recipe" button.
3. **Recipe.** Shows one recipe: title, ingredient list, steps, and a portions control (minus / plus).
   - Quantities are in grams and kilograms only (no cups, spoons, ounces or ml). Use g below 1000, kg from 1000 up. Liquids are given in g (my call: 1 ml is treated as 1 g).
   - Changing portions recalculates every quantity in the app, without calling the AI.
   - Recipe may use ingredients the parent did not list (oil, water, spices). Those are marked as "not in your list" so the parent knows what to buy.
   - "Give me another" asks for a different recipe from the same ingredients and does not repeat ones already shown or disliked.
4. **After feeding.** Two buttons: "Baby liked it" and "Baby didn't like it". Liked recipes go to a **Liked recipes** page. Disliked recipes are never suggested again (my call). Only the recipe is hidden, not its ingredients, and a disliked recipe can be restored from a small list (my call, because babies often accept a food on a later try).
5. **Liked recipes page.** List of saved recipes. Opening one shows the same recipe view with the portions control. Opening it does not call the AI.

## How it is made (my calls, not agreed with the author unless stated)

- **AI provider: OpenAI (ChatGPT API).** Decided by the author: they have an OpenAI API key.
- **Hybrid approach.** The AI writes the recipe as structured data (title, ingredients with amounts in grams for a base number of portions, steps). The app validates the structure and applies baby-safety rules for the baby's age before showing it. If a recipe fails the rules, the app asks the AI again.
- **Project location (decided by the author):** a new folder, separate from the `receitas` folder, which holds the unrelated "One Little Bite" board book. Suggested path: `/Users/raissaalmeida/Documents/projects/baby-recipes` (my call). This design file should move into the new project when it is created. The board book is not touched.
- **Language (decided by the author):** English for the interface, the recipes and the safety word lists.
- **Server.** A small server holds the API key and relays requests. It runs on the author's laptop and listens on localhost only (decided: laptop use). The key never reaches the browser and is not committed to git. No hosting, no login, no rate limiting needed beyond a simple retry cap.
- **Different devices.** Browser storage is per browser, so the laptop's liked recipes are not shared with any other device. Accepted (sync is a non-goal).
- **Storage.** The browser's local storage holds the birthday, liked recipes, disliked recipes and recently shown recipes. No database server.
- **Stack.** Left to the builder. Suggested (my call): Node.js 20+ with the built-in `node:test`, no framework unless needed.
- **Safety enforcement (my call).** The app is authoritative. It scans ingredient names and steps for forbidden foods by keyword (singular and plural, lowercase) for the baby's age. The AI also returns allergen and texture tags, used only as an extra check, never as the only one.
- **Failures (my call).** If a recipe fails the rules, the app asks the AI again up to 3 times, then shows an error message and the parent can try again. Failed attempts are not counted as shown recipes.
- **Extra ingredients (my call).** Salt, sugar and honey are never allowed under 12 months, even as extras. Matching between the typed list and recipe ingredients ignores case and plurals; anything not matched is marked "not in your list".

## Safety rules (starting list, builder to check against current pediatric guidance)

- Under 12 months: no honey, no cow's milk as a drink, no added salt or sugar.
- Under 6 months: the site says solid foods are normally started around 6 months and does not suggest recipes or call the AI (my call). A birthday in the future is rejected.
- No whole nuts, whole grapes, popcorn or hard raw pieces for young children; textures match age (purée, mashed, soft finger food).
- Common allergens are flagged when present.
- The page shows a short note that this is not medical advice.

## Goals

- One recipe per request, fast, with exact gram/kg amounts.
- Portion changes are instant and exact.
- Baby safety rules enforced by the app, not only requested from the AI.
- Easy to run on the author's own machine.

## Non-goals

- Multiple users, accounts, logins, sync between devices.
- A database of fixed recipes. Liked recipes are saved copies, not a curated catalogue.
- Meal planning, shopping lists, nutrition calculation.
- Photos or images.

## Anti-goals

- A recipe containing a food that is unsafe for the baby's age, shown without a warning.
- Amounts in units other than g/kg.
- Spending API credits when nothing needs the AI (portion change, viewing liked recipes).
- The API key visible in the browser or in git.

## Constraints

- Quantities in kg and grams.
- Personal use, so cost should be a few cents per recipe at most.
- No login.

## Left to the builder

- Choice of web framework (or none), model name, prompt wording, exact validation schema, visual styling, file layout.

## Open points

None.