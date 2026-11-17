-- DEMO 1: the database, its tables, its constraints, and proof that the website uses the same data
-- Run in the mysql client started from the project folder:  SOURCE sql/demo_1.sql;
SELECT '=== 1. Databases on this server ===' AS '';
SHOW DATABASES;
USE shop_query_analyzer;
SELECT '=== 2. Tables of the project ===' AS '';
SHOW TABLES;
SELECT '=== 3. Row counts ===' AS '';
SELECT 'customers' AS table_name, COUNT(*) AS `rows` FROM customers
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
UNION ALL SELECT 'saved_queries', COUNT(*) FROM saved_queries
UNION ALL SELECT 'query_executions', COUNT(*) FROM query_executions;
SELECT '=== 4. Table definition with keys and constraints (SHOW CREATE TABLE) ===' AS '';
SHOW CREATE TABLE orders\G
SELECT '=== 5. Sample rows ===' AS '';
SELECT * FROM customers LIMIT 3;
SELECT * FROM orders LIMIT 3;
SELECT '=== 6. Latest runs: these are the queries just analysed on the website ===' AS '';
SELECT execution_id, query_id, executed_at, duration_ms, rows_examined, rows_returned
FROM query_executions ORDER BY execution_id DESC LIMIT 3;
