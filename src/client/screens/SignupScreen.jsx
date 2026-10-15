import { useEffect, useState } from 'react';

const MIN_PASSWORD = 10;

export default function SignupScreen({ api, token, onDone }) {
  const [email, setEmail] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.invite(token)
      .then((r) => live && setEmail(r.email))
      .catch((err) => { if (live) { setInvalid(true); setError(err.message); } });
    return () => { live = false; };
  }, [api, token]);

  async function submit(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError(`Use a password with at least ${MIN_PASSWORD} characters`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.signup(token, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (invalid) return <section><h1>Invite</h1><p role="alert">{error}</p></section>;
  if (email === null) return <p>Checking your invite...</p>;
  return (
    <form onSubmit={submit}>
      <h1>Create your account</h1>
      <p>You were invited as {email}.</p>
      <label>
        Choose a password
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>Create account</button>
    </form>
  );
}
