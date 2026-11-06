import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';
import type { ApiBaby, ApiUser } from '../apiTypes.js';
import { t } from '../i18n/index.js';
import { babyName } from '../useBabies.js';
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
// (a baby's details, too young) get just the babies' names and the account actions. Each baby is a group with its
// own pages, then come the pages for everyone. `current` marks the page the user is on, under the baby `babyId`.
export interface MenuProps {
  user: ApiUser;
  current?: string | null;
  babies?: ApiBaby[];
  babyId?: string | null;
  onIdeas?: (babyId: string) => void;
  onLiked?: (babyId: string) => void;
  onAddBaby?: () => void;
  onEditBaby?: (babyId: string) => void;
  onCommunity?: () => void;
  onAdmin: () => void;
  onLogout: () => void;
  onDelete: () => void;
}

export default function Menu({
  user, current = null, babies = [], babyId = null, onIdeas, onLiked, onAddBaby, onEditBaby, onCommunity, onAdmin, onLogout, onDelete,
}: MenuProps) {
  const [open, setOpen] = useState(false);

  const closing = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  const forEveryone = Boolean(onCommunity) || user.isAdmin;

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
          {babies.map((baby) => {
            const name = babyName(baby);
            const selected = baby.id === babyId;
            return (
              <div key={baby.id} role="group" aria-label={name} className="grid gap-1 border-t border-border pt-1">
                <div className="flex min-h-9 items-center gap-2 px-3">
                  {/* The current baby is marked; its page buttons carry aria-current for screen readers. */}
                  {selected && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                  <p className="m-0 min-w-0 flex-1 wrap-anywhere text-sm font-semibold">{name}</p>
                  {onEditBaby && (
                    <Button variant="ghost" size="icon" className="shrink-0" aria-label={t('menu.editBaby', { name })} onClick={closing(() => onEditBaby(baby.id))}>
                      <Emoji>✎</Emoji>
                    </Button>
                  )}
                </div>
                {onIdeas && <MenuItem emoji="✨" label={t('menu.ideas')} active={selected && current === 'home'} onClick={closing(() => onIdeas(baby.id))} />}
                {onLiked && <MenuItem emoji="♡" label={t('menu.liked')} active={selected && current === 'liked'} onClick={closing(() => onLiked(baby.id))} />}
              </div>
            );
          })}
          {onAddBaby && <MenuItem emoji="＋" label={t('menu.addBaby')} onClick={closing(onAddBaby)} />}
          {forEveryone && (
            <div role="group" aria-label={t('menu.forEveryone')} className="grid gap-1 border-t border-border pt-1">
              <p className="m-0 px-3 py-1 text-sm text-muted-foreground">{t('menu.forEveryone')}</p>
              {onCommunity && <MenuItem emoji="🌍" label={t('menu.community')} active={current === 'shared'} onClick={closing(onCommunity)} />}
              {user.isAdmin && <MenuItem emoji="🛠" label={t('menu.admin')} active={current === 'admin'} onClick={closing(onAdmin)} />}
            </div>
          )}
          <div className="grid gap-1 border-t border-border pt-1">
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
          </div>
        </Card>
      )}
    </header>
  );
}
