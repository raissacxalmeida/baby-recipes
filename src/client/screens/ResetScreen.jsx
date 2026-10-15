import { useEffect, useState } from 'react';

const MIN_PASSWORD = 10;

export default function ResetScreen({ api, token, onDone }) {
  const [email, setEmail] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [invalid, setInvalid] = useState(false);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.resetInfo(token)
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
      await api.reset(token, password);
      setChanged(true);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (invalid) return <section><h1>Reset password</h1><p role="alert">{error}</p></section>;
  if (changed) {
    return (
      <section>
        <h1>Password changed</h1>
        <button type="button" onClick={() => onDone()}>Go to log in</button>
      </section>
    );
  }
  if (email === null) return <p>Checking your link...</p>;
  return (
    <form onSubmit={submit}>
      <h1>Reset password</h1>
      <p>New password for {email}.</p>
      <label>
        New password
        <input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>Change password</button>
    </form>
  );
}
