-- =====================================================================
-- 01_schema.sql  -  Shop Query Analyzer, MySQL 8.0
-- Creates the project database and all tables (DDL with constraints).
-- Run as root (setup only):  mysql -u root -p < sql/01_schema.sql
-- Safe by design: CREATE DATABASE has no IF NOT EXISTS and no DROP anywhere,
-- so it fails instead of touching an existing database of the same name.
-- =====================================================================
CREATE DATABASE shop_query_analyzer
    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE shop_query_analyzer;

-- ---------------------------------------------------------------------
-- Part A: the shop data that analysed queries run against
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    customer_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name         VARCHAR(60)   NOT NULL,
    email        VARCHAR(100)  NOT NULL,
    city         VARCHAR(30)   NOT NULL,
    signup_date  DATE          NOT NULL,
    PRIMARY KEY (customer_id),
    UNIQUE KEY uq_customers_email (email)
) ENGINE = InnoDB;

CREATE TABLE products (
    product_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name        VARCHAR(80)   NOT NULL,
    category    VARCHAR(20)   NOT NULL,
    price       DECIMAL(8,2)  NOT NULL,
    stock       INT           NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id),
    CONSTRAINT chk_products_price CHECK (price > 0),
    CONSTRAINT chk_products_stock CHECK (stock >= 0)
) ENGINE = InnoDB;

-- InnoDB automatically creates an index for the foreign key customer_id.
-- order_date, status and total_amount are deliberately NOT indexed, so
-- filtering on them gives real full table scans to analyse.
CREATE TABLE orders (
    order_id      INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    customer_id   INT UNSIGNED  NOT NULL,
    order_date    DATE          NOT NULL,
    status        ENUM('PENDING','PAID','SHIPPED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    total_amount  DECIMAL(10,2) NOT NULL,
    PRIMARY KEY (order_id),
    CONSTRAINT fk_orders_customer FOREIGN KEY (customer_id)
        REFERENCES customers (customer_id) ON DELETE RESTRICT,
    CONSTRAINT chk_orders_total CHECK (total_amount >= 0)
) ENGINE = InnoDB;

CREATE TABLE order_items (
    item_id     INT UNSIGNED       NOT NULL AUTO_INCREMENT,
    order_id    INT UNSIGNED       NOT NULL,
    product_id  INT UNSIGNED       NOT NULL,
    quantity    SMALLINT UNSIGNED  NOT NULL,
    unit_price  DECIMAL(8,2)       NOT NULL,
    PRIMARY KEY (item_id),
    CONSTRAINT fk_items_order   FOREIGN KEY (order_id)   REFERENCES orders (order_id)     ON DELETE CASCADE,
    CONSTRAINT fk_items_product FOREIGN KEY (product_id) REFERENCES products (product_id) ON DELETE RESTRICT,
    CONSTRAINT chk_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_items_price    CHECK (unit_price > 0)
) ENGINE = InnoDB;

-- ---------------------------------------------------------------------
-- Part B: the analyzer's own tables (what the web app reads and writes)
-- ---------------------------------------------------------------------

-- One row per distinct query text (preset or custom).
-- embedding = feature vector (JSON array) built by fn_query_embedding(); used for cosine similarity.
CREATE TABLE saved_queries (
    query_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    label       VARCHAR(100)  NOT NULL,
    sql_text    TEXT          NOT NULL,
    query_hash  CHAR(64)      NOT NULL,
    is_preset   TINYINT(1)    NOT NULL DEFAULT 0,
    embedding   JSON          NOT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (query_id),
    UNIQUE KEY uq_saved_queries_hash (query_hash),
    CONSTRAINT chk_saved_queries_preset CHECK (is_preset IN (0, 1))
) ENGINE = InnoDB;

-- One row per run. duration/rows_* are MEASURED by EXPLAIN ANALYZE; estimated_* are optimizer ESTIMATES.
CREATE TABLE query_executions (
    execution_id    BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    query_id        INT UNSIGNED     NOT NULL,
    executed_at     TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    duration_ms     DECIMAL(12,3)    NOT NULL,
    rows_returned   BIGINT UNSIGNED  NOT NULL,
    rows_examined   BIGINT UNSIGNED  NOT NULL,
    estimated_cost  DECIMAL(16,2)    NULL,
    estimated_rows  BIGINT UNSIGNED  NULL,
    run_note        VARCHAR(100)     NULL,
    PRIMARY KEY (execution_id),
    KEY idx_exec_query_time (query_id, executed_at),
    CONSTRAINT fk_exec_query FOREIGN KEY (query_id)
        REFERENCES saved_queries (query_id) ON DELETE CASCADE,
    CONSTRAINT chk_exec_duration CHECK (duration_ms >= 0)
) ENGINE = InnoDB;

-- The actual MySQL EXPLAIN ANALYZE text (plan_text) and its parsed form (plan_json), 1:1 with an execution.
CREATE TABLE query_plans (
    plan_id         BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    execution_id    BIGINT UNSIGNED  NOT NULL,
    plan_text       MEDIUMTEXT       NOT NULL,
    plan_json       JSON             NOT NULL,
    server_version  VARCHAR(30)      NOT NULL,
    PRIMARY KEY (plan_id),
    UNIQUE KEY uq_plans_execution (execution_id),
    CONSTRAINT fk_plans_execution FOREIGN KEY (execution_id)
        REFERENCES query_executions (execution_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- One row per table access found in a plan: how MySQL reached the table and how many rows it read.
CREATE TABLE execution_table_access (
    access_id        BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    execution_id     BIGINT UNSIGNED  NOT NULL,
    table_name       VARCHAR(64)      NOT NULL,
    table_alias      VARCHAR(64)      NULL,
    access_method    VARCHAR(40)      NOT NULL,
    index_name       VARCHAR(64)      NULL,
    index_condition  VARCHAR(400)     NULL,
    filter_condition VARCHAR(600)     NULL,
    estimated_rows   BIGINT UNSIGNED  NULL,
    rows_examined    BIGINT UNSIGNED  NOT NULL,
    rows_kept        BIGINT UNSIGNED  NULL,
    loops            BIGINT UNSIGNED  NOT NULL DEFAULT 1,
    explanation      TEXT             NOT NULL,
    PRIMARY KEY (access_id),
    KEY idx_access_execution (execution_id),
    KEY idx_access_table_method (table_name, access_method),
    CONSTRAINT fk_access_execution FOREIGN KEY (execution_id)
        REFERENCES query_executions (execution_id) ON DELETE CASCADE
) ENGINE = InnoDB;

-- Advice created by triggers (and visible in the web app). UNIQUE key stops duplicate advice.
CREATE TABLE recommendations (
    rec_id        BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
    query_id      INT UNSIGNED     NOT NULL,
    execution_id  BIGINT UNSIGNED  NULL,
    suggestion    VARCHAR(255)     NOT NULL,
    severity      ENUM('LOW','MEDIUM','HIGH')           NOT NULL,
    status        ENUM('OPEN','APPLIED','DISMISSED')    NOT NULL DEFAULT 'OPEN',
    created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (rec_id),
    UNIQUE KEY uq_recommendation (query_id, suggestion),
    CONSTRAINT fk_rec_query FOREIGN KEY (query_id)
        REFERENCES saved_queries (query_id) ON DELETE CASCADE
) ENGINE = InnoDB;
