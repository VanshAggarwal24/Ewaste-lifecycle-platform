import { useCallback, useRef, type FormEvent, type FormEventHandler, type KeyboardEvent, type MouseEvent } from 'react';

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void | Promise<void>;

/**
 * Makes a form submit reliably in every context the app runs in.
 *
 * A form whose only submit path is the browser's native submission stops working when the app
 * is embedded in a frame with the sandbox flag `allow-forms` unset — which is exactly how the
 * platform preview is framed. Chrome refuses the submission ("Blocked form submission to ''
 * because the form's frame is sandboxed and the 'allow-forms' permission is not set"), and
 * because the `submit` event is never dispatched, React's `onSubmit` never runs: the button
 * looks dead and no request is made. Firefox and Safari behave the same way.
 *
 * Spreading the returned props onto a `<form>` removes that dependency:
 *
 *   const submit = useSandboxSafeForm(handleSubmit);
 *   <form {...submit} noValidate> … <Button type="submit">Save</Button></form>
 *
 *   - clicking the submit button is handled at the form level (the click still fires in a
 *     sandboxed frame) and the native submission is cancelled, so the handler runs once;
 *   - pressing Enter in a field runs the handler directly, which also suppresses the implicit
 *     submission a sandboxed frame would refuse;
 *   - a real `submit` event — programmatic `requestSubmit()`, or a browser that submits
 *     normally — is still handled, so nothing is lost by using this.
 *
 * The handler contract is unchanged: it receives an event and calls `event.preventDefault()`.
 */
export function useSandboxSafeForm(handler: SubmitHandler) {
  // A single press can reach us twice (click handling plus the browser's implicit submission).
  // The guard keeps one press to one request; it is released on the next tick so a later
  // attempt — for example after a failed sign-in — is never swallowed.
  const handledOnThisTick = useRef(false);

  const run = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      if (handledOnThisTick.current) return;
      handledOnThisTick.current = true;
      window.setTimeout(() => {
        handledOnThisTick.current = false;
      }, 0);
      void handler(event);
    },
    [handler],
  );

  const onSubmit = useCallback<FormEventHandler<HTMLFormElement>>(
    (event) => {
      event.preventDefault();
      run(event);
    },
    [run],
  );

  const onClick = useCallback(
    (event: MouseEvent<HTMLFormElement>) => {
      const button = (event.target as HTMLElement | null)?.closest?.('button');
      if (!button || button.hasAttribute('disabled')) return;

      // A button inside a form submits unless its type says otherwise (HTML default).
      if ((button.getAttribute('type') ?? 'submit') !== 'submit') return;

      // Cancel the native submission — in a sandboxed frame it would be refused and the
      // `submit` event would never arrive — and run the handler from the click itself.
      event.preventDefault();
      run(event as unknown as FormEvent<HTMLFormElement>);
    },
    [run],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.key !== 'Enter') return;

      const target = event.target as HTMLElement | null;
      // Textareas keep newlines, and Enter on a focused button is a click.
      if (!target || target.tagName === 'TEXTAREA' || target.tagName === 'BUTTON') return;

      event.preventDefault();
      run(event as unknown as FormEvent<HTMLFormElement>);
    },
    [run],
  );

  return { onSubmit, onClick, onKeyDown };
}
