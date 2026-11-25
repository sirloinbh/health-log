// Checkup and blood test results as the API sends them (#330), and how they read on screen.

export type LabResult = {
  id: number;
  date: string;
  name: string;
  value: number;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  note: string | null;
  /** The visit it was taken at; null when unlinked or once that visit is gone. */
  visit: { id: number; date: string; clinic: string } | null;
};

/** Path every lab result write goes under. */
export const labsPath = '/api/labs';

/** The lab results page, in the app's page list. */
export const labsPagePath = '/labs';

export const maxLabValue = 1_000_000_000;

/**
 * A result or range limit as typed: 0 or more, at most 4 decimals, below 1 billion. Blank is no value
 * (null); anything unreadable is undefined, so "1,5" or "-3" is never guessed at.
 */
export function parseLabNumber(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= maxLabValue ? value : undefined;
}

/** "190 mg/dL", or just "190" without a unit. */
export const valueText = (item: Pick<LabResult, 'value' | 'unit'>) =>
  [String(item.value), item.unit].filter(Boolean).join(' ');

/** "Reference 0 - 200 mg/dL", "Reference up to 200", "Reference from 10", or null with no range. */
export function rangeText(item: Pick<LabResult, 'refLow' | 'refHigh' | 'unit'>) {
  const { refLow: low, refHigh: high } = item;
  if (low === null && high === null) return null;
  const range =
    low !== null && high !== null
      ? `${low} - ${high}`
      : high !== null
        ? `up to ${high}`
        : `from ${low}`;
  return `Reference ${[range, item.unit].filter(Boolean).join(' ')}`;
}

/** Whether the value is outside its reference range; null when there is no range to compare with. */
export function rangeStatus(item: Pick<LabResult, 'value' | 'refLow' | 'refHigh'>) {
  if (item.refLow === null && item.refHigh === null) return null;
  if (item.refLow !== null && item.value < item.refLow) return 'low' as const;
  if (item.refHigh !== null && item.value > item.refHigh) return 'high' as const;
  return 'normal' as const;
}
