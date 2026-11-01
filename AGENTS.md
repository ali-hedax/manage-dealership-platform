# AGENTS.md — working on HEDAX

## Purpose

HEDAX is a management dashboard for a car dealership. It turns ISACO B2B reports (`https://b2b.isaco.ir`) into statistics, charts and analysis. **Downloading a report is not the goal**: work is done only when the data is parsed, stored and visible in the analysis. B2B stays the system of record; HEDAX only reads reports.

Full behaviour and rules: [README.md](README.md) (Persian). Where docs and code disagree, the **current code** wins; record the discrepancy under "Known issues".

## Architecture

| Path | Responsibility |
| --- | --- |
| `index (4).html` | The whole browser app in one file (HTML/CSS/JS, no external libraries, ~4300 lines). The name has a space and parentheses — always quote it. |
| `companion/server.cjs` | Local server on `127.0.0.1:5173` (`HEDAX_PORT`). Serves the page and `/api/b2b/{session,sync,report,login,state,archive}` with Host/Origin checks and a per-run token. |
| `companion/b2b.cjs` | `B2BClient`: Chrome via Playwright `launchPersistentContext`, sign-in, passive session probe (`state`), appointment report (`sync` → `/PlanningReport`). |
| `companion/operations.cjs` | The other four reports: `ROUTES`, `validateOperation` (allowed scope per report), `runOperation` (set and verify filters, click export). |
| `companion/export.cjs` | `captureExport`: gets export bytes; if the window dies mid-transfer, refetches with the captured URL and session cookies (`via: session`). |
| `companion/archive.cjs` | `detectFormat` (format from bytes); keeps a copy per report in `.local/report-archive` (5 per source). |
| `companion/config.cjs` | `BUILD` = `chrome-` + hash of `SOURCES`; profile dir `.local/b2b-profile-chrome`. |
| `companion/start.cjs`, `restart.ps1` | Launcher: probes the running companion, replaces an outdated one only after verifying process identity, starts it hidden and detached. |
| `start-hedax.cmd` | User entry point on Windows. |
| `tests/` | `fixtures.js` / `fixtures-ssml.js` generate synthetic data; `shims/` fake DOMParser and IndexedDB for Node; `cdp.cjs` drives headless Chrome for browser tests. |

Key names inside `index (4).html` (search for them):

- **File reading:** `sniffFormat`, `ingestFile`, `parseXlsxNative`, `parseSpreadsheetMlNative` + `repairSpreadsheetMlText`, `parseHtmlTableGrid`, `mapColumnsByName` / `autoMapColumns`, `textCell`.
- **Appointments (نوبت‌دهی):** `buildNobatReport`, `computeNobatStats`, `nobatScopeKey`, `classifyIncomingReport`, `commitNobatReport`, `importB2BReport`, `nobatDue`, module `B2BSync`.
- **Other sources:** `operationsScope`, `operationDue`, `importOperationReport`, `parseOperationPayload`, module `OperationsSync`.
- **Reception (پذیرش):** `receptionWeekScope`, `receptionPartitions`, `fetchReceptionWindow`, `mergeReceptionRecords`, `mergeReceptionCoverage`, `computeReceptionStats`, `renderReception`.
- **Transport and sign-in:** `B2BRequests` (one shared queue), `B2BGate` (`guard`, `waitForLogin`), `B2BStages` (per-step record), `B2BArchive`.
- **Analysis and UI:** `recomputeDerived`, `renderDashboard`, `managementMetrics`, `renderManagementOverview`, `renderPriority`, `renderSlow`, `renderEmdad`, `renderOil`, `renderNobat`; exports `buildXlsxBlob`, `exportTable`.

Browser storage: IndexedDB `hedax` / `nobat_reports` (every appointment report revision, scoped by date + status filter + hall); IndexedDB `hedax_source_snapshots` / `sources` keyed by `sourceId` (`alef` inventory, `b` DPLAN, `p` special roadside assistance, `t` reception); localStorage `hedax-b2b-settings`, `hedax-b2b-last-success`, `hedax-ops-enabled` (settings only).

## Setup, running, testing

Requires Node.js ≥ 22, npm (lockfile: `package-lock.json`), Google Chrome. Single dependency: `playwright` pinned at 1.62.1 — do not upgrade incidentally.

```
npm install
start-hedax.cmd            # normal run: companion in background + opens http://localhost:5173/
npm start                  # companion in the foreground (node companion/server.cjs)
npm test                   # all Node tests, synthetic data, no Chrome, no B2B
npm run test:browser       # headless Chrome, throwaway profile, synthetic data
node tests/<name>.test.cjs # one test
```

