# UI Modernization (shadcn/ui, warm & cozy) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every screen of the baby-recipes client with shadcn/ui components in the approved "A: warm and cozy" look, with consistent spacing, phone-first layout, and proper confirmation dialogs, without changing behaviour.

**Architecture:** Add Tailwind (Vite plugin) and shadcn/ui (plain JS, `@/` alias to `src/client`), define the palette as CSS-variable tokens in `src/client/style.css`, build a few thin shared components on top of the shadcn primitives (`Field`, `Notice`, `Emoji`, `ConfirmDialog`), then migrate screens one group at a time. The old 16-line stylesheet stays alive inside `@layer components` until the last task so the app works after every commit.

**Tech Stack:** React 18, Vite 5.4, Tailwind CSS (v4 with `@tailwindcss/vite`, unless the shadcn CLI cannot do JS cleanly with it; then v3), shadcn/ui (Radix: AlertDialog, Label, Slot), `clsx`, `tailwind-merge`, `class-variance-authority`, `@fontsource/nunito`, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-10-17-ui-modernization-design.md`. Mockups (visual reference where the spec is silent): `docs/superpowers/specs/2026-10-17-ui-modernization-mockups/`.

## Global Constraints

- Plain JavaScript (`.jsx`/`.js`); no TypeScript. shadcn `components.json` with `"tsx": false`.
- Light theme only; no dark mode, theme toggle, i18n, PWA, routing or state library. No server or API changes.
- Look (from the spec and mockups): page background `#fff8ef`, text `#3b2a1a`; accent orange `#f08a3c` with a darker bottom edge (`0 3px 0 #c96a22`) on primary buttons; destructive `#d9482b`; white cards, border `#f0dfc8`, shadow `0 2px 10px rgba(180,120,40,.08)`; control border `#e8d3b5`; chip background `#ffe1bd`; badge `#fff1cc` on text `#8a5a00`; note background `#fff1e0` border `#f5d3a8`; progress track `#f3e3cc`. Card radius 18px, control radius 14px, chips/badges/stepper buttons fully round. Font Nunito, bundled (no CDN).
- Uniform spacing: cards and form fields separated by the same gap (Tailwind `gap-4`/`space-y-4`); controls at least 40px tall, primary actions 44px.
- Visible wording is unchanged from today ("Baby liked it", "Baby didn't like it", "Give me another", "Suggest a recipe", "Liked recipes", "Delete my account", "Remove <email>" etc.). Emoji are added only inside `<Emoji>` (an `aria-hidden` span) so accessible names don't change.
- Keep `role="alert"` on errors and `role="note"` on the allergen note. Keep existing `aria-label`s (`Remove <name>`, `Open <title>`, `Restore <title>`, `Fewer portions`, `More portions`, `Revoke invite for <email>`, `Invite <email> again`, `Reset password for <email>`, `Remove <email>`) and `<label>`-wraps-input structure.
- Emails and user text are always rendered as text (never as HTML).
- Tests may be rewritten only where noted (confirm dialogs); coverage must not shrink.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `feat/ui-modernization`.
- New build-time packages go in `devDependencies` (the Dockerfile build stage already runs `npm ci` and `npm run build`; the runtime image needs nothing new).

## Review Focus

Failure modes the spec implies that no screen task's happy-path tests cover (each is pinned by a test in the task named in brackets):

1. Cancel, Escape and outside-click on a confirmation dialog take no action, and a double-click on the confirm button acts once. [Task 4, Task 8]
2. After a confirmed action that removes the thing the dialog was opened from (admin row removed, account deleted and the bar unmounted), the page is not left locked: `document.body` has no `pointer-events: none`, and other buttons are still reachable by role. [Task 4, Task 8]
3. Unknown, empty, plural, upper-case or oddly spaced ingredient names get a sensible emoji (fallback `🥣`), never crash. [Task 3]
4. The admin's own row (no figure, no actions) renders no empty labelled cells in the phone layout. [Task 8]
5. Long emails, recipe titles and ingredient names wrap instead of forcing horizontal scroll at 375px. [Task 9 visual check; Task 6 and 8 add `break-words`/`min-w-0`]

