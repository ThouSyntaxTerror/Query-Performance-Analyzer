-- =====================================================================
-- 03_roles.sql  -  database roles. The web app connects as the account that matches the logged-in user's role,
-- so MySQL itself refuses anything the role may not do. Accounts are created by scripts/setup.mjs
-- (generated passwords); to create them by hand:
--   CREATE USER 'pp_auth'@'localhost'    IDENTIFIED BY '<password>';
--   CREATE USER 'pp_admin'@'localhost'   IDENTIFIED BY '<password>';
--   CREATE USER 'pp_student'@'localhost' IDENTIFIED BY '<password>';
-- =====================================================================
CREATE ROLE IF NOT EXISTS 'pp_auth_role', 'pp_admin_role', 'pp_student_role';

-- pp_auth_role: used only to check a login. Can read the users table and nothing else.
GRANT SELECT ON placement_portal.users TO 'pp_auth_role';
GRANT SELECT (student_id, user_id) ON placement_portal.students TO 'pp_auth_role';

-- pp_admin_role: the placement officer. Full data access and may call every routine; no DDL (no CREATE, ALTER, DROP).
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON placement_portal.* TO 'pp_admin_role';

-- pp_student_role: public data (jobs, companies, skills) can be read; everything personal goes through procedures.
-- No INSERT, UPDATE or DELETE on any table, and no SELECT on students, applications, placements or users.
GRANT SELECT ON placement_portal.jobs        TO 'pp_student_role';
GRANT SELECT ON placement_portal.companies   TO 'pp_student_role';
GRANT SELECT ON placement_portal.skills      TO 'pp_student_role';
GRANT SELECT ON placement_portal.job_skills  TO 'pp_student_role';
GRANT EXECUTE ON PROCEDURE placement_portal.sp_apply_for_job   TO 'pp_student_role';
GRANT EXECUTE ON PROCEDURE placement_portal.sp_update_resume   TO 'pp_student_role';
GRANT EXECUTE ON PROCEDURE placement_portal.sp_my_profile      TO 'pp_student_role';
GRANT EXECUTE ON PROCEDURE placement_portal.sp_my_applications TO 'pp_student_role';
GRANT EXECUTE ON PROCEDURE placement_portal.sp_recommend_jobs  TO 'pp_student_role';

GRANT 'pp_auth_role'    TO 'pp_auth'@'localhost';
GRANT 'pp_admin_role'   TO 'pp_admin'@'localhost';
GRANT 'pp_student_role' TO 'pp_student'@'localhost';
SET DEFAULT ROLE ALL TO 'pp_auth'@'localhost', 'pp_admin'@'localhost', 'pp_student'@'localhost';
FLUSH PRIVILEGES;
