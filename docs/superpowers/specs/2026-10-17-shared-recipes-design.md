# Shared recipes page: design

Extends `2026-10-15-accounts-sync-design.md`. Same app, same accounts, same look as `2026-10-17-ui-modernization-design.md`. "My call" marks a decision the author did not make; everything else was decided by the author in conversation.

## Intent

Parents who use the app want inspiration. A recipe the baby liked is worth passing on, and seeing what other babies liked gives ideas for what to cook next. Today the only place a liked recipe lives is the parent's own Liked list. This adds a page where parents browse recipes other parents chose to share, grouped by kind of food, and a way to share and unshare from the Liked page.

## Users

The same small, invited group as the rest of the app (single digits to low dozens of accounts). Everyone who can log in can see the shared page and share. Not a public site.

## Behaviour

1. **Sharing.** On the Liked page, each liked recipe has a Share button. After it is shared the button reads Unshare. Clicking Unshare removes the recipe from the shared page at once (no confirmation: it is easy to share again, my call). Only a recipe in the parent's own Liked list can be shared; the server takes the recipe from the parent's saved copy, never from what the browser sends.
2. **What other parents see.** The recipe (title, ingredients, steps, allergens) and the baby's age in months at the moment it was shared. Nothing else: no name, no email, no avatar. The age is a snapshot and does not grow as the baby does (my call). The server never returns who shared a recipe.
3. **The page.** A new screen, "Community recipes" (the author named it), opened from a button on the home screen next to the existing Liked button. Layout A, chosen by the author: a row of group chips at the top (All first, then one chip per group that currently has recipes; no empty groups), and below it one list of recipe cards. Tapping a chip filters the list. Each card shows the title, the group, the baby's age (for example "8 mo") and a like button with a count. Empty state: a plain note that nothing has been shared yet. Back goes to the home screen.
4. **Order (my call).** Most liked first, then newest first. No search and no paging; the whole list is returned (the group is small).
5. **Opening a recipe (my call).** Tapping a card opens the full recipe on the existing recipe screen (portion scaling included), without the "baby liked it / didn't like it / another" buttons, as the Liked page's Open does today. Back returns to the shared page with the same group still selected.
6. **Liking someone else's recipe.** The like button saves a copy of the recipe into the liking parent's own Liked list and adds one to the count (my call: this is what the author's "they can like it" means; the count is the number of parents who liked it). Tapping again takes the like back: the count drops and the copy leaves that parent's Liked list (my call). Removing that recipe from the Liked page does the same. A parent cannot like their own shared recipe: their card shows a "Shared by you" badge and the count, with no like button (my call).
7. **Groups.** Assigned by the server at the moment of sharing and stored with the shared recipe (my call). The parent never picks. Rule, decided by the author: if the recipe is a kind of dish such as a cake or a soup, it goes in that dish group; otherwise it goes in the group of its main ingredient.
   - **Dish groups (my call on the exact words):** Cake (title contains cake, muffin, cupcake), Soup (soup, broth, stew). Checked against the title first, whole words, case-insensitive.
   - **Main ingredient (my call):** Fish and Meat win whenever any ingredient is fish or meat, however little of it there is, because "salmon and sweet potato" is a fish dish. Otherwise the heaviest ingredient by grams decides, ignoring water, oil, butter and salt. Ingredient groups: Fish, Meat, Eggs, Vegetables, Fruit, Grains (rice, oats, pasta, bread), Legumes (beans, lentils, peas, chickpeas). Anything that matches nothing goes in Other.
   - Ingredient names are matched with the existing ingredient normalisation (`src/shared/ingredients.js`), so plurals and extra words work. The keyword lists live in one shared file with tests that pin concrete examples (banana oat cake is Cake, salmon with sweet potato is Fish, chicken with carrot is Meat, lentil stew is Soup, banana with oats is Fruit).
   - Each group has an emoji for its chip and card (my call): Fish 🐟, Meat 🍗, Eggs 🥚, Vegetables 🥕, Fruit 🍎, Grains 🍚, Legumes 🫘, Cake 🍰, Soup 🍲, Other 🥣.
8. **Unsharing and leaving.** Unsharing removes the recipe and its likes from the page and the counts. Parents who already liked it keep their saved copy (author's decision). Removing a recipe from your Liked list also unshares it (my call). Deleting an account, or the admin removing a person, removes everything that person shared and every like they gave.
9. **Recipes saved from the shared page cannot be shared again** (my call), so the same recipe never appears twice. The Liked page shows no Share button on them. The builder chooses how to mark them.
10. **Same-title clash (my call).** Recipe ids are made from the title, so two parents can hold different recipes with the same id. A shared recipe is therefore identified by who shared it plus the id. If a parent who likes a shared recipe already has a recipe with that id in their Liked list, their own is kept and no copy is made; the like still counts.
    - **Ties and units (my call):** if a title matches both a Cake word and a Soup word, Cake wins. Ingredient weights are the recipe's `grams` field, which is always grams, so there are no other units to convert.
    - **Chip order (my call):** fixed, not by popularity: All, Fish, Meat, Eggs, Vegetables, Fruit, Grains, Legumes, Cake, Soup, Other (only those that have recipes).
11. **Identifying a shared recipe (my call).** Each shared recipe gets its own opaque id when shared, and the browser uses only that id to like, open or unshare it. It reveals nothing about who shared it.
12. **Saved copies and unliking (my call).** Taking back a like, or removing a recipe from the Liked page, must only ever delete a recipe that was saved from the shared page. In the same-id clash case from item 10 no copy was made, so the parent's own recipe is never deleted by un-liking.
13. **No age filter (my call).** The page shows every shared recipe whatever the viewer's baby's age; the age badge is how a parent judges fit. No new daily limits: sharing and liking cost no OpenAI calls.

## Non-goals and anti-goals

- No names, photos, comments, replies, reports, search, following, or editing a shared recipe. It must never feel like a social network.
- No way to find out who shared a recipe, from the screen or from the API.
- Not a place for free text: parents cannot write or change a recipe when sharing.
- No admin tooling for shared recipes in this version; the admin removes a person to remove everything they shared (my call).

## Constraints

- English UI, plain parent-friendly wording, emoji only inside `<Emoji>`.
- Follow the `add-screen` skill (`.claude/skills/add-screen/SKILL.md`) for the new screen and the existing patterns for routes (`src/server/routes/data.js`), data (`src/server/userData.js`), migrations (`src/server/migrations.js`: append a new migration; add new tables to `APP_TABLES` so test resets and backups see them), API client (`src/client/api.js`) and wiring (`src/client/MainApp.jsx`, new behaviour added as optional props so existing renders keep working).
- All new endpoints require a logged-in user. Shared recipe text is rendered as plain text, never HTML, and long unbroken titles wrap at 375px.
- Accepted risk (my call): the existing like endpoint accepts any well-formed recipe from the browser, so an invited parent could craft a recipe and share it. For an invite-only group this is accepted; the shared page adds no new way to inject markup.
- Tests are written first; the full suite, `npm run build` and a 375px check pass; the app container is rebuilt with the `deploy-docker` skill when done.

## Left to the builder

Table and column design, endpoint names, how recipes saved from the shared page are marked, how counts are computed, the exact keyword lists beyond the examples above, and the screen's internal structure.
