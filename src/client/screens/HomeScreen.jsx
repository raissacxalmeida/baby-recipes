import { useState } from 'react';
import { parseIngredientList } from '../../shared/ingredients.js';
import { ingredientEmoji } from '../../shared/ingredientEmoji.js';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { errorText, getLanguage, t } from '../i18n/index.js';

const percent = (used, limit) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

export default function HomeScreen({ ageText, ingredients, onChange, onSuggest, loading, error, usage = null }) {
  const [text, setText] = useState('');

  function add(e) {
    e.preventDefault();
    onChange(parseIngredientList([...ingredients, text], { plurals: getLanguage() === 'en' }));
    setText('');
  }

  return (
    <section className="grid gap-4">
      <div className="grid gap-1">
        <h1>{t('home.title')}</h1>
        <p className="m-0 text-sm text-muted-foreground">{t('home.babyAge', { age: ageText })}</p>
      </div>
      <Card className="grid gap-3">
        <form onSubmit={add} className="flex items-end gap-2">
          <Field label={t('home.ingredient')} className="min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" variant="outline">{t('home.add')}</Button>
        </form>
        {ingredients.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {ingredients.map((name) => (
              <li key={name} className="flex max-w-full items-center gap-1 rounded-full bg-chip py-1 pl-3 pr-1 text-sm font-semibold">
                <Emoji>{ingredientEmoji(name)}</Emoji>
                <span className="min-w-0 wrap-anywhere">{name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  aria-label={t('home.remove', { name })}
                  onClick={() => onChange(ingredients.filter((i) => i !== name))}
                >
                  <Emoji>✕</Emoji>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {error && <Notice kind="error">{errorText(error)}</Notice>}
      <Button onClick={onSuggest} disabled={loading || ingredients.length === 0}>
        <Emoji>✨</Emoji>
        {t('home.suggest')}
      </Button>
      {usage && (
        <div className="grid gap-2">
          <p className="m-0 text-xs text-muted-foreground">{t('home.usage', { used: usage.recipesToday, limit: usage.limit })}</p>
          <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${percent(usage.recipesToday, usage.limit)}%` }} />
          </div>
        </div>
      )}
    </section>
  );
}
