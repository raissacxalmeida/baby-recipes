import { useEffect, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from '../api.js';
import { asApiError } from '../api.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';

const MIN_PASSWORD = 10;

export interface ResetScreenProps {
  api: Api;
  token: string;
  onDone: () => void;
}

export default function ResetScreen({ api, token, onDone }: ResetScreenProps) {
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [changed, setChanged] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.resetInfo(token)
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
      await api.reset(token, password);
      setChanged(true);
    } catch (err) {
      setError(asApiError(err));
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Card>
        <section className="grid gap-4"><h1>{t('reset.title')}</h1>{error && <Notice kind="error">{errorText(error)}</Notice>}</section>
      </Card>
    );
  }
  if (changed) {
    return (
      <Card>
        <section className="grid gap-4">
          <h1>{t('reset.changedTitle')}</h1>
          <Button variant="outline" onClick={() => onDone()}>{t('reset.toLogin')}</Button>
        </section>
      </Card>
    );
  }
  if (email === null) return <Notice>{t('reset.checking')}</Notice>;
  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1>{t('reset.title')}</h1>
        <Notice className="wrap-anywhere">{t('reset.forEmail', { email })}</Notice>
        <Field label={t('reset.newPassword')} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{errorText(error)}</Notice>}
        <Button type="submit" disabled={busy}>{t('reset.submit')}</Button>
      </form>
    </Card>
  );
}
