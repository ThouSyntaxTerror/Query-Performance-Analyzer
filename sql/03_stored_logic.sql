-- =====================================================================
-- 03_stored_logic.sql  -  functions, procedures, triggers, view
-- Run as root (setup only):  mysql -u root -p < sql/03_stored_logic.sql
-- (uses the mysql client's DELIMITER command)
-- =====================================================================
USE shop_query_analyzer;

DELIMITER $$

-- ---------------------------------------------------------------------
-- FUNCTION: how many times does a keyword occur in a text?
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_count_occ(p_text TEXT, p_needle VARCHAR(40))
RETURNS INT
DETERMINISTIC
BEGIN
    RETURN (CHAR_LENGTH(p_text) - CHAR_LENGTH(REPLACE(p_text, p_needle, ''))) DIV CHAR_LENGTH(p_needle);
END$$

-- ---------------------------------------------------------------------
-- FUNCTION: SQL text -> 30 number feature vector (JSON array)
-- Each position counts one SQL construct, table or column (SELECT, JOIN, GROUP BY, 'orders', ...).
-- Similar queries get similar vectors; fn_cosine_similarity() compares them.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_query_embedding(p_sql TEXT)
RETURNS JSON
DETERMINISTIC
BEGIN
    DECLARE s TEXT;
    SET s = LOWER(REGEXP_REPLACE(p_sql, '\\s+', ' '));
    RETURN JSON_ARRAY(
        fn_count_occ(s, 'select'),      fn_count_occ(s, ' join '),     fn_count_occ(s, 'group by'),
        fn_count_occ(s, 'order by'),    fn_count_occ(s, ' limit '),    fn_count_occ(s, ' where '),
        fn_count_occ(s, ' like '),      fn_count_occ(s, ' in ('),      fn_count_occ(s, 'exists'),
        fn_count_occ(s, 'with '),       fn_count_occ(s, 'count('),     fn_count_occ(s, 'sum('),
        fn_count_occ(s, 'avg('),        fn_count_occ(s, 'max('),       fn_count_occ(s, 'distinct'),
        fn_count_occ(s, 'between'),     fn_count_occ(s, 'having'),     fn_count_occ(s, 'union'),
        fn_count_occ(s, 'customers'),   fn_count_occ(s, 'products'),   fn_count_occ(s, 'orders'),
        fn_count_occ(s, 'order_items'), fn_count_occ(s, 'status'),     fn_count_occ(s, 'order_date'),
        fn_count_occ(s, 'customer_id'), fn_count_occ(s, 'category'),   fn_count_occ(s, 'city'),
        fn_count_occ(s, 'email'),       fn_count_occ(s, 'total_amount'), fn_count_occ(s, 'price')
    );
END$$

-- ---------------------------------------------------------------------
-- FUNCTION: cosine similarity of two JSON number arrays (1 = same direction, 0 = unrelated)
-- cos(a,b) = (a . b) / (|a| * |b|), computed in SQL with JSON_TABLE
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_cosine_similarity(p_a JSON, p_b JSON)
RETURNS DOUBLE
DETERMINISTIC
READS SQL DATA
BEGIN
    DECLARE v_dot DOUBLE;
    DECLARE v_na  DOUBLE;
    DECLARE v_nb  DOUBLE;
    SELECT SUM(x.v * y.v), SQRT(SUM(x.v * x.v)), SQRT(SUM(y.v * y.v))
      INTO v_dot, v_na, v_nb
      FROM JSON_TABLE(p_a, '$[*]' COLUMNS (i FOR ORDINALITY, v DOUBLE PATH '$')) AS x
      JOIN JSON_TABLE(p_b, '$[*]' COLUMNS (i FOR ORDINALITY, v DOUBLE PATH '$')) AS y ON x.i = y.i;
    IF v_dot IS NULL OR v_na = 0 OR v_nb = 0 THEN
        RETURN 0;
    END IF;
    RETURN v_dot / (v_na * v_nb);
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE: save a query once (same text = same row) and return its id
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_save_query(
    IN  p_label     VARCHAR(100),
    IN  p_sql       TEXT,
    IN  p_is_preset TINYINT,
    OUT p_query_id  INT UNSIGNED)
BEGIN
    DECLARE v_hash CHAR(64);
    SET v_hash = SHA2(LOWER(TRIM(REGEXP_REPLACE(p_sql, '\\s+', ' '))), 256);
    SET p_query_id = NULL;
    SELECT query_id INTO p_query_id FROM saved_queries WHERE query_hash = v_hash;
    IF p_query_id IS NULL THEN
        INSERT INTO saved_queries (label, sql_text, query_hash, is_preset, embedding)
        VALUES (p_label, TRIM(p_sql), v_hash, p_is_preset, fn_query_embedding(p_sql));
        SET p_query_id = LAST_INSERT_ID();
    END IF;
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE: record one measured run and its raw plan
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_log_execution(
    IN  p_query_id      INT UNSIGNED,
    IN  p_duration_ms   DECIMAL(12,3),
    IN  p_rows_returned BIGINT UNSIGNED,
    IN  p_rows_examined BIGINT UNSIGNED,
    IN  p_est_cost      DECIMAL(16,2),
    IN  p_est_rows      BIGINT UNSIGNED,
    IN  p_note          VARCHAR(100),
    IN  p_plan_text     MEDIUMTEXT,
    IN  p_plan_json     JSON,
    IN  p_version       VARCHAR(30),
    OUT p_execution_id  BIGINT UNSIGNED)
BEGIN
    INSERT INTO query_executions
        (query_id, duration_ms, rows_returned, rows_examined, estimated_cost, estimated_rows, run_note)
    VALUES
        (p_query_id, p_duration_ms, p_rows_returned, p_rows_examined, p_est_cost, p_est_rows, p_note);
    SET p_execution_id = LAST_INSERT_ID();
    INSERT INTO query_plans (execution_id, plan_text, plan_json, server_version)
    VALUES (p_execution_id, p_plan_text, p_plan_json, p_version);
END$$

-- ---------------------------------------------------------------------
-- PROCEDURE: compare two runs side by side (B relative to A)
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_compare_executions(IN p_run_a BIGINT UNSIGNED, IN p_run_b BIGINT UNSIGNED)
BEGIN
    SELECT a.execution_id AS run_a, b.execution_id AS run_b,
           a.duration_ms AS ms_a, b.duration_ms AS ms_b,
           ROUND(100 * (b.duration_ms - a.duration_ms) / NULLIF(a.duration_ms, 0), 1) AS ms_change_pct,
           a.rows_examined AS examined_a, b.rows_examined AS examined_b,
           ROUND(100 * (CAST(b.rows_examined AS SIGNED) - CAST(a.rows_examined AS SIGNED)) / NULLIF(a.rows_examined, 0), 1) AS examined_change_pct,
           a.rows_returned AS returned_a, b.rows_returned AS returned_b
    FROM query_executions a
    JOIN query_executions b ON b.execution_id = p_run_b
    WHERE a.execution_id = p_run_a;
END$$

-- ---------------------------------------------------------------------
-- VIEW + PROCEDURE: which queries deserve attention first?
-- priority = total time spent = runs x average time (repeated AND costly)
-- ---------------------------------------------------------------------
CREATE VIEW v_workload_priority AS
SELECT RANK() OVER (ORDER BY SUM(e.duration_ms) DESC)           AS priority_rank,
       q.query_id,
       q.label,
       COUNT(*)                                                  AS runs,
       ROUND(AVG(e.duration_ms), 3)                              AS avg_ms,
       ROUND(SUM(e.duration_ms), 3)                              AS total_ms,
       ROUND(100 * SUM(e.duration_ms) / SUM(SUM(e.duration_ms)) OVER (), 1) AS pct_of_workload,
       SUM(e.rows_examined)                                      AS rows_examined,
       SUM(e.rows_returned)                                      AS rows_returned,
       ROUND(SUM(e.rows_examined) / NULLIF(SUM(e.rows_returned), 0), 1) AS examined_per_returned
FROM saved_queries q
JOIN query_executions e ON e.query_id = q.query_id
GROUP BY q.query_id, q.label$$

CREATE PROCEDURE sp_workload_priority(IN p_limit INT)
BEGIN
    SELECT * FROM v_workload_priority ORDER BY priority_rank, query_id LIMIT p_limit;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 1: after a run is stored, flag inefficient or slow runs
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_exec_after_insert
AFTER INSERT ON query_executions
FOR EACH ROW
BEGIN
    IF NEW.rows_examined >= 1000 AND NEW.rows_examined >= 20 * GREATEST(NEW.rows_returned, 1) THEN
        INSERT IGNORE INTO recommendations (query_id, execution_id, suggestion, severity)
        VALUES (NEW.query_id, NEW.execution_id,
                'Reads at least 20 rows for every row it returns: use an index on the filter columns or narrow the filter',
                IF(NEW.rows_examined >= 50000, 'HIGH', 'MEDIUM'));
    END IF;
    IF NEW.duration_ms >= 100 THEN
        INSERT IGNORE INTO recommendations (query_id, execution_id, suggestion, severity)
        VALUES (NEW.query_id, NEW.execution_id,
                'Measured run time is 100 ms or more: review the plan, joins and filters',
                IF(NEW.duration_ms >= 500, 'HIGH', 'MEDIUM'));
    END IF;
END$$

-- ---------------------------------------------------------------------
-- TRIGGER 2: after a table access is stored, flag large full table scans
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_access_after_insert
AFTER INSERT ON execution_table_access
FOR EACH ROW
BEGIN
    IF NEW.access_method = 'Table scan' AND NEW.rows_examined >= 5000 THEN
        INSERT IGNORE INTO recommendations (query_id, execution_id, suggestion, severity)
        SELECT e.query_id, NEW.execution_id,
               CONCAT('Full table scan on ', NEW.table_name,
                      IF(NEW.filter_condition IS NULL,
                         ' with no filter: select fewer rows/columns or paginate',
                         CONCAT(' filtered by ', LEFT(NEW.filter_condition, 120),
                                ': consider an index on the filtered column(s)'))),
               IF(NEW.rows_examined >= 50000, 'HIGH', 'MEDIUM')
        FROM query_executions e
        WHERE e.execution_id = NEW.execution_id;
    END IF;
END$$

DELIMITER ;
