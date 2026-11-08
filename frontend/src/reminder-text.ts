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

/** "오늘", "내일", "3일 뒤". */
export const whenText = (daysLeft: number) =>
  daysLeft === 0 ? '오늘' : daysLeft === 1 ? '내일' : `${daysLeft}일 뒤`;

/** "가상피부과 · 피부과 예약", "가상정 복용 종료". */
export const reminderTitle = (item: Reminder) =>
  item.kind === 'visit' ? `${clinicText(item)} 예약` : `${item.name} 복용 종료`;

/** What came before, when it helps: "지난번 시술: 레이저, 주사". */
export const reminderDetail = (item: Reminder) =>
  item.kind === 'visit' && item.procedures.length
    ? `지난번 시술: ${item.procedures.join(', ')}`
    : null;

/** The page the record is written on. */
export const reminderPage = (item: Reminder) =>
  item.kind === 'visit'
    ? { to: visitsPagePath, label: '병원 기록' }
    : { to: medicationsPagePath, label: '약 기록' };

/** Stable across reloads, and apart for a visit and a medicine with the same id. */
export const reminderKey = (item: Reminder) => `${item.kind}-${item.id}-${item.dueOn}`;
