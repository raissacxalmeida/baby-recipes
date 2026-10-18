import { useEffect, useReducer, useRef, useState } from 'react';
import { ageInMonths } from '../shared/age.js';
import { ageLabel } from '../shared/units.js';
import Menu from './components/Menu.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import LikedScreen from './screens/LikedScreen.jsx';
import RecipeScreen from './screens/RecipeScreen.jsx';
import SetupScreen from './screens/SetupScreen.jsx';
import SharedScreen from './screens/SharedScreen.jsx';
import TooYoungScreen from './screens/TooYoungScreen.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';

const MIN_MONTHS = 6;

// Where the recipe screen's back button goes, by where the recipe was opened from. A freshly suggested recipe has none: the menu leads out.
const BACK = {
  liked: { screen: 'liked', label: 'Back to liked recipes' },
  shared: { screen: 'shared', label: 'Back to community recipes' },
};

function startScreen(birthdate, now) {
  if (!birthdate) return 'setup';
  try {
    return ageInMonths(birthdate, now) < MIN_MONTHS ? 'too-young' : 'home';
  } catch {
    return 'setup';
  }
}

export default function MainApp({ api, user, now, landOn = null, onSessionLost = () => {}, onLogout, onDelete, onAdmin }) {
  const [server, setServer] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [screen, setScreen] = useState(null);
  const [ingredients, setIngredients] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [origin, setOrigin] = useState('home');
  const [community, setCommunity] = useState([]);
  const [communityGroup, setCommunityGroup] = useState('All');
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
      .then(async (s) => {
        const start = startScreen(s.birthdate, now());
        // Arriving from another page (the admin page) can ask for the liked or community page instead of Home.
        const list = start === 'home' && landOn === 'shared' ? await api.listShared() : null;
        if (!live) return;
        setServer(s);
        if (list) setCommunity(list);
        setScreen(start === 'home' && landOn ? landOn : start);
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
      setOrigin('home');
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

  function open(opened, from = 'liked') {
    setRecipe(opened);
    setOrigin(from);
    go('recipe');
  }

  const showCommunity = () => guarded(async () => {
    setCommunity(await api.listShared());
    go('shared');
  });

  const toggleCommunityLike = (item) => guarded(async () => {
    await (item.liked ? api.unlikeShared(item.id) : api.likeShared(item.id));
    setCommunity(await api.listShared());
    await refresh();
  });

  const account = <Menu user={user} onAdmin={onAdmin} onLogout={onLogout} onDelete={onDelete} />;
  if (loadError) return <>{account}<Notice kind="error">{loadError}</Notice></>;
  if (!server || !screen) return <>{account}<Notice>Loading...</Notice></>;

  function renderScreen() {
    if (screen === 'setup') return <SetupScreen onSave={saveBirthday} now={now} />;
    if (screen === 'too-young') return <TooYoungScreen onChangeBirthday={() => go('setup')} />;
    if (screen === 'liked') {
      return (
        <LikedScreen
          liked={server.liked}
          disliked={server.disliked}
          onOpen={open}
          sharedIds={server.sharedIds}
          copiedIds={server.copiedIds}
          error={error}
          onShare={(r) => guarded(async () => { await api.share(r.id); await refresh(); })}
          onUnshare={(r) => guarded(async () => { await api.unshare(r.id); await refresh(); })}
          onUnlike={(id) => guarded(async () => { await api.unlike(id); await refresh(); })}
          onRestore={(id) => guarded(async () => { await api.restore(id); await refresh(); })}
        />
      );
    }
    if (screen === 'shared') {
      return (
        <SharedScreen
          recipes={community}
          group={communityGroup}
          onGroup={setCommunityGroup}
          error={error}
          onOpen={(item) => open(item.recipe, 'shared')}
          onToggleLike={toggleCommunityLike}
        />
      );
    }
    if (screen === 'recipe' && recipe) {
      return (
        <>
          {BACK[origin] && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => go(BACK[origin].screen)}>
              <Emoji>←</Emoji>
              {BACK[origin].label}
            </Button>
          )}
          <RecipeScreen
            key={recipe.id}
            recipe={recipe}
            busy={loading}
            onAnother={origin === 'home' ? suggest : undefined}
            onLiked={origin === 'home' ? like : undefined}
            onDisliked={origin === 'home' ? dislike : undefined}
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
      />
    );
  }

  // The page links only make sense once the app proper has started; the recipe page marks no page as current.
  const inApp = ['home', 'liked', 'shared', 'recipe'].includes(screen);
  return (
    <>
      <Menu
        user={user}
        current={screen}
        onHome={inApp ? () => go('home') : undefined}
        onLiked={inApp ? () => go('liked') : undefined}
        onCommunity={inApp ? showCommunity : undefined}
        onAdmin={onAdmin}
        onLogout={onLogout}
        onDelete={onDelete}
      />
      {renderScreen()}
    </>
  );
}
