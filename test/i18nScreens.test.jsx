import { test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react';
import catalogs from '../src/client/i18n/catalogs.js';
import { setLanguage } from '../src/client/i18n/index.js';
import HomeScreen from '../src/client/screens/HomeScreen.jsx';
import LikedScreen from '../src/client/screens/LikedScreen.jsx';
import RecipeScreen from '../src/client/screens/RecipeScreen.jsx';
import SharedScreen from '../src/client/screens/SharedScreen.jsx';
import { englishLeft } from './helpers/i18n.js';
import { make } from './helpers/app.jsx';

afterEach(cleanup);

const OTHER_LANGUAGES = ['pt', 'es', 'de'];
const word = (language, key, params = {}) =>
  Object.entries(params).reduce((text, [name, value]) => text.replace(`{${name}}`, value), catalogs[language][key]);

const home = (props = {}) => render(
  <HomeScreen
    ageText="8 months"
    ingredients={['banana']}
    onChange={vi.fn()}
    onSuggest={vi.fn()}
    loading={false}
    error={null}
    usage={{ recipesToday: 2, limit: 10 }}
    {...props}
  />,
);

test.each(OTHER_LANGUAGES)('the home screen is fully in %s', (language) => {
  setLanguage(language);
  home();
  expect(screen.getByRole('heading', { name: word(language, 'home.title') })).not.toBeNull();
  expect(screen.getByText(word(language, 'home.usage', { used: 2, limit: 10 }))).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'home.remove', { name: 'banana' }) })).not.toBeNull();
  expect(englishLeft(document.body, language, ['home.'])).toEqual([]);
});

test('the baby age sentence takes the translated age as a whole', () => {
  setLanguage('de');
  home({ ageText: '8 Monate' });
  expect(screen.getByText('Das Baby ist 8 Monate alt.')).not.toBeNull();
});

test('there is no English-only note under the ingredient box in any language', () => {
  expect(catalogs.en['home.ingredientNote']).toBeUndefined();
  for (const language of ['en', 'pt', 'es', 'de']) {
    setLanguage(language);
    home();
    expect(screen.queryByText(/English|inglés|inglês|Englisch/)).toBeNull();
    cleanup();
  }
});

const typeAndAdd = (language, text) => {
  fireEvent.change(screen.getByLabelText(catalogs[language]['home.ingredient']), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: catalogs[language]['home.add'] }));
};

test('a word typed in another language keeps its ending, while English words are still made singular', () => {
  setLanguage('pt');
  const onChange = vi.fn();
  home({ ingredients: [], onChange });
  typeAndAdd('pt', 'Feijoes');
  expect(onChange).toHaveBeenCalledWith(['feijoes']);
  cleanup();
  setLanguage('en');
  const onEnglish = vi.fn();
  home({ ingredients: [], onChange: onEnglish });
  typeAndAdd('en', 'Tomatoes');
  expect(onEnglish).toHaveBeenCalledWith(['tomato']);
});

const dish = {
  ...make('Banana mash'),
  allergens: ['milk', 'sesame', 'lupin'],
  ingredients: [{ name: 'banana', grams: 1500, inList: true }, { name: 'oats', grams: 30, inList: false }],
};
const recipeScreen = () => (
  <RecipeScreen recipe={dish} onAnother={vi.fn()} onLiked={vi.fn()} onDisliked={vi.fn()} />
);

test.each(OTHER_LANGUAGES)('the recipe screen is fully in %s', (language) => {
  setLanguage(language);
  render(recipeScreen());
  expect(screen.getByRole('button', { name: word(language, 'recipe.fewer') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'recipe.more') })).not.toBeNull();
  expect(englishLeft(document.body, language, ['recipe.'])).toEqual([]);
});

test('allergens are translated and an unknown one is shown as it is', () => {
  setLanguage('de');
  render(recipeScreen());
  expect(screen.getByRole('note').textContent).toContain('Allergene: Milch, Sesam, lupin');
});

test('amounts use the decimal mark of the language', () => {
  render(recipeScreen());
  expect(screen.getByText('1.5 kg')).not.toBeNull();
  cleanup();
  setLanguage('de');
  render(recipeScreen());
  expect(screen.getByText('1,5 kg')).not.toBeNull();
});

