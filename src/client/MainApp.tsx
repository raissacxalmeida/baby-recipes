import { useEffect, useReducer, useRef, useState } from 'react';
import { ageInMonths } from '../shared/age.js';
import Menu from './components/Menu.jsx';
import BabyScreen from './screens/BabyScreen.jsx';
import HomeScreen from './screens/HomeScreen.jsx';
import LikedScreen from './screens/LikedScreen.jsx';
import RecipeScreen from './screens/RecipeScreen.jsx';
import SharedScreen from './screens/SharedScreen.jsx';
import TooYoungScreen from './screens/TooYoungScreen.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from './api.js';
import { asApiError, type ApiError } from './api.js';
import type { ApiRecipe, ApiState, ApiUser, BabyInput, SharedItem } from './apiTypes.js';
import type { CatalogKey } from './i18n/en.js';
import { errorText, getLanguage, t, type ErrorInfo } from './i18n/index.js';
import { titleIn, titleKey } from './localize.js';
import { useRecipeTranslation } from './useRecipeTranslation.js';
import { MAX_BABIES, type Babies } from './useBabies.js';
import type { GroupFilter } from './screens/SharedScreen.jsx';

const MIN_MONTHS = 6;

// 'baby' is the baby showing's details (or the first baby of an account with none); 'add' is another baby.
type Screen = 'baby' | 'add' | 'too-young' | 'home' | 'liked' | 'shared' | 'recipe';
// Where a recipe was opened from.
type Origin = 'home' | 'liked' | 'shared';
// The page the app opens on when it comes back from the admin page or another baby (null: the start screen;
// 'edit': the baby's details; 'add': the screen to add another baby).
export type LandOn = 'liked' | 'shared' | 'edit' | 'add' | null;

// Where the recipe screen's back button goes, by where the recipe was opened from. A freshly suggested recipe has none: the menu leads out.
const BACK: Partial<Record<Origin, { screen: Screen; label: CatalogKey }>> = {
  liked: { screen: 'liked', label: 'recipe.backLiked' },
  shared: { screen: 'shared', label: 'recipe.backCommunity' },
};

// A baby with no name or no valid birthdate is asked for them before anything else.
function startScreen(name: string | null, birthdate: string | null, now: Date): Screen {
  if (!name || !birthdate) return 'baby';
  try {
    return ageInMonths(birthdate, now) < MIN_MONTHS ? 'too-young' : 'home';
  } catch {
    return 'baby';
  }
}

// One baby's app: `api` is already bound to `babies.babyId` (App remounts this per baby), and an account with no baby
// gets the first-baby screen. `onPickBaby` is how a page under another baby in the menu is reached. `landOn` is read
// once, when the app mounts, and `onLanded` then tells App it was used, so a later baby switch starts on Recipe ideas.
export interface MainAppProps {
  api: Api;
  babies: Babies;
  user: ApiUser;
  now: () => Date;
  landOn?: LandOn;
  onSessionLost?: () => void;
  onLogout: () => void;
  onDelete: () => void;
  onAdmin: () => void;
  onPickBaby?: (babyId: string, page: LandOn) => void;
  onLanded?: () => void;
}

