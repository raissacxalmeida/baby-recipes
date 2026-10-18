import { isListed } from './ingredients.js';

// Chip order on the community page. "All" is added by the screen.
export const GROUPS = [
  { name: 'Fish', emoji: '🐟' },
  { name: 'Meat', emoji: '🍗' },
  { name: 'Eggs', emoji: '🥚' },
  { name: 'Vegetables', emoji: '🥕' },
  { name: 'Fruit', emoji: '🍎' },
  { name: 'Grains', emoji: '🍚' },
  { name: 'Legumes', emoji: '🫘' },
  { name: 'Cake', emoji: '🍰' },
  { name: 'Soup', emoji: '🍲' },
  { name: 'Other', emoji: '🥣' },
];

// Dish types are matched on the title and win over ingredients; Cake is checked before Soup.
const DISHES = [
  ['Cake', ['cake', 'muffin', 'cupcake']],
  ['Soup', ['soup', 'broth', 'stew']],
];

// Fish and meat win whenever they appear, however little there is.
const PROTEINS = [
  ['Fish', ['fish', 'salmon', 'cod', 'tuna', 'trout', 'haddock', 'hake', 'sardine', 'mackerel', 'sea bass']],
  ['Meat', ['chicken', 'beef', 'pork', 'turkey', 'lamb', 'veal', 'duck', 'meat', 'mince']],
];

// Otherwise the heaviest remaining ingredient decides.
const INGREDIENTS = [
  ['Eggs', ['egg']],
  ['Vegetables', [
    'carrot', 'potato', 'sweet potato', 'broccoli', 'cauliflower', 'pumpkin', 'squash', 'zucchini', 'courgette',
    'spinach', 'tomato', 'cucumber', 'pepper', 'beetroot', 'parsnip', 'kale', 'cabbage', 'onion', 'leek', 'celery',
    'aubergine', 'eggplant', 'corn', 'mushroom',
  ]],
  ['Fruit', [
    'banana', 'apple', 'pear', 'avocado', 'mango', 'peach', 'blueberry', 'strawberry', 'raspberry', 'plum',
    'apricot', 'melon', 'papaya', 'orange', 'kiwi', 'grape', 'berry',
  ]],
  ['Grains', ['rice', 'oat', 'pasta', 'bread', 'couscous', 'quinoa', 'barley', 'millet', 'noodle', 'wheat', 'flour', 'cereal']],
  ['Legumes', ['pea', 'bean', 'lentil', 'chickpea', 'hummus']],
];

// Cooking liquids and fats are usually the heaviest item without being the point of the dish.
const IGNORED = ['water', 'oil', 'butter', 'salt'];

const find = (table, test) => table.find(([, words]) => test(words))?.[0];

export function groupFor({ title, ingredients }) {
  const dish = find(DISHES, (words) => isListed(title, words));
  if (dish) return dish;
  const names = ingredients.map((i) => i.name);
  const protein = find(PROTEINS, (words) => names.some((name) => isListed(name, words)));
  if (protein) return protein;
  const heaviest = ingredients
    .filter((i) => !isListed(i.name, IGNORED))
    .sort((a, b) => b.grams - a.grams)[0];
  return (heaviest && find(INGREDIENTS, (words) => isListed(heaviest.name, words))) || 'Other';
}
