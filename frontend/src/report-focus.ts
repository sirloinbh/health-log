// Where keyboard focus goes on the report page as reports load (#212). One state replaces the
// flags that used to reset each other across three effects.

/**
 * What a load was started by, which decides where focus goes when it ends.
 * - `move`: a period button; it stays on screen, so focus moves only if the report fails (#138).
 * - `arrival`: "This week", which goes once the week is shown; focus moves to the period (#138).
 * - `retry`: "Try again", which stays while it waits and keeps its focus if it fails again (#128).
 * - `none`: the first load, or an address the page did not change itself.
 */
export type LoadCause = 'none' | 'move' | 'arrival' | 'retry';

export type ReportFocus = {
  /** Asked for by the last move, until the load for the new address starts. */
  asked: LoadCause;
  /** What started the load on its way now. */
  running: LoadCause;
  /** Where focus should go; `n` changes each time, so the same place can be asked again. */
  target: { to: 'span' | 'retry'; n: number } | null;
};

export type ReportFocusEvent =
  /** A period or date button changed the address; `arrival` when the button goes on arrival. */
  | { type: 'move'; arrival: boolean }
  /** The load for the address now asked for starts. */
  | { type: 'load' }
  /** "Try again" was pressed. */
  | { type: 'retry' }
  /** The load on its way ended. Answers for an address already left are not sent here. */
  | { type: 'done'; outcome: 'ok' | 'failed' };

export const initialReportFocus: ReportFocus = { asked: 'none', running: 'none', target: null };

/** Where focus goes when a load started by `cause` ends with `outcome`; null to leave it. */
const focusAfter = (cause: LoadCause, outcome: 'ok' | 'failed'): 'span' | 'retry' | null => {
  if (outcome === 'ok') return cause === 'arrival' || cause === 'retry' ? 'span' : null;
  // A failed move takes its row away, so "Try again" gets the focus; a failed retry keeps its own.
  return cause === 'move' || cause === 'arrival' ? 'retry' : null;
};

export function reportFocus(state: ReportFocus, event: ReportFocusEvent): ReportFocus {
  switch (event.type) {
    case 'move':
      return { ...state, asked: event.arrival ? 'arrival' : 'move' };
    case 'load':
      // A retry for the period left is over: the one now asked for is not a retry.
      return { ...state, asked: 'none', running: state.asked };
    case 'retry':
      return { ...state, running: 'retry' };
    case 'done': {
      const to = focusAfter(state.running, event.outcome);
      return {
        ...state,
        running: 'none',
        target: to ? { to, n: (state.target?.n ?? 0) + 1 } : state.target,
      };
    }
  }
}
