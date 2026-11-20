import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';

// WHO inserts rows: every main table stores the user that created each row (created_by)
export const GET = guard(async ({ session }) => (await poolFor(session.role).query(
  `SELECT t.table_name, u.role, COUNT(*) AS rows_inserted, COUNT(DISTINCT t.created_by) AS distinct_users
     FROM (SELECT 'students' AS table_name, created_by FROM students
           UNION ALL SELECT 'companies', created_by FROM companies
           UNION ALL SELECT 'jobs', created_by FROM jobs
           UNION ALL SELECT 'applications', created_by FROM applications
           UNION ALL SELECT 'placements', created_by FROM placements) t
     JOIN users u ON u.user_id = t.created_by
    GROUP BY t.table_name, u.role ORDER BY t.table_name, u.role`))[0], { role: 'admin' });
