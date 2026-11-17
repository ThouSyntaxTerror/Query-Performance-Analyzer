-- =====================================================================
-- 05_presets.sql  -  the preset queries offered by the web page
-- They are stored in saved_queries (is_preset = 1), so the terminal and the web app list the same rows.
-- Run as root (setup only):  mysql -u root -p < sql/05_presets.sql
-- =====================================================================
USE shop_query_analyzer;

CALL sp_save_query('Full scan: orders in March 2024 (no index on order_date)',
  'SELECT COUNT(*) FROM orders WHERE order_date BETWEEN ''2024-03-01'' AND ''2024-03-31''', 1, @id);

CALL sp_save_query('Indexed lookup: one customer''s orders (foreign-key index)',
  'SELECT order_id, order_date, total_amount FROM orders WHERE customer_id = 1234', 1, @id);

CALL sp_save_query('Primary-key lookup: one customer',
  'SELECT * FROM customers WHERE customer_id = 4321', 1, @id);

CALL sp_save_query('Low-selectivity filter: all pending orders',
  'SELECT order_id, customer_id, total_amount FROM orders WHERE status = ''PENDING''', 1, @id);

CALL sp_save_query('Join: orders of Pune customers',
  'SELECT c.name, o.order_id, o.total_amount FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE c.city = ''Pune''', 1, @id);

CALL sp_save_query('Aggregation: revenue per product category',
  'SELECT p.category, SUM(oi.quantity * oi.unit_price) AS revenue FROM order_items oi JOIN products p ON p.product_id = oi.product_id GROUP BY p.category ORDER BY revenue DESC', 1, @id);

CALL sp_save_query('Three-table join: paid items per city',
  'SELECT c.city, COUNT(*) AS items FROM customers c JOIN orders o ON o.customer_id = c.customer_id JOIN order_items oi ON oi.order_id = o.order_id WHERE o.status = ''PAID'' GROUP BY c.city', 1, @id);

CALL sp_save_query('Correlated subquery: orders above the customer average',
  'SELECT o.order_id, o.customer_id, o.total_amount FROM orders o WHERE o.total_amount > (SELECT AVG(o2.total_amount) FROM orders o2 WHERE o2.customer_id = o.customer_id) LIMIT 200', 1, @id);

CALL sp_save_query('CTE: top 5 months by revenue',
  'WITH monthly AS (SELECT DATE_FORMAT(order_date, ''%Y-%m'') AS month, SUM(total_amount) AS revenue FROM orders GROUP BY DATE_FORMAT(order_date, ''%Y-%m'')) SELECT month, revenue FROM monthly ORDER BY revenue DESC LIMIT 5', 1, @id);

CALL sp_save_query('Leading wildcard LIKE (cannot use the email index)',
  'SELECT customer_id, email FROM customers WHERE email LIKE ''%99@mail.test''', 1, @id);

CALL sp_save_query('Prefix LIKE (can use the email index)',
  'SELECT customer_id, email FROM customers WHERE email LIKE ''customer12%''', 1, @id);

SELECT query_id, label FROM saved_queries WHERE is_preset = 1 ORDER BY query_id;
