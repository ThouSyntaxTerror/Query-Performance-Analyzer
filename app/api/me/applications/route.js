import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';

export const GET = guard(({ session }) =>
  withUser(session, async (c) => (await c.query('CALL sp_my_applications(?)', [session.studentId]))[0][0]), { role: 'student' });
