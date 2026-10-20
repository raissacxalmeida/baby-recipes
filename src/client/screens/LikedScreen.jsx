import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { t } from '../i18n/index.js';

function Row({ title, children }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="min-w-32 flex-1 wrap-anywhere font-semibold">{title}</span>
      <div className="flex shrink-0 gap-1">{children}</div>
    </li>
  );
}

export default function LikedScreen({
  liked, disliked, onOpen, onUnlike, onRestore,
  sharedIds = [], copiedIds = [], onShare, onUnshare, error = null,
}) {
  return (
    <section className="grid gap-4">
      <h1><Emoji>♡</Emoji> {t('liked.title')}</h1>
      {error && <Notice kind="error">{error}</Notice>}
      <Card>
        {liked.length === 0 && <Notice>{t('liked.none')}</Notice>}
        <ul className="m-0 list-none p-0">
          {liked.map((r) => (
            <Row key={r.id} title={r.title}>
              <Button size="sm" variant="outline" aria-label={t('common.openLabel', { title: r.title })} onClick={() => onOpen(r)}>{t('common.open')}</Button>
              {onShare && !copiedIds.includes(r.id) && (
                sharedIds.includes(r.id)
                  ? <Button size="sm" variant="outline" aria-label={t('liked.unshareLabel', { title: r.title })} onClick={() => onUnshare(r)}>{t('liked.unshare')}</Button>
                  : <Button size="sm" variant="outline" aria-label={t('liked.shareLabel', { title: r.title })} onClick={() => onShare(r)}>{t('liked.share')}</Button>
              )}
              <Button size="sm" variant="ghost" aria-label={t('liked.removeLabel', { title: r.title })} onClick={() => onUnlike(r.id)}>{t('liked.remove')}</Button>
            </Row>
          ))}
        </ul>
      </Card>
      <h2>{t('liked.notLiked')}</h2>
      <Card>
        {disliked.length === 0 && <Notice>{t('liked.nothing')}</Notice>}
        <ul className="m-0 list-none p-0">
          {disliked.map((r) => (
            <Row key={r.id} title={r.title}>
              <Button size="sm" variant="outline" aria-label={t('liked.restoreLabel', { title: r.title })} onClick={() => onRestore(r.id)}>{t('liked.restore')}</Button>
            </Row>
          ))}
        </ul>
      </Card>
    </section>
  );
}
