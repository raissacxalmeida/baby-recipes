import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { ageInMonths } from '../../shared/age.js';
import { asApiError } from '../api.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';

export interface SetupScreenProps {
  onSave: (birthdate: string) => Promise<unknown> | void;
  now?: () => Date;
}

export default function SetupScreen({ onSave, now = () => new Date() }: SetupScreenProps) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<ErrorInfo | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try {
      ageInMonths(value, now());
      await onSave(value);
    } catch (err) {
      setError(asApiError(err));
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1><Emoji>🍼</Emoji> {t('setup.title')}</h1>
        <Notice>{t('setup.intro')}</Notice>
        <Field label={t('setup.birthday')} type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        {error && <Notice kind="error">{errorText(error)}</Notice>}
        <Button type="submit">{t('setup.continue')}</Button>
      </form>
    </Card>
  );
}
