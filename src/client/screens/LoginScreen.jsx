import { useState } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { t } from '../i18n/index.js';

export default function LoginScreen({ api, onLoggedIn, notice = null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLoggedIn(await api.login(email, password));
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1>{t('login.title')}</h1>
        {notice && <Notice>{notice}</Notice>}
        <Field label={t('auth.email')} type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label={t('auth.password')} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit" disabled={busy}>{t('login.submit')}</Button>
      </form>
    </Card>
  );
}
