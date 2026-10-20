# Tiny Pantry Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the site to Tiny Pantry, add its jar-and-sprout logo, and move the whole UI from cream-and-orange to the soft blue "Sky" palette, keeping errors red.

**Architecture:** The theme is CSS variables in `src/client/style.css` mapped by `tailwind.config.js`, so the recolor is a variable swap plus two non-token spots (card shadow, warm badge). The logo is one React component (`Logo.jsx`) used by the menu header and by the logged-out pages from `App.jsx`. The favicon is a static SVG in a new `public/` folder that Vite copies into `dist/`, which the server already serves.

**Tech Stack:** React 18, Tailwind 3 with CSS variables, Vite 5, Vitest + Testing Library (jsdom for `*.test.jsx`).

**Spec:** `docs/superpowers/specs/2026-10-20-tiny-pantry-branding-design.md`

## Global Constraints

- Name is exactly `Tiny Pantry`; tagline is exactly `recipes for little eaters` (lowercase, no full stop). The tagline is provisional, so keep both strings in one place (`Logo.jsx`).
- Logo mark: the SVG in the spec, 120×120 viewBox. Wordmark: Nunito weight 800, colour `#4A6A94`.
- Sky palette values are the spec's table. Fixed values: `--background #F4F8FD`, `--foreground #243449`, `--card #ffffff`, `--border #DCE7F4`, `--input #D3E1F2`, `--primary #8FB1DB`, `--primary-edge #6B90C0`, `--primary-foreground #1F2F46`, `--chip #DCE8F7`, `--note #EEF4FB`, `--note-border #CFDFF2`.
- Errors stay red: `--destructive`, `--destructive-foreground`, the error notice background `#fdeae5` and the destructive button edge `#8f2a14` do not change.
- Peach appears only in the logo's heart. No dark mode, no layout changes beyond adding the logo.
- Text and button labels meet 4.5:1 contrast; the focus ring meets 3:1 (the existing `test/theme.test.js` checks stay green).
- Not renamed: the `baby-recipes` package name, Docker and backup names, `baby-recipes.json`, and the "baby recipes" wording in `src/server/openai.js`.
- Colours are plain CSS variables, so never use a Tailwind opacity suffix (`bg-primary/50`) on them (an existing test enforces this).
- Commit messages end with the line `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

1. The wordmark must not become a heading or change a button's accessible name: tests find screens by `h1` and the menu by the button named `Menu`. (Task 2 and 3 tests.)
2. `--muted-foreground` is easy to leave too pale on blue; it is used on the page, cards, notes and chips. (Task 1 test.)
3. The red error/destructive colours must not drift while the palette changes. (Task 1 test.)
4. The logged-out pages show the large logo with tagline, and the logged-in app and the loading state do not show the tagline. (Task 4 tests.)
5. The header with logo plus Menu button must still fit a 320 px wide phone and the open menu must stay on screen. Not testable in jsdom; checked by hand in Task 6.

---

### Task 1: Sky palette

**Files:**
- Modify: `src/client/style.css:5-25`
- Modify: `tailwind.config.js:22` (card shadow)
- Test: `test/theme.test.js`

**Interfaces:**
- Consumes: the existing `tokens`, `contrast` helpers at the top of `test/theme.test.js`.
- Produces: the Sky token values that Tasks 2–4 rely on visually (Logo colours are hard-coded and do not depend on them).

- [ ] **Step 0: Commit the spec and this plan**

```bash
git add docs/superpowers/specs/2026-10-20-tiny-pantry-branding-design.md docs/superpowers/plans/2026-10-20-tiny-pantry-branding.md
git commit -m "docs: add Tiny Pantry branding design and plan"
```

- [ ] **Step 1: Write the failing tests in `test/theme.test.js`**

Add these tests (reusing `tokens`, `contrast`, `ERROR_NOTICE_BACKGROUND`):

- `the palette is the Sky blue palette`: `expect(tokens).toMatchObject({ background: '#F4F8FD', foreground: '#243449', card: '#ffffff', border: '#DCE7F4', input: '#D3E1F2', primary: '#8FB1DB', 'primary-edge': '#6B90C0', 'primary-foreground': '#1F2F46', chip: '#DCE8F7', note: '#EEF4FB', 'note-border': '#CFDFF2' })`. Compare case-insensitively (lower-case both sides).
- `the red for errors is unchanged`: `destructive` is `#bf3a1f` and `destructive-foreground` is `#ffffff`.
- `muted text meets 4.5:1 on the page, card, muted and note backgrounds`: loop over `background`, `card`, `muted`, `note`, asserting `contrast(tokens['muted-foreground'], bg) >= 4.5`.
- `body text meets 4.5:1 on the page and card`.
- `warm badge text meets 4.5:1 and its background differs from the default badge`: `contrast(tokens['warm-foreground'], tokens.warm) >= 4.5` and `tokens.warm !== tokens.chip`.
- `no orange is left in the theme files`: neither `src/client/style.css` nor `tailwind.config.js` contains any of `#fff8ef #f08a3c #c96a22 #f3e3cc #7a6650 #3b2a1a #f0dfc8 #e8d3b5 #ffe1bd #fff1e0 #f5d3a8 #fff1cc #8a5a00` or `180, 120, 40` (case-insensitive).

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/theme.test.js`
Expected: FAIL on the palette, muted, warm and no-orange tests; the red test passes already.

- [ ] **Step 3: Change the variables in `src/client/style.css` and the shadow in `tailwind.config.js`**

Set the fixed values from Global Constraints. Choose the rest: `--muted` about `#E6EEF8`, `--muted-foreground` about `#55698A` (darker than the mock's `#7D90A8`, which fails contrast), `--ring` about `#6B90C0`, `--warm` / `--warm-foreground` a soft sage pair such as `#E3F0E7` / `#2F5A3E` (not peach, not blue, so the "warm" badge stays distinct from chips). Card shadow becomes `0 2px 10px rgba(60, 90, 140, 0.08)`. Leave `--destructive*` alone.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run`
Expected: PASS (whole suite, since colours must not break other tests).

