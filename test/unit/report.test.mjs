import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { collectionFolders, describeRun, slugify, summarizeRun, writeReport } from '../../src/report.mjs';

test('collectionFolders returns folder names and ignores request-only nodes', () => {
  const collection = {
    item: [
      { name: 'Posts CRUD', item: [{ name: 'GET /posts?_limit=5' }] },
      { name: 'Users', item: [{ name: 'GET /users' }] },
      { name: 'Loose request', request: { method: 'GET' } }, // a top-level request is not a folder
    ],
  };
  assert.deepEqual(collectionFolders(collection), ['Posts CRUD', 'Users']);
  assert.deepEqual(collectionFolders({}), []);
  assert.deepEqual(collectionFolders(null), []);
});

test('slugify lowercases and turns every run of non-alphanumerics into a dash', () => {
  assert.equal(slugify('Posts CRUD'), 'posts-crud');
  assert.equal(slugify('Error handling'), 'error-handling');
  assert.equal(slugify('  GET /posts?_limit=5  '), 'get-posts-limit-5');
  assert.equal(slugify(''), 'all');
  assert.equal(slugify(null), 'all');
});

test('summarizeRun counts requests, assertions and failures from the summary', () => {
  const summary = {
    run: {
      executions: [
        { assertions: [{ assertion: 'a' }, { assertion: 'b' }] },
        { assertions: [{ assertion: 'c' }, { assertion: 'd', error: { message: 'boom' } }] },
      ],
      failures: [{ error: { message: 'boom' } }],
    },
  };
  const stats = summarizeRun(summary);
  assert.equal(stats.requests, 2);
  assert.equal(stats.assertions, 4);
  assert.equal(stats.failedAssertions, 1);
  assert.equal(stats.hasFailures, true);
  assert.equal(describeRun(stats), '2 request(s), 4 assertion(s), 1 failed');
  assert.equal(describeRun(summarizeRun({})).endsWith('0 failed'), true);
});

test('writeReport writes one JSON report per folder into the artifacts dir', () => {
  const dir = path.join('test-results', `unit-${process.pid}`);
  const summary = {
    run: {
      stats: { requests: 2, assertions: 3, failed: 1 },
      timings: { started: 0, completed: 10, responseAverage: 5 },
      failures: [{ source: { name: 'assertion' }, error: { message: 'expected 200 to equal 404' } }],
    },
  };
  const file = writeReport('Posts CRUD', summary, { dir, target: 'https://example.test' });
  try {
    assert.equal(path.basename(file), 'newman-report-posts-crud.json');
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(report.folder, 'Posts CRUD');
    assert.equal(report.target, 'https://example.test');
    assert.match(report.generatedAtUtc, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    assert.deepEqual(report.run.stats, summary.run.stats);
    assert.deepEqual(report.run.timings, summary.run.timings);
    assert.deepEqual(report.run.failures, [{ source: 'assertion', error: 'expected 200 to equal 404' }]);
  } finally {
    // The test writes into the real artifacts directory on purpose — clean up after itself.
    fs.rmSync(path.join(path.resolve(process.cwd(), dir)), { recursive: true, force: true });
  }
});

test('a summary without a run still produces a report shell', () => {
  const dir = path.join('test-results', `unit-${process.pid}-shell`);
  const file = writeReport('Users', undefined, { dir });
  try {
    const report = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(report.folder, 'Users');
    assert.equal(report.target, null);
    assert.equal(report.run, null);
  } finally {
    fs.rmSync(path.join(path.resolve(process.cwd(), dir)), { recursive: true, force: true });
  }
});
