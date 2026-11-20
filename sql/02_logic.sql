-- =====================================================================
-- 02_logic.sql  -  functions, procedures, triggers, views
-- Run as root (setup only):  mysql -u root -p < sql/02_logic.sql
-- =====================================================================
USE placement_portal;

DELIMITER $$

-- ---------------------------------------------------------------------
-- FUNCTION: how many times does a word occur in a text?
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_count_occ(p_text TEXT, p_needle VARCHAR(40)) RETURNS INT DETERMINISTIC
BEGIN
    RETURN (CHAR_LENGTH(p_text) - CHAR_LENGTH(REPLACE(p_text, p_needle, ''))) DIV CHAR_LENGTH(p_needle);
END$$

-- ---------------------------------------------------------------------
-- FUNCTION: text -> 32 number skill vector (JSON array).
-- Position i counts how often skill i is mentioned in the text.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_skill_embedding(p_text TEXT) RETURNS JSON DETERMINISTIC
BEGIN
    DECLARE s TEXT;
    SET s = CONCAT(' ', REGEXP_REPLACE(LOWER(p_text), '[^a-z0-9+#]+', ' '), ' ');
    RETURN JSON_ARRAY(
        fn_count_occ(s,' python '),   fn_count_occ(s,' java '),       fn_count_occ(s,' javascript '), fn_count_occ(s,' typescript '),
        fn_count_occ(s,' react '),    fn_count_occ(s,' nodejs '),     fn_count_occ(s,' sql '),        fn_count_occ(s,' mysql '),
        fn_count_occ(s,' mongodb '),  fn_count_occ(s,' postgresql '), fn_count_occ(s,' html '),       fn_count_occ(s,' css '),
        fn_count_occ(s,' c++ '),      fn_count_occ(s,' c '),          fn_count_occ(s,' machine learning '), fn_count_occ(s,' deep learning '),
        fn_count_occ(s,' data analysis '), fn_count_occ(s,' statistics '), fn_count_occ(s,' excel '), fn_count_occ(s,' power bi '),
        fn_count_occ(s,' tableau '),  fn_count_occ(s,' aws '),        fn_count_occ(s,' docker '),     fn_count_occ(s,' kubernetes '),
        fn_count_occ(s,' git '),      fn_count_occ(s,' linux '),      fn_count_occ(s,' django '),     fn_count_occ(s,' spring '),
        fn_count_occ(s,' rest api '), fn_count_occ(s,' testing '),    fn_count_occ(s,' networking '), fn_count_occ(s,' cybersecurity '));
END$$

-- ---------------------------------------------------------------------
-- FUNCTION: cosine similarity of two JSON number arrays (1 = same direction), computed with JSON_TABLE
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_cosine_similarity(p_a JSON, p_b JSON) RETURNS DOUBLE DETERMINISTIC READS SQL DATA
BEGIN
    DECLARE v_dot DOUBLE; DECLARE v_na DOUBLE; DECLARE v_nb DOUBLE;
    SELECT SUM(x.v * y.v), SQRT(SUM(x.v * x.v)), SQRT(SUM(y.v * y.v)) INTO v_dot, v_na, v_nb
      FROM JSON_TABLE(p_a, '$[*]' COLUMNS (i FOR ORDINALITY, v DOUBLE PATH '$')) AS x
      JOIN JSON_TABLE(p_b, '$[*]' COLUMNS (i FOR ORDINALITY, v DOUBLE PATH '$')) AS y ON x.i = y.i;
    IF v_dot IS NULL OR v_na = 0 OR v_nb = 0 THEN RETURN 0; END IF;
    RETURN v_dot / (v_na * v_nb);
END$$

-- ---------------------------------------------------------------------
-- FUNCTION: how well does a student match a job?  (0 to 100)
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_match_score(p_student INT UNSIGNED, p_job INT UNSIGNED) RETURNS DECIMAL(5,1) READS SQL DATA
BEGIN
    DECLARE v_s JSON; DECLARE v_j JSON;
    SELECT embedding INTO v_s FROM students WHERE student_id = p_student;
    SELECT embedding INTO v_j FROM jobs WHERE job_id = p_job;
    IF v_s IS NULL OR v_j IS NULL THEN RETURN 0; END IF;
    RETURN ROUND(100 * fn_cosine_similarity(v_s, v_j), 1);
