import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import AdminScreen from '../src/client/screens/AdminScreen.jsx';
import { createFakeApi } from './helpers/fakeApi.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const ADMIN = { email: 'me@example.com', isAdmin: true };
const overview = () => ({
  limit: 10,
  invites: [
    { id: 'i1', email: 'ana@example.com', status: 'pending', daysLeft: 6, createdAt: '2026-10-15T08:00:00.000Z' },
    { id: 'i2', email: 'maria@example.com', status: 'expired', daysLeft: null, createdAt: '2026-10-01T08:00:00.000Z' },
    { id: 'i3', email: 'joao@example.com', status: 'used', daysLeft: null, createdAt: '2026-10-12T08:00:00.000Z' },
  ],
  people: [
    { id: 'p0', email: 'me@example.com', isAdmin: true, joinedAt: '2026-10-10T08:00:00.000Z', lastLoginAt: '2026-10-15T08:00:00.000Z', recipesToday: null },
    { id: 'p1', email: 'joao@example.com', isAdmin: false, joinedAt: '2026-10-12T08:00:00.000Z', lastLoginAt: null, recipesToday: 3 },
  ],
});
const make = (overrides = {}) => createFakeApi({ user: ADMIN, overrides: { admin: { overview: vi.fn(async () => overview()), ...overrides } } });
const open = async (api, me = ADMIN) => {
  const view = render(<AdminScreen api={api} me={me} onBack={() => {}} />);
  await screen.findByRole('heading', { name: 'Invite someone' });
  return view;
};
const invitesRow = (email) => within(screen.getByRole('table', { name: 'Invites' })).getByText(email).closest('tr');

test('the overview renders both tables', async () => {
  await open(make());
  expect(within(invitesRow('ana@example.com')).getByText('Pending (6 days left)')).not.toBeNull();
  expect(within(invitesRow('maria@example.com')).getByText('Expired')).not.toBeNull();
  expect(within(invitesRow('joao@example.com')).getByText('Used')).not.toBeNull();
  expect(screen.getByText('3 of 10')).not.toBeNull();
});

test('the admin row has no Reset or Remove and no figure', async () => {
  await open(make());
  const row = screen.getByText('me@example.com').closest('tr');
  expect(within(row).queryByRole('button')).toBeNull();
  expect(within(row).queryByText(/of 10/)).toBeNull();
});

test('creating an invite shows the link once and the overview reloads', async () => {
  const api = make();
  const { unmount } = await open(api);
  fireEvent.change(screen.getByLabelText('Invite email'), { target: { value: 'new@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
  const field = await screen.findByLabelText('Invite link for new@example.com');
  expect(field.value).toMatch(/\/invite\/new@example\.com$/);
  expect(screen.getByText(/shown only once/i)).not.toBeNull();
  expect(api.admin.createInvite).toHaveBeenCalledWith('new@example.com');
  expect(api.admin.overview).toHaveBeenCalledTimes(2);
  unmount();
  await open(api);
  expect(screen.queryByLabelText('Invite link for new@example.com')).toBeNull();
});

test('a conflict error is shown', async () => {
  const api = make({ createInvite: vi.fn(async () => { throw new Error('That email already has an account'); }) });
  await open(api);
  fireEvent.change(screen.getByLabelText('Invite email'), { target: { value: 'ana@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/already has an account/);
});

test('Revoke calls the API and the overview reloads', async () => {
  const overviews = [overview(), { ...overview(), invites: overview().invites.slice(1) }];
  const api = make({ overview: vi.fn(async () => overviews.shift() ?? overview()), revokeInvite: vi.fn(async () => {}) });
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for ana@example.com' }));
  await waitFor(() => expect(screen.queryByText('Pending (6 days left)')).toBeNull());
  expect(api.admin.revokeInvite).toHaveBeenCalledWith('i1');
});

test('Invite again creates a new invite for an expired one', async () => {
  const api = make();
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Invite maria@example.com again' }));
  await screen.findByLabelText('Invite link for maria@example.com');
  expect(api.admin.createInvite).toHaveBeenCalledWith('maria@example.com');
});

test('Reset password shows a reset link once', async () => {
  const api = make();
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Reset password for joao@example.com' }));
  const field = await screen.findByLabelText('Reset link for joao@example.com');
  expect(field.value).toMatch(/\/reset\//);
  expect(api.admin.reset).toHaveBeenCalledWith('p1');
});

test('Remove does nothing until the confirmation naming the person is accepted', async () => {
  const api = make();
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  await open(api);
  fireEvent.click(screen.getByRole('button', { name: 'Remove joao@example.com' }));
  expect(api.admin.remove).not.toHaveBeenCalled();
  expect(confirm.mock.calls[0][0]).toMatch(/joao@example\.com/);
  fireEvent.click(screen.getByRole('button', { name: 'Remove joao@example.com' }));
  await waitFor(() => expect(api.admin.remove).toHaveBeenCalledWith('p1'));
});

test('a non-admin sees Not found and nothing is requested', async () => {
  const api = make();
  render(<AdminScreen api={api} me={{ email: 'ana@example.com', isAdmin: false }} onBack={() => {}} />);
  expect(screen.getByText('Not found')).not.toBeNull();
  expect(api.admin.overview).not.toHaveBeenCalled();
});

test('emails are rendered as text, never as markup', async () => {
  const hostile = { ...overview(), invites: [{ id: 'x', email: '<img src=x onerror=alert(1)>@example.com', status: 'used', daysLeft: null, createdAt: '2026-10-15T08:00:00.000Z' }] };
  const { container } = await open(make({ overview: vi.fn(async () => hostile) }));
  expect(screen.getByText('<img src=x onerror=alert(1)>@example.com')).not.toBeNull();
  expect(container.querySelector('img')).toBeNull();
});

test('/admin in the app shows the page for the admin and Not found for others', async () => {
  const admin = make();
  const { unmount } = render(<App api={admin} path="/admin" navigate={() => {}} />);
  expect(await screen.findByRole('heading', { name: 'Invite someone' })).not.toBeNull();
  unmount();
  const user = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  render(<App api={user} path="/admin" navigate={() => {}} />);
  expect(await screen.findByText('Not found')).not.toBeNull();
  expect(user.admin.overview).not.toHaveBeenCalled();
});
