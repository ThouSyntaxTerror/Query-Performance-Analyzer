-- =====================================================================
-- 10_crud_demo.sql  -  INSERT / SELECT / UPDATE / DELETE on a demonstration customer
-- Run as root or qa_app:  SOURCE sql/10_crud_demo.sql;
-- The demo row has a unique email and no orders, and the DELETE targets exactly that email.
-- =====================================================================
USE shop_query_analyzer;

-- INSERT
INSERT INTO customers (name, email, city, signup_date)
VALUES ('Demo Customer', 'demo.customer@mail.test', 'Pune', CURDATE());

-- SELECT
SELECT customer_id, name, email, city, signup_date
FROM customers WHERE email = 'demo.customer@mail.test';

-- UPDATE
UPDATE customers SET city = 'Mumbai' WHERE email = 'demo.customer@mail.test';
SELECT customer_id, name, city FROM customers WHERE email = 'demo.customer@mail.test';

-- DELETE
DELETE FROM customers WHERE email = 'demo.customer@mail.test';
SELECT COUNT(*) AS rows_left FROM customers WHERE email = 'demo.customer@mail.test';

-- Constraint demonstrations (each statement is expected to FAIL; run them one at a time):
--   INSERT INTO products (name, category, price, stock) VALUES ('Bad', 'Toys', -5, 1);   -- chk_products_price
--   INSERT INTO orders (customer_id, order_date, total_amount) VALUES (999999, CURDATE(), 10);  -- fk_orders_customer
--   DELETE FROM customers WHERE customer_id = 1;                                          -- fk_orders_customer (RESTRICT)
