import { GROUPS } from '../../shared/recipeGroup.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { errorText, t } from '../i18n/index.js';

const emojiFor = (name) => GROUPS.find((g) => g.name === name)?.emoji;

export default function SharedScreen({
  recipes, group, onGroup, onOpen, onToggleLike, error = null,
}) {
  const present = GROUPS.filter((g) => recipes.some((r) => r.group === g.name));
  const selected = present.some((g) => g.name === group) ? group : 'All';
  const shown = selected === 'All' ? recipes : recipes.filter((r) => r.group === selected);

  return (
    <section className="grid gap-4">
      <h1><Emoji>🌍</Emoji> {t('shared.title')}</h1>
      {error && <Notice kind="error">{errorText(error)}</Notice>}
      {recipes.length === 0 && <Notice kind="note">{t('shared.none')}</Notice>}
      {present.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {[{ name: 'All' }, ...present].map((g) => (
            <Button
              key={g.name}
              size="sm"
              className="rounded-full"
              variant={g.name === selected ? 'default' : 'outline'}
              aria-pressed={g.name === selected}
              onClick={() => onGroup(g.name)}
            >
              {g.emoji && <Emoji>{g.emoji}</Emoji>}
              {t(`group.${g.name}`)}
            </Button>
          ))}
        </div>
      )}
      <ul className="m-0 grid list-none gap-3 p-0">
        {shown.map((r) => (
          <li key={r.id}>
            <Card className="grid gap-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0 flex-1 wrap-anywhere font-semibold">{r.recipe.title}</span>
                <Badge variant="warm" className="shrink-0">{t('shared.months', { count: r.ageMonths })}</Badge>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">
                  <Emoji>{emojiFor(r.group)}</Emoji> {t(`group.${r.group}`)}
                  {' · '}
                  <span>{t('shared.likes', { count: r.likes })}</span>
                </span>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  {r.mine
                    ? <Badge variant="warm">{t('shared.mine')}</Badge>
                    : (
                      <Button
                        size="sm"
                        variant={r.liked ? 'default' : 'outline'}
                        aria-label={t('shared.likeLabel', { title: r.recipe.title })}
                        aria-pressed={r.liked}
                        onClick={() => onToggleLike(r)}
                      >
                        <Emoji>{r.liked ? '♥' : '♡'}</Emoji>
                        {r.liked ? t('shared.liked') : t('shared.like')}
                      </Button>
                    )}
                  <Button size="sm" variant="outline" aria-label={t('common.openLabel', { title: r.recipe.title })} onClick={() => onOpen(r)}>{t('common.open')}</Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
