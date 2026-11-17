-- DEMO 2: users, roles and privileges
-- Run:  SOURCE sql/demo_2.sql;
USE shop_query_analyzer;
SELECT '=== 1. Accounts of the project ===' AS '';
SELECT user, host FROM mysql.user WHERE user LIKE 'qa\_%' AND user NOT LIKE '%\_role';
SELECT '=== 2. qa_app: reads and writes (used by the website to store results) ===' AS '';
SHOW GRANTS FOR 'qa_app'@'localhost' USING 'qa_app_role';
SELECT '=== 3. qa_viewer: read only ===' AS '';
SHOW GRANTS FOR 'qa_viewer'@'localhost' USING 'qa_viewer_role';
SELECT '=== 4. qa_runner: runs the pasted SQL, can read only 4 shop tables ===' AS '';
SHOW GRANTS FOR 'qa_runner'@'localhost' USING 'qa_runner_role';
SELECT '=== To show the difference live: log in as qa_viewer and try  DELETE FROM recommendations;  (denied) ===' AS '';
