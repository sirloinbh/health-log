// OpenAPI 3.1 document built from the registered Express routes and the server's own Zod schemas.
// `npm run openapi -w backend` writes docs/openapi.json; a test fails when it is out of date.
import type express from 'express';
import type { z } from 'zod/v4';

import { bodyInput } from './body.js';
import { checkInput } from './checks.js';
import { comboInput } from './combos.js';
import { foodInput, searchQuery } from './foods.js';
import { habitInput } from './habits.js';
import { comboUse, entryInput, mealCopy } from './meals.js';
import { dayQuery, medicationInput } from './medications.js';
import { doneInput } from './reminders.js';
import { reportQuery } from './report.js';
import { sleepInput } from './sleep.js';
import { listQuery, visitInput } from './visits.js';

type Json = Record<string, unknown>;

type CheckDef = {
  check: string;
  format?: string;
  pattern?: RegExp;
  minimum?: number;
  maximum?: number;
  length?: number;
  value?: number;
  inclusive?: boolean;
};
const checksOf = (def: Json) =>
  ((def.checks ?? []) as { _zod: { def: CheckDef } }[]).map((check) => check._zod.def);

const STRING_FORMATS: Record<string, string> = {
  uuid: 'uuid',
  guid: 'uuid',
  email: 'email',
  url: 'uri',
  datetime: 'date-time',
  date: 'date',
  time: 'time',
};
function stringFormat(format: string) {
  const name = STRING_FORMATS[format];
  if (!name) throw new Error(`Unsupported string format: ${format}`);
  return name;
}
// z.number().int() is a check and z.int() is the type itself; float32 and float64 are the same kinds but not integers.
const isIntegerFormat = (format: unknown) => typeof format === 'string' && format.includes('int');

