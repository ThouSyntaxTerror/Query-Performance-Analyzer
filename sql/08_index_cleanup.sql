-- =====================================================================
-- 08_index_cleanup.sql  -  idempotent cleanup of the demonstration index
-- Safe to run any number of times: it drops idx_demo_orders_order_date only if it exists.
-- Run as root:  SOURCE sql/08_index_cleanup.sql;
-- =====================================================================
USE shop_query_analyzer;

SET @has_index = (SELECT COUNT(*) FROM information_schema.STATISTICS
                  WHERE TABLE_SCHEMA = 'shop_query_analyzer' AND TABLE_NAME = 'orders'
                    AND INDEX_NAME = 'idx_demo_orders_order_date');
SET @sql = IF(@has_index > 0,
              'DROP INDEX idx_demo_orders_order_date ON orders',
              'SELECT ''demo index not present, nothing to drop'' AS result');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT INDEX_NAME FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'shop_query_analyzer' AND TABLE_NAME = 'orders'
GROUP BY INDEX_NAME;
