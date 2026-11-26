/**
 * The distinct values a person already used in a field, most used first, then the ones in
 * `common` that were not used yet. Feeds the pickers of repeating fields (brand, unit, clinic)
 * so a value is chosen instead of typed again (#352). Blank values are dropped, and two values
 * that differ only in case or outer spaces count as one (the first spelling wins).
 */
export function usedValues(
  values: readonly (string | null | undefined)[],
  common: readonly string[] = [],
): string[] {
  const counts = new Map<string, { text: string; count: number; first: number }>();
  values.forEach((value, index) => {
    const text = value?.trim();
    if (!text) return;
    const key = text.toLowerCase();
    const seen = counts.get(key);
    if (seen) seen.count += 1;
    else counts.set(key, { text, count: 1, first: index });
  });
  const used = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  const have = new Set(used.map((entry) => entry.text.toLowerCase()));
  return [...used.map((entry) => entry.text), ...common.filter((v) => !have.has(v.toLowerCase()))];
}
