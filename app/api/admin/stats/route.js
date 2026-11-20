import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';
import { recentEvents, resumeCount, topSkills } from '@/lib/mongo.mjs';

export const GET = guard(async ({ session }) => {
  const db = poolFor(session.role);
  const [[totals]] = await db.query(
    `SELECT (SELECT COUNT(*) FROM students) AS students, (SELECT COUNT(*) FROM companies) AS companies,
            (SELECT COUNT(*) FROM jobs WHERE status = 'OPEN') AS open_jobs, (SELECT COUNT(*) FROM applications) AS applications,
            (SELECT COUNT(*) FROM placements) AS placements, (SELECT ROUND(AVG(package_lpa), 2) FROM placements) AS avg_package`);
  const [companies] = await db.query('SELECT * FROM v_placement_stats ORDER BY placed DESC, applications DESC LIMIT 8');
  const [branches] = await db.query('SELECT * FROM v_branch_stats ORDER BY placed_pct DESC');
  // GROUP BY ... HAVING: jobs that attracted at least 80 applications
  const [popular] = await db.query(
    `SELECT j.job_id, j.title, c.name AS company, COUNT(*) AS applications, ROUND(AVG(a.match_score), 1) AS avg_match
       FROM jobs j JOIN companies c ON c.company_id = j.company_id JOIN applications a ON a.job_id = j.job_id
      GROUP BY j.job_id, j.title, c.name HAVING COUNT(*) >= 80 ORDER BY applications DESC LIMIT 6`);
  let nosql = { skills: [], events: [], resumes: null, error: null };
  try { nosql = { skills: await topSkills(8), events: await recentEvents(6), resumes: await resumeCount(), error: null }; }
  catch (e) { nosql.error = e.message; }
  return { totals, companies, branches, popular, nosql };
}, { role: 'admin' });
