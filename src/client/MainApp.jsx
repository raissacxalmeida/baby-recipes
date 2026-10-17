import { useEffect, useReducer, useRef, useState } from 'react';
import { ageInMonths } from '../shared/age.js';
import { ageLabel } from '../shared/units.js';
import HomeScreen from './screens/HomeScreen.jsx';
import LikedScreen from './screens/LikedScreen.jsx';
import RecipeScreen from './screens/RecipeScreen.jsx';
import SetupScreen from './screens/SetupScreen.jsx';
import TooYoungScreen from './screens/TooYoungScreen.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';

const MIN_MONTHS = 6;

function startScreen(birthdate, now) {
  if (!birthdate) return 'setup';
  try {
    return ageInMonths(birthdate, now) < MIN_MONTHS ? 'too-young' : 'home';
  } catch {
    return 'setup';
  }
}

export default function MainApp({ api, now, onSessionLost = () => {} }) {
  const [server, setServer] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [screen, setScreen] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fromLiked, setFromLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [, rerender] = useReducer((n) => n + 1, 0);
  const requestId = useRef(0);

  async function refresh() {
    const next = await api.state();
    setServer(next);
    return next;
  }

  useEffect(() => {
    let live = true;
    api.state()
      .then((s) => {
        if (!live) return;
        setServer(s);
        setScreen(startScreen(s.birthdate, now()));
      })
      .catch((err) => live && (err.status === 401 ? onSessionLost() : setLoadError(err.message)));
    return () => { live = false; };
  }, [api]);

  // Leaving a screen drops any pending request and its error. Arriving home starts a fresh ingredient list.
  function go(next) {
    requestId.current += 1;
    setLoading(false);
    setError(null);
    if (next === 'home') setIngredients([]);
    setScreen(next);
  }

  // A 401 means the session ended (expired, or the account was removed): back to the login form.
  function failed(err) {
    if (err.status === 401) onSessionLost();
    else setError(err.message);
  }

  async function guarded(action) {
    try {
      await action();
    } catch (err) {
      failed(err);
    }
    rerender();
  }

  async function saveBirthday(date) {
    try {
      await api.setBirthdate(date);
    } catch (err) {
      if (err.status === 401) return onSessionLost();
      throw err;
    }
    const next = await refresh();
    go(startScreen(next.birthdate, now()));
    return undefined;
  }

  async function suggest() {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const next = await api.suggest(ingredients);
      if (id !== requestId.current) return;
      setRecipe(next);
      setFromLiked(false);
      setSaved(false);
      setScreen('recipe');
      refresh().catch(() => {});
    } catch (err) {
      if (id === requestId.current) failed(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const like = () => guarded(async () => {
    await api.like(recipe);
    setSaved(true);
    await refresh();
  });

  const dislike = () => guarded(async () => {
    await api.dislike(recipe);
    setSaved(false);
    await refresh();
    suggest();
  });

  function open(liked) {
    setRecipe(liked);
    setFromLiked(true);
    go('recipe');
  }

  if (loadError) return <Notice kind="error">{loadError}</Notice>;
  if (!server || !screen) return <Notice>Loading...</Notice>;

  if (screen === 'setup') return <SetupScreen onSave={saveBirthday} now={now} />;
  if (screen === 'too-young') return <TooYoungScreen onChangeBirthday={() => go('setup')} />;
  if (screen === 'liked') {
    return (
      <LikedScreen
        liked={server.liked}
        disliked={server.disliked}
        onOpen={open}
        onUnlike={(id) => guarded(async () => { await api.unlike(id); await refresh(); })}
        onRestore={(id) => guarded(async () => { await api.restore(id); await refresh(); })}
        onBack={() => go('home')}
      />
    );
  }
  if (screen === 'recipe' && recipe) {
    return (
      <>
        <Button variant="ghost" size="sm" className="self-start" onClick={() => go(fromLiked ? 'liked' : 'home')}>
          <Emoji>←</Emoji>
          {fromLiked ? 'Back to liked recipes' : 'New recipe'}
        </Button>
        <RecipeScreen
          key={recipe.id}
          recipe={recipe}
          busy={loading}
          onAnother={fromLiked ? undefined : suggest}
          onLiked={fromLiked ? undefined : like}
          onDisliked={fromLiked ? undefined : dislike}
        />
        {saved && <Notice>Saved to liked recipes.</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </>
    );
  }
  return (
    <HomeScreen
      ageText={ageLabel(ageInMonths(server.birthdate, now()))}
      usage={server.usage}
      ingredients={ingredients}
      onChange={setIngredients}
      onSuggest={suggest}
      loading={loading}
      error={error}
      onShowLiked={() => go('liked')}
    />
  );
}
