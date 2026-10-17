# UI modernization (shadcn/ui) — design

## Intent

The site works but looks unfinished: components sit on top of each other with no consistent spacing, and nothing is styled beyond bare browser elements. The goal is a warm, playful-but-clean look that feels pleasant to use on a phone, built on shadcn/ui so spacing, focus states and dialogs come from one consistent system instead of ad-hoc CSS.

Success: every screen uses the same spacing scale, cards, buttons, chips and dialogs; nothing looks cramped; it is comfortable on a phone; existing behaviour and tests keep working.

## Decided with the user

- **Look: "A, warm and cozy"** (chosen from three mockups). Mockups are in `.superpowers/brainstorm/*/content/visual-style.html` and `direction-a-recipe.html` (local, git-ignored; the values below are the source of truth).
  - The mockup files are committed in `docs/superpowers/specs/2026-10-17-ui-modernization-mockups/` and are the reference for anything this document doesn't state (shadows, chip colours, hover shades, recipe-page layout). Where the two disagree, the mockups win on look, this document wins on behaviour.
  - Keep the current cream page background; peach/orange as the accent.
  - White cards, soft warm shadow, large rounded corners (about 18px on cards, about 14px on controls), pill-shaped chips and badges.
  - Primary button: solid orange (`#f08a3c`) with a slightly darker bottom edge. Secondary: white with a warm outline. Destructive: red (`#d9482b`).
  - Emoji on buttons and ingredients for the playful feel (e.g. "✨ Suggest a recipe", "♡ Liked recipes", "👍 Liked", "👎 Nope", "🔄 Another").
  - Generous, uniform gaps between every card, field and button.
- **Recipe page:** allergen warning as a soft highlighted note; portion stepper as round −/+ buttons; ingredient rows in a card with dividers; numbered circles for steps; "not in your list" as a small badge; Liked / Didn't like / Another as a three-button row.
- **Destructive actions:** replace `window.confirm` (account bar delete-account, admin Remove) with proper confirmation dialogs (shadcn AlertDialog) with a red confirm button.
- **Use shadcn/ui**, as the user asked.

## Decided by me (user can override)

- **Scope: every screen**, including login, sign-up, reset, setup, too-young, home, recipe, liked, and admin.
- **Light only.** No dark mode now.
- **Stay on plain JavaScript** (`.jsx`), no TypeScript migration. shadcn supports this (`tsx: false`).
- **Font: Nunito**, bundled with the app (e.g. `@fontsource`), not loaded from a CDN, because the site is self-hosted on a home network and may be offline or on a LAN without internet for browsers.
- **Emoji are the icons**; no icon library. Ingredients are free text, so emoji per ingredient comes from a small name → emoji lookup with a neutral fallback (e.g. 🥣). Unknown ingredients just get the fallback.
- **Admin tables become stacked cards/rows** that fit a phone instead of wide tables.
- A "not medical advice" footer stays, restyled.

## Goals

- One consistent spacing scale and shared components across all screens.
- Mobile-first, comfortable touch targets (at least 40–44px tall controls).
- Remove the hard-coded global element styles in `src/client/style.css`; styling comes from Tailwind classes and shadcn components.
- Keep behaviour identical: no changes to API, server, or data flow.

## Non-goals

- No dark mode, theme toggle, i18n, PWA/manifest, or new features.
- No routing library, state library, or TypeScript migration.
- No server changes.
- No redesign of the information structure or flows (same screens, same steps).

## Anti-goals (would count as a failure)

- Breaking existing tests or changing accessible names that tests rely on (see Constraints).
- A look that drifts from the approved warm/cozy mockups (e.g. default grey/black shadcn theme).
- Anything that breaks `npm run build`, `npm start`, or the Docker build.
- Wide tables or horizontal scrolling on a phone.

## Constraints

- **Stack today:** React 18, Vite 5.4, plain JS, no Tailwind, no path alias, one 16-line stylesheet at `src/client/style.css`. Client is about 800 lines across `App.jsx`, `MainApp.jsx` and `screens/*`. `api` is passed as a prop; routing is a regex on `location.pathname`.
- **Setup shadcn needs:** Tailwind (with the Vite plugin), a `@/` path alias in `vite.config.js` plus `jsconfig.json`, `components.json` (JS mode), a `cn` helper (`clsx` + `tailwind-merge`), CSS variables for the theme. Tailwind's base reset replaces the global element styles.
- **Tests** (Vitest + Testing Library in jsdom, about 6 `.jsx` test files in `test/`) query by role, label and text. Keep accessible names stable, for example `Remove <name>`, `Open <title>`, "Fewer portions", and `<label>` text wrapping inputs. Radix-based components (Dialog, AlertDialog) may need jsdom polyfills (`ResizeObserver`, `scrollIntoView`, pointer capture) added to test setup. Where emoji are added to button text, tests that match by exact text may need updating; prefer putting emoji in a way that keeps the accessible name (e.g. `aria-hidden` emoji span) so existing queries still pass.
- **Serving:** one Node process serves `dist/` (Vite build output) and the API; the multi-stage Dockerfile already runs `npm ci` and `npm run build`, so new build-time dependencies go in `devDependencies` and need no Docker change. Fonts must be bundled into `dist`.
- `[role='alert']` and `[role='note']` semantics must be preserved on error and allergen messages.
- Repo has a clean working tree on branch `master`; do the work on a branch/worktree and commit in small steps.

## Calls made after review (mine; user can override)

- **Tests may be rewritten, behaviour and coverage may not shrink.** Two groups must change: the `window.confirm` tests (`test/auth.screens.test.jsx`, `test/admin.screen.test.jsx`) become tests that open the dialog, check it names the person, then cancel and confirm; and the admin table tests change if the tables become stacked rows. Include a test-migration step in the plan. Prefer keeping real `table`/`tr` semantics if that is cheap (e.g. a table that reflows on narrow screens); stacked cards are fine if not.
- **Visible wording stays as it is today**; only emoji are added. The mockup labels "Liked" / "Nope" are shorthand. Real strings (for example "Baby liked it", "Didn't like", "Suggest a recipe") stay, so accessible names don't change. Emoji go in `aria-hidden` spans.
- **Admin: both the Invites and People lists get the same treatment**, and every piece of information currently shown (including the usage figure and all row actions) stays visible on a phone. Only the layout changes.
- **Done means:** the test suite passes, `npm run build` succeeds, and the builder has run the app and looked at each screen at about 375px wide (seeded or stubbed data is fine; recipe generation needs an OpenAI stub). The user does the final visual check.
- **Docker needs no change:** the build stage does `COPY . .`, so `jsconfig.json`, `components.json` and config files are included, and bundled fonts land in `dist`. `.superpowers/` is dockerignored and irrelevant to the build.

## Left to the builder

- Tailwind v3 vs v4 (whichever the current shadcn CLI supports cleanly with Vite 5.4), exact token names, and how shadcn's CSS variables map to the palette above.
- Which shadcn components to add (expected: button, input, label, card, badge, alert, alert-dialog, separator, maybe table or none).
- Order of work (suggestion: setup, shared layout/theme, auth screens, home/recipe/liked, admin, dialogs).
- Exact emoji lookup contents and where it lives (likely `src/shared` or `src/client`).
- Responsive details for the admin screen.
- How to verify visually (running the app, screenshots) in addition to the test suite.
