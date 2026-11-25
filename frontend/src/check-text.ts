import { count } from './plural';

/** null: not checked. It is never read as a no. */
export type DayCheck = {
  date: string;
  dietKept: boolean | null;
  sleepGood: boolean | null;
  mood: number | null;
  energy: number | null;
  stress: number | null;
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

/** Condition scores, 1 to 5 each. null: not rated. */
export const scores = [
  { key: 'mood', title: 'Mood', question: 'How was your mood?', low: 'Low', high: 'High' },
  { key: 'energy', title: 'Energy', question: 'How was your energy?', low: 'Low', high: 'High' },
  {
    key: 'stress',
    title: 'Stress',
    question: 'How stressed were you?',
    low: 'Calm',
    high: 'Stressed',
  },
] as const;

export const scoreValues = [1, 2, 3, 4, 5] as const;
export const notRated = 'Not rated';

export const scoreText = (value: number | null) => (value === null ? notRated : `${value} of 5`);

export const unchecked = 'Not checked';

export const answerText = (value: boolean | null, yes: string, no: string) =>
  value === null ? unchecked : value ? yes : no;

/**
 * "Kept on 4/5 days (80%)", "Kept on 1/1 day (100%)". The share is of the days answered, so an
 * unchecked day changes nothing.
 */
export const rateText = ({ days, yes }: Rate, word: string) =>
  days === 0
    ? 'No records'
    : `${word} on ${yes}/${count(days, 'day')} (${Math.round((yes / days) * 100)}%)`;

// Characters as the server and the database count them, from the shared contract (#215).
export { charCount } from '../../shared/contract';
