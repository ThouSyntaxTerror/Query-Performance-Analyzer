import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';
import { logEvent } from '@/lib/mongo.mjs';

// The student calls the procedure; the trigger inside MySQL checks CGPA, deadline and vacancy.
export const POST = guard(async ({ session, request }) => {
  const { job_id } = await request.json();
  const rows = await withUser(session, async (c) => (await c.query('CALL sp_apply_for_job(?, ?, ?)', [session.studentId, Number(job_id), session.userId]))[0]);
  await logEvent({ type: 'APPLY', user_id: session.userId, student_id: session.studentId, job_id: Number(job_id) });
  return { application_id: rows[0][0].application_id };
}, { role: 'student' });