Also: `node tests/operations-browser.cjs` (preview on 5176), `node tests/management-browser.cjs` (preview on 5178, `HEDAX_TEST_PORT`), `powershell -File tests/restart.test.ps1` (identity functions only; stops nothing). `tests/run-tests.js` and `tests/spreadsheetml.test.cjs` execute the code inside `index (4).html` in Node. Add every new Node test to the `test` script in `package.json`.

VS Code: tasks in `.vscode/tasks.json` (install, start, run companion, verified stop, port check, tests); debug configurations in `.vscode/launch.json` (companion on 5173 with a free-port pre-check, companion on 5174, current test file). Nothing runs on folder open.

Environment: only `HEDAX_PORT` (read by `server.cjs`; **ignored by `start-hedax.cmd`**, which always uses 5173) and `HEDAX_TEST_PORT`. `.env` is **not** loaded automatically; use `node --env-file=.env companion/server.cjs`. See `.env.example`. `HEDAX_RESTART_ROOT/PORT` and `HEDAX_NODE` are internal to the launcher.

Origins matter: `file://`, `localhost:5173`, `localhost:5174`, test ports and each browser profile have **separate IndexedDB data**. B2B fetching only works when the page is served by the companion. The B2B session lives in `.local/b2b-profile-chrome` (the old Edge profile `.local/b2b-profile` is left untouched); two companions cannot use that profile at the same time.

## B2B integration constraints

- Google Chrome only (`channel: 'chrome'`) with the dedicated profile. The page refuses a companion whose `browser` is not `chrome`.
- **Manual sign-in.** The user types username, password and captcha. Credentials are never stored; automatic sign-in is **not implemented**.
- **Auto-resume after sign-in (implemented):** `LOGIN_REQUIRED` → `B2BGate.guard` holds the queue → `waitForLogin` polls `/api/b2b/state` every 4 s (never navigates, reloads or focuses) → the same failed job reruns once. 30-minute cap. `ready` is a hint; the fetch itself is the authoritative check. There is deliberately no "I have signed in" button.
- **Read-only.** Only named report controls are set and the export button clicked. Never order parts, register receptions/repairs, recalculate, create pre-requests or save changes in B2B. In DPLAN only «تکمیل اطلاعات» is allowed.
- Failed or slow downloads are **never retried automatically**. One download at a time (`BUSY`); all page requests go through `B2BRequests`.

| Source | id | B2B route | Real format | Scope | Automatic cadence |
| --- | --- | --- | --- | --- | --- |
| Appointments | `n` | `/PlanningReport` | XLSX | day + status + hall (default today, «همه», «سالن تعمیرات») | daily (`nobatDue`) |
| Inventory | `alef` | `/RepStkStock` | HTML table as `.xls` | current, warehouse «انبار قطعات ولوازم یدکی» | when the section opens |
| DPLAN | `b` | `/Dplns` | XLSX | current B2B year | after month change |
| Special assistance | `p` | `/RepEmdadVijeh` | not recorded | year start → today | after month change; only from 10:00 Tehran |
| Reception | `t` | `/viewRepairCard` | SpreadsheetML as `.xls` | **last 7 days** (today + 6 before) | 7 days after last success |

The manual fetch button (`force`) bypasses cadence, but not the 10:00 gate. Scheduling only runs while the dashboard is open; there is no background service.

**Reception window (implemented):** `receptionWeekScope` builds 7 days by Julian day (month/year and Nowruz safe); the companion's `validateOperation` only accepts windows of ≤ 7 days with `part: true`. A part hitting the 1000-row cap is split **inside the window**, never back to year start. A single day at the cap, rows outside the window, a card repeated across parts, or any failed part → nothing is stored. New weeks **merge** into stored data (`mergeReceptionRecords`, key card number + admission year); received ranges live in `meta.coverage` and gaps stay "not received", never zero. **Do not generalise this to appointments, assistance, inventory or DPLAN** (`tests/reception-window.test.cjs` guards them).

## Data-processing and persistence rules

