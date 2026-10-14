import { AppError } from './errors.js';

const MODEL = 'gpt-4o-mini';
const URL = 'https://api.openai.com/v1/chat/completions';

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'basePortions', 'ingredients', 'steps', 'texture', 'allergens'],
  properties: {
    title: { type: 'string' },
    basePortions: { type: 'integer' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'grams'],
        properties: { name: { type: 'string' }, grams: { type: 'number' } },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
    texture: { type: 'string', enum: ['puree', 'mashed', 'soft-pieces', 'finger-food'] },
    allergens: { type: 'array', items: { type: 'string' } },
  },
};

function prompt({ ageMonths, ingredients, exclude }) {
  return [
    `Write one baby-friendly recipe for a baby aged ${ageMonths} months, in English.`,
    `Mainly use these ingredients: ${ingredients.join(', ')}. You may add a few common extras such as water or oil.`,
    'Give every amount in grams as a number (liquids too, counting 1 ml as 1 g); never use cups, spoons, oz or ml.',
    'basePortions is the number of baby portions the amounts make (1 to 4).',
    'texture must suit the age: puree or mashed from 6 months, mashed or soft-pieces from 9 months, any from 12 months.',
    'Never use honey, salt, sugar or cow\'s milk under 12 months, and no whole nuts, whole grapes or popcorn under 3 years.',
    'List the common allergens the recipe contains in allergens.',
    exclude.length ? `Do not use these titles: ${exclude.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

export async function callModel(input, { apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new AppError('missing-key', 'OPENAI_API_KEY is not set');
  const res = await fetchImpl(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a careful paediatric nutrition assistant who writes simple baby recipes.' },
        { role: 'user', content: prompt(input) },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'recipe', strict: true, schema: SCHEMA } },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed with status ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
