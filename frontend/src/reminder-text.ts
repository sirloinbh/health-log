// Reminders as the API sends them (#48), and how they read on screen.
import { medicationsPagePath } from './med-text';
import { clinicText, visitsPagePath } from './visit-text';

type Due = {
  id: number;
  dueOn: string;
  /** Days from the service's today: 0 is today. */
  daysLeft: number;
};

export type Reminder =
  | (Due & {
      kind: 'visit';
      clinic: string;
      department: string | null;
      /** The procedures done at that visit, in the order entered. */
      procedures: string[];
    })
  | (Due & { kind: 'medication'; name: string });

export type Reminders = {
  /** The service's today (Asia/Seoul). */
  today: string;
  /** The last day shown, `leadDays` after today. */
  until: string;
  leadDays: number;
  reminders: Reminder[];
};

/** Path every reminder write goes under, so a reload waits for it (#71). */
export const remindersPath = '/api/reminders';

/** "Today", "Tomorrow", "In 3 days". */
export const whenText = (daysLeft: number) =>
  daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`;

/** "Sample Clinic · Dermatology appointment", "Sample tablet ends". */
export const reminderTitle = (item: Reminder) =>
  item.kind === 'visit' ? `${clinicText(item)} appointment` : `${item.name} ends`;

/** What came before, when it helps: "Last procedures: laser, injection". */
export const reminderDetail = (item: Reminder) =>
  item.kind === 'visit' && item.procedures.length
    ? `Last procedures: ${item.procedures.join(', ')}`
    : null;

/** The page the record is written on. */
export const reminderPage = (item: Reminder) =>
  item.kind === 'visit'
    ? { to: visitsPagePath, label: 'Clinic records' }
    : { to: medicationsPagePath, label: 'Medication records' };

/** Stable across reloads, and apart for a visit and a medicine with the same id. */
export const reminderKey = (item: Reminder) => `${item.kind}-${item.id}-${item.dueOn}`;
