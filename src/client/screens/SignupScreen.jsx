import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';

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

  if (invalid) {
    return (
      <Card>
        <section className="grid gap-4"><h1>Invite</h1><Notice kind="error">{error}</Notice></section>
      </Card>
    );
  }
  if (email === null) return <Notice>Checking your invite...</Notice>;
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1>Create your account</h1>
        <Notice className="wrap-anywhere">You were invited as {email}.</Notice>
        <Field label="Choose a password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>Create account</Button>
      </form>
    </Card>
  );
}
