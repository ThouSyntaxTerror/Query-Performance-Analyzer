-- =====================================================================
-- 07_index_before_after.sql  -  does an index change the plan? Measured with EXPLAIN ANALYZE.
-- Run as root in the mysql client:  SOURCE sql/07_index_before_after.sql;
-- DDL (CREATE/DROP INDEX) is NOT rolled back like normal transactions, so this script
-- cleans up after itself at the end, and sql/08_index_cleanup.sql can be run at any time
-- if the script is interrupted. It only ever touches the index idx_demo_orders_order_date.
-- =====================================================================
USE shop_query_analyzer;

-- Step 0: the demonstration index must not exist yet (expect 0)
SELECT COUNT(*) AS demo_index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'shop_query_analyzer' AND TABLE_NAME = 'orders'
  AND INDEX_NAME = 'idx_demo_orders_order_date';

-- Step 1: BEFORE. Expect "Table scan on orders" reading all 50,000 rows.
EXPLAIN ANALYZE
SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2024-03-01' AND '2024-03-31'\G

-- Step 2: add the index and refresh statistics
CREATE INDEX idx_demo_orders_order_date ON orders (order_date);
ANALYZE TABLE orders;

-- Step 3: AFTER. Expect an index range scan reading only the March rows.
EXPLAIN ANALYZE
SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2024-03-01' AND '2024-03-31'\G

-- Step 4: CLEAN UP (explicit; DDL cannot be rolled back)
DROP INDEX idx_demo_orders_order_date ON orders;
ANALYZE TABLE orders;

-- Step 5: confirm the demonstration index is gone (expect 0)
SELECT COUNT(*) AS demo_index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'shop_query_analyzer' AND TABLE_NAME = 'orders'
  AND INDEX_NAME = 'idx_demo_orders_order_date';
