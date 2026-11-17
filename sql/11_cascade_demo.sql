-- =====================================================================
-- 11_cascade_demo.sql  -  foreign keys, ON DELETE CASCADE and ON DELETE RESTRICT
-- Run as root or qa_app:  SOURCE sql/11_cascade_demo.sql;
-- Part A uses a throw-away customer/order that it deletes again.
-- Part B (the refused delete) is commented out: run it by hand, it is expected to FAIL.
-- Part C runs inside a transaction and ROLLS BACK, so no real data is lost.
-- =====================================================================
USE shop_query_analyzer;

-- ---------------------------------------------------------------------
-- Part A: ON DELETE CASCADE  (orders -> order_items)
-- fk_items_order is declared ON DELETE CASCADE: deleting an order deletes its items too.
-- ---------------------------------------------------------------------
INSERT INTO customers (name, email, city, signup_date)
VALUES ('Cascade Demo', 'cascade.demo@mail.test', 'Pune', CURDATE());
SET @c = LAST_INSERT_ID();
INSERT INTO orders (customer_id, order_date, status, total_amount) VALUES (@c, CURDATE(), 'PENDING', 100);
SET @o = LAST_INSERT_ID();
INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES (@o, 1, 1, 10.00), (@o, 2, 2, 20.00);

SELECT 'A1 before delete' AS step,
       (SELECT COUNT(*) FROM orders      WHERE order_id = @o) AS orders,
       (SELECT COUNT(*) FROM order_items WHERE order_id = @o) AS order_items;

DELETE FROM orders WHERE order_id = @o;          -- only the ORDER is deleted ...

SELECT 'A2 after DELETE FROM orders' AS step,
       (SELECT COUNT(*) FROM orders      WHERE order_id = @o) AS orders,
       (SELECT COUNT(*) FROM order_items WHERE order_id = @o) AS order_items;   -- ... the items went with it

-- ---------------------------------------------------------------------
-- Part B: ON DELETE RESTRICT  (customers -> orders)
-- fk_orders_customer is RESTRICT: a customer who still has orders cannot be deleted.
-- Run these two by hand (the second one is expected to FAIL with error 1451):
--   INSERT INTO orders (customer_id, order_date, status, total_amount) VALUES (@c, CURDATE(), 'PENDING', 50);
--   DELETE FROM customers WHERE customer_id = @c;
-- then clean up:
--   DELETE FROM orders WHERE customer_id = @c;
-- ---------------------------------------------------------------------
DELETE FROM customers WHERE customer_id = @c;    -- no orders left, so this one is allowed
SELECT 'A3 demo customer removed' AS step, COUNT(*) AS customers_left FROM customers WHERE email = 'cascade.demo@mail.test';

-- ---------------------------------------------------------------------
-- Part C: the analyzer tables cascade too (saved_queries -> executions -> plans, table accesses, recommendations)
-- Deleting one saved query removes everything stored about it. Rolled back at the end.
-- ---------------------------------------------------------------------
SET @q = (SELECT query_id FROM saved_queries WHERE label LIKE 'Full scan: orders in March%' LIMIT 1);

SELECT 'C1 before' AS step,
       (SELECT COUNT(*) FROM saved_queries          WHERE query_id = @q) AS saved_queries,
       (SELECT COUNT(*) FROM query_executions       WHERE query_id = @q) AS executions,
       (SELECT COUNT(*) FROM query_plans p JOIN query_executions e ON e.execution_id = p.execution_id WHERE e.query_id = @q) AS plans,
       (SELECT COUNT(*) FROM execution_table_access a JOIN query_executions e ON e.execution_id = a.execution_id WHERE e.query_id = @q) AS table_accesses,
       (SELECT COUNT(*) FROM recommendations        WHERE query_id = @q) AS recommendations;

START TRANSACTION;
DELETE FROM saved_queries WHERE query_id = @q;

SELECT 'C2 after DELETE FROM saved_queries (inside the transaction)' AS step,
       (SELECT COUNT(*) FROM saved_queries          WHERE query_id = @q) AS saved_queries,
       (SELECT COUNT(*) FROM query_executions       WHERE query_id = @q) AS executions,
       (SELECT COUNT(*) FROM query_plans) AS plans_in_whole_table,
       (SELECT COUNT(*) FROM recommendations        WHERE query_id = @q) AS recommendations;

ROLLBACK;

SELECT 'C3 after ROLLBACK (everything is back)' AS step,
       (SELECT COUNT(*) FROM saved_queries          WHERE query_id = @q) AS saved_queries,
       (SELECT COUNT(*) FROM query_executions       WHERE query_id = @q) AS executions,
       (SELECT COUNT(*) FROM recommendations        WHERE query_id = @q) AS recommendations;

-- Show the cascade rules MySQL stores for every foreign key:
SELECT CONSTRAINT_NAME, TABLE_NAME, REFERENCED_TABLE_NAME, DELETE_RULE
FROM information_schema.REFERENTIAL_CONSTRAINTS
WHERE CONSTRAINT_SCHEMA = 'shop_query_analyzer'
ORDER BY TABLE_NAME;
