import { useState } from 'react';
import { Card } from '@/components/ui/card.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { ageInMonths } from '../../shared/age.js';

export default function SetupScreen({ onSave, now = () => new Date() }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    try {
      ageInMonths(value, now());
      await onSave(value);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-4">
        <h1><Emoji>🍼</Emoji> Welcome</h1>
        <Notice>Tell me your baby&apos;s birthday so recipes fit their age.</Notice>
        <Field label="Baby's birthday" type="date" value={value} onChange={(e) => setValue(e.target.value)} />
        {error && <Notice kind="error">{error}</Notice>}
        <Button type="submit">Continue</Button>
      </form>
    </Card>
  );
}
