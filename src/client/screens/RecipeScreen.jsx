import { useState } from 'react';
import { formatAmount, scaleRecipe } from '../../shared/units.js';
import { ingredientEmoji } from '../../shared/ingredientEmoji.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';

export default function RecipeScreen({ recipe, onAnother, onLiked, onDisliked, busy = false }) {
  const [portions, setPortions] = useState(recipe.basePortions);
  const scaled = scaleRecipe(recipe, portions);

  return (
    <article className="grid gap-4">
      <h1 className="break-words">{recipe.title}</h1>
      {recipe.allergens.length > 0 && (
        <Notice kind="note">
          <Emoji>⚠️</Emoji> Allergens: {recipe.allergens.join(', ')}
        </Notice>
      )}
      <Card className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2>Ingredients</h2>
          <div className="flex items-center gap-3 text-sm font-semibold">
            <Button variant="outline" size="icon" aria-label="Fewer portions" disabled={portions <= 1} onClick={() => setPortions(portions - 1)}>
              <Emoji>−</Emoji>
            </Button>
            <span>{portions === 1 ? '1 portion' : `${portions} portions`}</span>
            <Button variant="outline" size="icon" aria-label="More portions" disabled={portions >= 12} onClick={() => setPortions(portions + 1)}>
              <Emoji>+</Emoji>
            </Button>
          </div>
        </div>
        <ul className="m-0 list-none p-0">
          {scaled.ingredients.map((i, n) => (
            <li key={n} className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0">
              <span className="flex min-w-0 flex-wrap items-center gap-2">
                <Emoji>{ingredientEmoji(i.name)}</Emoji>
                <span className="break-words">{i.name}</span>
                {!i.inList && <Badge variant="warm">not in your list</Badge>}
              </span>
              <span className="shrink-0 font-semibold">{formatAmount(i.grams)}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="grid gap-2">
        <h2>Steps</h2>
        <ol className="m-0 grid list-none gap-3 p-0">
          {recipe.steps.map((step, n) => (
            <li key={n} className="flex gap-3">
              <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-chip text-xs font-bold">
                {n + 1}
              </span>
              <span className="min-w-0 break-words">{step}</span>
            </li>
          ))}
        </ol>
      </Card>
      {(onAnother || onLiked || onDisliked) && (
        <div className="flex flex-wrap gap-2">
          {onLiked && (
            <Button className="flex-1" disabled={busy} onClick={onLiked}>
              <Emoji>👍</Emoji>
              Baby liked it
            </Button>
          )}
          {onDisliked && (
            <Button className="flex-1" variant="outline" disabled={busy} onClick={onDisliked}>
              <Emoji>👎</Emoji>
              Baby didn&apos;t like it
            </Button>
          )}
          {onAnother && (
            <Button className="flex-1" variant="outline" disabled={busy} onClick={onAnother}>
              <Emoji>🔄</Emoji>
              Give me another
            </Button>
          )}
        </div>
      )}
    </article>
  );
}
