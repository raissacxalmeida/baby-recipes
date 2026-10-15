import { useEffect, useState } from 'react';
import AccountBar from './screens/AccountBar.jsx';
import AdminScreen from './screens/AdminScreen.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import ResetScreen from './screens/ResetScreen.jsx';
import SignupScreen from './screens/SignupScreen.jsx';
import MainApp from './MainApp.jsx';

const defaultNavigate = (path) => window.history.pushState({}, '', path);

export default function App({ api, now = () => new Date(), path: initialPath, navigate = defaultNavigate }) {
  const [path, setPath] = useState(() => initialPath ?? window.location.pathname);
  const [session, setSession] = useState({ status: 'loading', user: null });

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
  const signedIn = (user) => setSession({ status: 'ready', user });
  const signedOut = () => setSession({ status: 'anon', user: null });

  let body;
  if (invite) {
    body = <SignupScreen api={api} token={decodeURIComponent(invite[1])} onDone={(user) => { signedIn(user); go('/'); }} />;
  } else if (reset) {
    body = <ResetScreen api={api} token={decodeURIComponent(reset[1])} onDone={() => go('/')} />;
  } else if (session.status === 'loading') {
    body = <p>Loading...</p>;
  } else if (session.status === 'anon') {
    body = <LoginScreen api={api} onLoggedIn={signedIn} />;
  } else {
    body = (
      <>
        <AccountBar
          user={session.user}
          onLogout={async () => { await api.logout(); signedOut(); go('/'); }}
          onDelete={async () => { await api.deleteAccount(); signedOut(); go('/'); }}
          onAdmin={() => go('/admin')}
        />
        {path === '/admin'
          ? <AdminScreen api={api} me={session.user} onBack={() => go('/')} />
          : <MainApp api={api} user={session.user} now={now} />}
      </>
    );
  }

  return (
    <main>
      {body}
      <footer>This is not medical advice. Check with your paediatrician if unsure.</footer>
    </main>
  );
}
