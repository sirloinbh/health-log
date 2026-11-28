import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { createApp } from '../src/app.js';
import { amountOf, brandOf, nameOf, resultOf, sizeOf, withoutRepeats } from '../src/mfds.js';
import { listenForFetch } from './helpers.js';

// This route never touches the database.
const pool = {} as unknown as Pool;
// A decoding key has characters an address encodes, so the log check covers both spellings.
const key = 'test+portal/key==';

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const call = async (mfdsFetch: Fetch, query: string, options: { noKey?: boolean } = {}) => {
  const { server, port } = await listenForFetch(
    createApp(pool, { mfdsServiceKey: options.noKey ? undefined : key, mfdsFetch }),
  );
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/foods/mfds?${query}`);
    return { status: response.status, data: (await response.json()) as Record<string, unknown> };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
};

// The shape the portal sent on 2026-11-28 for a search of 신라면 (fields the draft ignores left out).
const shinCup = {
  FOOD_CD: 'P108-001000300-0738',
  FOOD_NM_KR: '신라면건면사발',
  DB_GRP_NM: '가공식품',
  MAKER_NM: '(주)농심',
  SERVING_SIZE: '100g',
  Z10500: '77.00g',
  AMT_NUM1: '370.000',
  AMT_NUM2: '',
  AMT_NUM3: '9.09',
  AMT_NUM4: '5.71',
  AMT_NUM6: '70.13',
  AMT_NUM7: '6.49',
  AMT_NUM13: '2,117.000',
  ITEM_REPORT_NO: '2007014900270',
  UPDATE_DATE: '2026-05-14',
};

/** resultOf for a record whose basis can be read. */
const draftOf = (row: typeof shinCup) => {
  const result = resultOf(row);
  assert.ok(result);
  return result;
};

const reply = (items: unknown[] | undefined, totalCount = items?.length ?? 0) =>
  new Response(
    JSON.stringify({
      header: { resultCode: '00', resultMsg: 'NORMAL SERVICE.' },
      body: { pageNo: 1, totalCount, numOfRows: 20, ...(items ? { items } : {}) },
    }),
  );

test('a search goes to the portal with the key and answers drafts converted to the total content', async () => {
  const seen: string[] = [];
  const { status, data } = await call(
    (url) => {
      seen.push(url);
      return Promise.resolve(reply([shinCup], 53));
    },
    `q=${encodeURIComponent(' 신라면 ')}&maker=${encodeURIComponent('농심')}`,
  );
  assert.equal(status, 200);
  const sent = new URL(seen[0]);
  assert.equal(
    sent.origin + sent.pathname,
    'https://apis.data.go.kr/1471000/FoodNtrCpntDbInfo03/getFoodNtrCpntDbInq03',
  );
  assert.equal(sent.searchParams.get('serviceKey'), key);
  assert.equal(sent.searchParams.get('type'), 'json');
  assert.equal(sent.searchParams.get('FOOD_NM_KR'), '신라면');
  assert.equal(sent.searchParams.get('MAKER_NM'), '농심');
  assert.equal(sent.searchParams.get('numOfRows'), '20');
  assert.deepEqual(data, {
    state: 'ok',
    total: 53,
    read: 1,
    results: [
      {
        code: 'P108-001000300-0738',
        name: '신라면건면사발',
        maker: '(주)농심',
        group: '가공식품',
        basis: '100g',
        total: '77g',
        updatedOn: '2026-05-14',
        food: {
          name: '신라면건면사발 77g',
          brand: '농심',
          servingSize: 77,
          servingUnit: 'g',
          // 370 kcal per 100 g is 284.9 kcal in 77 g; sodium had a thousands comma.
          calories: 284.9,
          protein: 7,
          fat: 4.4,
          carbs: 54,
          sugars: 5,
          sodium: 1630.09,
          sourceType: 'public',
          sourceUrl:
            'https://various.foodsafetykorea.go.kr/nutrient/general/food/detail.do?searchFoodCd=P108-001000300-0738&searchRegionCd=ZZ&searchMonthCd=AVG',
        },
      },
    ],
  });
  assert.equal(JSON.stringify(data).includes(key), false);
});

test('a search with no maker sends no maker, and no match is an empty list', async () => {
  const seen: string[] = [];
  const { data } = await call((url) => {
    seen.push(url);
    return Promise.resolve(reply(undefined));
  }, 'q=zzqq');
  assert.equal(new URL(seen[0]).searchParams.has('MAKER_NM'), false);
  assert.deepEqual(data, { state: 'ok', total: 0, read: 0, results: [] });
});

test('without a key the lookup is off and the portal is not called', async () => {
  let called = false;
  const { status, data } = await call(
    () => {
      called = true;
      return Promise.resolve(reply([]));
    },
    'q=milk',
    { noKey: true },
  );
  assert.equal(status, 200);
  assert.deepEqual(data, { state: 'off' });
  assert.equal(called, false);
});

test('an empty or long search term is a 400 before the portal is called', async () => {
  let called = false;
  const fetchImpl: Fetch = () => {
    called = true;
    return Promise.resolve(reply([]));
  };
  const empty = await call(fetchImpl, 'q=%20');
  assert.equal(empty.status, 400);
  assert.equal(empty.data.error, 'Enter a food name to search for');
  const long = await call(fetchImpl, `q=${'가'.repeat(51)}`);
  assert.equal(long.status, 400);
  assert.equal(long.data.error, 'The food name must be 50 characters or fewer');
  assert.equal(called, false);
});

test('a refused key, an error code, a strange answer or a network failure is "unavailable", and the key is not logged', async () => {
  const logged: string[] = [];
  const warn = console.warn;
  console.warn = (line: string) => logged.push(line);
  try {
    const failures: Fetch[] = [
      // What the portal sends for a key not registered for this API.
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ OpenAPI_ServiceResponse: { returnReasonCode: '30' } }), {
            status: 403,
          }),
        ),
      () =>
        Promise.resolve(
          new Response(JSON.stringify({ header: { resultCode: '22' }, body: { totalCount: 0 } })),
        ),
      () => Promise.resolve(new Response('<xml>not json</xml>')),
      () => Promise.resolve(new Response(JSON.stringify({ header: { resultCode: '00' } }))),
      () => Promise.reject(new Error(`fetch failed for ${key}`)),
      () => Promise.reject(new Error(`fetch failed for ?serviceKey=${encodeURIComponent(key)}`)),
      () =>
        Promise.reject(
          new Error(`fetch failed for ?${new URLSearchParams({ serviceKey: key }).toString()}`),
        ),
    ];
    for (const failure of failures) {
      const { status, data } = await call(failure, 'q=milk');
      assert.equal(status, 200);
      assert.deepEqual(data, { state: 'unavailable' });
    }
  } finally {
    console.warn = warn;
  }
  assert.equal(logged.length, 7);
  assert.ok(logged.every((line) => JSON.parse(line).event === 'mfds_unavailable'));
  for (const form of [key, 'test%2Bportal%2Fkey%3D%3D', 'test%2Bportal/key==']) {
    assert.equal(logged.join('\n').includes(form), false);
  }
});

test('values are read from the database text: commas, blanks and dashes', () => {
  assert.equal(amountOf('2,117.000'), 2117);
  assert.equal(amountOf('0.00'), 0);
  assert.equal(amountOf(''), null);
  assert.equal(amountOf('-'), null);
  assert.equal(amountOf(null), null);
  assert.equal(amountOf('<1'), null);
  assert.deepEqual(sizeOf('140.000g'), { size: 140, unit: 'g' });
  assert.deepEqual(sizeOf('200ml'), { size: 200, unit: 'mL' });
  assert.deepEqual(sizeOf('1,000mL'), { size: 1000, unit: 'mL' });
  assert.equal(sizeOf('1개'), null);
  assert.equal(sizeOf('0g'), null);
  assert.equal(brandOf('씨제이씨푸드(주)'), '씨제이씨푸드');
  assert.equal(brandOf('㈜오뚜기'), '오뚜기');
  assert.equal(brandOf('농심 주식회사'), '농심');
  assert.equal(brandOf(''), null);
});

test('a total equal to the basis, missing, or in another unit keeps the per-100 values', () => {
  const same = draftOf({ ...shinCup, Z10500: '100g' });
  assert.deepEqual(
    [same.food.name, same.food.servingSize, same.food.calories, same.total],
    ['신라면건면사발', 100, 370, '100g'],
  );
  const none = draftOf({ ...shinCup, Z10500: '' });
  assert.deepEqual(
    [none.food.name, none.food.servingSize, none.total],
    ['신라면건면사발', 100, null],
  );
  const otherUnit = draftOf({ ...shinCup, SERVING_SIZE: '100mL', Z10500: '500g' });
  assert.deepEqual(
    [otherUnit.food.servingSize, otherUnit.food.servingUnit, otherUnit.food.calories],
    [100, 'mL', 370],
  );
  // A blank value stays unknown after the conversion, not 0.
  assert.equal(draftOf({ ...shinCup, AMT_NUM7: '' }).food.sugars, null);
});

test('the same product under several codes shows once, as its newest record, in the first place', () => {
  const dry = { ...shinCup, FOOD_NM_KR: '신라면건면', Z10500: '97.00g' };
  const results = withoutRepeats(
    [
      { ...dry, FOOD_CD: 'P-0016', UPDATE_DATE: '2026-05-07' },
      shinCup,
      { ...dry, FOOD_CD: 'P-0159', UPDATE_DATE: '2026-06-01' },
      { ...dry, FOOD_CD: 'P-0032', UPDATE_DATE: '2026-05-07' },
      // Other values are another match, even under the same name.
      { ...dry, FOOD_CD: 'P-0200', AMT_NUM1: '400.000' },
    ].map(draftOf),
  );
  assert.deepEqual(
    results.map((result) => result.code),
    ['P-0159', 'P108-001000300-0738', 'P-0200'],
  );
});

test('a draft always fits what POST /api/foods accepts', () => {
  // A long name loses the total, then is cut to 100 characters.
  assert.equal(nameOf('가'.repeat(97), '77g'), '가'.repeat(97));
  assert.equal(nameOf('가'.repeat(96), '77g'), `${'가'.repeat(96)} 77g`);
  assert.equal(nameOf('가'.repeat(120), '77g'), '가'.repeat(100));
  assert.equal(draftOf({ ...shinCup, FOOD_NM_KR: '가'.repeat(120) }).food.name, '가'.repeat(100));
  // A maker too long for a brand leaves the brand empty.
  assert.equal(brandOf('가'.repeat(50)), '가'.repeat(50));
  assert.equal(brandOf('가'.repeat(51)), null);
  // A total above the API's limit keeps the basis; a value above it after converting is unknown.
  const huge = draftOf({ ...shinCup, Z10500: '150,000g' });
  assert.deepEqual([huge.food.servingSize, huge.food.calories], [100, 370]);
  assert.equal(
    draftOf({ ...shinCup, Z10500: '10,000g', AMT_NUM13: '2,117.000' }).food.sodium,
    null,
  );
});

test('a record whose basis cannot be read is not offered', async () => {
  assert.equal(resultOf({ ...shinCup, SERVING_SIZE: '1회 제공량' }), null);
  assert.equal(resultOf({ ...shinCup, SERVING_SIZE: '' }), null);
  const { data } = await call(
    () => Promise.resolve(reply([{ ...shinCup, SERVING_SIZE: '1개' }, shinCup], 2)),
    'q=milk',
  );
  assert.equal(data.read, 2);
  assert.deepEqual(
    (data.results as { code: string }[]).map((result) => result.code),
    ['P108-001000300-0738'],
  );
});
