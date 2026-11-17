# MySQL Query Analyzer

A one-page web app. You paste a SQL query; it runs it on a **real MySQL 8.0 database**, **rates it out of 100** and **suggests changes** (for example the exact `CREATE INDEX` to add). The technical detail behind the rating (the actual `EXPLAIN ANALYZE` plan, measured values, why rows were examined) is one click away. The web app and the MySQL terminal use the **same database**, `shop_query_analyzer`.

![Report](docs/img/ui_report.png)

## What you can do

| On the page | What happens in MySQL |
|---|---|
| Pick a preset, paste SQL or upload a `.sql` file, press Analyze | `EXPLAIN ANALYZE` executes the query as a read-only account |
| Read the result | A score out of 100, why it lost points, and suggested changes. Under "Technical details": measured time, rows examined versus returned, access method, index, filter and the reason, the actual plan, similar queries |
| Compare runs, rank queries | In the MySQL terminal: `CALL sp_compare_executions(a, b)` and `CALL sp_workload_priority(10)` (see the demo guide) |

## How the rating works

The score starts at 100 and loses points for measured problems: slow run time, rows read and then thrown away by a filter, whole-table scans of big tables, `SELECT *`, correlated subqueries, and large results with no `LIMIT`. Each lost point is listed with its reason. The thresholds are in `lib/rating.mjs`.

Below the rating, an **Analysis** section gives the DBMS view of the same run, all computed from the measured plan and the stored runs:

| Metric | Meaning |
|---|---|
| Scan efficiency | rows kept by the filter divided by rows examined |
| Optimizer accuracy (q-error) | how many times too high or too low the optimizer's row estimate was, at its worst plan step |
| Cost per 1,000 rows | measured time divided by rows examined, times 1,000 |
| Workload priority | rank by total time (runs multiplied by average time) among all stored queries, read from a MySQL view |
| Access type, index, selectivity | per table: `ALL`, `range`, `ref`, `eq_ref`, `const` or `index`, the index used, share of rows passing the filter |
| Rows and columns returned, tables accessed, execution features | columns come from MySQL prepared-statement metadata; features include join algorithm, temporary table, sort |
| Totals so far | queries run, distinct queries, rows examined and returned, time spent, counted by MySQL |

![Technical details](docs/img/ui_details.png)

## How it fits together

![Architecture](docs/img/architecture.png)

## What happens when you press Analyze

![Workflow](docs/img/workflow.png)

## Measured values versus estimates

Every plan line has two brackets. The estimate is a guess made before running; the measured part was counted while MySQL executed the query. The page labels them differently and only ever treats measured values as results.

![Reading a plan line](docs/img/plan_reading.png)

## Database

Nine tables: the four shop tables and five analyzer tables.

![ER model](docs/img/er_model.png)

Three accounts with different privileges, enforced by MySQL:

![Accounts and roles](docs/img/permissions.png)

## Setup (once)

Needs Node.js 20 or newer and the MySQL 8.0 service running on port 3306.

1. Install packages:

```bash
npm install
```

2. Enter your MySQL root password **locally**. It is never typed into chat and never committed. In PowerShell, in this project folder:

```bash
copy .env.local.example .env.local
notepad .env.local
```

   Replace `PUT_YOUR_ROOT_PASSWORD_HERE` with your root password, keep the double quotes, save, close. `.env.local` is ignored by Git.

3. Create the database, tables, data, accounts and permissions (root is used for this step only):

```bash
npm run setup
```

   This never drops anything. If a database called `shop_query_analyzer` already exists and is not this project's, it stops and changes nothing. It generates passwords for the three restricted accounts and saves them to `.env.local`.

4. Record measured sample runs (real `EXPLAIN ANALYZE` executions of the preset queries):

```bash
npm run warmup
```

5. Start the page and open http://localhost:3200 (black and red page: a query box, an Analyze button, then the report):

```bash
npm run dev
```

## Files

| Path | Purpose |
|---|---|
| `sql/01_schema.sql` to `sql/10_crud_demo.sql` | Setup, seed data, stored logic, permissions, presets, three queries, index before/after, cleanup, DDL and CRUD demos |
| `lib/` | SQL guard, plan parser, analysis pipeline, database pools |
| `app/` | The one-page interface and its four API routes |
| `scripts/` | `setup`, `warmup` and a helper to run the `mysql` client with the saved password |
| `docs/REPORT.md` | Complete technical report |
| `docs/DEMO_GUIDE.md` | Live-demo script with exact commands |

Run a terminal command with a saved password without typing it: `npm run mysql -- --as root -e "SHOW DATABASES"`.
