import { useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Emoji } from '@/components/ui/emoji.jsx';

function MenuItem({ emoji, label, active, onClick }) {
  return (
    <Button variant="ghost" className="justify-start" aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Emoji>{emoji}</Emoji>
      {label}
    </Button>
  );
}

// The page links only show for the pages whose handler is passed, so screens that come before the app proper
// (birthday, too young) get just the account actions. `current` marks the page the user is on.
export default function Menu({ user, current = null, onHome, onLiked, onCommunity, onAdmin, onLogout, onDelete }) {
  const [open, setOpen] = useState(false);

  const closing = (action) => () => {
    setOpen(false);
    action();
  };

  return (
    <header className="relative">
      <Button variant="outline" size="sm" aria-expanded={open} aria-controls="main-menu" onClick={() => setOpen(!open)}>
        <Emoji>☰</Emoji>
        Menu
      </Button>
      {open && (
        <Card id="main-menu" className="absolute left-0 top-full z-40 mt-2 grid w-64 max-w-full gap-1 p-2">
          <p className="m-0 min-w-0 wrap-anywhere px-3 py-1 text-sm text-muted-foreground">{user.email}</p>
          {onHome && <MenuItem emoji="✨" label="Home" active={current === 'home'} onClick={closing(onHome)} />}
          {onLiked && <MenuItem emoji="♡" label="Liked recipes" active={current === 'liked'} onClick={closing(onLiked)} />}
          {onCommunity && <MenuItem emoji="🌍" label="Community recipes" active={current === 'shared'} onClick={closing(onCommunity)} />}
          {user.isAdmin && <MenuItem emoji="🛠" label="Admin" active={current === 'admin'} onClick={closing(onAdmin)} />}
          <MenuItem emoji="⎋" label="Log out" onClick={closing(onLogout)} />
          {!user.isAdmin && (
            <ConfirmDialog
              trigger={<Button variant="ghost" className="justify-start text-destructive">Delete my account</Button>}
              title="Delete your account?"
              description={`Delete the account ${user.email} and all its saved data? This cannot be undone.`}
              confirmLabel="Yes, delete my account"
              onConfirm={onDelete}
            />
          )}
        </Card>
      )}
    </header>
  );
}
