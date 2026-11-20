# CLAUDE.md - Placement Portal (DBMS Level 3 project, replaces the Query Analyzer)

Hand-off context for the Claude Code CLI. The user switched from `../mysql-query-analyzer` (a query analyzer) to this management
system because they could not answer "who inserts rows into the tables?" in the viva and the project felt too complicated.

## What it is
Next.js 16 portal on MySQL 8.0.46 (database `placement_portal`) plus MongoDB (`placement_portal_docs`). Roles: admin and student.
Admin posts companies/jobs, ranks applicants, places students; students browse/apply/edit resumes. Vector = 32-number skill vector
(fn_skill_embedding) + cosine similarity (fn_cosine_similarity) inside MySQL. Every main table has created_by (who inserted).

## Status
Built and tested (API tests, DB-level permission checks, MongoDB). Local git repo only, NO remote: do not push until the user gives a URL (ask first).
Not yet written: REPORT.md (full report), presentation script, NOSQL_MODEL.md. README.md, docs/COMMANDS.txt and docs/img/er_chen.png exist.

## Secrets
`.env.local` (Git-ignored) holds MYSQL_ROOT_PASSWORD (copied from the other project; never print it) and generated PP_AUTH/PP_ADMIN/PP_STUDENT
passwords and AUTH_SECRET. NEVER cat/Read/echo it or put values in chat, docs or commits. Use `npm run mysql -- --as root -e "..."`.
Do not touch other MongoDB databases on the machine (collegeDB, genztech, simplebank) or other MySQL databases (company, hostel, nested, sample, smart_hostel, shop_query_analyzer).

## Commands
```
npm install
npm run setup     # idempotent: creates DB, tables, logic, accounts, grants, sample data (a few minutes), Mongo documents
npm run dev       # http://localhost:3300   (admin/admin123, student001/student123)
npm run mysql -- --as root|pp_auth|pp_admin|pp_student -D placement_portal -e "SQL"     (or --file path.sql)
node docs/screenshots.mjs     # needs the app on 3300; node docs/... ER diagram: docs/diagrams/er_chen.html -> docs/img/er_chen.png via headless Edge
```

## Design facts
- One MySQL account per role: `withUser(session, fn)` in lib/db.mjs uses the pool of the logged-in role and sets `@app_user_id` (used by triggers for audit).
- pp_student has NO insert/update/delete and no SELECT on students/applications/placements/users; it calls procedures (sp_apply_for_job, sp_update_resume, sp_my_profile, sp_my_applications, sp_recommend_jobs).
- Eligibility rules live in trigger `trg_apps_bi` (SIGNAL 45000 messages are shown to the user by lib/auth.mjs guard).
- `sp_place_student` is a real transaction; `sp_list_triggers` exists because information_schema hides triggers from accounts without the TRIGGER privilege.
- Skill vector order in fn_skill_embedding must equal lib/skills.mjs SKILLS and the seed list in scripts/setup.mjs.
- Seed is deterministic (mulberry32 seed 42) but MongoDB certifications are random per run. Test data created during development was removed; baseline = 300 students, 40 jobs, 2406 applications, 25 placements.
- Auto-increment gaps appear after failed inserts; harmless.

## Working rules
- Use the Write tool for files; bash heredocs with several quote styles failed twice. Never `taskkill /IM node.exe`; stop the dev server by port 3300 with PowerShell Get-NetTCPConnection.
- README/docs: no emojis. Do NOT add Co-Authored-By trailers to commits (the user wants to be the only contributor).
- Outward-facing actions (push, deploy) need the user's explicit go-ahead.
