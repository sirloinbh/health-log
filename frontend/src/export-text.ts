// Downloading my records as CSV files (#332): the kinds offered, the date range check, and the download.
import { dailyRangeText, inDailyRange, isValidDate } from './daily-date';

/** Path of the export, under the sign-in like every other API path. */
const exportPath = '/api/export';

/** The kinds in the order shown. `key` is what the API calls it. */
export const exportKinds = [
  { key: 'meals', label: 'Meals', detail: 'Each food eaten with its amounts and meal time' },
  { key: 'sleep', label: 'Sleep', detail: 'Bed and wake times, stages and score' },
  { key: 'body', label: 'Body', detail: 'Weight, body fat, waist, blood pressure and notes' },
  { key: 'habits', label: 'Habits', detail: 'Cigarettes and drinks' },
  { key: 'checks', label: 'Daily checks', detail: 'Diet, sleep, mood, energy, stress and notes' },
  { key: 'intake', label: 'Water and caffeine', detail: 'Each drink with its time' },
  { key: 'visits', label: 'Clinic visits', detail: 'Visits with notes and costs' },
  { key: 'procedures', label: 'Visit procedures', detail: 'Procedures done at each visit' },
  { key: 'medications', label: 'Medications', detail: 'Medicines taken in the range' },
  { key: 'labs', label: 'Lab results', detail: 'Checkup and blood test values' },
] as const;

export type ExportKind = (typeof exportKinds)[number]['key'] | 'all';

/** The first reason the two dates cannot be sent, or null when they can. */
export function rangeProblem(from: string, to: string) {
  if (!isValidDate(from)) return 'Choose a start date';
  if (!isValidDate(to)) return 'Choose an end date';
  if (!inDailyRange(from)) return `Start date: ${dailyRangeText}`;
  if (!inDailyRange(to)) return `End date: ${dailyRangeText}`;
  if (from > to) return 'The start date cannot be after the end date';
  return null;
}

export const exportUrl = (kind: ExportKind, from: string, to: string) =>
  `${exportPath}?kind=${kind}&from=${from}&to=${to}`;

/** The file name the server asked for, or a fallback from the choice. */
export function fileNameOf(header: string | null, fallback: string) {
  const match = /filename="?([^";]+)"?/i.exec(header ?? '');
  return match?.[1] ? match[1] : fallback;
}

/** What to tell the person when the server refused or could not make the file. */
async function failureText(response: Response) {
  if (response.status === 401) return 'Your sign-in has ended. Reload the page and sign in again.';
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === 'string' && body.error) return body.error;
  } catch {
    // Not JSON: the fallback below is enough.
  }
  return 'Could not make the file';
}

/**
 * Asks for the file and hands it to the browser as a download. The page stays where it is, so a
 * refusal can be shown on it instead of replacing the page with an error answer.
 */
export async function downloadExport(kind: ExportKind, from: string, to: string) {
  let response: Response;
  try {
    response = await fetch(exportUrl(kind, from, to), { credentials: 'same-origin' });
  } catch {
    throw new Error('Cannot reach the server');
  }
  if (!response.ok) throw new Error(await failureText(response));
  const blob = await response.blob();
  const name = fileNameOf(
    response.headers.get('content-disposition'),
    `health-log-${kind}-${from}_${to}.${kind === 'all' ? 'zip' : 'csv'}`,
  );
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handled.
  setTimeout(() => URL.revokeObjectURL(href), 0);
  return name;
}
