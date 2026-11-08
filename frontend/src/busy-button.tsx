import type { ComponentProps, MouseEvent } from 'react';

import { Button } from './components/ui/button';
import { cn } from './lib/utils';

/**
 * A button that stays focusable while a save it started is on its way (#126).
 * `disabled` would drop the keyboard focus to the start of the page, and a failed save would leave
 * it there. This one is only marked aria-disabled and ignores presses while `busy`, so a submit
 * button does not submit its form again. The handler behind it should also refuse a second save,
 * since Enter in a field submits the form without pressing the button.
 * `disabled` is still for a button that cannot be used at all, such as an empty combo.
 */
export function BusyButton({
  busy,
  className,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { busy: boolean }) {
  return (
    <Button
      {...props}
      aria-disabled={busy || undefined}
      className={cn('aria-disabled:cursor-not-allowed aria-disabled:opacity-50', className)}
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        if (busy) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
