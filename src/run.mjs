#!/usr/bin/env node
/**
 * The runner.
 *
 * `newman` is used as a library (not the CLI) because this suite has to do three things the CLI
 * cannot do in one invocation: run one collection folder at a time (each folder is an isolated
 * scenario), keep a machine-readable JSON report per folder on disk, and answer with an exit code
 * that separates a failed assertion from a broken setup.
 *
 *   node src/run.mjs                        # every folder (scenario) in the collection
 *   node src/run.mjs --folder "Posts CRUD"  # one folder only
 *   node src/run.mjs --list                 # folder names only, nothing is executed
 *
 * Exit codes: 0 all assertions passed · 1 a request or assertion failed · 2 infrastructure error.
 */

import fs from 'node:fs';
import path from 'node:path';
import newman from 'newman';

import { config, resolveBaseUrl } from './config.mjs';
import { collectionFolders, describeRun, slugify, summarizeRun, writeReport } from './report.mjs';

const EXIT = { ok: 0, failed: 1, error: 2 };

function readJson(file) {
  const resolved = path.resolve(process.cwd(), file);
  if (!fs.existsSync(resolved)) throw new Error(`file not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`invalid JSON in ${file}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = { folder: config.folder, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--folder' || argv[i] === '-f') {
      const value = argv[i + 1];
      if (!value || value.startsWith('-')) throw new Error('--folder expects a folder name (see --list)');
      args.folder = value;
      i += 1;
    } else if (argv[i] === '--list') {
      args.list = true;
    }
  }
  return args;
}

/**
 * Newman's own `json` reporter writes loose files into ./newman/ unless it is given an export
 * path, and the shaped report already covers the outcome — so when the reporter is enabled, its
 * raw export is pinned next to it, one file per folder.
 */
function reporterOptions(folder, reporters) {
  if (!reporters.includes('json')) return undefined;
  const dir = path.resolve(process.cwd(), config.artifactsDir);
  fs.mkdirSync(dir, { recursive: true });
  return { json: { export: path.join(dir, `newman-raw-${slugify(folder)}.json`) } };
}

/** Run one folder through the newman library and resolve its summary. */
function runFolder(folder, { collection, environment, baseUrl }) {
  const reporters = config.reporters.split(',').map((name) => name.trim()).filter(Boolean);
  const options = {
    collection,
    environment,
    folder: folder ?? undefined,
    reporters,
    reporter: reporterOptions(folder, reporters),
    timeoutRequest: config.timeoutRequestMs,
    iterationCount: config.iterationCount,
    insecure: config.insecure,
    envVar: [{ key: 'base_url', value: baseUrl }],
  };
  return new Promise((resolve, reject) => {
    newman.run(options, (error, summary) => (error ? reject(error) : resolve(summary)));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const collection = readJson(config.collection);
  const folders = collectionFolders(collection);

  if (args.list) {
    config.log(`${folders.length} folder(s): ${folders.join(', ')}`);
    return EXIT.ok;
  }

  // An explicit --folder / NEWMAN_FOLDER selects a single scenario; by default every folder runs,
  // each in its own newman run so one broken scenario cannot mask the others' results.
  const selected = args.folder ? folders.filter((folder) => folder === args.folder) : folders;
  if (selected.length === 0) {
    config.log(`no collection folder matches '${args.folder}' (available: ${folders.join(', ')})`);
    return EXIT.error;
  }

  const environment = readJson(config.environment);
  const baseUrl = resolveBaseUrl(environment);
  config.log(`target ${baseUrl || '(base_url unresolved)'} · ${selected.length} folder(s) · reporters ${config.reporters}`);

  let failed = false;
  let infrastructureError = null;

  for (const folder of selected) {
    config.log(`— ${folder}`);
    try {
      const summary = await runFolder(folder, { collection, environment, baseUrl });
      const report = writeReport(folder, summary, { dir: config.artifactsDir, target: baseUrl });
      const stats = summarizeRun(summary);
      config.log(`${folder}: ${describeRun(stats)} · report ${path.relative(process.cwd(), report)}`);
      if (stats.hasFailures) failed = true;
    } catch (error) {
      infrastructureError = error;
      config.log(`! ${folder} could not run: ${error.message}`);
    }
  }

  if (infrastructureError && !failed) return EXIT.error;
  return failed ? EXIT.failed : EXIT.ok;
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`[newman] fatal: ${error.stack ?? error.message}`);
    process.exit(EXIT.error);
  });

export { main, parseArgs, runFolder };
