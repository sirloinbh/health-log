/** pg returns NUMERIC as a string on purpose (standard/db.ts); a NULL stays null. */
export const optionalNumber = (value: string | null) => (value === null ? null : Number(value));

/** `row` with the named NUMERIC columns as numbers; a column that can be NULL stays nullable. */
type WithNumbers<T, K extends keyof T> = {
  [P in keyof T]: P extends K ? (null extends T[P] ? number | null : number) : T[P];
};

/**
 * The one place NUMERIC strings become numbers. The query already names its columns as the API
 * does (`weight_kg AS "weightKg"`), so only the NUMERIC ones are converted here. int8 needs no
 * help: setInt8Parser already returns it as a number.
 */
export const withNumbers = <T extends Record<string, unknown>, K extends keyof T & string>(
  row: T,
  keys: readonly K[],
) => {
  const result: Record<string, unknown> = { ...row };
  for (const key of keys) result[key] = optionalNumber(row[key] as string | null);
  return result as WithNumbers<T, K>;
};

// The two-decimal rule is shared with the screens (#215).
export { hasTwoDecimalsAtMost } from './contract.js';
