# Multiple babies in one account

## Intent

Today one account is one baby: the birthdate is a column on the user, and the liked and disliked recipes, the list of already-shown recipes and the recipe suggestions all hang off that user. A parent with two or more babies (twins, siblings close in age) has no way to get recipes that fit each of them. They would need one account per baby.

The owner wants one account to hold several babies. The parent looks after one baby at a time and can switch between them. Everything the app does for a baby (suggesting recipes for their age, remembering what they liked and disliked) is kept separately for each baby.

## Goals

- An account holds one or more babies. Each baby has a name and a birthdate.
- The app shows **one baby at a time**. Every page looks as it does today, for the baby currently selected. There is no screen that shows two babies at once.
- The parent can switch to another baby from the menu.
- The menu is split into pages for a baby and pages for everyone:
  - Per baby: the suggestion page and Liked recipes.
  - For everyone: Community and Admin (Admin only for the admin, as now).
- The suggestion page (called "Home" in the menu today) is renamed **"Recipe ideas"**.
- A parent can add a baby, edit a baby's name and birthdate, and remove a baby.
- Existing accounts keep working with nothing lost: their current baby becomes the first baby, with the liked and disliked recipes attached.

## Non-goals

- Showing or comparing several babies on one screen.
- A daily limit per baby. The limit stays per account (see decisions).
- Several parents or caregivers on one baby, or moving a baby between accounts.
- Photos, avatars, weight, allergies or any other baby profile data beyond name and birthdate.
- Changing how recipes are generated, matched, translated or checked for safety, other than reading the selected baby's age.
- Changing the login, invites, password reset or admin features.

## Anti-goals (a failure even if it works)

- Any existing account loses a liked or disliked recipe, a shared recipe or its birthdate in the migration.
- A second baby doubles the cost of the OpenAI calls (the shared limit must hold).
- A recipe disliked for one baby hides it from, or blocks it for, another baby.
- One baby's data shows up under another baby, for example after switching quickly.

## Constraints

- **It is a live database with real data.** The change needs a migration that moves each user's birthdate and recipes onto a first baby, safely and exactly once. The deploy-docker skill takes a backup when `src/server/` changes; this change must go through it.
- **Four languages.** Every new piece of text exists in English, Portuguese, Spanish and German (`src/client/i18n/*`), including new error messages (`err.*` keys). There are tests that check the catalogs and the error keys.
- **TypeScript, strict.** The project was just moved to TypeScript. New API shapes are typed in `src/shared` or `src/client/apiTypes.ts` like the existing ones.
- **The data model today** (`src/server/migrations.ts`):
  - `users.birthdate`.
  - `recipes` keyed by `(user_id, id)` with status liked or disliked and `copied_from`.
  - `shown` keyed by `(user_id, title)`, capped at 50 titles, used to avoid suggesting the same recipe twice.
  - `usage` keyed by `(user_id, day)`.
  - `shared_recipes` with a unique `(user_id, recipe_id)` and `baby_months`, taken from the user's birthdate when the recipe is shared.
  - `shared_likes`, one row per user per shared recipe.
- **Code that reads the birthdate directly** and must change to read the selected baby's: `getState` and `setBirthdate` in `userData.ts`, `requestRecipe` in `recipeService.ts`, `shareRecipe` in `sharedRecipes.ts`, and the routes in `routes/data.ts`.
- Work happens on branch `BR-6` and is not pushed by this work.

## What was decided with the owner

- **One baby at a time**, with the same pages as today.
- **The menu** lists each baby as a header with that baby's own pages underneath (Recipe ideas, Liked recipes), then a "for everyone" group with Community and Admin. The owner picked this layout (option C in the mockup) over a switcher at the top of the menu and a baby button in the header. Tapping a page under a baby switches to that baby and opens that page. The current baby is marked.
- **New name for the suggestion page: "Recipe ideas".** Picked by the owner from five suggestions. The translations are my call (below).
- **Per baby:** birthdate (and so age and the "too young" check), liked and disliked recipes, and the already-shown list.
- **Per account:** the daily limit (one shared pool for all babies, as today: 10 newly generated recipes and 30 model calls a day), the language, the login, and which Community recipes the parent has liked.
- **Removing a baby**, after a confirmation:
  - Their liked and disliked lists and their shown list are deleted.
  - Recipes they shared to the community that **no one else liked** are deleted.
  - Recipes they shared that **other parents liked** stay in the community.
  - Recipes other parents saved from the community into their own lists are unaffected, as today.
- **Adding a baby:** an "Add a baby" entry in the menu opens a screen asking for a name and a birthdate. A baby under 6 months is still added and sees the "too young" page, as today.
- **Existing accounts:** the current birthdate becomes the first baby. The parent is asked for a name the next time they open the app. The liked and disliked lists move onto that baby untouched.

## My calls (not discussed in detail with the owner; they can overrule these)

- Names need not be unique within an account, so twins work. A name is required, with a maximum length the builder picks (about 30 characters).
- A cap of **5 babies per account**, to keep the menu usable.
- The **last remaining baby cannot be removed**. The parent can use the existing "Delete account" instead.
- The app **reopens on the baby used last**. If that baby no longer exists, it opens on the first baby.
- A Community recipe the parent likes is saved into the **currently selected baby's** list. Liking is account-wide, so the heart shows as liked whichever baby is selected. Unliking removes the saved copy from whichever baby's list it was saved into.
- A recipe a baby shares to the community records that baby's age in months at that moment (`baby_months`), taken from that baby's birthdate.
- Translations of the new menu text: "Recipe ideas" / "Ideias de receitas" / "Ideas de recetas" / "Rezeptideen". The group headings ("For {name}", "For everyone") are for the builder to word in all four languages.
- The migration is a new numbered entry in `MIGRATIONS`, following the existing pattern. `APP_TABLES` is updated for any new table.
- The name field for an existing account's first baby is allowed to be empty in the database until the parent fills it in, and the app shows a name prompt in that case. (The builder may choose a different way to get the same behaviour.)
- An existing account that never set a birthdate gets **no baby** from the migration. An account with no babies (this one, and every new signup) lands on the add-a-baby screen, which is today's birthday setup screen with a name field. So "no babies" is a state the app handles, not an error.
- Removing a baby also removes the Community likes behind the copies saved in that baby's list, the same way unliking a single recipe does today. Otherwise the Community heart would show as liked with no recipe saved anywhere.
- If two babies in one account both liked the same recipe, and one of them shares it, the account has one shared entry for that recipe (the existing uniqueness on user and recipe). Sharing it again from the other baby changes nothing. Removing the baby who shared it removes the entry under the rule above, even if the other baby still likes the recipe.
- The "too young" page's "change birthday" button edits the selected baby's birthdate.
- Deleting the account removes all its babies and their data, as it removes the user's data today.

## Left to the builder

- The table design: a `babies` table with a user reference, name and birthdate, and how `recipes`, `shown` and `shared_recipes` point to a baby. Whether `users.birthdate` is dropped or left unused.
- How a shared recipe is tied to a baby, and what happens to that link when the baby is removed but the recipe stays in the community.
- How the browser says which baby a request is for (for example a baby id on each request), how the server remembers the last baby used, and how races such as switching babies while a request is in flight are avoided.
- The API routes and response shapes for listing, adding, editing, removing and selecting a baby, and how `/api/state` changes.
- Where "Edit baby" lives in the interface, and how the menu behaves with up to five babies (for example, showing the pages only under the current baby and collapsing the others).
- The add-baby and name-prompt screens, built on the existing setup screen.
- Tests and the order of work, including a migration test on a database that holds an existing user with recipes, shown titles and a shared recipe.
