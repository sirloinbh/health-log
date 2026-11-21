// The AI tools of Health Log (project-standards#711, ADR-0017). shared-ai lists and calls them over
// /internal/tools; standard/tools.ts checks the signed call, the scope, and writes the audit row.
import { z } from 'zod/v4';

import { isRealDate } from './dates.js';
import type { Db } from './db.js';
import { mealsOfDay } from './meals.js';
import { defineTool } from './standard/tools.js';

// One day per call, so a tool cannot return the whole history.
const listMealsInput = z.object({
  date: z
    .string({ error: 'Choose a date' })
    .refine(isRealDate, 'The date is not valid (use YYYY-MM-DD)'),
});

export const tools = [
  defineTool({
    name: 'list_meals',
    description:
      "List what was eaten on one day (date as YYYY-MM-DD): each meal entry with its servings and nutrients, the nutrient totals of the day, and the junk food counts of the day's week and month.",
    input: listMealsInput,
    access: 'read',
    action: 'read',
    entity: 'meal_entry',
    run: async ({ date }, { db }: { db: Db }) => ({ result: await mealsOfDay(db, date) }),
  }),
];
