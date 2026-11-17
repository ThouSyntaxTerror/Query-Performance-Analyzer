-- DEMO 6: triggers firing live, and joins
-- Run in the mysql client started from the project folder:  SOURCE sql/demo_6.sql;
-- The trigger test inserts two TEST rows inside a transaction and ROLLS BACK, so nothing is kept.
USE shop_query_analyzer;

SELECT '=== A1. The trigger code stored in MySQL ===' AS '';
SHOW CREATE TRIGGER trg_exec_after_insert\G

SELECT '=== A2. Recommendations of the query "Indexed lookup" BEFORE the test (expect none) ===' AS '';
SET @q = (SELECT query_id FROM saved_queries WHERE label LIKE 'Indexed lookup%' LIMIT 1);
SELECT COUNT(*) AS recommendations_before FROM recommendations WHERE query_id = @q;

SELECT '=== A3. Insert a TEST run that reads 60,000 rows to return 1 (inside a transaction) ===' AS '';
START TRANSACTION;
INSERT INTO query_executions (query_id, duration_ms, rows_returned, rows_examined, run_note)
VALUES (@q, 120.000, 1, 60000, 'TEST ROW for trigger demo');
SET @e = LAST_INSERT_ID();

SELECT '=== A4. Trigger 1 fired by itself: these recommendation rows appeared ===' AS '';
SELECT rec_id, severity, suggestion FROM recommendations WHERE query_id = @q;

SELECT '=== A5. Insert a TEST table access (full scan of 60,000 rows): trigger 2 fires ===' AS '';
INSERT INTO execution_table_access (execution_id, table_name, access_method, rows_examined, rows_kept, loops, explanation)
VALUES (@e, 'orders', 'Table scan', 60000, 60000, 1, 'TEST ROW for trigger demo');
SELECT rec_id, severity, suggestion FROM recommendations WHERE query_id = @q ORDER BY rec_id;

SELECT '=== A6. ROLLBACK: the test rows and the recommendations they caused are gone ===' AS '';
ROLLBACK;
SELECT COUNT(*) AS recommendations_after FROM recommendations WHERE query_id = @q;
SELECT COUNT(*) AS test_rows_left FROM query_executions WHERE run_note = 'TEST ROW for trigger demo';

SELECT '=== B1. INNER JOIN: each table access with the query and the run it belongs to ===' AS '';
SELECT q.label, e.execution_id, a.table_name, a.access_method, a.rows_examined, a.rows_kept
FROM execution_table_access a
JOIN query_executions e ON e.execution_id = a.execution_id
JOIN saved_queries q ON q.query_id = e.query_id
WHERE e.execution_id IN (SELECT MAX(execution_id) FROM query_executions GROUP BY query_id)
ORDER BY a.rows_examined DESC
LIMIT 6;

SELECT '=== B2. LEFT JOIN: saved queries that have NO recommendation ===' AS '';
SELECT q.query_id, LEFT(q.label, 60) AS label
FROM saved_queries q
LEFT JOIN recommendations r ON r.query_id = q.query_id
WHERE r.rec_id IS NULL;

SELECT '=== B3. Three-table JOIN with GROUP BY on the shop data: revenue per city ===' AS '';
SELECT c.city, COUNT(DISTINCT o.order_id) AS orders, SUM(oi.quantity * oi.unit_price) AS revenue
FROM customers c
JOIN orders o ON o.customer_id = c.customer_id
JOIN order_items oi ON oi.order_id = o.order_id
GROUP BY c.city
ORDER BY revenue DESC;

SELECT '=== B4. JOIN on a view: queries and how many recommendations each has ===' AS '';
SELECT w.priority_rank, LEFT(w.label, 50) AS label, w.total_ms, COUNT(r.rec_id) AS recommendations
FROM v_workload_priority w
LEFT JOIN recommendations r ON r.query_id = w.query_id
GROUP BY w.priority_rank, w.label, w.total_ms
ORDER BY w.priority_rank
LIMIT 5;
