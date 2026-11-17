-- =====================================================================
-- 06_three_queries.sql  -  the three project queries for the marking demo
-- Run in the mysql client:  USE shop_query_analyzer;  SOURCE sql/06_three_queries.sql;
-- They read what the web app has stored, so run some analyses on the page first
-- (or run:  npm run warmup).
-- =====================================================================
USE shop_query_analyzer;

-- ---------------------------------------------------------------------
-- Q1  Which queries should be fixed first?   (join + GROUP BY + window functions)
-- Priority = total time spent = how often a query runs x how long it takes.
-- A 1 ms query run 10,000 times can matter more than a 2 s query run once.
-- ---------------------------------------------------------------------
SELECT RANK() OVER (ORDER BY SUM(e.duration_ms) DESC)                       AS priority_rank,
       q.query_id,
       q.label,
       COUNT(*)                                                              AS runs,
       ROUND(AVG(e.duration_ms), 3)                                          AS avg_ms,
       ROUND(SUM(e.duration_ms), 3)                                          AS total_ms,
       ROUND(100 * SUM(e.duration_ms) / SUM(SUM(e.duration_ms)) OVER (), 1)  AS pct_of_workload,
       SUM(e.rows_examined)                                                  AS rows_examined,
       SUM(e.rows_returned)                                                  AS rows_returned
FROM saved_queries q
JOIN query_executions e ON e.query_id = q.query_id
GROUP BY q.query_id, q.label
ORDER BY total_ms DESC
LIMIT 10;

-- ---------------------------------------------------------------------
-- Q2  For each query, which table did its latest run read the most?   (two correlated subqueries)
-- Shows where full table scans happen and how many rows were read versus kept.
-- ---------------------------------------------------------------------
SELECT q.label,
       a.table_name,
       a.access_method,
       a.index_name,
       a.rows_examined,
       a.rows_kept
FROM saved_queries q
JOIN query_executions e
  ON e.query_id = q.query_id
 AND e.execution_id = (SELECT MAX(e2.execution_id)
                       FROM query_executions e2
                       WHERE e2.query_id = q.query_id)
JOIN execution_table_access a
  ON a.execution_id = e.execution_id
 AND a.rows_examined = (SELECT MAX(a2.rows_examined)
                        FROM execution_table_access a2
                        WHERE a2.execution_id = e.execution_id)
ORDER BY a.rows_examined DESC;

-- ---------------------------------------------------------------------
-- Q3  Which stored queries are most similar to a chosen one?   (cosine similarity, implemented in MySQL)
-- fn_cosine_similarity() compares the feature vectors built by fn_query_embedding().
-- ---------------------------------------------------------------------
SELECT b.query_id,
       b.label,
       ROUND(fn_cosine_similarity(a.embedding, b.embedding), 3) AS similarity,
       (SELECT ROUND(AVG(e.duration_ms), 3)
        FROM query_executions e WHERE e.query_id = b.query_id)   AS avg_ms
FROM saved_queries a
JOIN saved_queries b ON b.query_id <> a.query_id
WHERE a.label LIKE 'Join: orders of Pune%'
ORDER BY similarity DESC
LIMIT 5;
