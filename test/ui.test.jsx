import { test, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { Button } from '../src/client/components/ui/button.jsx';
import { Emoji } from '../src/client/components/ui/emoji.jsx';
import { Field } from '../src/client/components/ui/field.jsx';
import { Notice } from '../src/client/components/ui/notice.jsx';
import { ConfirmDialog } from '../src/client/components/ui/confirm-dialog.jsx';

afterEach(cleanup);

test('an emoji inside a button does not change its accessible name or its text', () => {
  render(<Button><Emoji>✨</Emoji> Suggest a recipe</Button>);
  expect(screen.getByRole('button', { name: 'Suggest a recipe' })).not.toBeNull();
  expect(screen.getByText('Suggest a recipe')).not.toBeNull();
});

test('Notice keeps the alert and note roles and info has neither', () => {
  render(<><Notice kind="error">bad</Notice><Notice kind="note">careful</Notice><Notice kind="info">fyi</Notice></>);
  expect(screen.getByRole('alert').textContent).toBe('bad');
  expect(screen.getByRole('note').textContent).toBe('careful');
  expect(screen.getByText('fyi').getAttribute('role')).toBeNull();
});

test('Field wraps its label text and input in one label', () => {
  render(<Field label="Email" defaultValue="" />);
  const input = screen.getByLabelText('Email');
  fireEvent.change(input, { target: { value: 'a@b.c' } });
  expect(input.value).toBe('a@b.c');
});

const setup = (onConfirm = vi.fn()) => {
  render(
    <ConfirmDialog
      trigger={<button type="button">Delete</button>}
      title="Delete it?"
      description="This cannot be undone."
      confirmLabel="Yes, delete"
      onConfirm={onConfirm}
    />,
  );
  return onConfirm;
};
const openDialog = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  return screen.findByRole('alertdialog');
};

test('the dialog shows its description and Cancel closes it without confirming', async () => {
  const onConfirm = setup();
  const dialog = await openDialog();
  expect(within(dialog).getByText('This cannot be undone.')).not.toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(onConfirm).not.toHaveBeenCalled();
});

test('Escape closes the dialog without confirming', async () => {
  const onConfirm = setup();
  const dialog = await openDialog();
  fireEvent.keyDown(dialog, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(onConfirm).not.toHaveBeenCalled();
});

test('double-clicking the confirm button confirms once, and a later open confirms again', async () => {
  const onConfirm = setup();
  const dialog = await openDialog();
  const yes = within(dialog).getByRole('button', { name: 'Yes, delete' });
  fireEvent.click(yes);
  fireEvent.click(yes);
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(onConfirm).toHaveBeenCalledTimes(1);
  const again = await openDialog();
  fireEvent.click(within(again).getByRole('button', { name: 'Yes, delete' }));
  expect(onConfirm).toHaveBeenCalledTimes(2);
});
