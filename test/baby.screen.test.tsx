import { test, expect, vi, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import BabyScreen, { type BabyScreenProps } from '../src/client/screens/BabyScreen.jsx';
import type { ApiBaby } from '../src/client/apiTypes.js';
import { now } from './helpers/app.jsx';

afterEach(cleanup);

const mia: ApiBaby = { id: 'baby-1', name: 'Mia', birthdate: '2026-02-14' };

function show(props: Partial<BabyScreenProps> = {}) {
  const onSave = vi.fn<BabyScreenProps['onSave']>(async () => {});
  render(<BabyScreen now={now} onSave={onSave} {...props} />);
  return onSave;
}
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save' }));
const field = (label: string) => screen.getByLabelText<HTMLInputElement>(label);

test('first mode shows Welcome and both fields', () => {
  show({ first: true });
  expect(screen.getByRole('heading', { level: 1, name: 'Welcome' })).not.toBeNull();
  expect(field("Baby's name").value).toBe('');
  expect(field("Baby's birthday").value).toBe('');
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove this baby' })).toBeNull();
});

test('without a baby the heading is Add a baby, with one it is Edit baby', () => {
  show();
  expect(screen.getByRole('heading', { level: 1, name: 'Add a baby' })).not.toBeNull();
  cleanup();
  show({ baby: mia });
  expect(screen.getByRole('heading', { level: 1, name: 'Edit baby' })).not.toBeNull();
});

test('an empty or blank name shows the name error and does not call onSave', async () => {
  const onSave = show({ first: true });
  fill("Baby's birthday", '2026-02-14');
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a name of 1 to 30 characters');
  fill("Baby's name", '   ');
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a name of 1 to 30 characters');
  expect(onSave).not.toHaveBeenCalled();
});

test('a 31-character name shows the error', async () => {
  const onSave = show({ first: true });
  fill("Baby's name", 'B'.repeat(31));
  fill("Baby's birthday", '2026-02-14');
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a name of 1 to 30 characters');
  expect(onSave).not.toHaveBeenCalled();
});

test('a 30-character name, counted like the server counts, is accepted', async () => {
  const onSave = show({ first: true });
  fill("Baby's name", ` ${'B'.repeat(30)} `);
  fill("Baby's birthday", '2026-02-14');
  save();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'B'.repeat(30), birthdate: '2026-02-14' }));
});

test('a future or missing birthday shows the birthday error and does not call onSave', async () => {
  const onSave = show({ first: true });
  fill("Baby's name", 'Mia');
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('Enter a valid birthday as YYYY-MM-DD');
  fill("Baby's birthday", '2099-01-01');
  save();
  expect((await screen.findByRole('alert')).textContent).toBe('The birthday must be before today');
  expect(onSave).not.toHaveBeenCalled();
});

test('a valid form calls onSave with the trimmed name and the birthday', async () => {
  const onSave = show({ first: true });
  fill("Baby's name", '  Mia  ');
  fill("Baby's birthday", '2026-02-14');
  save();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledWith({ name: 'Mia', birthdate: '2026-02-14' }));
  expect(screen.queryByRole('alert')).toBeNull();
});

test('a server error from onSave is shown and the form keeps what was typed', async () => {
  const failing = Object.assign(new Error('Could not reach the server'), { key: 'err.network' });
  show({ first: true, onSave: vi.fn(async () => { throw failing; }) });
  fill("Baby's name", 'Mia');
  fill("Baby's birthday", '2026-02-14');
  save();
  expect((await screen.findByRole('alert')).textContent).toMatch(/reach the server/);
  expect(field("Baby's name").value).toBe('Mia');
});

test('edit mode is prefilled and a baby with no name shows an empty name field', () => {
  show({ baby: mia });
  expect(field("Baby's name").value).toBe('Mia');
  expect(field("Baby's birthday").value).toBe('2026-02-14');
  cleanup();
  show({ baby: { id: 'baby-1', name: null, birthdate: '2026-02-14' } });
  expect(field("Baby's name").value).toBe('');
  expect(field("Baby's birthday").value).toBe('2026-02-14');
});

test('Cancel and Remove appear only when their callbacks are given, and Remove asks to confirm', async () => {
  const onCancel = vi.fn();
  const onRemove = vi.fn();
  show({ baby: mia, onCancel, onRemove });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(onCancel).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove this baby' }));
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Remove Mia/)).not.toBeNull();
  expect(onRemove).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove' }));
  expect(onRemove).toHaveBeenCalled();
  cleanup();
  show({ baby: mia });
  expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove this baby' })).toBeNull();
});