- [ ] **Step 5: Commit**

```bash
git add src/client/style.css tailwind.config.js test/theme.test.js
git commit -m "feat: move the theme to the Sky blue palette"
```

### Task 2: Logo component

**Files:**
- Create: `src/client/components/Logo.jsx`
- Test: `test/logo.test.jsx`

**Interfaces:**
- Produces:
  - `export const NAME = 'Tiny Pantry'` and `export const TAGLINE = 'recipes for little eaters'`
  - `export function LogoMark({ className }): JSX` — the spec's SVG, `aria-hidden="true"`, sized by `className` (Tailwind `h-… w-…`).
  - `export default function Logo({ size = 'sm', tagline = false }): JSX` — mark plus the name; `size` is `'sm'` (header) or `'lg'` (logged-out pages); the tagline shows only when `tagline` is true. The name and tagline are plain `<span>`/`<p>`, never headings.

- [ ] **Step 1: Write the failing tests in `test/logo.test.jsx`**

- `shows the name and no tagline by default`: `render(<Logo />)`; `getByText('Tiny Pantry')` exists; `queryByText('recipes for little eaters')` is null.
- `shows the tagline when asked`: `render(<Logo size="lg" tagline />)`; both strings present.
- `is not a heading and hides the mark from screen readers`: `queryByRole('heading')` is null; `container.querySelector('svg').getAttribute('aria-hidden')` is `'true'`.
- `the mark keeps the sprout and the heart`: the SVG markup contains `#8DB59A` and `#F6B9A6`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/logo.test.jsx`
Expected: FAIL, cannot resolve `Logo.jsx`.

- [ ] **Step 3: Implement `Logo.jsx`**

Use the SVG from the spec for `LogoMark`. Wordmark: classes for Nunito weight 800 in `#4A6A94` (the font is already global; use an arbitrary-value class such as `text-[#4A6A94]` — not a token, so the opacity-suffix rule does not apply). `'lg'` stacks the mark above the name, centred, with the tagline under it in `text-muted-foreground`; `'sm'` is a single row.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run test/logo.test.jsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Logo.jsx test/logo.test.jsx
git commit -m "feat: add the Tiny Pantry logo component"
```

### Task 3: Logo in the app header

**Files:**
- Modify: `src/client/components/Menu.jsx:23-30` (the `<header>` and the dropdown anchor)
- Test: `test/menu.test.jsx`

**Interfaces:**
- Consumes: `Logo` (default export, `size="sm"`) from Task 2.
- Produces: every screen that renders `Menu` now shows the small logo.

- [ ] **Step 1: Write the failing tests in `test/menu.test.jsx`**

- `the header shows the Tiny Pantry name next to the menu button`: after `await startApp()`, `screen.getByText('Tiny Pantry')` exists and `screen.getByRole('button', { name: 'Menu' })` exists (the name must not leak into the button's accessible name).
- `the name is not repeated in the open menu`: after `openMenu()`, `screen.getAllByText('Tiny Pantry')` has length 1.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/menu.test.jsx`
Expected: FAIL on the first new test.

- [ ] **Step 3: Update `Menu.jsx`**

