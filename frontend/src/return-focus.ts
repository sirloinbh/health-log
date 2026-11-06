import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Sends focus back to the button that opened a dialog once it closes (#78). The page's dialogs open
 * without a DialogTrigger, so Radix has nowhere to return focus and keyboard users land on <body>.
 * When that button is gone, for example after a save redraws the list, focus goes to `fallback`.
 */
export function useReturnFocus(fallback: RefObject<HTMLElement | null>) {
  const opener = useRef<HTMLElement | null>(null);
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

  /** Call when the dialog opens, with the element that opened it. */
  const remember = useCallback((element: HTMLElement) => {
    opener.current = element;
  }, []);

  /** Call when the dialog closes. */
  const returnFocus = useCallback(() => setReturns((count) => count + 1), []);

  /** Call after the list is drawn again: a removed opener drops focus to <body>. */
  const keepFocus = useCallback(() => {
    if (document.activeElement === document.body) fallback.current?.focus();
  }, [fallback]);

  return { remember, returnFocus, keepFocus };
}