test('portions are counted in the language of the page', () => {
  setLanguage('es');
  render(recipeScreen());
  expect(screen.getByText('2 porciones')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Menos porciones' }));
  expect(screen.getByText('1 porción')).not.toBeNull();
});

test('switching language keeps the chosen portions', () => {
  const { rerender } = render(recipeScreen());
  fireEvent.click(screen.getByRole('button', { name: 'More portions' }));
  expect(screen.getByText('3 portions')).not.toBeNull();
  // App re-renders everything below it when the language changes; the screen keeps its state.
  act(() => setLanguage('de'));
  rerender(recipeScreen());
  expect(screen.getByText('3 Portionen')).not.toBeNull();
});

const liked = (props = {}) => render(
  <LikedScreen
    liked={[make('Banana mash')]}
    disliked={[make('Oat porridge')]}
    onOpen={vi.fn()}
    onUnlike={vi.fn()}
    onRestore={vi.fn()}
    onShare={vi.fn()}
    onUnshare={vi.fn()}
    {...props}
  />,
);

test.each(OTHER_LANGUAGES)('the liked screen is fully in %s', (language) => {
  setLanguage(language);
  liked();
  expect(screen.getByRole('heading', { name: word(language, 'liked.title') })).not.toBeNull();
  for (const [key, title] of [['common.openLabel', 'Banana mash'], ['liked.shareLabel', 'Banana mash'], ['liked.removeLabel', 'Banana mash'], ['liked.restoreLabel', 'Oat porridge']]) {
    expect(screen.getByRole('button', { name: word(language, key, { title }) }), key).not.toBeNull();
  }
  expect(englishLeft(document.body, language, ['liked.', 'common.open'])).toEqual([]);
});

test.each(OTHER_LANGUAGES)('the empty liked lists are in %s', (language) => {
  setLanguage(language);
  liked({ liked: [], disliked: [] });
  expect(screen.getByText(word(language, 'liked.none'))).not.toBeNull();
  expect(screen.getByText(word(language, 'liked.nothing'))).not.toBeNull();
});

test('an unshare button is labelled in German', () => {
  setLanguage('de');
  liked({ sharedIds: ['banana-mash'] });
  expect(screen.getByRole('button', { name: 'Banana mash nicht mehr teilen' })).not.toBeNull();
});

const item = (title, extra = {}) => ({
  id: `s-${title}`, recipe: make(title), group: 'Other', ageMonths: 10, likes: 3, mine: false, liked: false, ...extra,
});
const community = [item('Pear mash', { group: 'Fruit', likes: 1 }), item('Salmon mash', { group: 'Fish', liked: true })];
const shared = (props = {}) => render(
  <SharedScreen recipes={community} group="All" onGroup={vi.fn()} onOpen={vi.fn()} onToggleLike={vi.fn()} {...props} />,
);

test.each(OTHER_LANGUAGES)('the community screen is fully in %s', (language) => {
  setLanguage(language);
  shared();
  expect(screen.getByRole('heading', { name: word(language, 'shared.title') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'group.All') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'group.Fruit') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'group.Fish') })).not.toBeNull();
  expect(screen.getByRole('button', { name: word(language, 'shared.likeLabel', { title: 'Pear mash' }) })).not.toBeNull();
  expect(englishLeft(document.body, language, ['shared.', 'group.', 'common.open'])).toEqual([]);
});

test('the German community page counts likes and months in German and filters by the English group', () => {
  setLanguage('de');
  const onGroup = vi.fn();
  shared({ onGroup });
  const card = screen.getByText('Pear mash').closest('li');
  expect(within(card).getByText('10 Mon.')).not.toBeNull();
  expect(within(card).getByText('1 Like')).not.toBeNull();
  expect(screen.getByText('3 Likes')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Obst' }));
  expect(onGroup).toHaveBeenCalledWith('Fruit');
});

test('the empty community page and the own-recipe badge are in Portuguese', () => {
  setLanguage('pt');
  shared({ recipes: [] });
  expect(screen.getByRole('note').textContent).toBe(word('pt', 'shared.none'));
  cleanup();
  shared({ recipes: [item('Banana cake', { group: 'Cake', mine: true })] });
  expect(screen.getByText(word('pt', 'shared.mine'))).not.toBeNull();
});
