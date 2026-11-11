/** "1 day", "3 days": a count with its noun in the right number. */
export const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
