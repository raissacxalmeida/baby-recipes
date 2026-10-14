// Patterns are regex sources matched on whole words after the text is normalised.
const UNDER_12 = [
  ['honey', 'honey(?:ed)?'],
  ['salt', 'salt(?:s|ed|y|ing)?'],
  ['sugar', 'sugar(?:s|y|ed)?'],
  ['syrup', 'syrups?'],
  ['milk', 'milks?'],
  ['soy sauce', 'soy sauces?'],
  ['stock cube', 'stock cubes?'],
  ['bouillon', 'bouillon'],
  ['bacon', 'bacon'],
  ['ham', 'ham'],
  ['miso', 'miso'],
  ['agave', 'agave'],
  ['molasses', 'molasses'],
  ['jaggery', 'jaggery'],
];
const CHOKING = [
  ['popcorn', 'pop ?corn'],
  ['whole nuts', 'whole (?:nut|almond|walnut|peanut|cashew|hazelnut|pecan|pistachio)s?'],
  ['whole grapes', 'whole grapes?'],
  ['raw hard vegetables or fruit', 'raw (?:apple|carrot|celery|pear)s?'],
];
// Bare nuts and grapes are fine once prepared safely.
const NUTS = /\bnuts?\b/;
const NUTS_PREPARED = /\b(?:ground|butter|paste|powder|flour|pur[ée]ed?|finely|chopped)\b/;
const GRAPES = /\bgrapes?\b/;
const GRAPES_PREPARED = /\b(?:quartered|quarter|halved|halve|chopped|mashed|pur[ée]ed?|cut)\b/;

const ALLOWED_TEXTURES = (months) =>
  months < 9 ? ['puree', 'mashed'] : months < 12 ? ['mashed', 'soft-pieces'] : ['puree', 'mashed', 'soft-pieces', 'finger-food'];

const ALLERGEN_KEYWORDS = {
  peanut: ['peanut'],
  'tree nut': ['tree nut', 'almond', 'walnut', 'cashew', 'hazelnut', 'pecan', 'pistachio'],
  egg: ['egg'],
  milk: ['milk', 'cheese', 'yogurt', 'yoghurt', 'cream'],
  wheat: ['wheat', 'flour', 'bread', 'pasta'],
  soy: ['soy', 'tofu', 'edamame'],
  fish: ['fish', 'salmon', 'tuna', 'cod'],
  shellfish: ['shellfish', 'shrimp', 'prawn', 'crab', 'lobster'],
  sesame: ['sesame', 'tahini'],
};

const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[\s\u00a0-]+/g, ' ')
    .replace(/\b(?:breast|formula)(?: milk)?\b/g, ' ');
const has = (text, pattern) => new RegExp(`\\b(?:${pattern})\\b`).test(text);

export function checkSafety(recipe, ageMonths) {
  const text = normalize([recipe.title, ...recipe.ingredients.map((i) => i.name), ...recipe.steps].join(' \n '));
  const problems = [];
  if (ageMonths < 12) {
    for (const [label, pattern] of UNDER_12) {
      if (has(text, pattern)) problems.push(`${label} is not suitable under 12 months`);
    }
  }
  if (ageMonths < 36) {
    for (const [label, pattern] of CHOKING) {
      if (has(text, pattern)) problems.push(`${label} is a choking hazard under 3 years`);
    }
    if (NUTS.test(text) && !NUTS_PREPARED.test(text)) problems.push('whole nuts are a choking hazard under 3 years');
    if (GRAPES.test(text) && !GRAPES_PREPARED.test(text)) problems.push('whole grapes are a choking hazard under 3 years');
  }
  if (!ALLOWED_TEXTURES(ageMonths).includes(recipe.texture)) {
    problems.push(`texture ${recipe.texture} is not suitable at ${ageMonths} months`);
  }
  return problems;
}

export function detectAllergens(recipe) {
  const text = normalize(recipe.ingredients.map((i) => i.name).join(' \n '));
  const found = new Set((recipe.aiAllergens ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));
  for (const [allergen, terms] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (terms.some((t) => has(text, `${t}(?:s|es)?`))) found.add(allergen);
  }
  return [...found].sort();
}
