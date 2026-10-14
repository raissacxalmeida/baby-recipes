import { AppError } from './errors.js';

const MODEL = 'gpt-4o-mini';
const TIMEOUT_MS = 30_000;
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
    'Do not mention honey, salt, sugar or milk at all, even to say they are left out. Do not put amounts or units in the steps; amounts belong only in the ingredient list.',
    'List the common allergens the recipe contains in allergens.',
    exclude.length ? `Do not use these titles: ${exclude.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
}

export async function callModel(input, { apiKey, fetchImpl = fetch }) {
  if (!apiKey) throw new AppError('missing-key', 'OPENAI_API_KEY is not set');
  let res;
  try {
    res = await fetchImpl(URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
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
  } catch {
    throw new AppError('upstream-error', 'Could not reach OpenAI');
  }
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' Check OPENAI_API_KEY.' : '';
    throw new AppError('upstream-error', `OpenAI rejected the request (status ${res.status}).${hint}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}
