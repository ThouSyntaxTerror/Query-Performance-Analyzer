import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';

// The database objects, read from MySQL's own catalogue (so the admin can show triggers, procedures and views without typing SQL)
export const GET = guard(async ({ session }) => {
  const db = poolFor(session.role);
  // triggers are listed by a definer procedure, so the admin account does not need the TRIGGER privilege
  const [[triggers]] = await db.query('CALL sp_list_triggers()');
  const [routines] = await db.query(
    `SELECT ROUTINE_TYPE AS type, ROUTINE_NAME AS name FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = 'placement_portal' ORDER BY ROUTINE_TYPE, ROUTINE_NAME`);
  const [views] = await db.query(`SELECT TABLE_NAME AS name FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'placement_portal' ORDER BY 1`);
  const [tables] = await db.query(
    `SELECT TABLE_NAME AS name, TABLE_ROWS AS approx_rows FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = 'placement_portal' AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`);
  const [fks] = await db.query(
    `SELECT TABLE_NAME AS child, REFERENCED_TABLE_NAME AS parent, DELETE_RULE AS on_delete FROM information_schema.REFERENTIAL_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = 'placement_portal' ORDER BY TABLE_NAME`);
  return { triggers, routines, views, tables, fks };
}, { role: 'admin' });
