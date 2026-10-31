import { AppError } from './errors.js';
import { isObject } from './guards.js';
import type { ModelInput, TranslatedLanguage, TranslateTask } from './types.js';

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

function prompt({ ageMonths, ingredients, exclude }: ModelInput): string {
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

// What every call needs besides its input: the key, and the fetch to use (replaced in tests).
export interface CallOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

// The reply text of a chat completion. Anything else is a plain TypeError, as reading a missing field always was.
function replyText(data: unknown): string {
  const choice = isObject(data) && Array.isArray(data.choices) ? data.choices[0] : undefined;
  const message = isObject(choice) ? choice.message : undefined;
  const content = isObject(message) ? message.content : undefined;
  if (typeof content !== 'string') throw new TypeError('OpenAI answered in an unexpected shape');
  return content;
}

// One chat completion that answers with JSON matching `schema`; the key travels only in the header.
async function ask(
  { system, user, name, schema }: { system: string; user: string; name: string; schema: object },
  { apiKey, fetchImpl }: { apiKey: string; fetchImpl: typeof fetch },
): Promise<unknown> {
  if (!apiKey) throw new AppError('missing-key', 'OPENAI_API_KEY is not set', { key: 'err.openaiKey' });
  let res: Response;
  try {
    res = await fetchImpl(URL, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } },
      }),
    });
  } catch {
    throw new AppError('upstream-error', 'Could not reach OpenAI', { key: 'err.openaiUnreachable' });
  }
  if (!res.ok) {
    const hint = res.status === 401 || res.status === 403 ? ' Check OPENAI_API_KEY.' : '';
    throw new AppError('upstream-error', `OpenAI rejected the request (status ${res.status}).${hint}`, {
      key: 'err.openaiRejected', params: { status: res.status },
    });
  }
  const data: unknown = await res.json();
  return JSON.parse(replyText(data));
}

export function callModel(input: ModelInput, { apiKey, fetchImpl = fetch }: CallOptions): Promise<unknown> {
  return ask({
    system: 'You are a careful paediatric nutrition assistant who writes simple baby recipes.',
    user: prompt(input),
    name: 'recipe',
    schema: SCHEMA,
  }, { apiKey, fetchImpl });
}

const LANGUAGE_NAMES: Record<TranslatedLanguage, string> = { pt: 'Portuguese', es: 'Spanish', de: 'German' };
const strings = { type: 'array', items: { type: 'string' } };
const wrap = (properties: Record<string, object>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });

// One kind of translation: what to ask, the JSON schema of the answer, and where the useful part of the answer is.
// `prompt` is a method, so the per-kind entries below can be used where any task is accepted.
interface Translation<T extends TranslateTask> {
  schema: object;
  prompt(task: T): string;
  unwrap(answer: unknown): unknown;
}

// The part of a parsed answer under `name`. A null answer is a plain TypeError, as reading it always was;
// any other non-object has no such part, and the caller rejects that.
const field = (answer: unknown, name: string): unknown => {
  if (answer === null || answer === undefined) throw new TypeError('The translator answered in an unexpected shape');
  return isObject(answer) ? answer[name] : undefined;
};

const TRANSLATIONS: { [K in TranslateTask['kind']]: Translation<Extract<TranslateTask, { kind: K }>> } = {
  ingredients: {
    schema: wrap({ items: { type: 'array', items: { type: ['string', 'null'] } } }),
    prompt: ({ language, items }) => [
      `These are food ingredients a parent typed in ${LANGUAGE_NAMES[language]}. Give the common English name of each one, in the same order.`,
      'Answer null for anything that is not clearly a food you can name in English, and whenever you are not sure. Never guess and never replace a word with a different ingredient.',
      `Ingredients: ${JSON.stringify(items)}`,
    ].join('\n'),
    unwrap: (answer) => field(answer, 'items'),
  },
  titles: {
    schema: wrap({ titles: strings }),
    prompt: ({ language, titles }) => [
      `Translate these English baby-recipe titles into ${LANGUAGE_NAMES[language]}, in the same order, one title for each.`,
      'Keep each title short and natural, as it would appear in a cookbook for parents.',
      `Titles: ${JSON.stringify(titles)}`,
    ].join('\n'),
    unwrap: (answer) => field(answer, 'titles'),
  },
  recipe: {
    schema: wrap({ title: { type: 'string' }, ingredients: strings, steps: strings }),
    prompt: ({ language, recipe }) => [
      `Translate this English baby recipe into ${LANGUAGE_NAMES[language]}.`,
      'Keep exactly the same number of ingredients and steps, in the same order. Translate the meaning, not word for word, in natural wording for parents. Do not add or remove anything and do not add amounts.',
      `Recipe: ${JSON.stringify(recipe)}`,
    ].join('\n'),
    unwrap: (answer) => answer,
  },
};

export function callTranslate(task: TranslateTask, { apiKey, fetchImpl = fetch }: CallOptions): Promise<unknown> {
  const kind: Translation<TranslateTask> = TRANSLATIONS[task.kind];
  return ask({
    system: 'You are a careful translator of simple baby-food text.',
    user: kind.prompt(task),
    name: task.kind,
    schema: kind.schema,
  }, { apiKey, fetchImpl }).then(kind.unwrap);
}
