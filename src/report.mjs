/**
 * Shaping of a Newman summary into the report this suite writes.
 *
 * Kept free of `newman` and of this suite's own configuration so it can be unit-tested directly:
 * everything that decides *what a report contains* lives here; the runner (run.mjs) supplies the
 * summary and the destination.
 */

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ARTIFACTS_DIR = 'test-results';

/**
 * Every top-level folder name in a Postman collection — the scenarios this suite can run.
 * A top-level request (no nested items) is not a folder and is not returned.
 */
export function collectionFolders(collection) {
  const items = collection?.item ?? [];
  return items
    .filter((item) => Array.isArray(item.item) && item.item.length > 0)
    .map((item) => item.name)
    .filter(Boolean);
}

/** Filesystem-safe name for a folder: lowercase, every run of other characters becomes '-'. */
export function slugify(value) {
  const slug = String(value ?? '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'all';
}

/** `summary.run.executions[]` → the counters the runner logs and the report stores. */
export function summarizeRun(summary) {
  const executions = summary?.run?.executions ?? [];
  const assertions = executions.reduce((total, execution) => total + (execution.assertions?.length ?? 0), 0);
  const failedAssertions = executions.reduce(
    (total, execution) => total + (execution.assertions ?? []).filter((assertion) => assertion.error).length, 0);
  const failures = summary?.run?.failures ?? [];
  return {
    requests: executions.length,
    assertions,
    failedAssertions,
    hasFailures: failures.length > 0,
  };
}

/** Human-readable one-liner per folder, for the run log. */
export function describeRun(stats) {
  return `${stats.requests} request(s), ${stats.assertions} assertion(s), ${stats.failedAssertions} failed`;
}

/**
 * Write one folder's report to `<dir>/newman-report-<slug>.json` and return the file path.
 *
 * The report carries newman's own `run.stats` and `run.timings` verbatim — reshaping them would
 * only lose information — plus a compact failure list naming the source and the error message.
 */
export function writeReport(folder, summary, { dir = DEFAULT_ARTIFACTS_DIR, target = null } = {}) {
  const resolvedDir = path.resolve(process.cwd(), dir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  const file = path.join(resolvedDir, `newman-report-${slugify(folder)}.json`);
  fs.writeFileSync(file, JSON.stringify({
    generatedAtUtc: new Date().toISOString(),
    target,
    folder: folder ?? null,
    run: summary?.run
      ? {
          stats: summary.run.stats,
          timings: summary.run.timings,
          failures: (summary.run.failures ?? []).map((failure) => ({
            source: failure.source?.name ?? null,
            error: failure.error?.message ?? null,
          })),
        }
      : null,
  }, null, 2));
  return file;
}
