import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';

// The audit log written by triggers: what changed and WHO changed it
export const GET = guard(async ({ session }) => (await poolFor(session.role).query(
  `SELECT l.audit_id, l.table_name, l.row_id, l.action, l.old_value, l.new_value, u.username AS changed_by, l.changed_at
     FROM audit_log l LEFT JOIN users u ON u.user_id = l.changed_by ORDER BY l.audit_id DESC LIMIT 25`))[0], { role: 'admin' });
