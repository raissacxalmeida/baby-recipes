import { useEffect, useReducer, useRef, useState } from 'react';
import { ageInMonths } from '../shared/age.js';
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
import type { Api } from './api.js';
import { asApiError, type ApiError } from './api.js';
import type { ApiRecipe, ApiState, ApiUser, SharedItem } from './apiTypes.js';
import type { CatalogKey } from './i18n/en.js';
import { errorText, getLanguage, t, type ErrorInfo } from './i18n/index.js';
import { titleIn, titleKey } from './localize.js';
import { useRecipeTranslation } from './useRecipeTranslation.js';
import type { GroupFilter } from './screens/SharedScreen.jsx';

const MIN_MONTHS = 6;

type Screen = 'setup' | 'too-young' | 'home' | 'liked' | 'shared' | 'recipe';
// Where a recipe was opened from.
type Origin = 'home' | 'liked' | 'shared';
// The page the app opens on when it comes back from the admin page (null: the start screen).
export type LandOn = 'liked' | 'shared' | null;

// Where the recipe screen's back button goes, by where the recipe was opened from. A freshly suggested recipe has none: the menu leads out.
const BACK: Partial<Record<Origin, { screen: Screen; label: CatalogKey }>> = {
  liked: { screen: 'liked', label: 'recipe.backLiked' },
  shared: { screen: 'shared', label: 'recipe.backCommunity' },
};

function startScreen(birthdate: string | null, now: Date): Screen {
  if (!birthdate) return 'setup';
  try {
    return ageInMonths(birthdate, now) < MIN_MONTHS ? 'too-young' : 'home';
  } catch {
    return 'setup';
  }
}

export interface MainAppProps {
  api: Api;
  user: ApiUser;
  now: () => Date;
  landOn?: LandOn;
  onSessionLost?: () => void;
  onLogout: () => void;
  onDelete: () => void;
  onAdmin: () => void;
}

