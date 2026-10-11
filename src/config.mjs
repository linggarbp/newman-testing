/**
 * Configuration for the newman-testing suite.
 *
 * One module reads every environment variable (including an optional local `.env`), so the runner
 * and the unit tests all agree on the same defaults. Node 20+ only — no runtime dependency, so the
 * file stays usable in a minimal container image.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env loader: `KEY=value`, `#` comments, optional quotes. Never overrides real env. */
function loadDotEnv(file = path.resolve(process.cwd(), '.env')) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadDotEnv();

const read = (name, fallback = '') => {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
};
const readBool = (name, fallback) => {
  const value = read(name).toLowerCase();
  return value === '' ? fallback : !['false', '0', 'no', 'off'].includes(value);
};
const readInt = (name, fallback) => {
  const parsed = Number.parseInt(read(name), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * The base_url every folder talks to: NEWMAN_BASE_URL (`override`) wins over the environment
 * file's own value, and an empty answer means the collection variable is the last resort.
 */
export function resolveBaseUrl(environment, override = config.baseUrl) {
  if (override) return override;
  const values = environment?.values ?? [];
  const entry = values.find((candidate) => candidate?.enabled !== false && candidate?.key === 'base_url' && candidate?.value);
  return entry ? entry.value : '';
}

export const config = {
  /** Optional override: the base_url every folder talks to. Blank = the environment file's value. */
  baseUrl: read('NEWMAN_BASE_URL'),

  /** What runs. */
  collection: read('NEWMAN_COLLECTION', 'collections/sample-api-collection.json'),
  environment: read('NEWMAN_ENVIRONMENT', 'environments/local.json'),
  /** Newman reporters; 'json' keeps one raw export per folder in the artifacts directory. */
  reporters: read('NEWMAN_REPORTERS', 'cli,json'),
  /** Optional: run a single collection folder (scenario) instead of all of them. */
  folder: read('NEWMAN_FOLDER'),

  /** Where the per-folder reports land. */
  artifactsDir: read('ARTIFACTS_DIR', 'test-results'),

  timeoutRequestMs: readInt('REQUEST_TIMEOUT_MS', 10_000),
  iterationCount: readInt('ITERATIONS', 1),
  insecure: readBool('INSECURE', false),

  /** Progress narration. */
  log: (message) => console.log(`[newman] ${message}`),
};

export { loadDotEnv };
