const UNDER_12 = ['honey', 'salt', 'sugar', 'syrup', 'milk'];
const UNDER_36 = ['popcorn', 'whole nut', 'whole grape'];

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

const hasWord = (text, term) => new RegExp(`\\b${term}(?:s|es|ed)?\\b`).test(text);
const withoutBreastOrFormula = (text) => text.replace(/\b(?:breast|formula)(?: milk)?\b/g, ' ');

export function checkSafety(recipe, ageMonths) {
  const text = withoutBreastOrFormula(
    [recipe.title, ...recipe.ingredients.map((i) => i.name), ...recipe.steps].join(' \n ').toLowerCase(),
  );
  const problems = [];
  if (ageMonths < 12) {
    for (const term of UNDER_12) {
      if (hasWord(text, term)) problems.push(`${term} is not suitable under 12 months`);
    }
  }
  if (ageMonths < 36) {
    for (const term of UNDER_36) {
      if (hasWord(text, term)) problems.push(`${term} is a choking hazard under 3 years`);
    }
  }
  if (!ALLOWED_TEXTURES(ageMonths).includes(recipe.texture)) {
    problems.push(`texture ${recipe.texture} is not suitable at ${ageMonths} months`);
  }
  return problems;
}

export function detectAllergens(recipe) {
  const text = withoutBreastOrFormula(recipe.ingredients.map((i) => i.name).join(' \n ').toLowerCase());
  const found = new Set((recipe.aiAllergens ?? []).map((a) => a.trim().toLowerCase()).filter(Boolean));
  for (const [allergen, terms] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (terms.some((t) => hasWord(text, t))) found.add(allergen);
  }
  return [...found].sort();
}
