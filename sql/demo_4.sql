-- DEMO 4: insert / select / update / delete, then foreign keys and cascading deletes
-- Run:  SOURCE sql/demo_4.sql;
SELECT '=== 1. INSERT, SELECT, UPDATE, DELETE on a demo customer ===' AS '';
SOURCE sql/10_crud_demo.sql;
SELECT '=== 2. Foreign keys: CASCADE and RESTRICT ===' AS '';
SOURCE sql/11_cascade_demo.sql;
