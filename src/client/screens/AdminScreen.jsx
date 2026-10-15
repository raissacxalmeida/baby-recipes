import { useEffect, useState } from 'react';

const day = (iso) => (iso ? iso.slice(0, 10) : 'never');
const statusText = (invite) => {
  if (invite.status === 'pending') return `Pending (${invite.daysLeft} ${invite.daysLeft === 1 ? 'day' : 'days'} left)`;
  return invite.status === 'used' ? 'Used' : 'Expired';
};

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
    <div className="issued">
      <label>
        {label}
        <input readOnly value={issued.link} ref={setField} onFocus={(e) => e.target.select()} />
      </label>
      <button type="button" onClick={copy}>Copy</button>
      {copied && <span> Copied</span>}
      <p>Shown only once. Send it to {issued.email} yourself.</p>
    </div>
  );
}

function AdminPage({ api, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [issued, setIssued] = useState(null);
  const [email, setEmail] = useState('');

  const load = () => api.admin.overview().then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  async function act(action) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err.message);
    }
    await load();
  }

  const invite = (address) => act(async () => {
    const { link } = await api.admin.createInvite(address);
    setIssued({ kind: 'invite', email: address, link });
  });

  return (
    <section>
      <button type="button" onClick={onBack}>Back to the app</button>
      <h1>Admin</h1>
      <h2>Invite someone</h2>
      <form onSubmit={(e) => { e.preventDefault(); invite(email.trim()); setEmail(''); }}>
        <label>
          Invite email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit">Create invite</button>
      </form>
      {error && <p role="alert">{error}</p>}
      {issued && <IssuedLink issued={issued} />}

      {data && (
        <>
          <h2>Invites</h2>
          <table aria-label="Invites">
            <thead><tr><th>Email</th><th>Status</th><th>Created</th><th /></tr></thead>
            <tbody>
              {data.invites.map((i) => (
                <tr key={i.id}>
                  <td>{i.email}</td>
                  <td>{statusText(i)}</td>
                  <td>{day(i.createdAt)}</td>
                  <td>
                    {i.status === 'pending' && (
                      <button type="button" aria-label={`Revoke invite for ${i.email}`} onClick={() => act(() => api.admin.revokeInvite(i.id))}>
                        Revoke
                      </button>
                    )}
                    {i.status === 'expired' && (
                      <button type="button" aria-label={`Invite ${i.email} again`} onClick={() => invite(i.email)}>
                        Invite again
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>People</h2>
          <table aria-label="People">
            <thead><tr><th>Email</th><th>Joined</th><th>Last login</th><th>Recipes today</th><th /></tr></thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id}>
                  <td><span>{p.email}</span>{p.isAdmin && <span> (admin)</span>}</td>
                  <td>{day(p.joinedAt)}</td>
                  <td>{day(p.lastLoginAt)}</td>
                  <td>{p.recipesToday === null ? '' : `${p.recipesToday} of ${data.limit}`}</td>
                  <td>
                    {!p.isAdmin && (
                      <>
                        <button
                          type="button"
                          aria-label={`Reset password for ${p.email}`}
                          onClick={() => act(async () => {
                            const { link } = await api.admin.reset(p.id);
                            setIssued({ kind: 'reset', email: p.email, link });
                          })}
                        >
                          Reset password
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${p.email}`}
                          onClick={() => {
                            if (window.confirm(`Remove ${p.email} and delete all their data? This cannot be undone.`)) {
                              act(() => api.admin.remove(p.id));
                            }
                          }}
                        >
                          Remove
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export default function AdminScreen({ api, me, onBack }) {
  if (!me.isAdmin) return <p>Not found</p>;
  return <AdminPage api={api} onBack={onBack} />;
}
