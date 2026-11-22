/** pg returns NUMERIC and bigint counts as strings; a NULL stays null. */
export const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

// The two-decimal rule is shared with the screens (#215).
export { hasTwoDecimalsAtMost } from './contract.js';
