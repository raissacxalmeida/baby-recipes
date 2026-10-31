import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from '../api.js';
import { asApiError } from '../api.js';
import type { ApiUser } from '../apiTypes.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';

export interface LoginScreenProps {
  api: Api;
  onLoggedIn: (user: ApiUser) => void;
  notice?: ErrorInfo | null;
}

export default function LoginScreen({ api, onLoggedIn, notice = null }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await api.login(email, password));
    } catch (err) {
      setError(asApiError(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1>{t('login.title')}</h1>
        {notice && <Notice>{errorText(notice)}</Notice>}
        <Field label={t('auth.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{errorText(error)}</Notice>}
        <Button type="submit" disabled={busy}>{t('login.submit')}</Button>
      </form>
    </Card>
  );
}
