-- =====================================================================
-- 02_seed.sql  -  deterministic sample data (no RAND(): same rows every time)
-- 5,000 customers, 500 products, 50,000 orders, 150,000 order items.
-- Run as root (setup only):  mysql -u root -p < sql/02_seed.sql
-- =====================================================================
USE shop_query_analyzer;
SET SESSION cte_max_recursion_depth = 200000;

INSERT INTO customers (name, email, city, signup_date)
WITH RECURSIVE seq AS (
    SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 5000
)
SELECT CONCAT('Customer ', n),
       CONCAT('customer', n, '@mail.test'),
       ELT(1 + n % 8, 'Bengaluru','Mumbai','Delhi','Pune','Chennai','Hyderabad','Kolkata','Ahmedabad'),
       DATE_ADD('2022-01-01', INTERVAL (n * 7) % 1000 DAY)
FROM seq;

INSERT INTO products (name, category, price, stock)
WITH RECURSIVE seq AS (
    SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 500
)
SELECT CONCAT('Product ', n),
       ELT(1 + n % 6, 'Books','Electronics','Home','Toys','Fashion','Sports'),
       ROUND(5 + (n * 37) % 995 + (n % 100) / 100, 2),
       (n * 13) % 200
FROM seq;

INSERT INTO orders (customer_id, order_date, status, total_amount)
WITH RECURSIVE seq AS (
    SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 50000
)
SELECT 1 + (n * 7919) % 5000,
       DATE_ADD('2023-01-01', INTERVAL (n * 13) % 730 DAY),
       ELT(1 + (n * 3) % 4, 'PENDING','PAID','SHIPPED','CANCELLED'),
       ROUND(10 + (n * 17) % 990 + (n % 100) / 100, 2)
FROM seq;

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
WITH RECURSIVE seq AS (
    SELECT 1 AS n UNION ALL SELECT n + 1 FROM seq WHERE n < 150000
)
SELECT 1 + (s.n - 1) % 50000, p.product_id, 1 + s.n % 5, p.price
FROM seq s
JOIN products p ON p.product_id = 1 + (s.n * 31) % 500;

-- refresh optimizer statistics so plan estimates are realistic
ANALYZE TABLE customers, products, orders, order_items;
