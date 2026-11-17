-- DEMO 5: the NoSQL / vector part (JSON documents and cosine similarity), with create/read/update/delete
-- Run:  SOURCE sql/demo_5.sql;
USE shop_query_analyzer;
SELECT '=== 1. Execution plans are stored as JSON documents and queried with JSON functions ===' AS '';
SELECT execution_id, JSON_LENGTH(plan_json) AS plan_steps,
       JSON_UNQUOTE(JSON_EXTRACT(plan_json, '$[0].description')) AS root_step,
       JSON_EXTRACT(plan_json, '$[0].measured.endMs') AS root_ms
FROM query_plans ORDER BY execution_id LIMIT 3;
SELECT '=== 2. How many stored plans contain a full table scan? ===' AS '';
SELECT COUNT(*) AS plans_with_table_scan
FROM query_plans WHERE JSON_SEARCH(plan_json, 'one', 'Table scan on%', NULL, '$[*].description') IS NOT NULL;
SELECT '=== 3. Each query has a 30 number embedding (JSON array) ===' AS '';
SELECT query_id, JSON_LENGTH(embedding) AS dimensions, LEFT(embedding, 40) AS start_of_embedding FROM saved_queries LIMIT 3;
SELECT '=== 4. Create, read (cosine similarity), update and delete on the vector feature ===' AS '';
SOURCE sql/12_vector_ops.sql;
