import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Notice } from '@/components/ui/notice.jsx';

const day = (iso) => (iso ? iso.slice(0, 10) : 'never');
const statusText = (invite) => {
  if (invite.status === 'pending') return `Pending (${invite.daysLeft} ${invite.daysLeft === 1 ? 'day' : 'days'} left)`;
  return invite.status === 'used' ? 'Used' : 'Expired';
};

// Each row is a small card: cells stack and show their label before the value (the app column is narrow at every width).
// The explicit roles keep the table semantics when the display is overridden.
const cellClass = 'block empty:hidden before:text-xs before:font-semibold before:text-muted-foreground before:content-[attr(data-label)]';

function Table({ label, headings, children }) {
  return (
    <table aria-label={label} role="table" className="block w-full text-left text-sm">
      <thead role="rowgroup" className="sr-only">
        <tr role="row">
          {headings.map((h, n) => (
            <th key={n} role="columnheader" scope="col" className="py-2 pr-3 text-xs font-semibold uppercase text-muted-foreground">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="block">{children}</tbody>
    </table>
  );
}

function Tr(props) {
  return <tr role="row" className="grid gap-1 border-b border-border py-3 last:border-0" {...props} />;
}

function Td({ label, className, ...props }) {
  return <td role="cell" data-label={label ? `${label}:` : undefined} className={cn(cellClass, label && 'before:mr-1', className)} {...props} />;
}

function IssuedLink({ issued }) {
  const label = `${issued.kind === 'invite' ? 'Invite' : 'Reset'} link for ${issued.email}`;
  const [copied, setCopied] = useState(false);
  const [field, setField] = useState(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(issued.link);
      setCopied(true);
    } catch {
      field?.select();
    }
  }

  return (
    <Card className="grid gap-3 border-note-border bg-note">
      <Field label={label} readOnly value={issued.link} ref={setField} onFocus={(e) => e.target.select()} />
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={copy}>Copy</Button>
        {copied && <span className="text-sm font-semibold"> Copied</span>}
      </div>
      <Notice className="wrap-anywhere">Shown only once. Send it to {issued.email} yourself.</Notice>
    </Card>
  );
}

function AdminPage({ api }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);
  const [email, setEmail] = useState('');

  const load = () => api.admin.overview().then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  async function act(action) {
    setError(null);
    let ok = true;
    try {
      await action();
    } catch (err) {
      setError(err.message);
      ok = false;
    }
    await load();
    return ok;
  }

  const invite = (address) => act(async () => {
    const { link } = await api.admin.createInvite(address);
    setIssued({ kind: 'invite', email: address, link });
  });

  return (
    <section className="grid gap-4">
      <h1>Admin</h1>
      <h2>Invite someone</h2>
      <Card>
        <form className="grid gap-3" onSubmit={async (e) => { e.preventDefault(); if (await invite(email.trim())) setEmail(''); }}>
          <Field label="Invite email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit">Create invite</Button>
        </form>
      </Card>
      {error && <Notice kind="error">{error}</Notice>}
      {issued && <IssuedLink issued={issued} />}

      {data && (
        <>
          <h2>Invites</h2>
          <Card className="py-2">
            <Table label="Invites" headings={['Email', 'Status', 'Created', '']}>
              {data.invites.map((i) => (
                <Tr key={i.id}>
                  <Td className="break-all font-semibold">{i.email}</Td>
                  <Td label="Status"><Badge>{statusText(i)}</Badge></Td>
                  <Td label="Created">{day(i.createdAt)}</Td>
                  <Td>
                    {i.status === 'pending' && (
                      <Button size="sm" variant="outline" aria-label={`Revoke invite for ${i.email}`} onClick={() => act(() => api.admin.revokeInvite(i.id))}>
                        Revoke
                      </Button>
                    )}
                    {i.status === 'expired' && (
                      <Button size="sm" variant="outline" aria-label={`Invite ${i.email} again`} onClick={() => invite(i.email)}>
                        Invite again
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>

          <h2>People</h2>
          <Card className="py-2">
            <Table label="People" headings={['Email', 'Joined', 'Last login', 'Recipes today', '']}>
              {data.people.map((p) => (
                <Tr key={p.id}>
                  <Td className="break-all font-semibold"><span>{p.email}</span>{p.isAdmin && <span> (admin)</span>}</Td>
                  <Td label="Joined">{day(p.joinedAt)}</Td>
                  <Td label="Last login">{day(p.lastLoginAt)}</Td>
                  <Td label="Recipes today">{p.recipesToday === null ? null : `${p.recipesToday} of ${data.limit}`}</Td>
                  <Td>
                    {!p.isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Reset password for ${p.email}`}
                          onClick={() => act(async () => {
                            const { link } = await api.admin.reset(p.id);
                            setIssued({ kind: 'reset', email: p.email, link });
                          })}
                        >
                          Reset password
                        </Button>
                        <ConfirmDialog
                          trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label={`Remove ${p.email}`}>Remove</Button>}
                          title="Remove this person?"
                          description={`Remove ${p.email} and delete all their data? This cannot be undone.`}
                          confirmLabel="Yes, remove"
                          onConfirm={() => act(() => api.admin.remove(p.id))}
                        />
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>
        </>
      )}
    </section>
  );
}

export default function AdminScreen({ api, me }) {
  if (!me.isAdmin) return <p>Not found</p>;
  return <AdminPage api={api} />;
}
