import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';
import { logEvent } from '@/lib/mongo.mjs';

// Change an application's status, or place the student (one MySQL transaction inside sp_place_student)
export const PATCH = guard(async ({ session, request, params }) => {
  const { status, place } = await request.json();
  const id = Number(params.id);
  await withUser(session, (c) => place
    ? c.query('CALL sp_place_student(?, ?)', [id, session.userId])
    : c.query('CALL sp_set_application_status(?, ?, ?)', [id, String(status), session.userId]));
  await logEvent({ type: place ? 'PLACED' : 'STATUS_CHANGE', user_id: session.userId, application_id: id, status: place ? 'SELECTED' : status });
  return { ok: true };
}, { role: 'admin' });
