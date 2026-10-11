# newman-testing

[![CI](https://github.com/linggarbp/newman-testing/actions/workflows/ci.yml/badge.svg)](https://github.com/linggarbp/newman-testing/actions/workflows/ci.yml)

A Postman collection plus a small programmatic [Newman](https://github.com/postmanlabs/newman) runner.
Top-level folders of the collection are treated as isolated scenarios: the runner executes them one
at a time as separate Newman runs, writes a machine-readable JSON report per folder, and exits with
a code that tells CI exactly what happened. The bundled sample collection runs against the public
[JSONPlaceholder](https://jsonplaceholder.typicode.com) API, so the repository works out of the box
with no server, no credentials, and no accounts.

## Why a runner and not just `newman run`

`newman run` executes the whole collection as one unit and produces one summary. This runner wraps
the Newman **library** to add the three things a CI-facing suite needs:

| | `newman run` (CLI) | this runner |
|---|---|---|
| Unit of execution | one run over the whole collection | one Newman run per top-level folder |
| Result granularity | a single summary for everything | a per-folder summary line and one JSON report per folder |
| Artifacts | only what you export by hand | Newman's own JSON export plus a shaped report, per folder |
| Exit codes | `0` ok, non-zero on failure | `0` passed · `1` a request/assertion failed · `2` infrastructure error |
| Configuration | command-line flags | environment variables, read once in `src/config.mjs` |
| Target override | `--env-var base_url=…` on every call | `NEWMAN_BASE_URL`, applied to every folder in one place |

Folder-at-a-time also means one broken scenario cannot mask the others: each folder gets its own
run, its own report file, and its own line in the log.

## Quick start

```bash
git clone https://github.com/linggarbp/newman-testing.git
cd newman-testing
npm ci
npm run test:run
```

Requires Node 20 or newer. On success the last lines look like:

```
[newman] target https://jsonplaceholder.typicode.com · 4 folder(s) · reporters cli,json
[newman] — Posts CRUD
[newman] Posts CRUD: 5 request(s), 12 assertion(s), 0 failed · report test-results/newman-report-posts-crud.json
[newman] — Users
[newman] Users: 3 request(s), 6 assertion(s), 0 failed · report test-results/newman-report-users.json
...
```

## Commands

| Command | What it does |
|---|---|
| `npm run test:run` | Every folder in its own Newman run, with per-folder reports in `test-results/` |
| `npm run list` | Lists the collection's folders (scenarios) without executing anything |
| `npm test` | Plain `newman run` CLI over the whole collection — the raw baseline for comparison |
| `npm run test:unit` | `node:test` unit tests for the report shaper and the configuration resolution |
| `npm run lint` | `node --check` on every source module |
| `node src/run.mjs --folder "Users"` | Runs a single folder by name |
| `node src/run.mjs -f "Users"` | Same, short flag |

## Collection conventions

The collection is the source of truth — the runner discovers folders from it at runtime, nothing is
hard-coded in the code.

* A **folder** is a scenario; a **request** is a test case.
* Every folder is **self-contained and order-independent**: it creates what it needs (named with a
  unique run suffix minted by the folder's prerequest script) and asserts on the response it just
  received, never on state another folder left behind.
* Every request asserts with `pm.test`, and the assertions check the **response shape**, not just
  the status code — a field that changes type breaks the suite even when the status stays 200.
* `{{base_url}}` comes from the environment file (`environments/local.json`). The runner injects
  the resolved value as an environment variable, so `NEWMAN_BASE_URL` overrides it for every folder
  without editing a file.

## Reports

Every run writes into `test-results/` (change it with `ARTIFACTS_DIR`):

* `newman-report-<folder>.json` — one shaped report per folder: the outcome CI cares about.

  ```json
  {
    "generatedAtUtc": "2026-10-11T13:59:12.302Z",
    "target": "https://jsonplaceholder.typicode.com",
    "folder": "Posts CRUD",
    "run": {
      "stats": { "requests": { "total": 5, "failed": 0 }, "assertions": { "total": 12, "failed": 0 }, "...": "Newman's own counters" },
      "timings": { "responseAverage": 781.6, "started": 1791727148180, "completed": 1791727152278, "...": "Newman's own timings" },
      "failures": []
    }
  }
  ```

  When something fails, `run.failures` carries one `{ "source", "error" }` entry per failure (for
  example `"connect ECONNREFUSED 127.0.0.1:9"` when the target is down) and the runner exits `1`.

* `newman-raw-<folder>.json` — Newman's own JSON export, pinned to a file per folder. Without an
  explicit export path Newman's `json` reporter scatters loose files into `./newman/`; the runner
  points it at the artifacts directory instead.

## Configuration

Every setting is an environment variable, read once in `src/config.mjs`. Copy `.env.example` to
`.env` to change them locally — real environment variables always win over the file.

| Variable | Default | Purpose |
|---|---|---|
| `NEWMAN_BASE_URL` | *(blank)* | Overrides `base_url` for every folder; blank means "use the environment file" |
| `NEWMAN_COLLECTION` | `collections/sample-api-collection.json` | Collection to run |
| `NEWMAN_ENVIRONMENT` | `environments/local.json` | Environment file to run with |
| `NEWMAN_REPORTERS` | `cli,json` | Newman reporters (`cli` for humans, `json` for the raw export) |
| `NEWMAN_FOLDER` | *(blank)* | Runs a single folder by name; blank runs all of them |
| `ARTIFACTS_DIR` | `test-results` | Where reports and raw exports land |
| `REQUEST_TIMEOUT_MS` | `10000` | Per-request timeout in milliseconds |
| `ITERATIONS` | `1` | Newman iterations per folder |
| `INSECURE` | `false` | Allow self-signed TLS certificates |

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Every request and assertion passed |
| `1` | A request or assertion failed — the suite ran and found a problem |
| `2` | Infrastructure error — the collection or environment could not be read, no folder matched, or the run could not start |

The split matters in CI: `2` means "fix your pipeline", `1` means "the API under test changed".

## Project structure

```
collections/sample-api-collection.json   folders (scenarios) -> requests (test cases) with pm.test assertions
environments/local.json                  base_url for the sample API
src/config.mjs                           every environment variable, read once
src/report.mjs                           shaping: a Newman summary -> the report JSON
src/run.mjs                              the runner: one folder at a time, then report that folder
test/unit/                               node:test coverage for the report shaper and the configuration
.github/workflows/ci.yml                 lint + unit tests, then a real run against JSONPlaceholder
```

## CI

The workflow runs two jobs:

1. **quality** — `npm ci`, `npm run lint`, `npm run test:unit` on Node 20.
2. **run** — `node src/run.mjs`: a real run of every folder against the public JSONPlaceholder API.
   No mocks and no secrets; a green build means the sample suite genuinely passed.

## License

MIT — see [LICENSE](LICENSE). The sample collection targets JSONPlaceholder, a free fake REST API
for prototyping and testing.
