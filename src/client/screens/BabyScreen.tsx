import { useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { ageInMonths } from '../../shared/age.js';
import { asApiError } from '../api.js';
import type { ApiBaby, BabyInput } from '../apiTypes.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';
import { babyName } from '../useBabies.js';

// The longest name the server takes (MAX_NAME in src/server/babies.ts). Counted the same way, with `.length` after
// trimming, so the browser and the server never disagree about a name.
const MAX_NAME = 30;

// One screen for a baby's name and birthday: the first baby of an account (`first`), another baby (no `baby`), or
// the details of an existing one (`baby`, which may still have no name).
export interface BabyScreenProps {
  baby?: ApiBaby;
  first?: boolean;
  now?: () => Date;
  onSave: (input: BabyInput) => Promise<unknown> | void;
  onCancel?: () => void;
  onRemove?: () => Promise<unknown> | void;
}

export default function BabyScreen({ baby, first = false, now = () => new Date(), onSave, onCancel, onRemove }: BabyScreenProps) {
  const [name, setName] = useState(baby?.name ?? '');
  const [birthdate, setBirthdate] = useState(baby?.birthdate ?? '');
  const [error, setError] = useState<ErrorInfo | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > MAX_NAME) {
      setError({ message: t('err.babyName', { max: MAX_NAME }), key: 'err.babyName', params: { max: MAX_NAME } });
      return;
    }
    try {
      ageInMonths(birthdate, now());
      setError(null);
      await onSave({ name: trimmed, birthdate });
    } catch (err) {
      setError(asApiError(err));
    }
  }

  async function remove() {
    try {
      await onRemove?.();
    } catch (err) {
      setError(asApiError(err));
    }
  }

  const title = first ? t('baby.titleFirst') : baby ? t('baby.titleEdit') : t('baby.titleAdd');
  return (
    <section className="grid gap-4">
      <h1><Emoji>🍼</Emoji> {title}</h1>
      <Card>
        <form onSubmit={submit} noValidate className="grid gap-4">
          <Notice>{t('baby.intro')}</Notice>
          <Field label={t('baby.name')} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          <Field label={t('baby.birthday')} type="date" value={birthdate} onChange={(e) => setBirthdate(e.target.value)} />
          {error && <Notice kind="error">{errorText(error)}</Notice>}
          <Button type="submit">{t('baby.save')}</Button>
          {onCancel && <Button variant="outline" onClick={onCancel}>{t('baby.cancel')}</Button>}
        </form>
      </Card>
      {baby && onRemove && (
        <ConfirmDialog
          trigger={<Button variant="ghost" className="justify-self-start text-destructive">{t('baby.remove')}</Button>}
          title={t('baby.removeTitle')}
          description={t('baby.removeBody', { name: babyName(baby) })}
          confirmLabel={t('baby.removeConfirm')}
          onConfirm={remove}
        />
      )}
    </section>
  );
}
