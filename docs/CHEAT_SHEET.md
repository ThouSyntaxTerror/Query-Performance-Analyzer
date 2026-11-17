# Presentation cheat sheet (one page)

## The pitch (say this first, 20 seconds)
"A spell-checker for SQL. You paste a query, it runs it on a real MySQL database, gives it a score out of 100, and tells you what to change, for example the exact index to create. Everything it measures is saved in MySQL, so I can also show the data in the database itself."

## Set up (before the audience arrives)
Terminal 1, website:
```bash
cd "C:\Users\athar\OneDrive\Desktop\dhjhg\dbms\mini project\mysql-query-analyzer"
npm run dev
```
Open http://localhost:3200

Terminal 2, MySQL (type the password at the prompt):
```bash
cd "C:\Users\athar\OneDrive\Desktop\dhjhg\dbms\mini project\mysql-query-analyzer"
& "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p
```

## Part A: the website (3 minutes). Paste, press ANALYZE, read the score.

| Paste this | What to point at |
|---|---|
| `SELECT order_id, order_date, total_amount FROM orders WHERE customer_id = 1234` | 100, GOOD: an index finds the 10 rows directly |
| `SELECT COUNT(*) FROM orders WHERE order_date BETWEEN '2024-03-01' AND '2024-03-31'` | About 45 to 50: 50,000 rows read, 2,123 kept, and it suggests `CREATE INDEX idx_orders_order_date ON orders (order_date);` |
| `SELECT COUNT(*) FROM orders WHERE DATE_FORMAT(order_date, '%Y-%m') = '2024-03'` | Same rows wasted, but the advice is different: do not wrap the column in a function |

Under the score: **Why this score**, **Suggested changes**, then **Analysis** (four scores, access type, totals).

## Part B: MySQL terminal. Type these (short, no script files).

**1. Tables and constraints**
```sql
USE shop_query_analyzer;
SHOW TABLES;
SELECT * FROM customers LIMIT 5;
SHOW CREATE TABLE orders\G
```

**2. Join**
```sql
SELECT c.name, o.order_id, o.total_amount FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE c.city = 'Pune' LIMIT 5;
```

**2b. GROUP BY with HAVING**
```sql
SELECT q.label, COUNT(*) AS runs, ROUND(AVG(e.duration_ms), 2) AS avg_ms, SUM(e.rows_examined) AS rows_examined FROM saved_queries q JOIN query_executions e ON e.query_id = q.query_id GROUP BY q.query_id, q.label HAVING COUNT(*) >= 5 ORDER BY runs DESC;
```
Say: "WHERE filters rows before grouping; HAVING filters the groups: only queries run at least 5 times."

**3. Trigger: show it, then make it fire** (capital G)
```sql
SHOW TRIGGERS\G
START TRANSACTION;
INSERT INTO query_executions (query_id, duration_ms, rows_returned, rows_examined) VALUES (2, 120, 1, 60000);
SELECT severity, suggestion FROM recommendations WHERE query_id = 2;
ROLLBACK;
```
Say: "I inserted one row; MySQL wrote those recommendations by itself."

**4. Cascade** (everything is rolled back)
```sql
START TRANSACTION;
SELECT COUNT(*) FROM query_executions WHERE query_id = 1;
DELETE FROM saved_queries WHERE query_id = 1;
SELECT COUNT(*) FROM query_executions WHERE query_id = 1;
ROLLBACK;
```
Say: "Deleting the query deleted its runs, plans and recommendations: ON DELETE CASCADE."

**5. Users and privileges**
```sql
SHOW GRANTS FOR 'qa_app'@'localhost' USING 'qa_app_role';
SHOW GRANTS FOR 'qa_viewer'@'localhost' USING 'qa_viewer_role';
```

**6. Insert, update, delete, select**
```sql
INSERT INTO customers (name, email, city, signup_date) VALUES ('Demo', 'demo@mail.test', 'Pune', CURDATE());
SELECT customer_id, name, city FROM customers WHERE email = 'demo@mail.test';
UPDATE customers SET city = 'Mumbai' WHERE email = 'demo@mail.test';
DELETE FROM customers WHERE email = 'demo@mail.test';
```

**7. NoSQL (MongoDB): open a third PowerShell window and type `mongosh`**
```js
use shop_query_analyzer_docs
db.plans.countDocuments()
db.plans.findOne({ execution_id: 1 }, { label: 1, rating: 1, tables: 1, _id: 0 })
db.plans.aggregate([{ $unwind: '$tables' }, { $match: { 'tables.type': 'ALL' } }, { $group: { _id: '$tables.table', scans: { $sum: 1 } } }, { $sort: { scans: -1 } }])
db.plans.distinct('label', { $text: { $search: 'wildcard' } })
db.plans.getIndexes().map(i => i.name)
```
Say: "Each analysed run is also saved in MongoDB as one nested document, same execution id as in MySQL. MySQL keeps the related, constrained data; MongoDB keeps the whole run as a document. The aggregation counts full table scans per table."

Create, update, delete a document:
```js
db.plans.insertOne({ demo: true, label: 'demo document' })
db.plans.updateOne({ demo: true }, { $set: { note: 'edited' } })
db.plans.deleteOne({ demo: true })
```

**8. Vector (back in the MySQL window)**
```sql
SELECT query_id, JSON_LENGTH(embedding) AS dimensions, embedding FROM saved_queries WHERE query_id = 5;
SELECT b.label, ROUND(fn_cosine_similarity(a.embedding, b.embedding), 3) AS similarity FROM saved_queries a JOIN saved_queries b ON b.query_id <> a.query_id WHERE a.query_id = 5 ORDER BY similarity DESC LIMIT 3;
```
Say: "Each query is a 30-number vector. Cosine similarity finds queries shaped alike."

(The `sql/demo_*.sql` files do the same thing in one command each; keep them as a backup only.)

## Part C: the index fix (2 minutes). Three commands, then clean up.
1. Website: run the March query (score about 45 to 50).
2. Terminal:
```sql
CREATE INDEX idx_orders_order_date ON orders (order_date);
ANALYZE TABLE orders;
```
3. Website: run the March query again (score about 100, about 2,123 rows read).
4. **Always clean up:**
```sql
DROP INDEX idx_orders_order_date ON orders;
ANALYZE TABLE orders;
```

## If asked
- **Are the numbers real?** Yes: MySQL's `EXPLAIN ANALYZE` runs the query and counts time and rows.
- **Why a shop database?** It is the test database the analyzer examines: realistic joins, filters and 205,000 rows.
- **Is it safe to paste any SQL?** One SELECT only; the account used can read four tables and nothing else; read-only with a 5 second limit.
- **How is the score made?** Starts at 100, loses points for slow time, rows read and thrown away, full scans, `SELECT *`, correlated subqueries, no `LIMIT` (section 6b of the report).
