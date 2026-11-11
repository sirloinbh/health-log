import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { inspect } from 'node:util';

import { testDatabaseSkip } from './helpers.js';

// #52. DB tests run only against health_test and say why they were skipped otherwise.
test('DB tests run only against health_test', () => {
  assert.equal(testDatabaseSkip('postgres://postgres@127.0.0.1:5472/health_test'), false);
  assert.equal(testDatabaseSkip('postgres://u:p@localhost/health_test?sslmode=disable'), false);
});

test('another database or none is skipped with its name as the reason', () => {
  assert.equal(
    testDatabaseSkip('postgres://postgres@127.0.0.1:5432/study_test'),
    'Not the dedicated health_test database: study_test',
  );
  assert.equal(
    testDatabaseSkip('postgres://postgres@127.0.0.1:5432/health'),
    'Not the dedicated health_test database: health',
  );
  assert.equal(testDatabaseSkip(undefined), 'Not the dedicated health_test database: none');
  assert.equal(testDatabaseSkip(''), 'Not the dedicated health_test database: none');
  assert.equal(
    testDatabaseSkip('postgres://postgres@127.0.0.1:5432/'),
    'Not the dedicated health_test database: none',
  );
});

test('an address that cannot be read fails without printing its password', () => {
  assert.throws(
    () => testDatabaseSkip('postgres://user:secret-pass@bad host/health_test'),
    (error: Error) => {
      assert.match(error.message, /TEST_DATABASE_URL cannot be read as an address/);
      // Printed errors show their properties and cause too, not only the message.
      assert.doesNotMatch(inspect(error), /secret-pass/);
      return true;
    },
  );
});

const dbReadme = new URL('../../database/README.md', import.meta.url);
// The backend-only deploy repository has no database folder.
const docsTest = existsSync(dbReadme) ? test : test.skip;

// Copied as written, U&'\\AE30' stores the characters "\AE30" instead of the Hangul letter.
docsTest('the DB guide writes Unicode escapes with one backslash', () => {
  const text = readFileSync(dbReadme, 'utf8');
  assert.ok(text.includes("U&'\\XXXX'"), 'the escape rule is still documented');
  assert.doesNotMatch(text, /U&'[^']*\\\\/);
});
