# CLAUDE.md - MySQL Query Analyzer (DBMS Level 3 mini project)

Hand-off context for the Claude Code CLI. This project REPLACES the earlier PGlite/PostgreSQL version in
`../query-analyzer` (do not use that one; it was abandoned when the requirement became "real MySQL 8.0 only").

## What it is
One-page Next.js 16 app on a real MySQL 8.0.46 database `shop_query_analyzer` (service MySQL80, port 3306).
Runs a user's single SELECT with `EXPLAIN ANALYZE`, parses the plan, stores run + plan + table accesses, explains why rows
were examined, finds similar queries by cosine similarity (in MySQL). The page is deliberately minimal: query box, Analyze, then a 0-100 RATING with reasons and SUGGESTED CHANGES (lib/rating.mjs), and a collapsed 'Technical details' section (black/red, square corners). The user's original idea with the teacher: analyze the query, rate it, recommend changes. Comparing runs and the priority ranking are done in the terminal (`sp_compare_executions`, `sp_workload_priority`, `sql/06`).
The web app and the MySQL terminal use the same database. No login, no admin page.

## Status: built and tested; NOT pushed
- Setup, warm-up, API, UI, SQL scripts 01-10, README, docs/REPORT.md, docs/DEMO_GUIDE.md all done. Test results are in REPORT.md section 9.
- Local git repo only, no remote. DO NOT PUSH until the user gives a repository URL.
- Nothing destructive outside the new database was ever done; other databases (company, hostel, nested, sample, smart_hostel) are untouched.

## Secrets (important)
- `.env.local` (Git-ignored) holds MYSQL_ROOT_PASSWORD (entered by the user) and generated QA_APP/QA_VIEWER/QA_RUNNER passwords.
- NEVER print, echo, cat or Read `.env.local`, never put its values in commits, docs or chat. Use `npm run mysql -- --as root -e "..."`
  (scripts/mysql-cli.mjs) to run the mysql client with the saved password without seeing it.
- Root is for `npm run setup` only. The app uses qa_app (read/write analyzer tables) and qa_runner (SELECT on 4 shop tables only).
- The user once pasted the root password in chat; suggest they change it after the demo. Do not repeat it.

## Commands
```
npm install
npm run setup     # root: creates DB, tables, seed, stored logic, accounts, grants, presets. Idempotent, never drops.
npm run warmup    # real EXPLAIN ANALYZE runs of the 11 presets (skips if runs exist; --force adds more)
npm run dev       # http://localhost:3200
npm run mysql -- --as root|qa_app|qa_viewer|qa_runner -D shop_query_analyzer -e "SQL"     (or --file sql/xx.sql)
node docs/build-diagrams.mjs        # regenerate diagram PNGs from docs/diagrams/*.mmd (Edge/Chrome + internet)
node docs/screenshots.mjs <runIdBefore> <runIdAfter>   # needs the app running on 3200
```

## Layout
- `sql/01_schema.sql` ... `10_crud_demo.sql`: all SQL (schema, seed, stored logic, permissions, presets, 3 queries, index before/after, cleanup, DDL demo, CRUD demo).
- `lib/sqlguard.mjs` (one read-only SELECT/WITH only), `lib/plan.mjs` (EXPLAIN ANALYZE parser + reasons), `lib/analyzer.mjs` (pipeline), `lib/db.mjs` (two pools), `lib/api.mjs`.
- `app/page.js` (minimal), `app/components.js` (QueryInput, RatingCard, RunView), `lib/rating.mjs` (score + suggestions), `lib/metrics.mjs` (scores: scan efficiency, q-error, cost per 1000 rows, workload rank; access types; totals), `app/api/{state,analyze,runs,run/[id]}/route.js`.
- `scripts/setup.mjs`, `warmup.mjs`, `mysql-cli.mjs`, `_env.mjs`.
- `docs/`: REPORT.md, DEMO_GUIDE.md, diagrams/*.mmd, img/*.png.

## Hard-won facts (verified on this server)
- EXPLAIN ANALYZE (TREE) line format: `(cost=A..B rows=R)` = estimate, `(actual time=S..E rows=R loops=L)` = measured. Numbers can be like `100e-6` or `6.88e+6`.
  The number regex must not accept `0..0` as one number (this caused a NaN bug once).
- `max_execution_time` does NOT make EXPLAIN ANALYZE fail: it returns a PARTIAL plan. analyzer.mjs treats wall time >= 97% of the limit as timed out and discards it.
- Stripping comments removes `/*+ MAX_EXECUTION_TIME() */` hints, so users cannot override the timeout.
- PK lookup appears as "Rows fetched before execution" (no table name); the table is inferred from the SQL when only one base table is used.
- InnoDB auto-creates an index for the orders.customer_id FK; order_date/status are deliberately unindexed so scans can be demonstrated.
- Unsigned BIGINT subtraction errors in MySQL: cast to SIGNED (fixed in sp_compare_executions).
- Bash heredocs with apostrophes can fail; prefer the Write tool. Never run `taskkill /IM node.exe`; stop the dev server by port:
  PowerShell `Get-NetTCPConnection -LocalPort 3200 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }`.
- README/docs: no emojis. Do not add Co-Authored-By trailers to commits (the user wants to be the only contributor).

## Possible next steps
1. Get the repo URL from the user, then `git remote add origin <url>` and push (ask first).
2. Hosting is NOT possible on free serverless hosts: the database is the user's local MySQL. Demo it locally.
3. Optional polish: a screenshot of the terminal demo, viva notes.
