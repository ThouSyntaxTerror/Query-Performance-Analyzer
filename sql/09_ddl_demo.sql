-- =====================================================================
-- 09_ddl_demo.sql  -  safe CREATE TABLE / ALTER TABLE / DROP TABLE demonstration
-- Run as root:  SOURCE sql/09_ddl_demo.sql;
-- Works only on a new scratch table called demo_scratch. DROP TABLE below names that table
-- explicitly; nothing else is touched. DDL is auto-committed, so cleanup is explicit.
-- =====================================================================
USE shop_query_analyzer;

-- CREATE TABLE (refuses to run if demo_scratch already exists, so it can never overwrite anything)
CREATE TABLE demo_scratch (
    demo_id    INT UNSIGNED NOT NULL AUTO_INCREMENT,
    note       VARCHAR(50)  NOT NULL,
    created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (demo_id)
) ENGINE = InnoDB;

INSERT INTO demo_scratch (note) VALUES ('first row'), ('second row');
SHOW CREATE TABLE demo_scratch\G

-- ALTER TABLE: add a column with a constraint, then an index
ALTER TABLE demo_scratch
    ADD COLUMN priority TINYINT UNSIGNED NOT NULL DEFAULT 1,
    ADD CONSTRAINT chk_demo_priority CHECK (priority BETWEEN 1 AND 5);
ALTER TABLE demo_scratch ADD INDEX idx_demo_note (note);
SHOW CREATE TABLE demo_scratch\G

-- the constraint at work: this INSERT is rejected (priority 9 is outside 1..5)
-- INSERT INTO demo_scratch (note, priority) VALUES ('bad', 9);

-- DROP TABLE (only the scratch table)
DROP TABLE demo_scratch;
SHOW TABLES LIKE 'demo_scratch';
