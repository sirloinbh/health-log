import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sends focus back to the button that opened a dialog once it closes (#78). The page's dialogs open
 * without a DialogTrigger, so Radix has nowhere to return focus and keyboard users land on <body>.
 * When that button is gone, for example after a save redraws the list, focus goes to `fallback`.
 *
 * Call it from the page component that draws the list, so its redraws run the check below.
 */
export function useReturnFocus(fallback: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
  // Set from closing until focus has gone somewhere or a new dialog opens.
  const watching = useRef(false);
  const [returns, setReturns] = useState(0);

  // The closing dialog moves focus on a timer of its own first.
  useEffect(() => {
    if (!returns) return;
    const timer = setTimeout(() => {
      const target = opener.current?.isConnected ? opener.current : fallback.current;
      target?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [fallback, returns]);

  // After every redraw: a list read again after a save may have removed the opener while it had
  // focus, which drops focus to <body>. No dependencies, as the redraw can come from any state.
  useEffect(() => {
    if (!watching.current || opener.current?.isConnected) return;
    watching.current = false;
    if (document.activeElement === document.body) fallback.current?.focus();
  });

  /** Call when the dialog opens, with the element that opened it. */
  const remember = useCallback((element: HTMLElement) => {
    opener.current = element;
    watching.current = false;
  }, []);

  /** Call when the dialog closes. */
  const returnFocus = useCallback(() => {
    watching.current = true;
    setReturns((count) => count + 1);
  }, []);

  return { remember, returnFocus };
}
