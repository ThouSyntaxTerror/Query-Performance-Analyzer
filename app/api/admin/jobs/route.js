import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';
import { logEvent } from '@/lib/mongo.mjs';

// Admin posts a job. MySQL triggers compute the skill vector and link the skills; created_by records who inserted it.
export const POST = guard(async ({ session, request }) => {
  const b = await request.json();
  const r = await withUser(session, (c) => c.query(
    'INSERT INTO jobs (company_id, title, description, min_cgpa, vacancies, package_lpa, deadline, created_by) VALUES (?,?,?,?,?,?,?,?)',
    [Number(b.company_id), String(b.title).trim(), String(b.description).trim(), Number(b.min_cgpa), Number(b.vacancies), Number(b.package_lpa), b.deadline, session.userId]));
  await logEvent({ type: 'JOB_POSTED', user_id: session.userId, job_id: r[0].insertId });
  return { job_id: r[0].insertId };
}, { role: 'admin' });