- **Format from content**, not extension or name (`sniffFormat` in the page, `detectFormat` in the companion). `.xls` may be SpreadsheetML or an HTML table; binary OLE2 is rejected. Never report a format as read unless it was.
- **Identifiers are text** (`textCell`): card, appointment, plate and part numbers keep leading zeros and long digits. Columns are matched **by header name**, not position.
- **No double counting:** same file + same scope is a duplicate (content hash); appointment reports with different filters/dates are never summed; the other four sources keep one snapshot each (annual and overlapping exports are not added); reception merges only by card + year; a stock row matched by several codes is valued once.
- An appointment row **without a card number** is not a confirmed reception; it is counted separately, and the row count is not a reception count.
- **Estimated release time** («زمان تقریبی ترخیص») never replaces the real release time.
- **Missing ≠ zero:** empty cells are "unknown" and excluded from averages; days not received are "unknown"; a weekly number is never presented as a full-year figure.
- **Customer remarks do not prove** a repair or service; oil/filter sales are not serviced-vehicle counts.
- **Failure never erases valid data:** a snapshot is stored only after complete parsing; an invalid file, mismatched scope, no valid rows, or an IndexedDB failure keeps the last valid data and names the failed step.
- Numbers from one sample file belong in tests (`--real … --rows`), never hard-coded in the app.
- Keep existing analyses, charts, tables and exports (management summary Excel, order file, price comparison, registration-to-release time) unless explicitly asked to change them.

## Development workflow

1. Before editing, check `git status` / `git diff` and preserve the user's uncommitted changes; read the relevant code. `index (4).html` is large — locate by function name.
2. Keep changes minimal and match the compact existing style (2 spaces, UTF-8 without BOM; `.editorconfig`). Do not run a formatter over the HTML file.
3. Run the focused test, then `npm test`; browser tests for browser paths. Don't repeat checks that already passed without a reason.
4. **After changing `companion/`**, rerun `start-hedax.cmd` and confirm the running build equals the code on disk (never print the token):
   ```
   node -e "console.log(require('./companion/config.cjs').BUILD)"
   ```
   and compare with the `build` field of `GET http://127.0.0.1:5173/api/b2b/session`. A change only to `export.cjs` does **not** change `BUILD` (see Known issues).
5. **Download, parse, store and render are four separate results** (`B2BStages` records them). A real fetch is verified only when it reaches the charts and survives a page reload.
6. Report each item as succeeded / failed with cause / not tested, and keep synthetic results separate from live B2B results. State blockers (sign-in needed, push not done, missing dependency) with the exact action required.

## Sensitive data and Git

- **Never commit or log:** real spreadsheets/CSVs, customer data, passwords, companion tokens, cookies, browser profiles/sessions, databases, network traces, or anything under `.local/` (profiles, `report-archive`, `companion.log`, local live-check scripts). `.gitignore` covers these; check `git status` before committing and avoid blind `git add -A`.
- Do not copy `.local` or archive contents into docs or reports. Tests use synthetic fixtures only; real files only locally via `--real`.
- Remote: `origin` = `https://github.com/ali-hedax/manage-dealership-platform.git`. Verify `git remote -v` and the current branch before any push; do not guess repository names. `brand-guide-hedax` is a different project.
- No force push, no history rewrite, no checkout/reset that loses uncommitted work. Commit or push only when asked.

## Known issues (evidence as of 2026-09-28, commit `e75f19c`)

| Item | Status |
| --- | --- |
| `npm test` (15 Node test files) | passes locally (Node 26.8.2), synthetic data |
| `tests/import-browser.cjs`, `tests/e2e-browser.js` | pass locally, synthetic data |
| `tests/autosync-browser.cjs` | **fails 1 of 40**: «پذیرش از چند بخش جمع شد» expects several reception parts, gets `{"parts":1}`. The test still assumes the old year-to-date batching replaced in `e75f19c`; the test needs updating, not the 7-day behaviour. |
| Reception last-7-days | implemented; verified with synthetic tests. A real 7-day reception file exists in the local archive (download stage only); reaching charts and surviving reload with live B2B is **not verified**. |
| Auto-resume after manual sign-in | implemented; tested against a simulated companion only; live end-to-end **not tested**. |
| Live inventory, DPLAN, assistance fetches | end-to-end live verification not confirmed. |
| CI workflow `.github/workflows/test.yml` | not yet run on GitHub. |

1. **`BUILD` does not cover `export.cjs`.** `SOURCES` in `companion/config.cjs` hashes only `config/server/b2b/operations/archive.cjs`, although `b2b.cjs` and `operations.cjs` require `export.cjs`. Editing only `export.cjs` leaves the running companion looking current, so the launcher will not replace it. Not fixed.
2. `tests/autosync-browser.cjs` out of date, as above.
