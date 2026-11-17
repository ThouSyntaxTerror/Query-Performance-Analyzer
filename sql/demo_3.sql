-- DEMO 3: stored logic (function, procedures, triggers, view) and the three queries
-- Run:  SOURCE sql/demo_3.sql;
USE shop_query_analyzer;
SELECT '=== 1. Triggers: fire automatically when a run or a table access is stored ===' AS '';
SELECT TRIGGER_NAME, EVENT_MANIPULATION AS event, EVENT_OBJECT_TABLE AS on_table, ACTION_TIMING AS timing
FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'shop_query_analyzer';
SELECT '=== 2. Functions and procedures ===' AS '';
SELECT ROUTINE_TYPE AS type, ROUTINE_NAME AS name FROM information_schema.ROUTINES
WHERE ROUTINE_SCHEMA = 'shop_query_analyzer' ORDER BY ROUTINE_TYPE, ROUTINE_NAME;
SELECT '=== 3. Recommendations created by the triggers (nobody typed these) ===' AS '';
SELECT rec_id, severity, LEFT(suggestion, 90) AS suggestion FROM recommendations ORDER BY rec_id DESC LIMIT 4;
SELECT '=== 4. Procedure: which queries to fix first ===' AS '';
CALL sp_workload_priority(5);
SELECT '=== 5. The three project queries ===' AS '';
SOURCE sql/06_three_queries.sql;
