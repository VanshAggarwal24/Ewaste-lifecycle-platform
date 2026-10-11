import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useSandboxSafeForm } from '@/lib/formSubmission';

/**
 * The submit path must not depend on the browser's native form submission.
 *
 * In the preview's sandboxed iframe (`sandbox="allow-scripts"`, no `allow-forms`) Chrome
 * refuses the submission and never dispatches the `submit` event, so a form wired only through
 * `onSubmit` is dead: clicking Sign in does nothing and no request is made. These tests pin the
 * behaviour that replaced it — the click itself drives the handler, Enter drives the handler,
 * and a real `submit` event still works.
 */

function TestForm({ onSave }: { onSave: () => void }) {
  const [note, setNote] = useState('');
  const submit = useSandboxSafeForm((event) => {
    event.preventDefault();
    onSave();
  });

  return (
    <form {...submit} noValidate>
      <label htmlFor="title">Title</label>
      <input id="title" name="title" />
      <label htmlFor="notes">Notes</label>
      <textarea id="notes" name="notes" />
      <button type="button" onClick={() => setNote('toggled')}>
        Toggle {note}
      </button>
      <button type="submit">Save</button>
    </form>
  );
}

afterEach(cleanup);

describe('a form that must work without native submission', () => {
  it('runs the handler once when the submit button is clicked', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('runs the handler once when the icon inside the submit button is clicked', () => {
    const onSave = vi.fn();
    render(<SaveWithIcon onSave={onSave} />);

    fireEvent.click(screen.getByTestId('icon'));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('runs the handler when Enter is pressed in a text field', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText('Title'), { key: 'Enter' });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('leaves Enter alone inside a textarea', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);

    fireEvent.keyDown(screen.getByLabelText('Notes'), { key: 'Enter' });

    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not submit from a button that is not a submit button', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /toggle toggled/i })).toBeTruthy();
  });

  it('still handles a real submit event', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);

    fireEvent.submit(screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('works when the submit event never reaches the app (the sandboxed preview)', () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);
    const form = screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement;

    // A sandboxed frame refuses the submission before dispatching `submit` at all; from the
    // app's point of view that is the same as the event never reaching it.
    form.addEventListener('submit', (event) => event.stopPropagation());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('shows the failure mode this replaced: previously the button did nothing', () => {
    const onSave = vi.fn();
    render(<LegacyForm onSave={onSave} />);
    const form = screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement;
    form.addEventListener('submit', (event) => event.stopPropagation());

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).not.toHaveBeenCalled();
  });

  it('accepts a second attempt on a later tick (the guard is not a lock)', async () => {
    const onSave = vi.fn();
    render(<TestForm onSave={onSave} />);
    const form = screen.getByRole('button', { name: 'Save' }).closest('form') as HTMLFormElement;

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireEvent.submit(form);

    expect(onSave).toHaveBeenCalledTimes(2);
  });
});

/** The previous wiring: the handler only ever ran from the browser's `submit` event. */
function LegacyForm({ onSave }: { onSave: () => void }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSave();
      }}
      noValidate
    >
      <button type="submit">Save</button>
    </form>
  );
}

/** A submit button whose visible content is an icon, like the real buttons. */
function SaveWithIcon({ onSave }: { onSave: () => void }) {
  const submit = useSandboxSafeForm((event) => {
    event.preventDefault();
    onSave();
  });

  return (
    <form {...submit} noValidate>
      <button type="submit">
        <span data-testid="icon" aria-hidden>
          ★
        </span>
        Save
      </button>
    </form>
  );
}
