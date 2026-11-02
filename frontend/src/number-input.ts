/**
 * What a number typed as text means: a number, null when left blank, or undefined when unreadable.
 * These fields are text on purpose. A `type="number"` field in Chrome drops a comma while typing,
 * so "49,5" reaches the form as 495 with nothing marked invalid.
 */
export function parseAmount(text: string) {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return /^\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : undefined;
}
