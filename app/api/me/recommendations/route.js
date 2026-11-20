import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';

// Vector similarity: open jobs ranked by cosine similarity between the student's skill vector and each job's vector
export const GET = guard(({ session }) =>
  withUser(session, async (c) => (await c.query('CALL sp_recommend_jobs(?, 8)', [session.studentId]))[0][0]), { role: 'student' });
