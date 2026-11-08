import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Pool } from 'pg';

import { withApi } from './helpers.js';

// Made-up values only: no real visit belongs in tests.
const visit = { date: '2026-03-15', clinic: '가상의원' };

const untouched = () =>
  ({
    query: async () => {
      throw new Error('a rejected request must not reach the database');
    },
    connect: async () => {
      throw new Error('a rejected request must not open a transaction');
    },
  }) as unknown as Pool;

const rejects = async (body: unknown, message: string, method = 'POST', path = '/api/visits') => {
  await withApi(untouched(), async (call) => {
    const { status, data } = await call(path, { method, body });
    assert.equal(status, 400, JSON.stringify(body));
    assert.match(String(data.error), new RegExp(message));
  });
};

test('a visit needs a real date and a clinic', async () => {
  await rejects({ clinic: '가상의원' }, '방문 날짜를 골라 주세요');
  await rejects({ ...visit, date: '2026-02-30' }, '방문 날짜가 올바르지 않습니다');
  await rejects({ ...visit, date: '3000-01-01' }, '방문 날짜가 올바르지 않습니다');
  await rejects({ date: visit.date }, '병원 이름을\\(를\\) 입력해 주세요');
  await rejects({ ...visit, clinic: '   ' }, '병원 이름을\\(를\\) 입력해 주세요');
  await rejects([], '요청 본문');
});

test('lengths are counted in characters, so the limit holds for emoji as well', async () => {
  await rejects({ ...visit, clinic: '🏥'.repeat(101) }, '병원 이름은\\(는\\) 100자 이하');
  await rejects({ ...visit, department: '가'.repeat(51) }, '진료과은\\(는\\) 50자 이하');
  await rejects({ ...visit, note: '가'.repeat(1001) }, '1000자 이하');
});

test('costs are whole won from 0 to 100 million', async () => {
  for (const [value, message] of [
    ['1000', '숫자로'],
    [12.5, '원 단위 정수로'],
    [-1, '0원 이상'],
    [100_000_001, '1억 원 이하'],
  ] as const) {
    await rejects({ ...visit, cost: value }, `진료비은\\(는\\) ${message}`);
    await rejects({ ...visit, procedures: [{ name: '가상 시술', cost: value }] }, message);
  }
});

test('the next appointment cannot come before the visit', async () => {
  await rejects({ ...visit, nextVisitOn: '2026-03-14' }, '방문 날짜보다 빠를 수 없습니다');
  await rejects({ ...visit, nextVisitOn: '2026-13-01' }, '다음 예약일이 올바르지 않습니다');
});

test('procedures need a name and stop at ten', async () => {
  await rejects({ ...visit, procedures: [{ area: '이마' }] }, '시술 이름을\\(를\\) 입력해 주세요');
  await rejects({ ...visit, procedures: ['가상 시술'] }, '시술 항목이 올바르지 않습니다');
  await rejects(
    { ...visit, procedures: Array.from({ length: 11 }, () => ({ name: '가상 시술' })) },
    '10개까지',
  );
});

test('refusals never repeat what was entered', async () => {
  const secret = '가상비밀메모';
  await withApi(untouched(), async (call) => {
    for (const body of [
      { ...visit, note: secret.repeat(200) },
      { ...visit, clinic: secret.repeat(20) },
      { ...visit, procedures: [{ name: secret, note: secret.repeat(100) }] },
    ]) {
      const { status, data } = await call('/api/visits', { method: 'POST', body });
      assert.equal(status, 400);
      assert.doesNotMatch(String(data.error), new RegExp(secret));
    }
  });
});

test('ids, dates and search words are checked before the database', async () => {
  await withApi(untouched(), async (call) => {
    for (const [method, path, message] of [
      ['PUT', '/api/visits/abc', '병원 방문 ID'],
      ['DELETE', '/api/visits/0', '병원 방문 ID'],
      ['GET', '/api/visits?date=2026-02-30', '날짜가 올바르지 않습니다'],
      ['GET', `/api/visits?q=${'가'.repeat(101)}`, '검색어는 100자 이하'],
      ['GET', '/api/visits?offset=-1', '목록 위치'],
    ] as const) {
      const { status, data } = await call(path, {
        method,
        body: method === 'PUT' ? visit : undefined,
      });
      assert.equal(status, 400, path);
      assert.match(String(data.error), new RegExp(message), path);
    }
  });
});
