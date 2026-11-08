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
  { key: 'dietKept', title: '식단', question: '식단을 지켰나요?', yes: '지킴', no: '못 지킴' },
  { key: 'sleepGood', title: '수면', question: '잠을 잘 잤나요?', yes: '잘 잠', no: '못 잠' },
] as const;

export const unchecked = '체크 안 함';

export const answerText = (value: boolean | null, yes: string, no: string) =>
  value === null ? unchecked : value ? yes : no;

/** "4/5일 지킴 (80%)". The share is of the days answered, so an unchecked day changes nothing. */
export const rateText = ({ days, yes }: Rate, word: string) =>
  days === 0 ? '기록 없음' : `${yes}/${days}일 ${word} (${Math.round((yes / days) * 100)}%)`;

/**
 * Characters as the server and the database count them: an emoji is one, not the two UTF-16 units
 * that `string.length` and an input's `maxLength` count (#92).
 */
export const charCount = (value: string) => [...value].length;
