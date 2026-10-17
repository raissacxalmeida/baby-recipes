---
name: add-screen
description: Use when asked to add, build or redesign a screen, page or view in the baby-recipes React app (src/client), for example "add a settings page" or "add a screen that lists X".
---

# Adding a screen

## Overview

The app's look lives in its existing screens and shared components, not in a style guide. Copy the closest screen and reuse the shared components; never invent styling.

## Steps

1. **Pick the template and read it and its test first.**

| New screen is... | Copy |
|---|---|
| a form | `LoginScreen`, `SetupScreen` |
| a form plus a list | `HomeScreen` |
| plain lists with row actions | `LikedScreen` |
| a detail page | `RecipeScreen` |
| tables or dangerous actions | `AdminScreen` |

2. **Does it need data or an endpoint the client doesn't have today?** (new API route, migration, server field.) Stop and agree on that with the user before any UI work. This skill covers the client only.
3. **Test first** in `test/<name>.test.jsx`: render the screen directly with props, plus one flow through the whole app with `startApp` from `test/helpers/app.jsx`. Find things by role, label and text. Cover the empty state, errors, and a very long unbroken title. Watch it fail before building.
4. **Build** `src/client/screens/<Name>Screen.jsx` (default export, data and callbacks as props). Root is `<section className="grid gap-4">`; the heading is an `h1`; content sits in `Card`s. Use the components in `src/client/components/ui/`: `Field` for inputs, `Button` (primary is the one main action; `outline` for the others; `ghost` for back), `Notice` (`kind="error" | "note" | "info"`), `ConfirmDialog` for anything destructive, `Badge`, `Emoji`.
5. **Wire it into `MainApp.jsx`:** import it, add an `if (screen === '<name>')` branch, and add an entry point on an existing screen as an optional prop (for example `onShowX`) so existing renders and tests keep working. Its back button returns to where the user came from, via `go()`.
6. **Verify:** the full suite, `npm run build`, then look at it at 375px wide with short and very long text.

## Rules learned the hard way

- Emoji go only inside `<Emoji>` (it is `aria-hidden`), so button and heading names don't change. Keep visible wording plain and parent-friendly.
- User-supplied text (titles, emails, names): add `wrap-anywhere`, and `min-w-0` inside flex rows. `break-words` is not enough.
- Colours are CSS-variable tokens. Use the token classes (`bg-chip`, `text-muted-foreground`, `bg-primary`), never raw hex. **Never put an opacity suffix on one** (`bg-muted/60` silently produces no CSS). Changing a token needs `test/theme.test.js` to stay green (contrast).
- Keep `role="alert"` on errors: use `Notice kind="error"`.
- Tailwind is v3 (config in `tailwind.config.js`).
- Phone check: headless Chrome won't go narrower than about 500px, so a plain 375px screenshot is cropped and misleading. Put the page in a 375px-wide `<iframe>` and screenshot that. A throwaway harness that mounts `<App>` with a fake api (as in `test/helpers/fakeApi.js`) is fine; don't commit it.
