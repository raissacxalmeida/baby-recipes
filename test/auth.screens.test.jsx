import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createFakeApi } from './helpers/fakeApi.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PASSWORD = 'a long enough password';
const now = () => new Date(2026, 9, 15);
const open = (api, path = '/') => render(<App api={api} now={now} path={path} navigate={() => {}} />);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));

test('a logged-out visitor sees the login form', async () => {
  open(createFakeApi());
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
});

test('a wrong password shows the server message', async () => {
  open(createFakeApi());
  await screen.findByLabelText('Email');
  type('Email', 'ana@example.com');
  type('Password', 'wrong password!!');
  click('Log in');
  expect((await screen.findByRole('alert')).textContent).toMatch(/Wrong email or password/);
});

test('a good login shows the signed-in area with the account bar', async () => {
  open(createFakeApi());
  await screen.findByLabelText('Email');
  type('Email', 'ana@example.com');
  type('Password', PASSWORD);
  click('Log in');
  expect(await screen.findByText('ana@example.com')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('an existing session skips the login form', async () => {
  open(createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } }));
  expect(await screen.findByRole('button', { name: 'Log out' })).not.toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
});

test('logging out returns to the login form', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  open(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
  expect(api.logout).toHaveBeenCalled();
});

test('Delete my account asks first and only then deletes', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
  open(api);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete my account' }));
  expect(api.deleteAccount).not.toHaveBeenCalled();
  expect(confirm.mock.calls[0][0]).toMatch(/ana@example\.com/);
  click('Delete my account');
  await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
});

test('only the admin sees the Admin link and no Delete button', async () => {
  const { unmount } = open(createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } }));
  await screen.findByRole('button', { name: 'Log out' });
  expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  unmount();
  open(createFakeApi({ user: { email: 'me@example.com', isAdmin: true } }));
  expect(await screen.findByRole('button', { name: 'Admin' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Delete my account' })).toBeNull();
});

test('/invite/<token> shows the invited email and checks the password length first', async () => {
  const api = createFakeApi();
  open(api, '/invite/abc');
  expect(await screen.findByText(/ana@example\.com/)).not.toBeNull();
  type('Choose a password', '123456789');
  click('Create account');
  expect(screen.getByRole('alert').textContent).toMatch(/at least 10/);
  expect(api.signup).not.toHaveBeenCalled();
});

test('a valid invite signup lands signed in', async () => {
  const api = createFakeApi();
  open(api, '/invite/abc');
  await screen.findByLabelText('Choose a password');
  type('Choose a password', PASSWORD);
  click('Create account');
  await waitFor(() => expect(api.signup).toHaveBeenCalledWith('abc', PASSWORD));
  expect(await screen.findByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('a bad invite link shows a message and no form', async () => {
  const api = createFakeApi({ overrides: { invite: vi.fn(async () => { throw new Error('This invite link is not valid'); }) } });
  open(api, '/invite/nope');
  expect((await screen.findByRole('alert')).textContent).toMatch(/not valid/);
  expect(screen.queryByLabelText('Choose a password')).toBeNull();
});

test('/reset/<token> sets a new password and offers the login page', async () => {
  const api = createFakeApi();
  const navigate = vi.fn();
  render(<App api={api} now={now} path="/reset/abc" navigate={navigate} />);
  await screen.findByLabelText('New password');
  type('New password', PASSWORD);
  click('Change password');
  await waitFor(() => expect(api.reset).toHaveBeenCalledWith('abc', PASSWORD));
  fireEvent.click(await screen.findByRole('button', { name: 'Go to log in' }));
  expect(navigate).toHaveBeenCalledWith('/');
});

test('the login lockout message is shown', async () => {
  const api = createFakeApi({ overrides: { login: vi.fn(async () => { throw new Error('Too many attempts. Try again in 15 minutes'); }) } });
  open(api);
  await screen.findByLabelText('Email');
  type('Email', 'ana@example.com');
  type('Password', PASSWORD);
  click('Log in');
  expect((await screen.findByRole('alert')).textContent).toMatch(/15 minutes/);
});