Make the `<header>` a row: `Logo` (`size="sm"`) first, the Menu button pushed to the end. Anchor the dropdown to the button's side so it stays on screen (`right-0` instead of `left-0`). Nothing else in the menu changes.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run`
Expected: PASS (the whole suite; other tests open the menu on every screen).

- [ ] **Step 5: Commit**

```bash
git add src/client/components/Menu.jsx test/menu.test.jsx
git commit -m "feat: show the logo in the app header"
```

### Task 4: Big logo on the logged-out pages

**Files:**
- Modify: `src/client/App.jsx:35-37,73-80` (compute whether the page is logged-out; render the logo above `body`)
- Test: `test/app.test.jsx`

**Interfaces:**
- Consumes: `Logo` with `size="lg" tagline` from Task 2.
- Produces: the logo with tagline above the Login, Signup (`/invite/<token>`) and Reset (`/reset/<token>`) forms; nothing extra in the logged-in app.

- [ ] **Step 1: Write the failing tests in `test/app.test.jsx`**

Follow that file's existing way of rendering `App` with the fake API (the fake API's `session` can return no user for the logged-out case):

- `the login page shows the logo and tagline`: logged out at `/` → `findByText('recipes for little eaters')` and `getByText('Tiny Pantry')` exist, and the `Log in` heading is still the only heading.
- `the invite page shows the logo and tagline`: path `/invite/abc` → tagline present.
- `the reset page shows the logo and tagline`: path `/reset/abc` → tagline present.
- `the logged-in app shows the name but not the tagline`: logged in at `/` → `getByText('Tiny Pantry')` exists, `queryByText('recipes for little eaters')` is null.
- `nothing is shown while the session is loading`: before the session promise resolves, neither string is on screen.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run test/app.test.jsx`
Expected: FAIL on the three logged-out tests.

- [ ] **Step 3: Implement in `App.jsx`**

A logged-out page is `invite || reset || session.status === 'anon'`. Render `<Logo size="lg" tagline />` immediately before `{body}` for those, inside the existing `<main>`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client/App.jsx test/app.test.jsx
git commit -m "feat: show the logo and tagline on the logged-out pages"
```

### Task 5: Page title, favicon and README

**Files:**
- Create: `public/favicon.svg`
- Modify: `index.html:6`
- Modify: `README.md:1`
- Test: `test/branding.test.js`

**Interfaces:**
- Produces: `/favicon.svg` served from `dist/` after `npm run build` (Vite copies `public/` to the build root).

- [ ] **Step 1: Write the failing tests in `test/branding.test.js`** (node environment)

- `the page title is Tiny Pantry`: `index.html` contains `<title>Tiny Pantry</title>`.
- `the page links the favicon`: `index.html` contains a `<link rel="icon" type="image/svg+xml" href="/favicon.svg"` tag.
- `the favicon is the logo mark`: `public/favicon.svg` exists, contains `viewBox="0 0 120 120"`, `#F6B9A6` (heart) and `#8DB59A` (sprout), and its stem uses `stroke-width="6"` (thicker for tab size).
- `the README is titled Tiny Pantry`: first line of `README.md` is `# Tiny Pantry`.
- `the OpenAI prompt keeps its wording`: `src/server/openai.js` still contains `writes simple baby recipes`.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run test/branding.test.js`
Expected: FAIL on the first four.

- [ ] **Step 3: Make the changes**

Create `public/favicon.svg` from the spec's SVG with the stem stroke at 6. Update the `<title>`, add the icon link in `index.html`, and change the README heading.

- [ ] **Step 4: Run to verify they pass, then build**

Run: `npx vitest run test/branding.test.js && npm run build && ls dist/favicon.svg`
Expected: tests PASS; the build succeeds; `dist/favicon.svg` is listed.

- [ ] **Step 5: Commit**

```bash
git add public/favicon.svg index.html README.md test/branding.test.js
git commit -m "feat: rename the site to Tiny Pantry and add a favicon"
```

### Task 6: Check it in a browser and deploy

**Files:** none changed unless the check finds a problem.

- [ ] **Step 1: Full suite and build**

Run: `npx vitest run && npm run build`
Expected: all tests PASS; build succeeds.

- [ ] **Step 2: Look at it** — use the `run` skill to start the app and check, at desktop width and at 320 px wide: Login, Signup/Reset (`/invite/x`, `/reset/x`), Home, a recipe, Liked, Community and Admin. Confirm no orange or cream is left, the header logo and Menu button fit on one line, the open menu stays on screen, errors and "Delete my account" are still red, and the favicon shows in the tab. Fix anything found with a test first where it is testable, then commit.

- [ ] **Step 3: Deploy** — use the `deploy-docker` skill so the container runs the new code.
