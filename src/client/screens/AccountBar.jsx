import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';

export default function AccountBar({ user, onLogout, onDelete, onAdmin }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-2">
      <span className="min-w-0 break-all text-sm text-muted-foreground">{user.email}</span>
      <div className="flex flex-wrap items-center gap-2">
        {user.isAdmin && <Button size="sm" variant="outline" onClick={onAdmin}>Admin</Button>}
        <Button size="sm" variant="outline" onClick={onLogout}>Log out</Button>
        {!user.isAdmin && (
          <ConfirmDialog
            trigger={<Button size="sm" variant="ghost" className="text-destructive">Delete my account</Button>}
            title="Delete your account?"
            description={`Delete the account ${user.email} and all its saved data? This cannot be undone.`}
            confirmLabel="Yes, delete my account"
            onConfirm={onDelete}
          />
        )}
      </div>
    </header>
  );
}
