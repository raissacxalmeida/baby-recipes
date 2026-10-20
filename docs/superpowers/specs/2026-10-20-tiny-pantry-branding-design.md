# Tiny Pantry: name, logo and blue theme

## Why

The site is called "Baby recipes", which is a description and not a name, and it has no logo. A parent opens it to find recipes that are good for their baby, matched to the ingredients in their kitchen and mindful of allergens. The name and look should make a tired, slightly anxious parent feel relaxed and comforted in the first second: soft, warm, simple, nothing clinical or loud.

The site is for English readers.

## What we decided

- **Name:** Tiny Pantry.
- **Tagline:** "recipes for little eaters". This was proposed in the conversation and not objected to, but it was not explicitly approved; treat it as provisional and easy to change.
- **Logo:** an open jar with a sprout growing out of it and a peach heart on the front (the mark below). Used in a lockup with the name in Nunito, weight 800, colour `#4A6A94`.
- **Theme:** the whole site moves from the current cream-and-orange palette to a soft blue ("Sky"): a pale blue-tinted background, soft blue buttons with dark text, dark navy body text. Chips and notes are pale blue. The peach appears only in the logo's heart, not in the UI.
- **Errors stay red.** The destructive colour (`--destructive`, the error notice background and the destructive button's edge) does not change. Red means "careful" and must keep meaning that.
- **Availability:** a web search found no existing brand, app or trademark called "Tiny Pantry". It could not check domain registrations or the USPTO database, and the baby-food company Tiny Organics uses a "Tiny ___" naming style, so confusion is possible but unlikely. Not a blocker; the owner may want to check the domain before launch.

### Logo mark (source of truth, 120×120 viewBox)

```svg
<svg width="120" height="120" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M60 40 V20" stroke="#6F9C80" stroke-width="4" stroke-linecap="round"/>
  <path d="M60 28 C49 28 43 21 43 12 C54 12 60 19 60 28Z" fill="#A9CBB5"/>
  <path d="M60 22 C60 12 66 6 77 6 C77 16 71 22 60 22Z" fill="#8DB59A"/>
  <rect x="34" y="36" width="52" height="12" rx="6" fill="#8FAFD6"/>
  <rect x="28" y="44" width="64" height="68" rx="24" fill="#CFE0F4"/>
  <path d="M60 98 C44 87 49 71 60 78 C71 71 76 87 60 98Z" fill="#F6B9A6"/>
</svg>
```

At tab size (about 16–32 px) the stem should be thickened (stroke-width 6) so the sprout stays visible.

### Sky palette

Values below were shown to and chosen by the owner as a feel; the exact numbers for the muted text and focus ring are the builder's to tune for contrast (see constraints).

| Token | Now | Sky |
|---|---|---|
| `--background` | `#fff8ef` | `#F4F8FD` |
| `--foreground` | `#3b2a1a` | `#243449` |
| `--card` | `#ffffff` | unchanged |
| `--border` | `#f0dfc8` | `#DCE7F4` |
| `--input` | `#e8d3b5` | `#D3E1F2` |
| `--primary` | `#f08a3c` | `#8FB1DB` |
| `--primary-edge` | `#c96a22` | `#6B90C0` |
| `--primary-foreground` | `#3b2a1a` | `#1F2F46` |
| `--muted` | `#f3e3cc` | a pale blue, about `#E6EEF8` |
| `--muted-foreground` | `#7a6650` | a mid blue-grey, about `#5F7390` |
| `--ring` | `#c96a22` | about `#6B90C0` |
| `--chip` | `#ffe1bd` | `#DCE8F7` |
| `--note` / `--note-border` | `#fff1e0` / `#f5d3a8` | `#EEF4FB` / `#CFDFF2` |
| `--destructive` and its foreground | unchanged | unchanged |

`--warm` and `--warm-foreground` (the "warm" badge variant, currently a yellow) and the card shadow in `tailwind.config.js` (an orange-tinted `rgba(180, 120, 40, 0.08)`, which should become a blue-tinted shadow such as `rgba(60, 90, 140, 0.08)`) also need to stop looking orange. Choose a warm-badge colour that stays clearly distinct from the default (blue) badge.

## Where the name and logo appear

- **Inside the app (Home, Liked, Community, Recipe, etc.):** the small mark and the name "Tiny Pantry" sit next to the Menu button at the top of each screen. Currently there is no header, only the Menu button in `src/client/components/Menu.jsx`.
- **Login, Signup and Reset-password screens:** a larger logo with the tagline above the form.
- **Browser tab:** the mark as the favicon, and the page title becomes "Tiny Pantry" in `index.html`.
- **README:** the heading becomes "Tiny Pantry".
- **Not renamed:** internal names (the `baby-recipes` package name, Docker names, backup file names, the seed file `baby-recipes.json`, folder names). The text in the OpenAI prompt that says "baby recipes" describes the task and stays.

## Goals

- A parent sees the new name and logo and the blue look on every screen, with no leftover orange or cream.
- The logo is a single reusable component or asset, not copied into each screen.
- Text and buttons stay readable in the new palette.

## Non-goals

- No new features, screens or layout changes beyond adding the logo.
- No change to the emoji used in headings and the menu.
- No dark mode.
- No domain purchase, trademark filing, social accounts or marketing material.

## Anti-goals

- Anything that reads clinical, loud or alarming. Do not add high-contrast or saturated colours.
- Making allergen or safety information less noticeable than it is now. If blue-on-blue notices blur together, fix that; do not trade it away for looks.
- Changing the red used for errors and destructive actions.

## Constraints

- The theme is driven by CSS variables in `src/client/style.css`, mapped in `tailwind.config.js`. Prefer changing the variables over editing individual components. Hard-coded colours that are not tokens (for example in `notice.jsx` and `button.jsx`) should be checked for anything orange.
- Body text and button text should meet WCAG AA contrast (4.5:1) against their backgrounds. The `--muted-foreground` value in the mock (`#7D90A8`) was too light for that; that is why the table suggests a darker one.
- The focus ring must be clearly visible against the new background.
- The font is already Nunito (set in `tailwind.config.js`); keep it.
- Works at phone width, as the site does today.

## Left to the builder

- Where the logo file lives (the project has no `public` folder yet) and how it is served, including the favicon.
- Whether the logo is an inline SVG React component or a file, and how the lockup is built.
- Exact values for the muted text, ring, and warm badge colours, within the constraints above.
- Updating the existing tests and any visual preview (`preview/`) that mention the old name or colours.
- The exact spacing and size of the header logo.