test('the Remove dialog names a baby with no name "Your baby"', async () => {
  show({ baby: { id: 'baby-1', name: null, birthdate: '2026-02-14' }, onRemove: vi.fn() });
  fireEvent.click(screen.getByRole('button', { name: 'Remove this baby' }));
  expect(within(await screen.findByRole('alertdialog')).getByText(/Remove Your baby/)).not.toBeNull();
});

test('a 60-character unbroken name does not overflow the card', async () => {
  const long = 'A'.repeat(60);
  show({ baby: { ...mia, name: long }, onRemove: vi.fn() });
  // The value is kept whole (no maxLength cut) and the field wraps inside the card; saving says it is too long.
  expect(field("Baby's name").value).toBe(long);
  expect(field("Baby's name").maxLength).toBe(-1);
  expect(field("Baby's name").closest('label')?.classList.contains('wrap-anywhere')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Remove this baby' }));
  const body = within(await screen.findByRole('alertdialog')).getByText(new RegExp(long));
  expect(body.classList.contains('wrap-anywhere')).toBe(true);
});

test('the screen is a section with the heading as its first h1', () => {
  const { container } = render(<BabyScreen first now={now} onSave={vi.fn()} />);
  const root = container.firstElementChild;
  expect(root?.tagName).toBe('SECTION');
  expect(root?.querySelectorAll('h1')).toHaveLength(1);
});

// A promise the test settles by hand, to hold onSave or onRemove pending.
function deferred() {
  let resolve: () => void = () => {};
  let reject: (err: Error) => void = () => {};
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const saveButton = () => screen.getByRole<HTMLButtonElement>('button', { name: 'Save' });
const formOf = (el: HTMLElement) => {
  const form = el.closest('form');
  if (!form) throw new Error('no form');
  return form;
};

test('a second submit while saving is ignored, Save is disabled until it settles, and a failure lets the parent retry', async () => {
  const pending = deferred();
  const onSave = vi.fn<BabyScreenProps['onSave']>(() => pending.promise);
  show({ first: true, onSave, onCancel: vi.fn() });
  fill("Baby's name", 'Mia');
  fill("Baby's birthday", '2026-02-14');
  save();
  // Both a click and a direct submit (which a disabled button does not stop) are ignored while the first is pending.
  save();
  fireEvent.submit(formOf(saveButton()));
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(saveButton().disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
  pending.reject(new Error('Could not reach the server'));
  expect((await screen.findByRole('alert')).textContent).toMatch(/reach the server/);
  expect(saveButton().disabled).toBe(false);
  save();
  await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
});

test('Remove runs once while pending, and the form cannot be used until it settles', async () => {
  const pending = deferred();
  const onRemove = vi.fn(() => pending.promise);
  const onSave = show({ baby: mia, onCancel: vi.fn(), onRemove });
  fireEvent.click(screen.getByRole('button', { name: 'Remove this baby' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Yes, remove' }));
  expect(onRemove).toHaveBeenCalledTimes(1);
  await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  const remove = screen.getByRole<HTMLButtonElement>('button', { name: 'Remove this baby' });
  expect(remove.disabled).toBe(true);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
  expect(saveButton().disabled).toBe(true);
  fireEvent.click(remove);
  expect(screen.queryByRole('alertdialog')).toBeNull();
  fireEvent.submit(formOf(saveButton()));
  expect(onSave).not.toHaveBeenCalled();
  pending.reject(Object.assign(new Error('You cannot remove your only baby'), { status: 409 }));
  expect((await screen.findByRole('alert')).textContent).toMatch(/only baby/);
  expect(remove.disabled).toBe(false);
  expect(onRemove).toHaveBeenCalledTimes(1);
});

test('a save that unmounts the screen (the parent moves on) leaves no warning behind', async () => {
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
  function Parent() {
    const [done, setDone] = useState(false);
    return done ? <p>Saved</p> : <BabyScreen first now={now} onSave={async () => { setDone(true); }} />;
  }
  render(<Parent />);
  fill("Baby's name", 'Mia');
  fill("Baby's birthday", '2026-02-14');
  save();
  expect(await screen.findByText('Saved')).not.toBeNull();
  await new Promise((r) => setTimeout(r, 0));
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});
