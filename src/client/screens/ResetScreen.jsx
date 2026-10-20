import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { errorText, t } from '../i18n/index.js';

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
      .catch((err) => { if (live) { setInvalid(true); setError(err); } });
    return () => { live = false; };
  }, [api, token]);

  async function submit(e) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) {
      setError({ key: 'err.passwordShort', params: { min: MIN_PASSWORD } });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.reset(token, password);
      setChanged(true);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  if (invalid) {
    return (
      <Card>
        <section className="grid gap-4"><h1>{t('reset.title')}</h1><Notice kind="error">{errorText(error)}</Notice></section>
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
