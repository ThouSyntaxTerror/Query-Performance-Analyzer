# Presentation script (about 6 minutes)

## 1. The idea (30 s)
"My project is a **Query Performance Analyzer**: a spell-checker for SQL. You paste a query, it runs it on a real MySQL database, gives it a **score out of 100**, explains why it lost points and **suggests the fix**, for example the exact index to create. Everything it measures is stored in two databases."

## 2. Databases used (45 s)
- **MySQL 8.0 (SQL):** 9 tables. Four shop tables (customers, products, orders, order_items, 205,000 rows) are what gets analysed. Five analyzer tables store the results: saved_queries, query_executions, query_plans, execution_table_access, recommendations.
- **MongoDB (NoSQL):** one nested document per analysed run: plan tree, metrics, rating, suggestions, tables, embedding.
- **Vector similarity:** each query becomes a 30-number embedding, and cosine similarity finds queries shaped alike.
- **Why two:** "MySQL for related data with keys, constraints and triggers. MongoDB for each run as one flexible document, because every plan has a different shape."
- **Interface:** Next.js page and API routes. Passwords are in a Git-ignored `.env.local`.

## 3. Demo: website (1 min)
1. Run `SELECT order_id, order_date, total_amount FROM orders WHERE customer_id = 1234`. **Score 100.** "An index finds the 10 rows."
2. Run `SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2024-03-01' AND '2024-03-31'`. **Score about 50.** "50,000 rows read, 2,123 kept. It suggests `CREATE INDEX idx_orders_order_date`."

## 4. Demo: MySQL terminal (2 min)
- `SHOW TABLES;` then `SHOW CREATE TABLE orders\G`: "keys, foreign key, CHECK, ENUM."
- **Join:** customers joined to orders. **HAVING:** queries run at least 5 times. **Subquery and window function:** in the three project queries.
- **Triggers:** `SHOW TRIGGERS\G`. "`trg_exec_after_insert` runs after each run is stored. If the query read 20 times more rows than it returned, or took 100 ms or more, it writes a recommendation by itself. `trg_access_after_insert` flags big full table scans." Then insert a test row inside a transaction, show the recommendations appear, `ROLLBACK`.
- **Functions and procedures:** `fn_query_embedding` builds the 30-number vector; `fn_cosine_similarity` compares two vectors; `sp_save_query` and `sp_log_execution` store a run; `sp_workload_priority` ranks queries by total time (runs times average time); view `v_workload_priority`.
- **Cascade:** deleting a saved query also deletes its runs, plans and recommendations (`ON DELETE CASCADE`, shown in a rolled-back transaction). A customer with orders cannot be deleted (`RESTRICT`).
- **Privileges:** `qa_app` reads and writes; `qa_viewer` can only read (a `DELETE` is denied); `qa_runner` runs the pasted SQL and can read four tables only.

## 5. Demo: MongoDB (1 min)
Open `mongosh`: `use shop_query_analyzer_docs`, `db.plans.countDocuments()`, show the newest document (the query just run on the website), then the **aggregation pipeline** that counts full table scans per table, and the **text search**. "MySQL is written first, the same run is then saved here with the same execution id."

## 6. Close (30 s)
"MySQL keeps related, constrained data; MongoDB keeps each run as a flexible document; cosine similarity finds similar queries. Limits: the score is my own heuristic, the embedding counts SQL features rather than understanding meaning, and CPU is not measured."

## Likely questions
- **Are the numbers real?** Yes, from MySQL's `EXPLAIN ANALYZE`, which runs the query and counts time and rows.
- **Is it safe to paste any SQL?** One read-only SELECT only, run by an account that can read four tables, with a 5 second limit.
- **How is the score made?** Starts at 100 and loses points for slow time, rows read then thrown away, full scans, `SELECT *`, correlated subqueries and no `LIMIT`.
- **Admin and normal users?** Roles are enforced inside MySQL (`qa_app`, `qa_viewer`, `qa_runner`); the website uses the restricted accounts. There is no login page.
- **Why a shop database?** It is the test database being analysed: realistic joins and filters with 205,000 rows.
