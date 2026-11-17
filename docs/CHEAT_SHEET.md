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

## Part B: MySQL terminal. Six commands, each prints its own headings.
```sql
SOURCE sql/demo_1.sql;
```
Tables, constraints (`SHOW CREATE TABLE`), row counts, and the newest rows are the queries you just ran on the website. **Say: "same database as the website."**

```sql
SOURCE sql/demo_2.sql;
```
Three accounts with different privileges. **Say: "the website's runner account can only read four tables."**

```sql
SOURCE sql/demo_3.sql;
```
Triggers, functions, procedures, the recommendations the triggers created, and the three queries (priority ranking, table hotspots, cosine similarity).

```sql
SOURCE sql/demo_4.sql;
```
Insert, select, update, delete, then cascade and restrict on foreign keys.

```sql
SOURCE sql/demo_5.sql;
```
JSON plans queried with `JSON_EXTRACT`, embeddings, and create/read/update/delete with cosine similarity.

```sql
SOURCE sql/demo_6.sql;
```
**Triggers firing live and joins.** It shows the trigger code, inserts a test run that reads 60,000 rows to return 1, and the recommendation rows appear by themselves (two triggers fire); then `ROLLBACK` removes everything. Then an inner join, a left join, a three-table join with `GROUP BY`, and a join on a view. **Say: "I never wrote those recommendations; the trigger did."**

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
