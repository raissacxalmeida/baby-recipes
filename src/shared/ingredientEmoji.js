const FALLBACK = '🥣';

const EMOJI = {
  carrot: '🥕',
  'sweet potato': '🍠',
  potato: '🥔',
  broccoli: '🥦',
  cauliflower: '🥦',
  banana: '🍌',
  apple: '🍎',
  pear: '🍐',
  avocado: '🥑',
  pea: '🫛',
  bean: '🫘',
  lentil: '🫘',
  pumpkin: '🎃',
  squash: '🎃',
  zucchini: '🥒',
  cucumber: '🥒',
  spinach: '🥬',
  tomato: '🍅',
  egg: '🥚',
  chicken: '🍗',
  fish: '🐟',
  salmon: '🐟',
  rice: '🍚',
  oat: '🥣',
  yogurt: '🥛',
  milk: '🥛',
  cheese: '🧀',
  mango: '🥭',
  peach: '🍑',
  blueberry: '🫐',
  strawberry: '🍓',
  corn: '🌽',
  bread: '🍞',
  pasta: '🍝',
};

// Plural endings to try removing: "carrots" -> "carrot", "tomatoes" -> "tomato".
const singulars = (word) => [word, word.replace(/es$/, ''), word.replace(/s$/, '')];

export function ingredientEmoji(name) {
  if (typeof name !== 'string') return FALLBACK;
  const word = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!word) return FALLBACK;
  for (const candidate of singulars(word)) {
    if (EMOJI[candidate]) return EMOJI[candidate];
  }
  return FALLBACK;
}