// Converts the Zod 4 types the API uses. Refinements (cross-field rules) cannot be expressed
// here; any other unsupported type fails loudly instead of being silently dropped.
export function jsonSchema(schema: z.ZodType): Json {
  const def = schema._zod.def as unknown as Json & { type: string };
  switch (def.type) {
    case 'object': {
      const shape = def.shape as Record<string, z.ZodType>;
      const required = Object.keys(shape).filter((key) => !shape[key].isOptional());
      const catchall = def.catchall as z.ZodType | undefined;
      return {
        type: 'object',
        properties: Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, jsonSchema(v)])),
        ...(required.length ? { required } : {}),
        ...(catchall?._zod.def.type === 'never' ? { additionalProperties: false } : {}),
      };
    }
    case 'string': {
      const out: Json = { type: 'string' };
      // z.uuid() and z.email() carry their format on the type, z.string().uuid() as a check.
      if (def.format) out.format = stringFormat(def.format as string);
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') out.minLength = check.minimum;
        else if (check.check === 'max_length') out.maxLength = check.maximum;
        else if (check.check === 'length_equals') out.minLength = out.maxLength = check.length;
        else if (check.check === 'string_format' && check.format === 'regex')
          out.pattern = check.pattern!.source;
        else if (check.check === 'string_format') out.format = stringFormat(check.format!);
        // `overwrite` is trim(); `custom` is a refinement.
        else if (check.check !== 'overwrite' && check.check !== 'custom')
          throw new Error(`Unsupported string check: ${check.format ?? check.check}`);
      }
      return out;
    }
    case 'number': {
      const out: Json = { type: isIntegerFormat(def.format) ? 'integer' : 'number' };
      for (const check of checksOf(def)) {
        if (check.check === 'number_format') {
          if (isIntegerFormat(check.format)) out.type = 'integer';
        } else if (check.check === 'greater_than')
          out[check.inclusive ? 'minimum' : 'exclusiveMinimum'] = check.value;
        else if (check.check === 'less_than')
          out[check.inclusive ? 'maximum' : 'exclusiveMaximum'] = check.value;
        else if (check.check === 'multiple_of') out.multipleOf = check.value;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported number check: ${check.check}`);
      }
      return out;
    }
    case 'boolean':
      return { type: 'boolean' };
    case 'array': {
      let min: number | undefined;
      let max: number | undefined;
      for (const check of checksOf(def)) {
        if (check.check === 'min_length') min = check.minimum;
        else if (check.check === 'max_length') max = check.maximum;
        else if (check.check === 'length_equals') min = max = check.length;
        else if (check.check !== 'custom')
          throw new Error(`Unsupported array check: ${check.check}`);
      }
      return {
        type: 'array',
        items: jsonSchema(def.element as z.ZodType),
        ...(min !== undefined ? { minItems: min } : {}),
        ...(max !== undefined ? { maxItems: max } : {}),
      };
    }
    case 'enum':
      return { type: 'string', enum: Object.values(def.entries as Record<string, string>) };
    case 'nullable': {
      const inner = jsonSchema(def.innerType as z.ZodType);
      return typeof inner.type === 'string'
        ? { ...inner, type: [inner.type, 'null'] }
        : { anyOf: [inner, { type: 'null' }] };
    }
    case 'optional':
      return jsonSchema(def.innerType as z.ZodType);
    case 'default':
      return { ...jsonSchema(def.innerType as z.ZodType), default: def.defaultValue };
    // .transform() is a pipe; the request is described by what comes in. z.preprocess() is a pipe
    // starting from a transform, which says nothing about the value, so its target describes it.
    case 'pipe': {
      const input = def.in as z.ZodType;
      return jsonSchema(input._zod.def.type === 'transform' ? (def.out as z.ZodType) : input);
    }
    case 'unknown':
      return {};
    default:
      throw new Error(`Unsupported Zod type for OpenAPI: ${def.type}`);
  }
}

type Operation = {
  summary: string;
  body?: [name: string, schema: z.ZodType];
  query?: z.ZodType;
  // Success status first; the rest are documented error statuses.
  status: number[];
};
// Every registered route must appear here exactly once (checked when building).
// Every route behind a router also answers 429 (the router's rate limit); `limited` adds it.
const limited = (status: number[]) => [...status, 429];
const operations: Record<string, Operation> = {
  'GET /api/health': { summary: 'Check the server and database connection', status: [200, 500] },
  'GET /api/me': { summary: 'Get the signed-in user', status: [200, 401, 503] },

  'GET /api/foods': {
    summary: 'Search or list stored foods, one page at a time',
    query: searchQuery,
    status: limited([200, 400]),
  },
  'GET /api/foods/recent': {
    summary: 'List stored foods by when they were last recorded',
    status: limited([200]),
  },
  'POST /api/foods': {
    summary: 'Add a food',
    body: ['Food', foodInput],
    status: limited([201, 400]),
  },
  'PUT /api/foods/:id': {
    summary: 'Replace a food',
    body: ['Food', foodInput],
    status: limited([200, 400, 404]),
  },

  'GET /api/meals/:date': {
    summary: 'Get the meal entries, totals, and junk-food counts of a day',
    status: limited([200, 400]),
  },
  'POST /api/meals/:date': {
    summary: 'Add a meal entry from a stored food or typed in',
    body: ['MealEntry', entryInput],
    status: limited([201, 400, 404]),
  },
  'POST /api/meals/:date/combos/:id': {
    summary: 'Add every food of a combo to a meal',
    body: ['ComboUse', comboUse],
    status: limited([201, 400, 404]),
  },
  'POST /api/meals/:date/copy': {
    summary: 'Copy one meal of another day to this day',
    body: ['MealCopy', mealCopy],
    status: limited([201, 400, 404]),
  },
  'DELETE /api/meals/:date/entries/:id': {
    summary: 'Delete a meal entry',
    status: limited([204, 400, 404]),
  },

  'GET /api/combos': { summary: 'List meal combos', status: limited([200]) },
  'POST /api/combos': {
    summary: 'Create a meal combo',
    body: ['Combo', comboInput],
    status: limited([201, 400, 409]),
  },
  'PUT /api/combos/:id': {
    summary: 'Replace the name and foods of a combo',
    body: ['Combo', comboInput],
    status: limited([200, 400, 404, 409]),
  },
  'DELETE /api/combos/:id': { summary: 'Delete a combo', status: limited([204, 400, 404]) },

  'GET /api/sleep/:date': { summary: 'Get the sleep record of a day', status: limited([200, 400]) },
  'PUT /api/sleep/:date': {
    summary: 'Save the sleep record of a day; the wake-up time must be after the bedtime',
    body: ['Sleep', sleepInput],
    status: limited([200, 400]),
  },
  'DELETE /api/sleep/:date': {
    summary: 'Delete the sleep record of a day',
    status: limited([204, 400, 404]),
  },

  'GET /api/body': {
    summary: 'List body records from `from` to `to` (YYYY-MM-DD, at most 366 days)',
    status: limited([200, 400]),
  },
  'GET /api/body/:date': { summary: 'Get the body record of a day', status: limited([200, 400]) },
  'PUT /api/body/:date': {
    summary: 'Save the body record of a day',
    body: ['Body', bodyInput],
    status: limited([200, 400]),
  },
  'DELETE /api/body/:date': {
    summary: 'Delete the body record of a day',
    status: limited([204, 400, 404]),
  },

  'GET /api/habits/:date': {
    summary: 'Get the alcohol and tobacco record of a day with period totals',
    status: limited([200, 400]),
  },
  'PUT /api/habits/:date': {
    summary: 'Save the alcohol and tobacco record of a day',
    body: ['Habit', habitInput],
    status: limited([200, 400]),
  },
  'DELETE /api/habits/:date': {
    summary: 'Delete the alcohol and tobacco record of a day',
    status: limited([204, 400, 404]),
  },

  'GET /api/checks/:date': {
    summary: 'Get the daily check of a day with period rates',
    status: limited([200, 400]),
  },
  'PUT /api/checks/:date': {
    summary: 'Save the daily check of a day',
    body: ['Check', checkInput],
    status: limited([200, 400]),
  },
  'DELETE /api/checks/:date': {
    summary: 'Delete the daily check of a day',
    status: limited([204, 400, 404]),
  },

  'GET /api/goals': { summary: 'List the goals and their changes', status: limited([200]) },
  'GET /api/goals/days/:date': {
    summary: 'Judge the goals against the records of a day',
    status: limited([200, 400]),
  },
  // The body depends on the item (each has its own target range), so it is described here only.
  'PUT /api/goals/:item': {
    summary:
      'Set a goal (calories, protein, sleep, or sober_days) from a date: body { from: YYYY-MM-DD, target: whole number, or null to turn the goal off }',
    status: limited([200, 400, 404]),
  },
  'DELETE /api/goals/:item/:from': {
    summary: 'Remove one goal change made from a date',
    status: limited([204, 400, 404]),
  },

  'GET /api/report': {
    summary: 'Get the week or month report around a date',
    query: reportQuery,
    status: limited([200, 400]),
  },

  'GET /api/visits': {
    summary: 'List clinic visits, filtered by search term or date, one page at a time',
    query: listQuery,
    status: limited([200, 400]),
  },
  'POST /api/visits': {
    summary: 'Add a clinic visit with its procedures',
    body: ['Visit', visitInput],
    status: limited([201, 400]),
  },
  'PUT /api/visits/:id': {
    summary: 'Replace a clinic visit',
    body: ['Visit', visitInput],
    status: limited([200, 400, 404]),
  },
  'DELETE /api/visits/:id': { summary: 'Delete a clinic visit', status: limited([204, 400, 404]) },

  'GET /api/medications': {
    summary: 'List the medicines taken on a day, or every medicine split by today',
    query: dayQuery,
    status: limited([200, 400]),
  },
  'POST /api/medications': {
    summary: 'Add a medicine',
    body: ['Medication', medicationInput],
    status: limited([201, 400]),
  },
  'PUT /api/medications/:id': {
    summary: 'Replace a medicine',
    body: ['Medication', medicationInput],
    status: limited([200, 400, 404]),
  },
  'DELETE /api/medications/:id': {
    summary: 'Delete a medicine',
    status: limited([204, 400, 404]),
  },

  'GET /api/reminders': {
    summary: 'List the clinic visit and medicine reminders that are due soon',
    status: limited([200]),
  },
  'POST /api/reminders/done': {
    summary: 'Mark a reminder as done',
    body: ['ReminderDone', doneInput],
    status: limited([204, 400, 404]),
  },
};

type Layer = {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
  matchers?: ((path: string) => unknown)[];
};
// Routes of the app and of the routers mounted on it. A router's mount path cannot be read back
// from Express 5, so it is found among the mounts the table names; a router that matches none of
// them fails the build instead of being skipped.
export function registeredRoutes(app: express.Express) {
  const mounts = [
    ...new Set(
      Object.keys(operations).map((route) => route.split(' ')[1].split('/').slice(0, 3).join('/')),
    ),
  ];
  const walk = (stack: Layer[], prefix: string): string[] =>
    stack.flatMap((layer) => {
      if (layer.route) {
        const path = layer.route.path === '/' ? '' : layer.route.path;
        return Object.keys(layer.route.methods).map((m) => `${m.toUpperCase()} ${prefix}${path}`);
      }
      if (!layer.handle?.stack) return [];
      const mount = mounts.find((candidate) => layer.matchers?.some((match) => match(candidate)));
      if (mount === undefined)
        throw new Error('A router is mounted at a path that is not in operations');
      return walk(layer.handle.stack, mount);
    });
  return walk((app as unknown as { router: { stack: Layer[] } }).router.stack, '');
}

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

export function buildOpenApi(app: express.Express) {
  const routes = registeredRoutes(app);
  const missing = routes.filter((route) => !operations[route]);
  const extra = Object.keys(operations).filter((route) => !routes.includes(route));
  if (missing.length || extra.length)
    throw new Error(`OpenAPI operations differ from routes: +${missing} -${extra}`);
  const schemas: Json = {
    Error: {
      type: 'object',
      properties: { error: { type: 'string', description: 'English error message' } },
      required: ['error'],
    },
  };
  const paths: Record<string, Json> = {};
  for (const route of [...routes].sort()) {
    const [method, path] = route.split(' ');
    const op = operations[route];
    const parameters: Json[] = [...path.matchAll(/:(\w+)/g)].map(([, name]) => ({
      name,
      in: 'path',
      required: true,
      schema: name === 'id' ? { type: 'integer', minimum: 1 } : { type: 'string' },
    }));
    if (op.query) {
      const query = jsonSchema(op.query) as { properties: Json; required?: string[] };
      for (const [name, schema] of Object.entries(query.properties))
        parameters.push({ name, in: 'query', required: !!query.required?.includes(name), schema });
    }
    if (op.body) schemas[op.body[0]] = jsonSchema(op.body[1]);
    const [success, ...failures] = op.status;
    const responses: Json = { [success]: { description: statusText[success] } };
    for (const status of failures)
      responses[status] = {
        description: statusText[status],
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      };
    const key = path.replace(/:(\w+)/g, '{$1}');
    paths[key] ??= {};
    paths[key][method.toLowerCase()] = {
      summary: op.summary,
      ...(parameters.length ? { parameters } : {}),
      ...(op.body
        ? {
            requestBody: {
              required: true,
              content: {
                'application/json': { schema: { $ref: `#/components/schemas/${op.body[0]}` } },
              },
            },
          }
        : {}),
      responses,
    };
  }
  return {
    openapi: '3.1.0',
    info: {
      title: 'Health Log API',
      version: '1.0.0',
      description:
        'Dates are YYYY-MM-DD (Asia/Seoul). Every error response is { error: message } with an English message.',
    },
    servers: [{ url: '/' }],
    paths,
    components: { schemas },
  };
}
