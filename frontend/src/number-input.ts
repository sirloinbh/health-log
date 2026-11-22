// A double holds 15 significant decimal digits exactly (#209).
const maxSignificantDigits = 15;

/**
 * What a number typed as text means: a number, null when left blank, or undefined when unreadable.
 * These fields are text on purpose. A `type="number"` field in Chrome drops a comma while typing,
 * so "49,5" reaches the form as 495 with nothing marked invalid.
 */
export function parseAmount(text: string) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  // Bounded lengths: 400 digits would become Infinity, then null in JSON, and erase the stored value.
  if (!/^\d{1,9}(\.\d{1,9})?$/.test(trimmed)) return undefined;
  // A double holds 15 significant digits exactly; more would be rounded, so 999999999.999999999
  // would be saved as 1000000000 (#209). Leading zeros and zeros after the last decimal digit
  // carry no value, so "0.000000001" and "70.500000000" are still read.
  const significant = trimmed
    .replace(/(\.\d*?)0+$/, '$1')
    .replace('.', '')
    .replace(/^0+/, '');
  return significant.length <= maxSignificantDigits ? Number(trimmed) : undefined;
}

/** What to tell someone whose typed amount `parseAmount` could not read. */
export const unreadableAmount = (label: string) =>
  `${label}: enter digits only. Use a period for the decimal point (for example 70.5)`;

// The two-decimal rule of the server, from the shared contract (#215).
export { hasTwoDecimalsAtMost } from '../../shared/contract';
