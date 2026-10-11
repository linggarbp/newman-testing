import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveBaseUrl } from '../../src/config.mjs';

const environment = (values) => ({ name: 'local', values });

test('resolveBaseUrl: the override wins over the environment file', () => {
  assert.equal(
    resolveBaseUrl(environment([{ key: 'base_url', value: 'https://from-env.test', enabled: true }]), 'https://override.test'),
    'https://override.test',
  );
});

test('resolveBaseUrl: without an override the environment file answers', () => {
  assert.equal(
    resolveBaseUrl(environment([{ key: 'base_url', value: 'https://from-env.test', enabled: true }]), ''),
    'https://from-env.test',
  );
});

test('resolveBaseUrl: disabled or empty entries are skipped, and so is a missing environment', () => {
  assert.equal(resolveBaseUrl(environment([
    { key: 'base_url', value: 'https://disabled.test', enabled: false },
    { key: 'base_url', value: '', enabled: true },
  ]), ''), '');
  assert.equal(resolveBaseUrl(null, ''), '');
  assert.equal(resolveBaseUrl(undefined, ''), '');
});
