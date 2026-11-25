// The API's operation table. The document is built by the managed standard/openapi.ts from Zod schemas
// (z.toJSONSchema). `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date or
// when the table and the registered routes differ.
import { z } from 'zod/v4';

import { bodyInput } from './body.js';
import { checkInput } from './checks.js';
import { comboInput } from './combos.js';
import { foodInput, searchQuery } from './foods.js';
import { habitInput } from './habits.js';
import { intakeInput } from './intake.js';
import { labInput, labListQuery } from './labs.js';
import { comboUse, entryInput, mealCopy, mealTimeInput } from './meals.js';
import { dayQuery, medicationInput } from './medications.js';
import { doneInput } from './reminders.js';
import { reportQuery } from './report.js';
import { requestKeyHeader, requestKeySchema } from './request-keys.js';
import { sleepInput } from './sleep.js';
import { buildOpenApi, type Operation } from './standard/openapi.js';
import { listQuery, visitInput } from './visits.js';

// The meal adding routes take a retry key (#196).
const retryKey = {
  [requestKeyHeader]: {
    description:
      'A UUID per user action. A retry with the same key and request gets the first answer and adds nothing; the same key with a different request is a 409.',
    schema: requestKeySchema,
  },
};

// Every registered route must appear here exactly once (checked when building).
export const operations: Record<string, Operation> = {
  'GET /api/health': {
    summary: 'Check the server and database connection',
    status: [200, 500],
    public: true,
  },
  'GET /api/me': { summary: 'Get the signed-in user', status: [200, 401, 503] },

  'GET /api/foods': {
    summary: 'Search or list stored foods, one page at a time',
    query: searchQuery,
    status: [200, 400],
  },
  'GET /api/foods/recent': {
    summary: 'List stored foods by when they were last recorded',
    status: [200],
  },
  'POST /api/foods': {
    summary: 'Add a food',
    body: ['Food', foodInput],
    status: [201, 400],
  },
  'PUT /api/foods/:id': {
    summary: 'Replace a food',
    body: ['Food', foodInput],
    status: [200, 400, 404],
  },

  'GET /api/meals/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the meal entries, totals, and junk-food counts of a day',
    status: [200, 400],
  },
  'POST /api/meals/:date': {
    params: { date: z.iso.date() },
    summary: 'Add a meal entry from a stored food or typed in',
    body: ['MealEntry', entryInput],
    headers: retryKey,
    status: [201, 400, 404, 409],
  },
  'POST /api/meals/:date/combos/:id': {
    params: { date: z.iso.date() },
    summary: 'Add every food of a combo to a meal',
    body: ['ComboUse', comboUse],
    headers: retryKey,
    status: [201, 400, 404, 409],
  },
  'POST /api/meals/:date/copy': {
    params: { date: z.iso.date() },
    summary: 'Copy one meal of another day to this day',
    body: ['MealCopy', mealCopy],
    headers: retryKey,
    status: [201, 400, 404, 409],
  },
  'PUT /api/meals/:date/times/:meal': {
    params: { date: z.iso.date(), meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack']) },
    summary: 'Set or clear the time of day a meal slot was eaten',
    body: ['MealTime', mealTimeInput],
    status: [200, 400],
  },
  'DELETE /api/meals/:date/entries/:id': {
    params: { date: z.iso.date() },
    summary: 'Delete a meal entry',
    status: [204, 400, 404],
  },

  'GET /api/combos': { summary: 'List meal combos', status: [200] },
  'POST /api/combos': {
    summary: 'Create a meal combo',
    body: ['Combo', comboInput],
    status: [201, 400, 409],
  },
  'PUT /api/combos/:id': {
    summary: 'Replace the name and foods of a combo',
    body: ['Combo', comboInput],
    status: [200, 400, 404, 409],
  },
  'DELETE /api/combos/:id': { summary: 'Delete a combo', status: [204, 400, 404] },

  'GET /api/sleep/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the sleep record of a day',
    status: [200, 400],
  },
  'PUT /api/sleep/:date': {
    params: { date: z.iso.date() },
    summary: 'Save the sleep record of a day; the wake-up time must be after the bedtime',
    body: ['Sleep', sleepInput],
    status: [200, 400],
  },
  'DELETE /api/sleep/:date': {
    params: { date: z.iso.date() },
    summary: 'Delete the sleep record of a day',
    status: [204, 400, 404],
  },

  'GET /api/body': {
    summary: 'List body records from `from` to `to` (YYYY-MM-DD, at most 366 days)',
    status: [200, 400],
  },
  'GET /api/body/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the body record of a day',
    status: [200, 400],
  },
  'PUT /api/body/:date': {
    params: { date: z.iso.date() },
    summary: 'Save the body record of a day',
    body: ['Body', bodyInput],
    status: [200, 400],
  },
  'DELETE /api/body/:date': {
    params: { date: z.iso.date() },
    summary: 'Delete the body record of a day',
    status: [204, 400, 404],
  },

  'GET /api/habits/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the alcohol and tobacco record of a day with period totals',
    status: [200, 400],
  },
  'PUT /api/habits/:date': {
    params: { date: z.iso.date() },
    summary: 'Save the alcohol and tobacco record of a day',
    body: ['Habit', habitInput],
    status: [200, 400],
  },
  'DELETE /api/habits/:date': {
    params: { date: z.iso.date() },
    summary: 'Delete the alcohol and tobacco record of a day',
    status: [204, 400, 404],
  },

  'GET /api/intake/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the water (ml) and caffeine (mg) counts and totals of a day',
    status: [200, 400],
  },
  'POST /api/intake/:date': {
    params: { date: z.iso.date() },
    summary:
      'Add one drink to a day: water adds 250 ml, caffeine drinks add their default mg (at most 50 per kind)',
    body: ['Intake', intakeInput],
    status: [201, 400],
  },
  'DELETE /api/intake/:date/:kind': {
    params: { date: z.iso.date() },
    summary: 'Remove the newest drink of a kind from a day; a count at 0 stays 0',
    status: [200, 400],
  },

  'GET /api/checks/:date': {
    params: { date: z.iso.date() },
    summary: 'Get the daily check of a day with period rates',
    status: [200, 400],
  },
  'PUT /api/checks/:date': {
    params: { date: z.iso.date() },
    summary: 'Save the daily check of a day',
    body: ['Check', checkInput],
    status: [200, 400],
  },
  'DELETE /api/checks/:date': {
    params: { date: z.iso.date() },
    summary: 'Delete the daily check of a day',
    status: [204, 400, 404],
  },

  'GET /api/goals': { summary: 'List the goals and their changes', status: [200] },
  'GET /api/goals/days/:date': {
    params: { date: z.iso.date() },
    summary: 'Judge the goals against the records of a day',
    status: [200, 400],
  },
  // The body depends on the item (each has its own target range), so it is described here only.
  'PUT /api/goals/:item': {
    summary:
      'Set a goal (calories, protein, sleep, sober_days, or last_meal) from a date: body { from: YYYY-MM-DD, target: whole number (last_meal: minutes from midnight, 1260 is 21:00), or null to turn the goal off }',
    status: [200, 400, 404],
  },
  'DELETE /api/goals/:item/:from': {
    params: { from: z.iso.date() },
    summary: 'Remove one goal change made from a date',
    status: [204, 400, 404],
  },

  'GET /api/report': {
    summary: 'Get the week or month report around a date',
    query: reportQuery,
    status: [200, 400],
  },

  'GET /api/visits': {
    summary: 'List clinic visits, filtered by search term or date, one page at a time',
    query: listQuery,
    status: [200, 400],
  },
  'POST /api/visits': {
    summary: 'Add a clinic visit with its procedures',
    body: ['Visit', visitInput],
    status: [201, 400],
  },
  'PUT /api/visits/:id': {
    summary: 'Replace a clinic visit',
    body: ['Visit', visitInput],
    status: [200, 400, 404],
  },
  'DELETE /api/visits/:id': { summary: 'Delete a clinic visit', status: [204, 400, 404] },

  'GET /api/labs': {
    summary: 'List checkup and blood test results, filtered by test name, one page at a time',
    query: labListQuery,
    status: [200, 400],
  },
  'POST /api/labs': {
    summary: 'Add a test result',
    body: ['LabResult', labInput],
    status: [201, 400],
  },
  'PUT /api/labs/:id': {
    summary: 'Replace a test result',
    body: ['LabResult', labInput],
    status: [200, 400, 404],
  },
  'DELETE /api/labs/:id': { summary: 'Delete a test result', status: [204, 400, 404] },

  'GET /api/medications': {
    summary: 'List the medicines taken on a day, or every medicine split by today',
    query: dayQuery,
    status: [200, 400],
  },
  'POST /api/medications': {
    summary: 'Add a medicine',
    body: ['Medication', medicationInput],
    status: [201, 400],
  },
  'PUT /api/medications/:id': {
    summary: 'Replace a medicine',
    body: ['Medication', medicationInput],
    status: [200, 400, 404],
  },
  'DELETE /api/medications/:id': {
    summary: 'Delete a medicine',
    status: [204, 400, 404],
  },

  'GET /api/reminders': {
    summary: 'List the clinic visit and medicine reminders that are due soon',
    status: [200],
  },
  'GET /api/workout-memo/:date': {
    params: { date: z.iso.date() },
    summary:
      "Read the day's workouts from workout-memo (read-only). The answer is { state: 'ok', workouts } or { state: 'unavailable' } when workout-memo cannot be reached",
    status: [200, 400],
  },
  'POST /api/reminders/done': {
    summary: 'Mark a reminder as done',
    body: ['ReminderDone', doneInput],
    status: [204, 400, 404],
  },
};

const statusText: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  204: 'Success, no content',
  400: 'Invalid input',
  401: 'Sign-in required',
  404: 'Not found',
  409: 'Duplicate or conflict',
  413: 'Request too large',
  429: 'Too many requests',
  500: 'Server error',
  503: 'Sign-in service unavailable',
};

export const document = buildOpenApi({
  title: 'Health Log API',
  description:
    'Dates are YYYY-MM-DD (Asia/Seoul). Every error response is { error: message } with an English message.',
  errorDescription: 'English error message',
  operations,
  statusText,
});
