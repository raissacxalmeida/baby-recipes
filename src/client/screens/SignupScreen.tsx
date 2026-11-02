import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from '../api.js';
import { asApiError } from '../api.js';
import type { ApiUser } from '../apiTypes.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';

const MIN_PASSWORD = 10;

export interface SignupScreenProps {
  api: Api;
  token: string;
  onDone: (user: ApiUser) => void;
}

export default function SignupScreen({ api, token, onDone }: SignupScreenProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.invite(token)
      .then((r) => live && setEmail(r.email))
      .catch((err: unknown) => { if (live) { setInvalid(true); setError(asApiError(err)); } });
    return () => { live = false; };
  }, [api, token]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      // Kept as data (key and values) so a language switch words it again; `message` is the text for now.
      setError({ message: t('err.passwordShort', { min: MIN_PASSWORD }), key: 'err.passwordShort', params: { min: MIN_PASSWORD } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onDone(await api.signup(token, password));
    } catch (err) {
      setError(asApiError(err));
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Card>
        <section className="grid gap-4"><h1>{t('signup.invalidTitle')}</h1>{error && <Notice kind="error">{errorText(error)}</Notice>}</section>
      </Card>
    );
  }
  if (email === null) return <Notice>{t('signup.checking')}</Notice>;
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1>{t('signup.title')}</h1>
        <Notice className="wrap-anywhere">{t('signup.invitedAs', { email })}</Notice>
        <Field label={t('signup.choosePassword')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{errorText(error)}</Notice>}
        <Button type="submit" disabled={busy}>{t('signup.submit')}</Button>
      </form>
    </Card>
  );
}