END$$

-- ---------------------------------------------------------------------
-- PROCEDURES that keep the skill tables in step with the text
-- ---------------------------------------------------------------------
CREATE PROCEDURE sp_sync_student_skills(IN p_student INT UNSIGNED)
BEGIN
    DECLARE v_text TEXT;
    SELECT CONCAT(' ', REGEXP_REPLACE(LOWER(resume_text), '[^a-z0-9+#]+', ' '), ' ') INTO v_text FROM students WHERE student_id = p_student;
    DELETE FROM student_skills WHERE student_id = p_student;
    INSERT INTO student_skills (student_id, skill_id, proficiency)
    SELECT p_student, k.skill_id, LEAST(5, fn_count_occ(v_text, CONCAT(' ', LOWER(k.name), ' ')))
    FROM skills k WHERE v_text LIKE CONCAT('% ', LOWER(k.name), ' %');
END$$

CREATE PROCEDURE sp_sync_job_skills(IN p_job INT UNSIGNED)
BEGIN
    DECLARE v_text TEXT;
    SELECT CONCAT(' ', REGEXP_REPLACE(LOWER(description), '[^a-z0-9+#]+', ' '), ' ') INTO v_text FROM jobs WHERE job_id = p_job;
    DELETE FROM job_skills WHERE job_id = p_job;
    INSERT INTO job_skills (job_id, skill_id)
    SELECT p_job, k.skill_id FROM skills k WHERE v_text LIKE CONCAT('% ', LOWER(k.name), ' %');
END$$

-- ---------------------------------------------------------------------
-- TRIGGERS: embeddings and skill links are maintained automatically
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_students_bi BEFORE INSERT ON students FOR EACH ROW
BEGIN SET NEW.embedding = fn_skill_embedding(NEW.resume_text); END$$

CREATE TRIGGER trg_students_bu BEFORE UPDATE ON students FOR EACH ROW
BEGIN
    IF NEW.resume_text <> OLD.resume_text THEN SET NEW.embedding = fn_skill_embedding(NEW.resume_text); END IF;
END$$

CREATE TRIGGER trg_students_ai AFTER INSERT ON students FOR EACH ROW
BEGIN CALL sp_sync_student_skills(NEW.student_id); END$$

CREATE TRIGGER trg_students_au AFTER UPDATE ON students FOR EACH ROW
BEGIN
    IF NEW.resume_text <> OLD.resume_text THEN
        CALL sp_sync_student_skills(NEW.student_id);
        INSERT INTO audit_log (table_name, row_id, action, old_value, new_value, changed_by)
        VALUES ('students', NEW.student_id, 'RESUME_UPDATE', NULL, 'resume changed', COALESCE(@app_user_id, NEW.created_by));
    END IF;
END$$

CREATE TRIGGER trg_jobs_bi BEFORE INSERT ON jobs FOR EACH ROW
BEGIN SET NEW.embedding = fn_skill_embedding(NEW.description); END$$

CREATE TRIGGER trg_jobs_bu BEFORE UPDATE ON jobs FOR EACH ROW
BEGIN
    IF NEW.description <> OLD.description THEN SET NEW.embedding = fn_skill_embedding(NEW.description); END IF;
END$$

CREATE TRIGGER trg_jobs_ai AFTER INSERT ON jobs FOR EACH ROW
BEGIN
    CALL sp_sync_job_skills(NEW.job_id);
    INSERT INTO audit_log (table_name, row_id, action, new_value, changed_by)
    VALUES ('jobs', NEW.job_id, 'INSERT', LEFT(NEW.title, 100), COALESCE(@app_user_id, NEW.created_by));
END$$

-- ---------------------------------------------------------------------
-- TRIGGER: an application is checked BEFORE it is stored (eligibility rules live in the database)
-- ---------------------------------------------------------------------
CREATE TRIGGER trg_apps_bi BEFORE INSERT ON applications FOR EACH ROW
BEGIN
    DECLARE v_cgpa DECIMAL(3,2); DECLARE v_min DECIMAL(3,2); DECLARE v_status VARCHAR(10); DECLARE v_deadline DATE;
    SELECT cgpa INTO v_cgpa FROM students WHERE student_id = NEW.student_id;
    SELECT min_cgpa, status, deadline INTO v_min, v_status, v_deadline FROM jobs WHERE job_id = NEW.job_id;
    IF v_status <> 'OPEN' THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This job is closed for applications';
    END IF;
    IF v_deadline < CURDATE() THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'The application deadline has passed';
    END IF;
    IF v_cgpa < v_min THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Your CGPA is below the minimum required for this job';
    END IF;
    SET NEW.match_score = fn_match_score(NEW.student_id, NEW.job_id);
