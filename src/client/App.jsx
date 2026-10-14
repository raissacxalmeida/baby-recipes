import { useReducer, useState } from 'react';
import { ageInMonths } from '../shared/age.js';
import { ageLabel } from '../shared/units.js';
import { startScreen } from './store.js';
import SetupScreen from './screens/SetupScreen.jsx';
import TooYoungScreen from './screens/TooYoungScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import RecipeScreen from './screens/RecipeScreen.jsx';
import LikedScreen from './screens/LikedScreen.jsx';

export default function App({ store, fetchRecipe, now = () => new Date() }) {
  const [screen, setScreen] = useState(() => startScreen(store, now()));
  const [birthdate, setBirthdate] = useState(() => store.getBirthdate());
  const [ingredients, setIngredients] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fromLiked, setFromLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, refresh] = useReducer((n) => n + 1, 0);

  function saveBirthday(date) {
    store.setBirthdate(date);
    setBirthdate(date);
    setScreen(ageInMonths(date, now()) < 6 ? 'too-young' : 'home');
  }

  async function suggest() {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchRecipe({ birthdate, ingredients, exclude: store.excludeTitles() });
      store.addShown(next.title);
      setRecipe(next);
      setFromLiked(false);
      setSaved(false);
      setScreen('recipe');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function dislike() {
    store.dislike(recipe);
    suggest();
  }

  function like() {
    store.like(recipe);
    setSaved(true);
  }

  function open(liked) {
    setRecipe(liked);
    setFromLiked(true);
    setScreen('recipe');
  }

  let body;
  if (screen === 'setup') body = <SetupScreen onSave={saveBirthday} now={now} />;
  else if (screen === 'too-young') body = <TooYoungScreen onChangeBirthday={() => setScreen('setup')} />;
  else if (screen === 'liked') {
    body = (
      <LikedScreen
        liked={store.getLiked()}
        disliked={store.getDisliked()}
        onOpen={open}
        onUnlike={(id) => { store.unlike(id); refresh(); }}
        onRestore={(id) => { store.restore(id); refresh(); }}
        onBack={() => setScreen('home')}
      />
    );
  } else if (screen === 'recipe' && recipe) {
    body = (
      <>
        <button type="button" onClick={() => setScreen(fromLiked ? 'liked' : 'home')}>
          {fromLiked ? 'Back to liked recipes' : 'Back to ingredients'}
        </button>
        <RecipeScreen
          key={recipe.id}
          recipe={recipe}
          busy={loading}
          onAnother={fromLiked ? undefined : suggest}
          onLiked={fromLiked ? undefined : like}
          onDisliked={fromLiked ? undefined : dislike}
        />
        {saved && <p>Saved to liked recipes.</p>}
        {error && <p role="alert">{error}</p>}
      </>
    );
  } else {
    body = (
      <HomeScreen
        ageText={ageLabel(ageInMonths(birthdate, now()))}
        ingredients={ingredients}
        onChange={setIngredients}
        onSuggest={suggest}
        loading={loading}
        error={error}
        onShowLiked={() => setScreen('liked')}
      />
    );
  }

  return (
    <main>
      {body}
      <footer>This is not medical advice. Check with your paediatrician if unsure.</footer>
    </main>
  );
}
