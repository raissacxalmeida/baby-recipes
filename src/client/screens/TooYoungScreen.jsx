import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';

export default function TooYoungScreen({ onChangeBirthday }) {
  return (
    <Card>
      <section className="grid gap-4">
        <h1><Emoji>🌱</Emoji> Not yet</h1>
        <Notice>Solid foods usually start around 6 months, so no recipes are suggested for now.</Notice>
        <Button variant="outline" onClick={onChangeBirthday}>Change birthday</Button>
      </section>
    </Card>
  );
}
