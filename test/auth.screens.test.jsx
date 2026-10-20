import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import App from '../src/client/App.jsx';
import { createFakeApi } from './helpers/fakeApi.js';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const PASSWORD = 'a long enough password';
const now = () => new Date(2026, 9, 15);
const open = (api, path = '/') => render(<App api={api} now={now} path={path} navigate={() => {}} />);
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name) => fireEvent.click(screen.getByRole('button', { name }));
// The account actions live in the menu; opening it twice would close it again.
const openMenu = async () => {
  const button = await screen.findByRole('button', { name: 'Menu' });
  if (button.getAttribute('aria-expanded') === 'false') fireEvent.click(button);
};
const inMenu = async (name) => { await openMenu(); return screen.findByRole('button', { name }); };

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
  await openMenu();
  expect(await screen.findByText('ana@example.com')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('an existing session skips the login form', async () => {
  open(createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } }));
  expect(await inMenu('Log out')).not.toBeNull();
  expect(screen.queryByLabelText('Password')).toBeNull();
});

test('logging out returns to the login form', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  open(api);
  fireEvent.click(await inMenu('Log out'));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
  expect(api.logout).toHaveBeenCalled();
});

const openDeleteDialog = async () => {
  fireEvent.click(await inMenu('Delete my account'));
  return screen.findByRole('alertdialog');
};

test('Delete my account asks first and only then deletes', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  open(api);
  const dialog = await openDeleteDialog();
  expect(dialog.textContent).toMatch(/ana@example\.com/);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(api.deleteAccount).not.toHaveBeenCalled();
  fireEvent.click(within(await openDeleteDialog()).getByRole('button', { name: 'Yes, delete my account' }));
  await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledTimes(1));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
});

test('after the account is deleted the page is not locked', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } });
  open(api);
  fireEvent.click(within(await openDeleteDialog()).getByRole('button', { name: 'Yes, delete my account' }));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
  expect(document.body.style.pointerEvents).not.toBe('none');
});

test('only the admin sees the Admin link and no Delete button', async () => {
  const { unmount } = open(createFakeApi({ user: { email: 'ana@example.com', isAdmin: false } }));
  await inMenu('Log out');
  expect(screen.queryByRole('button', { name: 'Admin' })).toBeNull();
  unmount();
  open(createFakeApi({ user: { email: 'me@example.com', isAdmin: true } }));
  expect(await inMenu('Admin')).not.toBeNull();
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
  expect(await inMenu('Log out')).not.toBeNull();
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

test('a malformed invite path does not blank the page', async () => {
  const api = createFakeApi({ overrides: { invite: vi.fn(async () => { throw new Error('This invite link is not valid'); }) } });
  open(api, '/invite/%E0%A4%A');
  expect((await screen.findByRole('alert')).textContent).toMatch(/not valid/);
  expect(api.invite).toHaveBeenCalledWith('%E0%A4%A');
});

test('logging out signs out locally even when the server call fails', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, overrides: { logout: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  open(api);
  fireEvent.click(await inMenu('Log out'));
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
});

test('a failed account deletion shows the message and stays signed in', async () => {
  const api = createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, overrides: { deleteAccount: vi.fn(async () => { throw new Error('Could not reach the server'); }) } });
  open(api);
  fireEvent.click(within(await openDeleteDialog()).getByRole('button', { name: 'Yes, delete my account' }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/Could not reach/);
  expect(screen.getByRole('button', { name: 'Log out' })).not.toBeNull();
});

test('a session that ends mid-use returns to the login form with a notice', async () => {
  const api = createFakeApi({
    user: { email: 'ana@example.com', isAdmin: false },
    birthdate: '2026-02-14',
    overrides: { suggest: vi.fn(async () => { throw Object.assign(new Error('Please log in'), { status: 401 }); }) },
  });
  open(api);
  await screen.findByLabelText('Ingredient');
  type('Ingredient', 'banana');
  click('Add');
  click('Suggest a recipe');
  expect(await screen.findByRole('button', { name: 'Log in' })).not.toBeNull();
  expect(screen.getByText(/session ended/i)).not.toBeNull();
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

const TAGLINE = 'recipes for little eaters';

test('the login page shows the logo and tagline', async () => {
  open(createFakeApi());
  expect(await screen.findByText(TAGLINE)).not.toBeNull();
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
  expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Log in']);
});

test('the invite page shows the logo and tagline', async () => {
  open(createFakeApi(), '/invite/abc');
  expect(await screen.findByText(TAGLINE)).not.toBeNull();
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
});

test('the reset page shows the logo and tagline', async () => {
  open(createFakeApi(), '/reset/abc');
  expect(await screen.findByText(TAGLINE)).not.toBeNull();
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
});

test('the logged-in app shows the name but not the tagline', async () => {
  open(createFakeApi({ user: { email: 'ana@example.com', isAdmin: false }, birthdate: '2026-02-14' }));
  await screen.findByRole('button', { name: 'Menu' });
  expect(screen.getByText('Tiny Pantry')).not.toBeNull();
  expect(screen.queryByText(TAGLINE)).toBeNull();
});

test('nothing is shown while the session is loading', () => {
  open(createFakeApi({ overrides: { session: () => new Promise(() => {}) } }));
  expect(screen.getByText('Loading...')).not.toBeNull();
  expect(screen.queryByText('Tiny Pantry')).toBeNull();
  expect(screen.queryByText(TAGLINE)).toBeNull();
});