export default function MainApp({ api, user, now, landOn = null, onSessionLost = () => {}, onLogout, onDelete, onAdmin }: MainAppProps) {
  const [server, setServer] = useState<ApiState | null>(null);
  const [loadError, setLoadError] = useState<ErrorInfo | null>(null);
  const [screen, setScreen] = useState<Screen | null>(null);
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipe, setRecipe] = useState<ApiRecipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [origin, setOrigin] = useState<Origin>('home');
  const [community, setCommunity] = useState<SharedItem[]>([]);
  const [communityGroup, setCommunityGroup] = useState<GroupFilter>('All');
  const [saved, setSaved] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const requestId = useRef(0);
  const asked = useRef(new Set<string>());
  const language = getLanguage();
  const translated = useRecipeTranslation(api, recipe, language, screen === 'recipe');

  async function refresh(): Promise<ApiState> {
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
      .catch((err: unknown) => live && (asApiError(err).status === 401 ? onSessionLost() : setLoadError(asApiError(err))));
    return () => { live = false; };
  }, [api]);

  // The lists show every title in the chosen language, so their titles are translated together, once per language.
  // A failure leaves the English titles and is tried again the next time the list is shown.
  useEffect(() => {
    if (language === 'en' || !server) return;
    const recipes = screen === 'liked' ? [...server.liked, ...server.disliked] : screen === 'shared' ? community.map((c) => c.recipe) : [];
    const missing = [...new Set(recipes.map((r) => r.title))].filter((title) => !asked.current.has(titleKey(language, title)));
    if (missing.length === 0) return;
    missing.forEach((title) => asked.current.add(titleKey(language, title)));
    api.translateTitles(language, missing)
      .then((answer) => setTitles((previous) => ({
        ...previous, ...Object.fromEntries(Object.entries(answer).map(([title, translated]): [string, string] => [titleKey(language, title), translated])),
      })))
      .catch(() => missing.forEach((title) => asked.current.delete(titleKey(language, title))));
  }, [screen, language, server, community]);

  // Leaving a screen drops any pending request and its error. Arriving home starts a fresh ingredient list.
  function go(next: Screen) {
    requestId.current += 1;
    setLoading(false);
    setError(null);
    if (next === 'home') setIngredients([]);
    setScreen(next);
  }

  // A 401 means the session ended (expired, or the account was removed): back to the login form.
  function failed(err: ApiError) {
    if (err.status === 401) onSessionLost();
    else setError(err);
  }

  async function guarded(action: () => Promise<unknown>) {
    try {
      await action();
    } catch (err) {
      failed(asApiError(err));
    }
    rerender();
  }

  async function saveBirthday(date: string): Promise<void> {
    try {
      await api.setBirthdate(date);
    } catch (err) {
      if (asApiError(err).status === 401) return onSessionLost();
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
      if (id === requestId.current) failed(asApiError(err));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const like = () => guarded(async () => {
    if (!recipe) return;
    await api.like(recipe);
    setSaved(true);
    await refresh();
  });

  const dislike = () => guarded(async () => {
    if (!recipe) return;
    await api.dislike(recipe);
    setSaved(false);
    await refresh();
    suggest();
  });

  function open(opened: ApiRecipe, from: Origin = 'liked') {
    setRecipe(opened);
    setOrigin(from);
    go('recipe');
  }

  const showCommunity = () => guarded(async () => {
    setCommunity(await api.listShared());
    go('shared');
  });

  const toggleCommunityLike = (item: SharedItem) => guarded(async () => {
    await (item.liked ? api.unlikeShared(item.id) : api.likeShared(item.id));
    setCommunity(await api.listShared());
    await refresh();
  });

  const account = <Menu user={user} onAdmin={onAdmin} onLogout={onLogout} onDelete={onDelete} />;
  if (loadError) return <>{account}<Notice kind="error">{errorText(loadError)}</Notice></>;
  if (!server || !screen) return <>{account}<Notice>{t('common.loading')}</Notice></>;

  // An arrow, not a declaration, so the `server` narrowed above still holds inside.
  const renderScreen = () => {
    if (screen === 'setup') return <SetupScreen onSave={saveBirthday} now={now} />;
    if (screen === 'too-young') return <TooYoungScreen onChangeBirthday={() => go('setup')} />;
    if (screen === 'liked') {
      return (
        <LikedScreen
          liked={server.liked}
          disliked={server.disliked}
          titleOf={(title) => titleIn(titles, language, title)}
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
          titleOf={(title) => titleIn(titles, language, title)}
          group={communityGroup}
          onGroup={setCommunityGroup}
          error={error}
          onOpen={(item) => open(item.recipe, 'shared')}
          onToggleLike={toggleCommunityLike}
        />
      );
    }
    if (screen === 'recipe' && translated.recipe) {
      const back = BACK[origin];
      return (
        <>
          {back && (
            <Button variant="ghost" size="sm" className="self-start" onClick={() => go(back.screen)}>
              <Emoji>←</Emoji>
              {t(back.label)}
            </Button>
          )}
          {/* The recipe is shown whole in one language: a notice while its translation is on the way. */}
          {translated.status === 'pending'
            ? <Notice>{t('recipe.translating')}</Notice>
            : (
              <RecipeScreen
                key={translated.recipe.id}
                recipe={translated.recipe}
                busy={loading}
                onAnother={origin === 'home' ? suggest : undefined}
                onLiked={origin === 'home' ? like : undefined}
                onDisliked={origin === 'home' ? dislike : undefined}
              />
            )}
          {saved && <Notice>{t('recipe.saved')}</Notice>}
          {error && <Notice kind="error">{errorText(error)}</Notice>}
        </>
      );
    }
    return (
      <HomeScreen
        ageText={t('age.months', { count: ageInMonths(server.birthdate, now()) })}
        usage={server.usage}
        ingredients={ingredients}
        onChange={setIngredients}
        onSuggest={suggest}
        loading={loading}
        error={error}
      />
    );
  };

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