END$$

CREATE TRIGGER trg_apps_ai AFTER INSERT ON applications FOR EACH ROW
BEGIN
    INSERT INTO audit_log (table_name, row_id, action, new_value, changed_by)
    VALUES ('applications', NEW.application_id, 'INSERT', NEW.status, COALESCE(@app_user_id, NEW.created_by));
END$$

CREATE TRIGGER trg_apps_au AFTER UPDATE ON applications FOR EACH ROW
BEGIN
    IF NEW.status <> OLD.status THEN
        INSERT INTO audit_log (table_name, row_id, action, old_value, new_value, changed_by)
        VALUES ('applications', NEW.application_id, 'STATUS_CHANGE', OLD.status, NEW.status, COALESCE(@app_user_id, NEW.created_by));
    END IF;
END$$

CREATE TRIGGER trg_placements_bi BEFORE INSERT ON placements FOR EACH ROW
BEGIN
    IF EXISTS (SELECT 1 FROM applications a JOIN applications b ON b.student_id = a.student_id
               JOIN placements p ON p.application_id = b.application_id
               WHERE a.application_id = NEW.application_id) THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'This student is already placed';
    END IF;
END$$

-- ---------------------------------------------------------------------
-- PROCEDURES used by the application
-- ---------------------------------------------------------------------
-- A student applies. The trigger above enforces the rules.
CREATE PROCEDURE sp_apply_for_job(IN p_student INT UNSIGNED, IN p_job INT UNSIGNED, IN p_user INT UNSIGNED)
BEGIN
    SET @app_user_id = p_user;
    INSERT INTO applications (student_id, job_id, created_by) VALUES (p_student, p_job, p_user);
    SELECT LAST_INSERT_ID() AS application_id;
END$$

-- A student edits the resume; triggers recompute the vector and the skills.
CREATE PROCEDURE sp_update_resume(IN p_student INT UNSIGNED, IN p_resume TEXT, IN p_user INT UNSIGNED)
BEGIN
    SET @app_user_id = p_user;
    UPDATE students SET resume_text = p_resume WHERE student_id = p_student;
END$$

-- The only way a student can read their own data
CREATE PROCEDURE sp_my_profile(IN p_student INT UNSIGNED)
BEGIN
    SELECT student_id, full_name, email, branch, cgpa, graduation_year, resume_text FROM students WHERE student_id = p_student;
END$$

CREATE PROCEDURE sp_my_applications(IN p_student INT UNSIGNED)
BEGIN
    SELECT a.application_id, j.title, c.name AS company, j.package_lpa, a.status, a.match_score, a.applied_at
    FROM applications a JOIN jobs j ON j.job_id = a.job_id JOIN companies c ON c.company_id = j.company_id
    WHERE a.student_id = p_student ORDER BY a.applied_at DESC;
END$$

-- Open jobs the student is eligible for and has not applied to, best match first
CREATE PROCEDURE sp_recommend_jobs(IN p_student INT UNSIGNED, IN p_limit INT)
BEGIN
    SELECT j.job_id, j.title, c.name AS company, j.package_lpa, j.min_cgpa, j.deadline,
           fn_match_score(p_student, j.job_id) AS match_score
    FROM jobs j JOIN companies c ON c.company_id = j.company_id JOIN students s ON s.student_id = p_student
    WHERE j.status = 'OPEN' AND j.deadline >= CURDATE() AND j.min_cgpa <= s.cgpa
      AND NOT EXISTS (SELECT 1 FROM applications a WHERE a.student_id = p_student AND a.job_id = j.job_id)
    ORDER BY match_score DESC, j.package_lpa DESC
    LIMIT p_limit;
END$$

