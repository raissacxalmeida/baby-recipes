import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import { t } from '../i18n/index.js';

export default function TooYoungScreen({ onChangeBirthday }) {
  return (
    <Card>
      <section className="grid gap-4">
        <h1><Emoji>🌱</Emoji> {t('tooYoung.title')}</h1>
        <Notice>{t('tooYoung.body')}</Notice>
        <Button variant="outline" onClick={onChangeBirthday}>{t('tooYoung.change')}</Button>
      </section>
    </Card>
  );
}
