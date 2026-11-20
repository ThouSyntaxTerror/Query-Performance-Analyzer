-- =====================================================================
-- 01_schema.sql  -  Placement Portal, MySQL 8.0
-- Creates the database and all tables. CREATE DATABASE has no IF NOT EXISTS and nothing is dropped,
-- so this fails instead of touching an existing database of the same name.
-- Run as root (setup only):  mysql -u root -p < sql/01_schema.sql
-- =====================================================================
CREATE DATABASE placement_portal CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE placement_portal;

-- Login accounts of the portal (passwords are bcrypt hashes, never plain text)
CREATE TABLE users (
    user_id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    username       VARCHAR(40)   NOT NULL,
    password_hash  VARCHAR(100)  NOT NULL,
    role           ENUM('admin','student') NOT NULL,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_username (username)
) ENGINE = InnoDB;

CREATE TABLE students (
    student_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    user_id          INT UNSIGNED  NOT NULL,
    full_name        VARCHAR(80)   NOT NULL,
    email            VARCHAR(100)  NOT NULL,
    branch           VARCHAR(30)   NOT NULL,
    cgpa             DECIMAL(3,2)  NOT NULL,
    graduation_year  SMALLINT      NOT NULL,
    resume_text      TEXT          NOT NULL,
    embedding        JSON          NULL,                 -- skill vector, maintained by a trigger
    created_by       INT UNSIGNED  NOT NULL,             -- WHO inserted this row
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (student_id),
    UNIQUE KEY uq_students_user (user_id),
    UNIQUE KEY uq_students_email (email),
    CONSTRAINT fk_students_user    FOREIGN KEY (user_id)    REFERENCES users (user_id) ON DELETE CASCADE,
    CONSTRAINT fk_students_creator FOREIGN KEY (created_by) REFERENCES users (user_id),
    CONSTRAINT chk_students_cgpa   CHECK (cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_students_year   CHECK (graduation_year BETWEEN 2020 AND 2035)
) ENGINE = InnoDB;

CREATE TABLE companies (
    company_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name        VARCHAR(80)   NOT NULL,
    industry    VARCHAR(40)   NOT NULL,
    location    VARCHAR(40)   NOT NULL,
    website     VARCHAR(100)  NULL,
    created_by  INT UNSIGNED  NOT NULL,
    created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (company_id),
    UNIQUE KEY uq_companies_name (name),
    CONSTRAINT fk_companies_creator FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE = InnoDB;

CREATE TABLE jobs (
    job_id       INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    company_id   INT UNSIGNED  NOT NULL,
    title        VARCHAR(80)   NOT NULL,
    description  TEXT          NOT NULL,
    min_cgpa     DECIMAL(3,2)  NOT NULL DEFAULT 0,
    vacancies    INT           NOT NULL,
    package_lpa  DECIMAL(5,2)  NOT NULL,
    deadline     DATE          NOT NULL,
    status       ENUM('OPEN','CLOSED') NOT NULL DEFAULT 'OPEN',
    embedding    JSON          NULL,                     -- skill vector, maintained by a trigger
    created_by   INT UNSIGNED  NOT NULL,
    created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (job_id),
    KEY idx_jobs_status_deadline (status, deadline),
    CONSTRAINT fk_jobs_company FOREIGN KEY (company_id) REFERENCES companies (company_id) ON DELETE CASCADE,
    CONSTRAINT fk_jobs_creator FOREIGN KEY (created_by) REFERENCES users (user_id),
    CONSTRAINT chk_jobs_cgpa     CHECK (min_cgpa BETWEEN 0 AND 10),
    CONSTRAINT chk_jobs_vacancy  CHECK (vacancies >= 0),
    CONSTRAINT chk_jobs_package  CHECK (package_lpa > 0)
) ENGINE = InnoDB;

CREATE TABLE skills (
    skill_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    name      VARCHAR(30)   NOT NULL,
    category  VARCHAR(20)   NOT NULL,
    PRIMARY KEY (skill_id),
    UNIQUE KEY uq_skills_name (name)
) ENGINE = InnoDB;

-- many-to-many: which skills a student has / a job needs (kept in step with the text by triggers)
CREATE TABLE student_skills (
    student_id   INT UNSIGNED  NOT NULL,
    skill_id     INT UNSIGNED  NOT NULL,
    proficiency  TINYINT       NOT NULL DEFAULT 1,
    PRIMARY KEY (student_id, skill_id),
    CONSTRAINT fk_ss_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE,
    CONSTRAINT fk_ss_skill   FOREIGN KEY (skill_id)   REFERENCES skills (skill_id)     ON DELETE CASCADE,
    CONSTRAINT chk_ss_level  CHECK (proficiency BETWEEN 1 AND 5)
) ENGINE = InnoDB;

CREATE TABLE job_skills (
    job_id    INT UNSIGNED  NOT NULL,
    skill_id  INT UNSIGNED  NOT NULL,
    PRIMARY KEY (job_id, skill_id),
    CONSTRAINT fk_js_job   FOREIGN KEY (job_id)   REFERENCES jobs (job_id)     ON DELETE CASCADE,
    CONSTRAINT fk_js_skill FOREIGN KEY (skill_id) REFERENCES skills (skill_id) ON DELETE CASCADE
) ENGINE = InnoDB;

CREATE TABLE applications (
    application_id  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    student_id      INT UNSIGNED  NOT NULL,
    job_id          INT UNSIGNED  NOT NULL,
    status          ENUM('APPLIED','SHORTLISTED','INTERVIEW','REJECTED','SELECTED') NOT NULL DEFAULT 'APPLIED',
    match_score     DECIMAL(5,1)  NULL,                  -- cosine similarity x 100, set by a trigger
    applied_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by      INT UNSIGNED  NOT NULL,
    PRIMARY KEY (application_id),
    UNIQUE KEY uq_application (student_id, job_id),      -- a student can apply to a job only once
    CONSTRAINT fk_app_student FOREIGN KEY (student_id) REFERENCES students (student_id) ON DELETE CASCADE,
    CONSTRAINT fk_app_job     FOREIGN KEY (job_id)     REFERENCES jobs (job_id)         ON DELETE CASCADE,
    CONSTRAINT fk_app_creator FOREIGN KEY (created_by) REFERENCES users (user_id)
) ENGINE = InnoDB;

CREATE TABLE placements (
    placement_id    INT UNSIGNED  NOT NULL AUTO_INCREMENT,
    application_id  INT UNSIGNED  NOT NULL,
    placed_on       DATE          NOT NULL,
    package_lpa     DECIMAL(5,2)  NOT NULL,
    created_by      INT UNSIGNED  NOT NULL,
    PRIMARY KEY (placement_id),
    UNIQUE KEY uq_placement_application (application_id),
    CONSTRAINT fk_pl_application FOREIGN KEY (application_id) REFERENCES applications (application_id) ON DELETE CASCADE,
    CONSTRAINT fk_pl_creator     FOREIGN KEY (created_by)     REFERENCES users (user_id)
) ENGINE = InnoDB;

-- every important change, with the user who made it (filled by triggers)
CREATE TABLE audit_log (
    audit_id    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    table_name  VARCHAR(30)     NOT NULL,
    row_id      INT UNSIGNED    NOT NULL,
    action      VARCHAR(20)     NOT NULL,
    old_value   VARCHAR(100)    NULL,
    new_value   VARCHAR(100)    NULL,
    changed_by  INT UNSIGNED    NULL,
    changed_at  TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (audit_id),
    KEY idx_audit_table_row (table_name, row_id)
) ENGINE = InnoDB;