export default function MainApp({
  api, babies, user, now, landOn = null, onSessionLost = () => {}, onLogout, onDelete, onAdmin, onPickBaby = () => {},
  onLanded = () => {},
}: MainAppProps) {
  const baby = babies.babies.find((b) => b.id === babies.babyId) ?? null;
  const [server, setServer] = useState<ApiState | null>(null);
  const [loadError, setLoadError] = useState<ErrorInfo | null>(null);
  // Without a baby there is nothing to load: the first-baby screen shows straight away.
  const [screen, setScreen] = useState<Screen | null>(baby ? null : 'baby');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [recipe, setRecipe] = useState<ApiRecipe | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [origin, setOrigin] = useState<Origin>('home');
  // Where Cancel on the add screen goes back to.
  const [beforeAdd, setBeforeAdd] = useState<Screen>('home');
  const [community, setCommunity] = useState<SharedItem[]>([]);
  const [communityGroup, setCommunityGroup] = useState<GroupFilter>('All');
  const [saved, setSaved] = useState(false);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const requestId = useRef(0);
  const asked = useRef(new Set<string>());
  const language = getLanguage();
  const translated = useRecipeTranslation(api, recipe, language, screen === 'recipe');
  // False once another baby is picked (App mounts a new app for them): an answer still on its way for this baby is
  // dropped, and nothing that follows from it (a refresh, the next suggestion after a dislike) is started.
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    onLanded();
    return () => { live.current = false; };
  }, []);

  async function refresh(): Promise<ApiState> {
    const next = await api.state();
    if (live.current) setServer(next);
    return next;
  }

  useEffect(() => {
    if (!baby) return undefined;
    let live = true;
    api.state()
      .then(async (s) => {
        const start = startScreen(baby.name, s.birthdate, now());
        // Arriving from another page (the admin page) can ask for the liked or community page instead of Recipe ideas,
        // or for the baby's details.
        const target: Screen = landOn === 'edit' ? 'baby' : landOn === 'add' ? 'add' : start === 'home' && landOn ? landOn : start;
        const list = target === 'shared' ? await api.listShared() : null;
        if (!live) return;
        setServer(s);
        if (list) setCommunity(list);
        setBeforeAdd(start);
        setScreen(target);
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
      .then((answer) => live.current && setTitles((previous) => ({
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

  // A baby screen's write: a 401 ends the session, any other error is left for the screen to show. Resolves to
  // whether the write went through.
  async function babyWrite(write: () => Promise<unknown>): Promise<boolean> {
    try {
      await write();
      return true;
    } catch (err) {
      if (asApiError(err).status !== 401) throw err;
      onSessionLost();
      return false;
    }
  }

  // A new baby (the first, or another from the menu) is added and selected: App then mounts the app for them, on
  // their Recipe ideas. The baby showing's details are changed and the app goes back to the start screen for their age.
  async function saveBaby(input: BabyInput): Promise<void> {
    if (!baby) {
      await babyWrite(() => babies.add(input));
      return;
    }
    if (!(await babyWrite(() => babies.edit(baby.id, input)))) return;
    const next = await refresh();
    go(startScreen(input.name, next.birthdate, now()));
  }

  const addBaby = (input: BabyInput) => babyWrite(() => babies.add(input));
  // The baby showing goes; App then shows the first remaining baby on their Recipe ideas.
  const removeBaby = (id: string) => babyWrite(() => babies.remove(id));

  // The menu's baby actions, on every screen once a baby exists. Editing the baby showing opens their details here;
  // editing another switches to them first. Add a baby is left out at the cap and on the add screen itself.
  const editBaby = (id: string) => (id === babies.babyId ? go('baby') : onPickBaby(id, 'edit'));
  const canAdd = baby !== null && babies.babies.length < MAX_BABIES && screen !== 'add';
  function openAdd() {
    if (screen) setBeforeAdd(screen);
    go('add');
  }
  const babyActions = {
    onEditBaby: baby ? editBaby : undefined,
    onAddBaby: canAdd ? openAdd : undefined,
  };

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
    if (live.current) suggest();
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

  const account = (
    <Menu user={user} babies={babies.babies} babyId={babies.babyId} {...babyActions} onAdmin={onAdmin} onLogout={onLogout} onDelete={onDelete} />
  );
  if (loadError) return <>{account}<Notice kind="error">{errorText(loadError)}</Notice></>;
  if (screen === 'add') {
    return (
      <>
        {account}
        <BabyScreen key="add" now={now} onSave={addBaby} onCancel={() => go(beforeAdd)} />
      </>
    );
  }
  if (screen === 'baby') {
    // A baby whose details are complete can cancel back to their start screen; a missing name or birthdate must be filled in.
    const back = baby && server ? startScreen(baby.name, server.birthdate, now()) : 'baby';
    return (
      <>
        {account}
        <BabyScreen
          key="baby"
          baby={baby ?? undefined}
          first={!baby}
          now={now}
          onSave={saveBaby}
          onCancel={back !== 'baby' ? () => go(back) : undefined}
          // The last baby cannot be removed: the account's own Delete is the way out for them.
          onRemove={baby && babies.babies.length >= 2 ? () => removeBaby(baby.id) : undefined}
        />
      </>
    );
  }
  if (!server || !screen) return <>{account}<Notice>{t('common.loading')}</Notice></>;

  // An arrow, not a declaration, so the `server` narrowed above still holds inside.
  const renderScreen = () => {
    if (screen === 'too-young') return <TooYoungScreen onChangeBirthday={() => go('baby')} />;
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
  // A page under the baby showing is just opened (Recipe ideas is their start page, the too-young page for a baby
  // under 6 months); one under another baby goes through App, which switches babies.
  const inApp = ['too-young', 'home', 'liked', 'shared', 'recipe'].includes(screen);
  const start = startScreen(baby?.name ?? null, server.birthdate, now());
  const page = (target: 'home' | 'liked') => (id: string) => {
    if (id !== babies.babyId) onPickBaby(id, target === 'liked' ? 'liked' : null);
    else go(target === 'home' ? start : 'liked');
  };
  return (
    <>
      <Menu
        user={user}
        current={screen === 'too-young' ? 'home' : screen}
        babies={babies.babies}
        babyId={babies.babyId}
        onIdeas={inApp ? page('home') : undefined}
        onLiked={inApp ? page('liked') : undefined}
        onCommunity={inApp ? showCommunity : undefined}
        {...babyActions}
        onAdmin={onAdmin}
        onLogout={onLogout}
        onDelete={onDelete}
      />
      {renderScreen()}
    </>
  );
}
