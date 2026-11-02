import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import type { ApiUser } from '../apiTypes.js';
import { t } from '../i18n/index.js';
import Logo from './Logo.jsx';

interface MenuItemProps {
  emoji: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}

function MenuItem({ emoji, label, active, onClick }: MenuItemProps) {
  return (
    <Button variant="ghost" className="justify-start" aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Emoji>{emoji}</Emoji>
      {label}
    </Button>
  );
}

// The page links only show for the pages whose handler is passed, so screens that come before the app proper
// (birthday, too young) get just the account actions. `current` marks the page the user is on.
export interface MenuProps {
  user: ApiUser;
  current?: string | null;
  onHome?: () => void;
  onLiked?: () => void;
  onCommunity?: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  onDelete: () => void;
}

export default function Menu({ user, current = null, onHome, onLiked, onCommunity, onAdmin, onLogout, onDelete }: MenuProps) {
  const [open, setOpen] = useState(false);

  const closing = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <header className="relative flex items-center justify-between gap-3">
      <Logo />
      <Button variant="outline" size="sm" className="shrink-0" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}>
        <Emoji>☰</Emoji>
        {t('menu.button')}
      </Button>
      {open && (
        <Card id="main-menu" className="absolute right-0 top-full z-40 mt-2 grid w-64 max-w-full gap-1 p-2">
          <p className="m-0 min-w-0 wrap-anywhere px-3 py-1 text-sm text-muted-foreground">{user.email}</p>
          {onHome && <MenuItem emoji="✨" label={t('menu.home')} active={current === 'home'} onClick={closing(onHome)} />}
          {onLiked && <MenuItem emoji="♡" label={t('menu.liked')} active={current === 'liked'} onClick={closing(onLiked)} />}
          {onCommunity && <MenuItem emoji="🌍" label={t('menu.community')} active={current === 'shared'} onClick={closing(onCommunity)} />}
          {user.isAdmin && <MenuItem emoji="🛠" label={t('menu.admin')} active={current === 'admin'} onClick={closing(onAdmin)} />}
          <MenuItem emoji="⎋" label={t('menu.logout')} onClick={closing(onLogout)} />
          {!user.isAdmin && (
            <ConfirmDialog
              trigger={<Button variant="ghost" className="justify-start text-destructive">{t('menu.delete')}</Button>}
              title={t('menu.deleteTitle')}
              description={t('menu.deleteBody', { email: user.email })}
              confirmLabel={t('menu.deleteConfirm')}
              onConfirm={onDelete}
            />
          )}
        </Card>
      )}
    </header>
  );
}
