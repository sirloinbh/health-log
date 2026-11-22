/** pg returns NUMERIC and bigint counts as strings; a NULL stays null. */
export const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

/**
 * True when the number has at most 2 decimal places. The columns keep two decimals; anything finer
 * would be rounded silently, even down to zero.
 */
export const hasTwoDecimalsAtMost = (value: number) => Number(value.toFixed(2)) === value;