-- Admin: applicants of one job, best match first
CREATE PROCEDURE sp_rank_candidates(IN p_job INT UNSIGNED, IN p_limit INT)
BEGIN
    SELECT a.application_id, s.student_id, s.full_name, s.branch, s.cgpa, a.match_score, a.status
    FROM applications a JOIN students s ON s.student_id = a.student_id
    WHERE a.job_id = p_job ORDER BY a.match_score DESC, s.cgpa DESC LIMIT p_limit;
END$$

-- Admin: change the status of an application (SELECTED is only set by sp_place_student)
CREATE PROCEDURE sp_set_application_status(IN p_app INT UNSIGNED, IN p_status VARCHAR(12), IN p_user INT UNSIGNED)
BEGIN
    IF p_status NOT IN ('APPLIED','SHORTLISTED','INTERVIEW','REJECTED') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Use sp_place_student to select a candidate';
    END IF;
    SET @app_user_id = p_user;
    UPDATE applications SET status = p_status WHERE application_id = p_app;
END$$

-- Admin: place a student. ONE TRANSACTION: placement row + application status + vacancy count, all or nothing.
CREATE PROCEDURE sp_place_student(IN p_app INT UNSIGNED, IN p_user INT UNSIGNED)
BEGIN
    DECLARE v_job INT UNSIGNED; DECLARE v_status VARCHAR(12); DECLARE v_vacancies INT; DECLARE v_package DECIMAL(5,2);
    DECLARE EXIT HANDLER FOR SQLEXCEPTION BEGIN ROLLBACK; RESIGNAL; END;
    SET @app_user_id = p_user;
    START TRANSACTION;
    SELECT a.job_id, a.status INTO v_job, v_status FROM applications a WHERE a.application_id = p_app FOR UPDATE;
    IF v_job IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Application not found'; END IF;
    IF v_status NOT IN ('SHORTLISTED','INTERVIEW') THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Only shortlisted or interviewed candidates can be placed';
    END IF;
    SELECT vacancies, package_lpa INTO v_vacancies, v_package FROM jobs WHERE job_id = v_job FOR UPDATE;
    IF v_vacancies < 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No vacancies left for this job'; END IF;
    INSERT INTO placements (application_id, placed_on, package_lpa, created_by) VALUES (p_app, CURDATE(), v_package, p_user);
    UPDATE applications SET status = 'SELECTED' WHERE application_id = p_app;
    UPDATE jobs SET vacancies = vacancies - 1, status = IF(vacancies - 1 = 0, 'CLOSED', status) WHERE job_id = v_job;
    COMMIT;
END$$

-- Lists the triggers of this database (information_schema hides them from accounts without the TRIGGER privilege)
CREATE PROCEDURE sp_list_triggers()
BEGIN
    SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS on_table, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event
    FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'placement_portal'
    ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, TRIGGER_NAME;
END$$

-- ---------------------------------------------------------------------
-- VIEWS for the reports
-- ---------------------------------------------------------------------
CREATE VIEW v_job_applicants AS
SELECT j.job_id, j.title, c.name AS company, a.application_id, s.student_id, s.full_name,
       s.cgpa, a.match_score, a.status
FROM jobs j
JOIN companies c ON c.company_id = j.company_id
JOIN applications a ON a.job_id = j.job_id
JOIN students s ON s.student_id = a.student_id$$

CREATE VIEW v_placement_stats AS
SELECT c.company_id, c.name AS company,
       COUNT(DISTINCT j.job_id)                            AS jobs,
       COUNT(a.application_id)                             AS applications,
       COUNT(p.placement_id)                               AS placed,
       ROUND(AVG(p.package_lpa), 2)                        AS avg_package_lpa
FROM companies c
LEFT JOIN jobs j ON j.company_id = c.company_id
LEFT JOIN applications a ON a.job_id = j.job_id
LEFT JOIN placements p ON p.application_id = a.application_id
GROUP BY c.company_id, c.name$$

CREATE VIEW v_branch_stats AS
SELECT s.branch, COUNT(DISTINCT s.student_id) AS students,
       COUNT(DISTINCT a.application_id) AS applications,
       COUNT(DISTINCT p.placement_id)   AS placed,
       ROUND(100 * COUNT(DISTINCT p.placement_id) / COUNT(DISTINCT s.student_id), 1) AS placed_pct
FROM students s
LEFT JOIN applications a ON a.student_id = s.student_id
LEFT JOIN placements p ON p.application_id = a.application_id
GROUP BY s.branch$$

DELIMITER ;
