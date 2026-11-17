-- =====================================================================
-- 04_permissions.sql  -  roles and GRANTs (two or more accounts with different privileges)
-- Run as root (setup only) AFTER the three accounts exist.
-- scripts/setup.mjs creates the accounts with generated passwords. To create them by hand:
--   CREATE USER 'qa_app'@'localhost'    IDENTIFIED BY '<choose a password>';
--   CREATE USER 'qa_viewer'@'localhost' IDENTIFIED BY '<choose a password>';
--   CREATE USER 'qa_runner'@'localhost' IDENTIFIED BY '<choose a password>' WITH MAX_USER_CONNECTIONS 5;
-- =====================================================================

CREATE ROLE IF NOT EXISTS 'qa_app_role', 'qa_viewer_role', 'qa_runner_role';

-- qa_app_role : the web app's account. Reads and writes every project table, may call the stored procedures.
GRANT SELECT, INSERT, UPDATE, DELETE ON shop_query_analyzer.* TO 'qa_app_role';
GRANT EXECUTE ON shop_query_analyzer.* TO 'qa_app_role';

-- qa_viewer_role : read-only account (reports, demos). SELECT plus the one function it needs for similarity queries.
GRANT SELECT ON shop_query_analyzer.* TO 'qa_viewer_role';
GRANT EXECUTE ON FUNCTION shop_query_analyzer.fn_cosine_similarity TO 'qa_viewer_role';

-- qa_runner_role : executes the user's custom SQL. SELECT on the four shop tables and NOTHING else:
-- no analyzer tables, no writes, no DDL, no procedures.
GRANT SELECT ON shop_query_analyzer.customers   TO 'qa_runner_role';
GRANT SELECT ON shop_query_analyzer.products    TO 'qa_runner_role';
GRANT SELECT ON shop_query_analyzer.orders      TO 'qa_runner_role';
GRANT SELECT ON shop_query_analyzer.order_items TO 'qa_runner_role';

GRANT 'qa_app_role'    TO 'qa_app'@'localhost';
GRANT 'qa_viewer_role' TO 'qa_viewer'@'localhost';
GRANT 'qa_runner_role' TO 'qa_runner'@'localhost';

-- roles must be active at login, so make them the default role of each account
SET DEFAULT ROLE ALL TO 'qa_app'@'localhost', 'qa_viewer'@'localhost', 'qa_runner'@'localhost';

FLUSH PRIVILEGES;
