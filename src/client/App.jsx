import { useEffect, useState } from 'react';
import AdminScreen from './screens/AdminScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ResetScreen from './screens/ResetScreen.jsx';
import SignupScreen from './screens/SignupScreen.jsx';
import MainApp from './MainApp.jsx';
import Menu from './components/Menu.jsx';
import { Notice } from '@/components/ui/notice.jsx';

const defaultNavigate = (path) => window.history.pushState({}, '', path);
const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export default function App({ api, now = () => new Date(), path: initialPath, navigate = defaultNavigate }) {
  const [path, setPath] = useState(() => initialPath ?? window.location.pathname);
  const [session, setSession] = useState({ status: 'loading', user: null });
  const [notice, setNotice] = useState(null);
  const [accountError, setAccountError] = useState(null);
  // Which page the app should open on when it comes back from the admin page.
  const [landOn, setLandOn] = useState(null);

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

  function go(next) {
    navigate(next);
    setPath(next);
  }
  const signedIn = (user) => { setNotice(null); setSession({ status: 'ready', user }); };
  const signedOut = () => { setLandOn(null); setSession({ status: 'anon', user: null }); };
  const sessionLost = () => { setNotice('Your session ended. Please log in again.'); signedOut(); };

  let body;
  if (invite) {
    body = <SignupScreen api={api} token={safeDecode(invite[1])} onDone={(user) => { signedIn(user); go('/'); }} />;
  } else if (reset) {
    body = <ResetScreen api={api} token={safeDecode(reset[1])} onDone={() => go('/')} />;
  } else if (session.status === 'loading') {
    body = <Notice>Loading...</Notice>;
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
          setAccountError(err.message);
        }
      },
      onAdmin: () => { setLandOn(null); go('/admin'); },
    };
    const land = (page) => () => { setLandOn(page); go('/'); };
    body = path === '/admin'
      ? (
        <>
          <Menu {...account} current="admin" onHome={land(null)} onLiked={land('liked')} onCommunity={land('shared')} />
          {accountError && <Notice kind="error">{accountError}</Notice>}
          <AdminScreen api={api} me={session.user} onBack={() => go('/')} />
        </>
      )
      : (
        <>
          {accountError && <Notice kind="error">{accountError}</Notice>}
          <MainApp api={api} now={now} landOn={landOn} onSessionLost={sessionLost} {...account} />
        </>
      );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">
      {body}
      <footer className="mt-4 text-center text-xs text-muted-foreground">
        This is not medical advice. Check with your paediatrician if unsure.
      </footer>
    </main>
  );
}
