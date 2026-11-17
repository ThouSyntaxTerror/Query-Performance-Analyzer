-- =====================================================================
-- 12_vector_ops.sql  -  Create / Read / Update / Delete on the vector feature (embedding + cosine similarity)
-- Run as root or qa_app:  SOURCE sql/12_vector_ops.sql;
-- Creates one demonstration query and deletes it again at the end.
-- MySQL 8.0 has no vector type, so an embedding is a JSON array of 30 numbers (see fn_query_embedding).
-- =====================================================================
USE shop_query_analyzer;

-- CREATE: store a new query together with its embedding
CALL sp_save_query('Vector demo: Pune customers',
                   'SELECT name FROM customers WHERE city = ''Pune''', 0, @v);
SELECT query_id, label, JSON_LENGTH(embedding) AS dimensions, LEFT(embedding, 70) AS embedding_start
FROM saved_queries WHERE query_id = @v;

-- READ: the 5 stored queries most similar to it (cosine similarity, computed in MySQL)
SELECT b.query_id, LEFT(b.label, 55) AS label,
       ROUND(fn_cosine_similarity(a.embedding, b.embedding), 3) AS similarity
FROM saved_queries a
JOIN saved_queries b ON b.query_id <> a.query_id
WHERE a.query_id = @v
ORDER BY similarity DESC
LIMIT 5;

-- UPDATE: change the query text, then recompute its hash and embedding so the vector stays correct
SET @new_sql = 'SELECT c.name, COUNT(*) AS orders FROM customers c JOIN orders o ON o.customer_id = c.customer_id WHERE c.city = ''Pune'' GROUP BY c.name';
UPDATE saved_queries
SET sql_text   = @new_sql,
    query_hash = SHA2(LOWER(TRIM(REGEXP_REPLACE(@new_sql, '\\s+', ' '))), 256),
    embedding  = fn_query_embedding(@new_sql)
WHERE query_id = @v;

-- READ again: the neighbours changed because the vector changed (now closest to the join queries)
SELECT b.query_id, LEFT(b.label, 55) AS label,
       ROUND(fn_cosine_similarity(a.embedding, b.embedding), 3) AS similarity
FROM saved_queries a
JOIN saved_queries b ON b.query_id <> a.query_id
WHERE a.query_id = @v
ORDER BY similarity DESC
LIMIT 5;

-- DELETE: remove the demonstration query (its runs, if any, go with it by ON DELETE CASCADE)
DELETE FROM saved_queries WHERE query_id = @v;
SELECT COUNT(*) AS demo_rows_left FROM saved_queries WHERE label = 'Vector demo: Pune customers';
