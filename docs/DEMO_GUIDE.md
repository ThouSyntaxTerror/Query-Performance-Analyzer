# Live demo guide

About 10 minutes. Two windows: a PowerShell terminal with the MySQL client, and the web page at http://localhost:3200.

## 0. Before the demo

```bash
cd "C:\Users\athar\OneDrive\Desktop\dhjhg\dbms\mini project\mysql-query-analyzer"
npm run dev
```

Open http://localhost:3200 in a browser. In a second PowerShell window, start the MySQL client from the same folder (so `SOURCE sql/...` paths work). It asks for your root password: **type it at the prompt, never in chat**.

```bash
cd "C:\Users\athar\OneDrive\Desktop\dhjhg\dbms\mini project\mysql-query-analyzer"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

If you ran `npm run setup` and `npm run warmup`, the database already holds measured runs.

## 1. The database exists and is the same one the page uses

```sql
SHOW DATABASES;
USE shop_query_analyzer;
SHOW TABLES;
```

Say: "Nine tables. The first four are the shop. The other five store what the analyzer measures."

```sql
SHOW CREATE TABLE orders\G
SHOW CREATE TABLE query_executions\G
```

Point at: `PRIMARY KEY`, `FOREIGN KEY ... REFERENCES`, `CHECK`, `ENUM`, `UNIQUE KEY`, and that `fk_orders_customer` created an index automatically (`KEY fk_orders_customer`).

```sql
SELECT * FROM customers LIMIT 5;
SELECT * FROM orders LIMIT 5;
SELECT execution_id, query_id, executed_at, duration_ms, rows_examined, rows_returned FROM query_executions ORDER BY execution_id DESC LIMIT 5;
```

Now switch to the page, run any preset (for example "Full scan: orders in March 2024"), then back in the terminal:

```sql
SELECT execution_id, query_id, executed_at, duration_ms, rows_examined, rows_returned FROM query_executions ORDER BY execution_id DESC LIMIT 1;
```

Say: "The run I just did on the page is the newest row here, with the same time and row counts. The page reads and writes this database."

## 2. Users, roles and privileges

```sql
SELECT user, host FROM mysql.user WHERE user LIKE 'qa\_%';
SHOW GRANTS FOR 'qa_app'@'localhost' USING 'qa_app_role';
SHOW GRANTS FOR 'qa_viewer'@'localhost' USING 'qa_viewer_role';
SHOW GRANTS FOR 'qa_runner'@'localhost' USING 'qa_runner_role';
```

Say: "`qa_app` reads and writes the project tables. `qa_viewer` can only read. `qa_runner` executes the SQL typed on the web page and can only read the four shop tables, nothing else."

Prove the difference. Open a **third** terminal, log in as the read-only user (its password is in `.env.local` under `QA_VIEWER_PASSWORD`; open that file in Notepad and copy it into the prompt):

```bash
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u qa_viewer -p shop_query_analyzer
```

```sql
SELECT COUNT(*) FROM query_executions;
DELETE FROM recommendations;
```

Expected: the SELECT works; the DELETE fails with `ERROR 1142 ... DELETE command denied to user 'qa_viewer'@'localhost'`. Type `exit` to leave.

## 3. The three queries

```sql
SOURCE sql/06_three_queries.sql;
```

| Query | What it shows | What to say |
|---|---|---|
| Q1 priority | Join, `GROUP BY`, window functions: total time per query and its share of the whole workload | "A query's priority is how often it runs times how long it takes. The aggregation query dominates the workload, so that is the one to fix first." |
| Q2 hotspots | Two correlated subqueries: for each query's latest run, the table that was read most | "This is where full table scans happen: `orders` is scanned 50,000 rows to keep a few thousand." |
| Q3 similarity | `fn_cosine_similarity` inside MySQL | "Each query becomes a vector of counts (JOINs, GROUP BY, table names...). Cosine similarity finds queries shaped alike." |

## 4. Stored function, procedure, trigger, view

```sql
SHOW FUNCTION STATUS WHERE Db = 'shop_query_analyzer';
SHOW PROCEDURE STATUS WHERE Db = 'shop_query_analyzer';
SHOW TRIGGERS\G
CALL sp_workload_priority(5);
CALL sp_compare_executions(1, 7);
SELECT ROUND(fn_cosine_similarity((SELECT embedding FROM saved_queries WHERE query_id = 5), (SELECT embedding FROM saved_queries WHERE query_id = 7)), 3) AS similarity;
```

Show the trigger firing. On the page run "Low-selectivity filter: all pending orders", then:

```sql
SELECT rec_id, severity, suggestion, created_at FROM recommendations ORDER BY rec_id DESC LIMIT 3;
```

Say: "I did not write these rows. The trigger `trg_access_after_insert` created the recommendation the moment the table access was stored."

## 5. INSERT, UPDATE, DELETE, SELECT

```sql
SOURCE sql/10_crud_demo.sql;
```

Or type them yourself:

```sql
INSERT INTO customers (name, email, city, signup_date) VALUES ('Demo Customer', 'demo.customer@mail.test', 'Pune', CURDATE());
SELECT customer_id, name, city FROM customers WHERE email = 'demo.customer@mail.test';
UPDATE customers SET city = 'Mumbai' WHERE email = 'demo.customer@mail.test';
DELETE FROM customers WHERE email = 'demo.customer@mail.test';
```

Show a constraint refusing bad data (this statement is expected to fail):

```sql
INSERT INTO products (name, category, price, stock) VALUES ('Bad', 'Toys', -5, 1);
```

Expected: `ERROR 3819 ... Check constraint 'chk_products_price' is violated.`

## 6. Index before and after (a real plan change)

On the page, choose **Analyze one query**, pick "Full scan: orders in March 2024", type `before index` in the run label box, press Run. Note: Table scan, 50,000 rows examined.

In the MySQL terminal:

```sql
CREATE INDEX idx_demo_orders_order_date ON orders (order_date);
ANALYZE TABLE orders;
```

On the page run the same query again with the label `after index`. Note: Index range scan, about 2,123 rows examined. Then choose **Compare two runs**, pick that query, pick the `before index` run as A and the `after index` run as B, press Run and compare.

**Clean up (always):**

```sql
DROP INDEX idx_demo_orders_order_date ON orders;
ANALYZE TABLE orders;
SOURCE sql/08_index_cleanup.sql;
```

Prefer a script-only version? `SOURCE sql/07_index_before_after.sql;` prints both plans and removes the index itself at the end.

## 7. Add and remove a demonstration table

```sql
SOURCE sql/09_ddl_demo.sql;
```

It creates `demo_scratch`, inserts two rows, shows `SHOW CREATE TABLE`, runs `ALTER TABLE` (new column with a `CHECK`, new index), shows it again, then runs `DROP TABLE demo_scratch;` and confirms it is gone. It only touches that one scratch table.

Manual version:

```sql
CREATE TABLE demo_scratch (demo_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, note VARCHAR(50) NOT NULL);
ALTER TABLE demo_scratch ADD COLUMN priority TINYINT UNSIGNED NOT NULL DEFAULT 1;
SHOW CREATE TABLE demo_scratch\G
DROP TABLE demo_scratch;
SHOW TABLES;
```

## 8. If the professor asks

| Question | Answer |
|---|---|
| Are these numbers real? | Yes. They come from `EXPLAIN ANALYZE`, which executes the query and counts time and rows. Estimates are shown dashed and are never used as results. |
| What if I paste a harmful query? | The page accepts one `SELECT` only; then MySQL itself blocks anything else because `qa_runner` can only `SELECT` four tables; the query runs read-only with a 5 second limit. |
| Why is the first run sometimes slower? | MySQL caches data pages in memory; repeat a run before concluding anything from small differences. |
| Where is the embedding? | In `saved_queries.embedding` (a JSON array of 30 counts), built by `fn_query_embedding`; compared by `fn_cosine_similarity`. |
| Why does the primary-key lookup preset show "Constant row"? | MySQL resolves a lookup by primary key while it is still planning ("Rows fetched before execution"), so no table scan or index walk happens at run time. |

## 9. Reset between rehearsals

To remove only the demo runs and keep the database:

```sql
DELETE FROM recommendations;
DELETE FROM query_executions;
DELETE FROM saved_queries WHERE is_preset = 0;
```

Then `npm run warmup` records fresh measured runs.
