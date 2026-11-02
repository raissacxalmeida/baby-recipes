import { useEffect, useState, type ComponentPropsWithoutRef, type FormEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils.js';
import { Badge } from '@/components/ui/badge.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Card } from '@/components/ui/card.jsx';
import { ConfirmDialog } from '@/components/ui/confirm-dialog.jsx';
import { Field } from '@/components/ui/field.jsx';
import { Notice } from '@/components/ui/notice.jsx';
import type { Api } from '../api.js';
import { asApiError } from '../api.js';
import type { AdminInvite, AdminOverview, ApiUser } from '../apiTypes.js';
import { errorText, t, type ErrorInfo } from '../i18n/index.js';

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : t('admin.never'));
const statusText = (invite: AdminInvite) => {
  if (invite.status === 'pending') return t('admin.pending', { count: invite.daysLeft });
  return invite.status === 'used' ? t('admin.used') : t('admin.expired');
};

// Each row is a small card: cells stack and show their label before the value (the app column is narrow at every width).
// The explicit roles keep the table semantics when the display is overridden.
const cellClass = 'block empty:hidden before:text-xs before:font-semibold before:text-muted-foreground before:content-[attr(data-label)]';

function Table({ label, headings, children }: { label: string; headings: string[]; children: ReactNode }) {
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

function Tr(props: ComponentPropsWithoutRef<'tr'>) {
  return <tr role="row" className="grid gap-1 border-b border-border py-3 last:border-0" {...props} />;
}

function Td({ label, className, ...props }: ComponentPropsWithoutRef<'td'> & { label?: string }) {
  return <td role="cell" data-label={label ? `${label}:` : undefined} className={cn(cellClass, label && 'before:mr-1', className)} {...props} />;
}

// The link just handed out, shown once: for an invite or for a password reset.
interface Issued {
  kind: 'invite' | 'reset';
  email: string;
  link: string;
}

function IssuedLink({ issued }: { issued: Issued }) {
  const label = t(issued.kind === 'invite' ? 'admin.inviteLink' : 'admin.resetLink', { email: issued.email });
  const [copied, setCopied] = useState(false);
  const [field, setField] = useState<HTMLInputElement | null>(null);

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
        <Button variant="outline" onClick={copy}>{t('admin.copy')}</Button>
        {copied && <span className="text-sm font-semibold">{t('admin.copied')}</span>}
      </div>
      <Notice className="wrap-anywhere">{t('admin.shownOnce', { email: issued.email })}</Notice>
    </Card>
  );
}

function AdminPage({ api }: { api: Api }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [email, setEmail] = useState('');

  const load = () => api.admin.overview().then(setData).catch((err: unknown) => setError(asApiError(err)));
  useEffect(() => { load(); }, []);

  async function act(action: () => Promise<unknown>) {
    setError(null);
    let ok = true;
    try {
      await action();
    } catch (err) {
      setError(asApiError(err));
      ok = false;
    }
    await load();
    return ok;
  }

  const invite = (address: string) => act(async () => {
    const { link } = await api.admin.createInvite(address);
    setIssued({ kind: 'invite', email: address, link });
  });

  return (
    <section className="grid gap-4">
      <h1>{t('admin.title')}</h1>
      <h2>{t('admin.inviteSomeone')}</h2>
      <Card>
        <form className="grid gap-3" onSubmit={async (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); if (await invite(email.trim())) setEmail(''); }}>
          <Field label={t('admin.inviteEmail')} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit">{t('admin.createInvite')}</Button>
        </form>
      </Card>
      {error && <Notice kind="error">{errorText(error)}</Notice>}
      {issued && <IssuedLink issued={issued} />}

      {data && (
        <>
          <h2>{t('admin.invites')}</h2>
          <Card className="py-2">
            <Table label={t('admin.invites')} headings={[t('admin.colEmail'), t('admin.colStatus'), t('admin.colCreated'), '']}>
              {data.invites.map((i) => (
                <Tr key={i.id}>
                  <Td className="break-all font-semibold">{i.email}</Td>
                  <Td label={t('admin.colStatus')}><Badge>{statusText(i)}</Badge></Td>
                  <Td label={t('admin.colCreated')}>{day(i.createdAt)}</Td>
                  <Td>
                    {i.status === 'pending' && (
                      <Button size="sm" variant="outline" aria-label={t('admin.revokeLabel', { email: i.email })} onClick={() => act(() => api.admin.revokeInvite(i.id))}>
                        {t('admin.revoke')}
                      </Button>
                    )}
                    {i.status === 'expired' && (
                      <Button size="sm" variant="outline" aria-label={t('admin.inviteAgainLabel', { email: i.email })} onClick={() => invite(i.email)}>
                        {t('admin.inviteAgain')}
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          </Card>

          <h2>{t('admin.people')}</h2>
          <Card className="py-2">
            <Table label={t('admin.people')} headings={[t('admin.colEmail'), t('admin.colJoined'), t('admin.colLastLogin'), t('admin.colRecipesToday'), '']}>
              {data.people.map((p) => (
                <Tr key={p.id}>
                  <Td className="break-all font-semibold"><span>{p.email}</span>{p.isAdmin && <span> {t('admin.adminTag')}</span>}</Td>
                  <Td label={t('admin.colJoined')}>{day(p.joinedAt)}</Td>
                  <Td label={t('admin.colLastLogin')}>{day(p.lastLoginAt)}</Td>
                  <Td label={t('admin.colRecipesToday')}>{p.recipesToday === null ? null : t('admin.usage', { used: p.recipesToday, limit: data.limit })}</Td>
                  <Td>
                    {!p.isAdmin && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={t('admin.resetLabel', { email: p.email })}
                          onClick={() => act(async () => {
                            const { link } = await api.admin.reset(p.id);
                            setIssued({ kind: 'reset', email: p.email, link });
                          })}
                        >
                          {t('admin.resetPassword')}
                        </Button>
                        <ConfirmDialog
                          trigger={<Button size="sm" variant="ghost" className="text-destructive" aria-label={t('admin.removeLabel', { email: p.email })}>{t('admin.remove')}</Button>}
                          title={t('admin.removeTitle')}
                          description={t('admin.removeBody', { email: p.email })}
                          confirmLabel={t('admin.removeConfirm')}
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

export interface AdminScreenProps {
  api: Api;
  me: ApiUser;
}

export default function AdminScreen({ api, me }: AdminScreenProps) {
  if (!me.isAdmin) return <p>{t('admin.notFound')}</p>;
  return <AdminPage api={api} />;
}
