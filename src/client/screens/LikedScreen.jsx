import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';

function Row({ title, children }) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0">
      <span className="min-w-0 flex-1 wrap-anywhere font-semibold">{title}</span>
      <div className="flex shrink-0 gap-1">{children}</div>
    </li>
  );
}

export default function LikedScreen({ liked, disliked, onOpen, onUnlike, onRestore, onBack }) {
  return (
    <section className="grid gap-4">
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={onBack}>
        <Emoji>←</Emoji>
        New recipe
      </Button>
      <h1><Emoji>♡</Emoji> Liked recipes</h1>
      <Card>
        {liked.length === 0 && <Notice>No liked recipes yet.</Notice>}
        <ul className="m-0 list-none p-0">
          {liked.map((r) => (
            <Row key={r.id} title={r.title}>
              <Button size="sm" variant="outline" aria-label={`Open ${r.title}`} onClick={() => onOpen(r)}>Open</Button>
              <Button size="sm" variant="ghost" aria-label={`Remove ${r.title}`} onClick={() => onUnlike(r.id)}>Remove</Button>
            </Row>
          ))}
        </ul>
      </Card>
      <h2>Not liked</h2>
      <Card>
        {disliked.length === 0 && <Notice>Nothing here.</Notice>}
        <ul className="m-0 list-none p-0">
          {disliked.map((r) => (
            <Row key={r.id} title={r.title}>
              <Button size="sm" variant="outline" aria-label={`Restore ${r.title}`} onClick={() => onRestore(r.id)}>Restore</Button>
            </Row>
          ))}
        </ul>
      </Card>
    </section>
  );
}
