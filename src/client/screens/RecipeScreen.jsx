import { useState } from 'react';
import { formatAmount, scaleRecipe } from '../../shared/units.js';
import { ingredientEmoji } from '../../shared/ingredientEmoji.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { getLanguage, hasKey, t } from '../i18n/index.js';

const allergenLabel = (name) => (hasKey(`allergen.${name}`) ? t(`allergen.${name}`) : name);

export default function RecipeScreen({ recipe, onAnother, onLiked, onDisliked, busy = false }) {
  const [portions, setPortions] = useState(recipe.basePortions);
  const scaled = scaleRecipe(recipe, portions);

  return (
    <article className="grid gap-4">
      <h1 className="wrap-anywhere">{recipe.title}</h1>
      {recipe.allergens.length > 0 && (
        <Notice kind="note">
          <Emoji>⚠️</Emoji> {t('recipe.allergens', { list: recipe.allergens.map(allergenLabel).join(', ') })}
        </Notice>
      )}
      <Card className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>{t('recipe.ingredients')}</h2>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Button variant="outline" size="icon" aria-label={t('recipe.fewer')} disabled={portions <= 1} onClick={() => setPortions(portions - 1)}>
              <Emoji>−</Emoji>
            </Button>
            <span>{t('recipe.portions', { count: portions })}</span>
            <Button variant="outline" size="icon" aria-label={t('recipe.more')} disabled={portions >= 12} onClick={() => setPortions(portions + 1)}>
              <Emoji>+</Emoji>
            </Button>
          </div>
        </div>
        <ul className="m-0 list-none p-0">
          {scaled.ingredients.map((i, n) => (
            <li key={n} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Emoji>{ingredientEmoji(i.original ?? i.name)}</Emoji>
                <span className="wrap-anywhere">{i.name}</span>
                {!i.inList && <Badge variant="warm">{t('recipe.notInList')}</Badge>}
              </span>
              <span className="shrink-0 font-semibold">{formatAmount(i.grams, getLanguage())}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="grid gap-2">
        <h2>{t('recipe.steps')}</h2>
        <ol className="m-0 grid list-none gap-3 p-0">
          {recipe.steps.map((step, n) => (
            <li key={n} className="flex gap-3">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-bold">
                {n + 1}
              </span>
              <span className="min-w-0 wrap-anywhere">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
      {(onAnother || onLiked || onDisliked) && (
        <div className="flex flex-wrap gap-2">
          {onLiked && (
            <Button className="flex-1" disabled={busy} onClick={onLiked}>
              <Emoji>👍</Emoji>
              {t('recipe.liked')}
            </Button>
          )}
          {onDisliked && (
            <Button className="flex-1" variant="outline" disabled={busy} onClick={onDisliked}>
              <Emoji>👎</Emoji>
              {t('recipe.disliked')}
            </Button>
          )}
          {onAnother && (
            <Button className="flex-1" variant="outline" disabled={busy} onClick={onAnother}>
              <Emoji>🔄</Emoji>
              {t('recipe.another')}
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
