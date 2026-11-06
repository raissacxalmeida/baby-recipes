import { useEffect, useMemo, useState } from 'react';
import AdminScreen from './screens/AdminScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ResetScreen from './screens/ResetScreen.jsx';
import SignupScreen from './screens/SignupScreen.jsx';
import MainApp, { type LandOn } from './MainApp.jsx';
import Logo from './components/Logo.jsx';
import LanguageSwitch from './components/LanguageSwitch.jsx';
import Menu from './components/Menu.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from './api.js';
import { asApiError } from './api.js';
import type { ApiUser } from './apiTypes.js';
import { errorText, getLanguage, setLanguage, t, useLanguage, type ErrorInfo } from './i18n/index.js';
import { MAX_BABIES, useBabies } from './useBabies.js';
import { isLanguage } from '../shared/languages.js';
import type { Language } from '../shared/types.js';

const defaultNavigate = (path: string) => window.history.pushState({}, '', path);
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

type SessionState =
  | { status: 'loading'; user: null }
  | { status: 'anon'; user: null }
  | { status: 'ready'; user: ApiUser };

export interface AppProps {
  api: Api;
  now?: () => Date;
  path?: string;
  navigate?: (path: string) => void;
}

export default function App({ api, now = () => new Date(), path: initialPath, navigate = defaultNavigate }: AppProps) {
  const [path, setPath] = useState(() => initialPath ?? window.location.pathname);
  const [session, setSession] = useState<SessionState>({ status: 'loading', user: null });
  const [notice, setNotice] = useState<ErrorInfo | null>(null);
  const [accountError, setAccountError] = useState<ErrorInfo | null>(null);
  // Which page the app should open on when it comes back from the admin page or switches to another baby. The app
  // reads it once when it mounts and clears it (onLanded), so it is never used twice.
  const [landOn, setLandOn] = useState<LandOn>(null);

  // App is the one component that follows the language: its re-render carries every screen below it.
  useLanguage();

  const invite = /^\/invite\/([^/]+)$/.exec(path);
  const reset = /^\/reset\/([^/]+)$/.exec(path);
  const special = Boolean(invite || reset);

  useEffect(() => {
    if (special) return undefined;
    let live = true;
    api.session()
      .then((r) => live && setSession(r ? { status: 'ready', user: r.user } : { status: 'anon', user: null }))
      .catch(() => live && setSession({ status: 'anon', user: null }));
    return () => { live = false; };
  }, [api, special]);

  // The language saved on the account wins; an account with none takes the one showing now. A failed save is not worth a message.
  useEffect(() => {
    const { user } = session;
    if (!user) return;
    if (isLanguage(user.language)) setLanguage(user.language);
    else api.setLanguage(getLanguage()).catch(() => {});
  }, [session.user]);

  function chooseLanguage(code: Language) {
    setLanguage(code);
    if (session.user) api.setLanguage(code).catch(() => {});
  }

  function go(next: string) {
    navigate(next);
    setPath(next);
  }
  const signedIn = (user: ApiUser) => { setNotice(null); setSession({ status: 'ready', user }); };
  const signedOut = () => { setLandOn(null); setSession({ status: 'anon', user: null }); };
  const sessionLost = () => { setNotice({ message: t('auth.sessionEnded'), key: 'auth.sessionEnded' }); signedOut(); };

  // The babies belong to the account, so App holds them: the admin page's menu and the app both list them.
  // The app gets an Api bound to the baby showing, and is remounted (keyed by that baby) when another is picked.
  const babies = useBabies(api, session.status === 'ready', sessionLost);
  const babyApi = useMemo(() => api.withBaby(babies.babyId), [api, babies.babyId]);
  const pickBaby = (babyId: string, page: LandOn) => {
    setLandOn(page);
    if (babyId !== babies.babyId) babies.select(babyId);
  };

  let body;
  if (invite) {
    body = <SignupScreen api={api} token={safeDecode(invite[1])} onDone={(user) => { signedIn(user); go('/'); }} />;
  } else if (reset) {
    body = <ResetScreen api={api} token={safeDecode(reset[1])} onDone={() => go('/')} />;
  } else if (session.status === 'loading') {
    body = <Notice>{t('common.loading')}</Notice>;
  } else if (session.status === 'anon') {
    body = <LoginScreen api={api} onLoggedIn={signedIn} notice={notice} />;
  } else {
    const account = {
      user: session.user,
      onLogout: async () => {
        try { await api.logout(); } catch { /* sign out on this device anyway */ }
        signedOut();
        go('/');
      },
      onDelete: async () => {
        setAccountError(null);
        try {
          await api.deleteAccount();
          signedOut();
          go('/');
        } catch (err) {
          setAccountError(asApiError(err));
        }
      },
      onAdmin: () => go('/admin'),
    };
    // The admin page's menu has the same baby sections as the app: a page under a baby opens that baby's page.
    const land = (page: LandOn) => (babyId: string) => { pickBaby(babyId, page); go('/'); };
    const leave = (page: LandOn) => () => { setLandOn(page); go('/'); };
    const menu = { ...account, babies: babies.babies, babyId: babies.babyId };
    if (path === '/admin') {
      body = (
        <>
          <Menu
            {...menu}
            current="admin"
            onIdeas={land(null)}
            onLiked={land('liked')}
            onEditBaby={land('edit')}
            onAddBaby={babies.babies.length < MAX_BABIES ? leave('add') : undefined}
            onCommunity={leave('shared')}
          />
          {accountError && <Notice kind="error">{errorText(accountError)}</Notice>}
          <AdminScreen api={api} me={session.user} />
        </>
      );
    } else if (babies.status === 'loading') {
      // No menu yet: the app's own menu comes next, and one shown now would be replaced (and closed) under the person.
      body = <Notice>{t('common.loading')}</Notice>;
    } else if (babies.status === 'error') {
      body = (
        <>
          <Menu {...menu} />
          {babies.error && <Notice kind="error">{errorText(babies.error)}</Notice>}
        </>
      );
    } else {
      body = (
        <>
          {accountError && <Notice kind="error">{errorText(accountError)}</Notice>}
          <MainApp
            key={babies.babyId ?? 'none'}
            api={babyApi}
            babies={babies}
            now={now}
            landOn={landOn}
            onSessionLost={sessionLost}
            onPickBaby={pickBaby}
            onLanded={() => setLandOn(null)}
            {...account}
          />
        </>
      );
    }
  }

  // The pages shown before logging in get the big logo; once in, the menu header carries the small one.
  const loggedOut = Boolean(invite || reset) || session.status === 'anon';

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      {loggedOut && <Logo size="lg" tagline />}
      {body}
      <footer className="mt-4 grid gap-2 text-center text-xs text-muted-foreground">
        <p className="m-0">{t('footer.disclaimer')}</p>
        <LanguageSwitch onChange={chooseLanguage} />
      </footer>
    </main>
  );
}