---

### Task 1: Tooling, tokens and test setup

**Files:**
- Modify: `package.json`, `vite.config.js`, `src/client/main.jsx`, `src/client/style.css`
- Create: `jsconfig.json`, `components.json`, `src/client/lib/utils.js`, `test/setup.jsdom.js`, `test/utils.test.js`

**Interfaces:**
- Produces: `cn(...inputs: ClassValue[]): string` in `src/client/lib/utils.js`; `@/` alias = `src/client`; Tailwind theme tokens usable as utilities (`bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `bg-card`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-destructive`, `bg-chip`, `bg-note`, `rounded-card`, `rounded-control`, `shadow-card`, `shadow-primary-edge`); jsdom polyfills for Radix.

- [ ] **Step 1:** `git switch -c feat/ui-modernization`.
- [ ] **Step 2: Write the failing test** `test/utils.test.js`: `cn('a', false && 'b', 'px-2', 'px-4')` equals `'a px-4'`.
- [ ] **Step 3:** Run `npx vitest run test/utils.test.js`. Expected: FAIL (module not found).
- [ ] **Step 4:** Install dev deps: `tailwindcss @tailwindcss/vite clsx tailwind-merge class-variance-authority`, and `@fontsource/nunito` (regular dependency is fine too; it is bundled by Vite at build time). Create `src/client/lib/utils.js` with `cn` (`twMerge(clsx(inputs))`).
- [ ] **Step 5:** `vite.config.js`: add `tailwindcss()` to plugins, `resolve.alias['@'] = <abs>/src/client`, and `test.setupFiles = ['./test/setup.jsdom.js']`. Add `jsconfig.json` (`paths: {"@/*": ["./src/client/*"]}`) and `components.json` (`style: "new-york"`, `tsx: false`, `tailwind.css: "src/client/style.css"`, `baseColor: "neutral"`, `cssVariables: true`, aliases `components: "@/components"`, `utils: "@/lib/utils"`, `ui: "@/components/ui"`). Prefer generating these with `npx shadcn@latest init` and correcting to the values above; if the CLI cannot produce plain JS with the chosen Tailwind version, write the files by hand.
- [ ] **Step 6:** `test/setup.jsdom.js`: guarded by `typeof window !== 'undefined'`, define no-op `ResizeObserver`, `Element.prototype.scrollIntoView`, `hasPointerCapture`, `setPointerCapture`, `releasePointerCapture` when missing.
- [ ] **Step 7:** Rewrite `src/client/style.css`: `@import "tailwindcss";`, theme tokens for the Global Constraints palette (shadcn variable names: `--background`, `--foreground`, `--card`, `--border`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--destructive`, `--ring`, plus `--chip`, `--note`), `--font-sans: 'Nunito', system-ui, sans-serif`, radii and shadows as the utilities listed above, `body` background/foreground/font. Move the 16 old rules unchanged into `@layer components { ... }` under a `/* legacy: delete in Task 9 */` comment so utilities still win over them. In `main.jsx` import `@fontsource/nunito/latin-400.css`, `latin-600.css`, `latin-700.css` before `./style.css`.
- [ ] **Step 8:** Run `npx vitest run`, then `npm run build`. Expected: all tests PASS (including `utils.test.js`); build succeeds and `dist/assets` contains Nunito `.woff2` files.
- [ ] **Step 9:** Commit `feat: tailwind, shadcn config, theme tokens and test setup`.

### Task 2: Shared UI components

**Files:**
- Create: `src/client/components/ui/{button,input,card,badge,alert-dialog,field,notice,emoji,confirm-dialog}.jsx`, `test/ui.test.jsx`

**Interfaces:**
- Consumes: `cn`, theme tokens (Task 1).
- Produces (all default-named exports as listed):
  - `Button({variant: 'default'|'outline'|'destructive'|'ghost' = 'default', size: 'default'|'sm'|'icon' = 'default', asChild, className, ...props})` and `buttonVariants`. Default = orange + bottom edge, `h-11`, `rounded-control`, semibold; outline = white with `border-input`; `size: 'icon'` = 32px round (portion stepper); disabled = 50% opacity, `cursor-not-allowed`, no edge.
  - `Input(props)`: `h-10`/`h-11`, `rounded-control`, `border-input`, white background, visible focus ring.
  - `Card({className, ...props})`: `rounded-card border bg-card p-4 shadow-card`.
  - `Badge({variant: 'default'|'warm' = 'default', className, ...props})`: fully round; `warm` is the `#fff1cc`/`#8a5a00` "not in your list" style, default is the chip colour.
  - AlertDialog set: `AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction` (standard shadcn, restyled: rounded 22px content, warm overlay, action uses destructive button variant).
  - `Field({label: string, className, ...inputProps})`: renders `<label>` wrapping the label text and an `<Input>` (so `getByLabelText` keeps working); `grid gap-2`, label `text-sm font-semibold`.
  - `Notice({kind: 'error'|'note'|'info', children})`: `error` renders `<p role="alert">` in destructive text on a soft red background; `note` renders `<p role="note">` in the note style; `info` renders a plain `<p>` in the muted style.
  - `Emoji({children})`: `<span aria-hidden="true">`.
  - `ConfirmDialog({trigger: ReactElement, title: string, description: string, confirmLabel: string, onConfirm: () => void})`: wraps AlertDialog; `trigger` is rendered with `AlertDialogTrigger asChild`; Cancel button reads "Cancel"; confirm button reads `confirmLabel` and calls `onConfirm`.

- [ ] **Step 1: Write failing tests** in `test/ui.test.jsx`:
  - `<Button><Emoji>✨</Emoji> Suggest a recipe</Button>` is found by `getByRole('button', {name: 'Suggest a recipe'})` and `getByText('Suggest a recipe')`.
  - `Notice kind="error"` has role `alert`; `kind="note"` has role `note`; `kind="info"` has neither.
  - `Field label="Email"` is found by `getByLabelText('Email')` and typing updates the input.
  - `ConfirmDialog`: clicking the trigger shows an `alertdialog` containing the description; Cancel closes it and `onConfirm` is not called; Escape closes it without calling; double-clicking the confirm button calls `onConfirm` exactly once; a second open-and-confirm calls it again.
- [ ] **Step 2:** Run `npx vitest run test/ui.test.jsx`. Expected: FAIL (modules missing).
- [ ] **Step 3:** Add the shadcn primitives with `npx shadcn@latest add button input card badge alert-dialog` (or write the equivalents by hand if the CLI can't produce JS), then restyle them to the Global Constraints values. Write `field`, `notice`, `emoji`, `confirm-dialog` as specified. For the double-click rule, confirm closes the dialog synchronously (Radix `AlertDialogAction` does this) and `onConfirm` runs from `onClick`; verify the test, add a guard only if it fails.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: shared ui components in the warm theme`.

### Task 3: Ingredient emoji lookup

**Files:**
- Create: `src/shared/ingredientEmoji.js`, `test/ingredientEmoji.test.js`

**Interfaces:**
- Produces: `ingredientEmoji(name: string): string`. Case-insensitive, trims, ignores a trailing plural `s`/`es`; returns `'🥣'` for unknown, empty or non-string input.

- [ ] **Step 1: Write failing tests:** `'Carrot'`, `'carrots'`, `'  CARROTS '` → `'🥕'`; `'sweet potato'` → `'🍠'`; `'broccoli'` → `'🥦'`; `'banana'` → `'🍌'`; `'dragonfruit-xyz'`, `''`, `'   '`, `undefined` → `'🥣'`.
- [ ] **Step 2:** Run `npx vitest run test/ingredientEmoji.test.js`. Expected: FAIL.
- [ ] **Step 3:** Implement with a small lookup object (about 30 common baby-food ingredients: carrot, sweet potato, potato, broccoli, banana, apple, pear, avocado, peas, pumpkin/squash, zucchini, spinach, tomato, egg, chicken, fish/salmon, rice, oats, yogurt, cheese, lentils, beans, mango, peach, blueberry, strawberry, cauliflower, corn, milk, bread/pasta). Normalise the input first, try exact then singular form.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5:** Commit `feat: ingredient emoji lookup`.

### Task 4: App shell and account bar with confirm dialog

**Files:**
- Modify: `src/client/App.jsx`, `src/client/screens/AccountBar.jsx`, `test/auth.screens.test.jsx` (the two `window.confirm` tests)

**Interfaces:**
- Consumes: `ConfirmDialog`, `Button`, `Notice`, `Emoji`.
- Produces: unchanged component props. `AccountBar({user, onLogout, onDelete, onAdmin})` keeps its signature.

- [ ] **Step 1: Rewrite the tests first** in `test/auth.screens.test.jsx`:
  - `'Delete my account asks first and only then deletes'`: click "Delete my account", find the `alertdialog`, assert its text names `ana@example.com`; click Cancel, assert it closes and `deleteAccount` was not called; reopen, click "Yes, delete my account", `waitFor` `deleteAccount` called once, then the "Log in" button appears.
  - Add `'after the account is deleted the page is not locked'`: following the flow above, `document.body.style.pointerEvents` is not `'none'` and the "Log in" button is found by role.
  - `'a failed account deletion shows the message and stays signed in'`: replace the `window.confirm` spy with opening the dialog and clicking "Yes, delete my account".
- [ ] **Step 2:** Run `npx vitest run test/auth.screens.test.jsx`. Expected: the three tests FAIL (no alertdialog yet), others PASS.
- [ ] **Step 3:** `AccountBar`: top row card-less header (email in muted text, buttons `Button size="sm" variant="outline"` for Admin and Log out), "Delete my account" as `ConfirmDialog` with `title="Delete your account?"`, description `Delete the account ${user.email} and all its saved data? This cannot be undone.`, `confirmLabel="Yes, delete my account"`, `onConfirm={onDelete}`. The trigger button keeps the visible text "Delete my account". `App.jsx`: `<main>` becomes `mx-auto max-w-md px-4 py-6` with `space-y-4` between children; footer restyled small muted centred; `Loading...` becomes muted centred text (same words); `accountError` uses `Notice kind="error"`.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS. If the body-lock test fails because the dialog was unmounted mid-close, fix by closing before calling `onConfirm` or by controlling `open` state in `ConfirmDialog`; keep Task 2's tests green.
- [ ] **Step 5:** Commit `feat: app shell and account bar with confirm dialog`.

### Task 5: Login, sign-up, reset, setup and too-young screens

**Files:**
- Modify: `src/client/screens/{LoginScreen,SignupScreen,ResetScreen,SetupScreen,TooYoungScreen}.jsx`

**Interfaces:**
- Consumes: `Card`, `Field`, `Button`, `Notice`, `Emoji`. Props of every screen are unchanged.

- [ ] **Step 1:** Run `npx vitest run test/auth.screens.test.jsx test/screens.test.jsx test/app.test.jsx` as the baseline. Expected: PASS. These tests are the safety net (labels, roles, button names); do not edit them.
- [ ] **Step 2:** Restyle each screen as one `Card` with a friendly heading (`h1`, 22px, bold) and a muted intro line; forms use `grid gap-4`; every label+input is a `Field`; the submit is a full-width primary `Button` (visible text unchanged, e.g. "Log in", "Create account", "Change password", "Continue"); errors use `Notice kind="error"`; the login "session ended" notice uses `Notice kind="info"`; add a decorative `Emoji` in headings only (for example 🍼 on Welcome, 🌱 on Not yet). `ResetScreen` "Go to log in" and `TooYoungScreen` "Change birthday" use the outline variant.
- [ ] **Step 3:** Run `npx vitest run`. Expected: all PASS with no test edits.
- [ ] **Step 4:** Commit `feat: restyle auth, setup and too-young screens`.

### Task 6: Home and liked screens

**Files:**
- Modify: `src/client/screens/HomeScreen.jsx`, `src/client/screens/LikedScreen.jsx`

**Interfaces:**
- Consumes: `Card`, `Field`, `Button`, `Badge`, `Notice`, `Emoji`, `ingredientEmoji` (Task 3). Props unchanged.

- [ ] **Step 1:** Baseline: `npx vitest run test/screens.test.jsx test/feedback.test.jsx test/limits.test.jsx test/app.test.jsx`. Expected: PASS.
- [ ] **Step 2:** Add one test to `test/screens.test.jsx` first: an ingredient with a very long name still renders in full and its `Remove <name>` button is reachable by role; and the chip shows `ingredientEmoji(name)` (query by text for the emoji). Run it: FAIL for the emoji assertion.
- [ ] **Step 3:** `HomeScreen`: heading with sub-line "Baby is {ageText} old." (muted); an ingredient `Card` containing the add form (`Field` plus an outline "Add" button on the same row) and the chips; chips are round `Badge`s with `<Emoji>{ingredientEmoji(name)}</Emoji>`, the name in a `min-w-0 break-words` span, and the existing `aria-label` remove button; usage line "Recipes today: N of L" with a thin progress bar (`aria-hidden`, width = N/L, accent colour); the primary "Suggest a recipe" (`✨` emoji) full width and `disabled` rules unchanged; "Liked recipes" outline button (`♡` emoji). Error via `Notice kind="error"`. `LikedScreen`: back button outline, each liked recipe a row in a `Card` (`min-w-0 break-words` title, `Open` outline and `Remove` ghost buttons keeping their `aria-label`s), "Not liked" list likewise with `Restore`; empty-state texts unchanged and muted.
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 5:** Commit `feat: restyle home and liked screens`.

### Task 7: Recipe screen

**Files:**
- Modify: `src/client/screens/RecipeScreen.jsx`, the back button in `src/client/MainApp.jsx` (lines around `Back to liked recipes`/`Back to ingredients`), and the "Saved to liked recipes." and error paragraphs there

**Interfaces:**
- Consumes: `Card`, `Button`, `Badge`, `Notice`, `Emoji`, `ingredientEmoji`. Props unchanged.

- [ ] **Step 1:** Baseline: `npx vitest run test/screens.test.jsx test/feedback.test.jsx test/app.test.jsx`. Expected: PASS.
- [ ] **Step 2:** Restyle per the mockup `direction-a-recipe.html`: title `h1` with `break-words`; allergen `Notice kind="note"` (same text `Allergens: ...`); an ingredients `Card` with the portion stepper in its header (round `Button size="icon"` for `Fewer portions`/`More portions`, same disabled bounds 1 and 12, text unchanged) and rows separated by dividers (`<Emoji>` from `ingredientEmoji`, name, amount right-aligned, `Badge variant="warm"` "not in your list"); a steps `Card` with numbered round markers (keep the `<ol>`; use list-style removal and a CSS counter or explicit marker span with `aria-hidden`); the feedback row of three buttons (primary "Baby liked it" with `👍`, outline "Baby didn't like it" with `👎`, outline "Give me another" with `🔄`), wrapping onto two lines on narrow screens, disabled while `busy`. `MainApp`: back button becomes a ghost/outline `Button size="sm"`; "Saved to liked recipes." uses `Notice kind="info"`; error uses `Notice kind="error"`.
- [ ] **Step 3:** Run `npx vitest run`. Expected: all PASS.
- [ ] **Step 4:** Commit `feat: restyle recipe screen`.

### Task 8: Admin screen

**Files:**
- Modify: `src/client/screens/AdminScreen.jsx`, `test/admin.screen.test.jsx` (the Remove test only, plus two additions)

**Interfaces:**
- Consumes: `Card`, `Field`, `Button`, `Badge`, `Notice`, `ConfirmDialog`. Props unchanged. Keeps `<table aria-label="Invites">` and `<table aria-label="People">`.

- [ ] **Step 1: Rewrite/add tests first** in `test/admin.screen.test.jsx`:
  - Replace `'Remove does nothing until the confirmation naming the person is accepted'`: click `Remove joao@example.com`, find the `alertdialog`, assert its text names `joao@example.com` and `admin.remove` was not called; Cancel closes it (still not called); reopen, click "Yes, remove", `waitFor` `admin.remove` called once with `'p1'`.
  - Add `'Escape closes the remove dialog without removing'`.
  - Add `'after a confirmed removal the page is not locked'`: overview reloads without joao; `document.body.style.pointerEvents` is not `'none'` and `getByRole('button', {name: 'Create invite'})` is found.
  - Add `'the admin row has empty usage and no labelled leftovers'`: the admin's row has no button, no text matching `/of 10/`, and its usage cell is empty (`textContent === ''`).
- [ ] **Step 2:** Run `npx vitest run test/admin.screen.test.jsx`. Expected: the Remove, Escape and body-lock tests FAIL; the rest PASS.
- [ ] **Step 3:** Restyle. Page: back button outline `size="sm"`, headings, invite form in a `Card` (`Field` + primary "Create invite"), `IssuedLink` in a highlighted `Card` (read-only `Field`, `Copy` button, "Copied" text, the "Shown only once…" line unchanged). Tables: keep native `<table aria-label>` / `<thead>` / `<tr>` / `<td>`; below the `sm` breakpoint reflow each row into a card (rows `block`, cells `block`, header `sr-only`) and add explicit `role="table"`, `role="row"`, `role="cell"`, `role="columnheader"` so the semantics survive the display override; each cell carries a `data-label` and shows it with a `before:content-[attr(data-label)]` pseudo-element, hidden with `empty:hidden` when the cell has no content; emails in `min-w-0 break-words`; status shown as a `Badge`; the action buttons keep their `aria-label`s and become small outline/ghost buttons; "Remove" uses `ConfirmDialog` with `title="Remove this person?"`, description `Remove ${p.email} and delete all their data? This cannot be undone.`, `confirmLabel="Yes, remove"`, `onConfirm` calling `act(() => api.admin.remove(p.id))`; trigger keeps `aria-label={`Remove ${p.email}`}` and text "Remove".
- [ ] **Step 4:** Run `npx vitest run`. Expected: all PASS. The "emails are rendered as text" test must still pass unmodified.
- [ ] **Step 5:** Commit `feat: restyle admin screen with confirm dialog`.

### Task 9: Cleanup and verification

**Files:**
- Modify: `src/client/style.css` (delete the legacy block)
- Create (untracked, excluded via `.git/info/exclude`): `preview/` harness for screenshots

- [ ] **Step 1:** Delete the `@layer components { /* legacy ... */ }` block and any now-unused class names (`.chips`, `.portions`, `.tag`, `.feedback`, `.account-bar`, `.issued`) from the JSX. Confirm `grep -rn "window.confirm" src test` returns nothing.
- [ ] **Step 2:** Run `npx vitest run` and `npm run build`. Expected: all PASS, build succeeds. If Docker is available run `docker build -t baby-recipes-ui .` and expect success; if not, say it was not run.
- [ ] **Step 3:** Build a throwaway preview harness in `preview/` (add it to `.git/info/exclude`, do not commit): an HTML entry mounting `<App>` with the in-memory `createFakeApi` from `test/helpers/fakeApi.js`, with query params selecting the route and state (login, invite, reset, setup, too-young, home with ingredients and usage, recipe, liked with items, admin). Serve it with Vite.
- [ ] **Step 4:** Using the browser tools, open every screen at 375px wide (and once at about 1024px) and check against the mockups: no horizontal scroll, consistent gaps, the dialogs (account delete, admin remove) open and look right, admin tables reflow into cards, very long email/title/ingredient strings wrap. Fix what is wrong. Record contrast of the primary button: white text on `#f08a3c` is about 2.5:1, below the 4.5:1 AA target; if it fails, tell the user and propose a text colour (for example `#3b2a1a`) rather than silently changing the approved look.
- [ ] **Step 5:** Run `npx vitest run` and `npm run build` once more, then commit `chore: remove legacy styles` (and any fixes from Step 4 as separate commits).
