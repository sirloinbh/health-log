import type { RefObject } from 'react';

import { Button } from './components/ui/button';
import { Spinner } from './components/ui/spinner';

/**
 * Reads the next page of a food list; shown only while the server says there is one.
 * While it waits it stays focusable (aria-disabled, not disabled): a disabled button drops the
 * keyboard focus to the start of the page. After the last page it is gone, so focus moves to
 * `afterLast`, the status line that says how many foods are now shown.
 */
export function MoreFoodsButton({
  loading,
  onLoad,
  afterLast,
}: {
  loading: boolean;
  onLoad: () => Promise<boolean>;
  afterLast: RefObject<HTMLElement | null>;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="self-start aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
      aria-disabled={loading || undefined}
      aria-busy={loading || undefined}
      onClick={(event) => {
        if (loading) return;
        const button = event.currentTarget;
        void onLoad().then((last) => {
          // Only the focus the button had: someone who moved on while waiting stays where they are.
          const active = document.activeElement;
          if (last && (active === button || active === document.body || active === null)) {
            afterLast.current?.focus();
          }
        });
      }}
    >
      {loading ? <Spinner size="sm" label="불러오는 중" /> : null}
      결과 더 보기
    </Button>
  );
}
