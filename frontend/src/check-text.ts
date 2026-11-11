/** null: not checked. It is never read as a no. */
export type DayCheck = {
  date: string;
  dietKept: boolean | null;
  sleepGood: boolean | null;
  memo: string | null;
};

type Rate = { days: number; yes: number };
export type CheckSummary = { from: string; to: string; diet: Rate; sleep: Rate };
export type CheckDay = { record: DayCheck | null; week: CheckSummary; month: CheckSummary };

export const questions = [
  {
    key: 'dietKept',
    title: 'Diet',
    question: 'Did you keep your diet?',
    yes: 'Kept',
    no: 'Not kept',
  },
  {
    key: 'sleepGood',
    title: 'Sleep',
    question: 'Did you sleep well?',
    yes: 'Slept well',
    no: 'Slept badly',
  },
] as const;

export const unchecked = 'Not checked';

export const answerText = (value: boolean | null, yes: string, no: string) =>
  value === null ? unchecked : value ? yes : no;

/** "Kept on 4/5 days (80%)". The share is of the days answered, so an unchecked day changes nothing. */
export const rateText = ({ days, yes }: Rate, word: string) =>
  days === 0 ? 'No records' : `${word} on ${yes}/${days} days (${Math.round((yes / days) * 100)}%)`;

/**
 * Characters as the server and the database count them: an emoji is one, not the two UTF-16 units
 * that `string.length` and an input's `maxLength` count (#92).
 */
export const charCount = (value: string) => [...value].length;
