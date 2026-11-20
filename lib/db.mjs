// Three connection pools to the SAME MySQL database, one MySQL account per kind of user:
//   auth    = pp_auth     can read the users table only (used to check a login)
//   admin   = pp_admin    the placement officer's rights
//   student = pp_student  read public job data and call a few procedures; no INSERT/UPDATE/DELETE at all
// The pool is chosen from the logged-in user's role, so MySQL enforces the permissions, not just the app.
import mysql from 'mysql2/promise';

export const DB_NAME = 'placement_portal';
const g = globalThis;

function make(user, passwordVar) {
  const password = process.env[passwordVar];
  if (!password) throw new Error(`${passwordVar} is missing. Run "npm run setup" first.`);
  return mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306),
    user, password, database: DB_NAME, connectionLimit: 5,
    dateStrings: true, decimalNumbers: true, supportBigNumbers: true, bigNumberStrings: false,
  });
}
const pools = {
  auth: () => (g.__ppAuth ??= make('pp_auth', 'PP_AUTH_PASSWORD')),
  admin: () => (g.__ppAdmin ??= make('pp_admin', 'PP_ADMIN_PASSWORD')),
  student: () => (g.__ppStudent ??= make('pp_student', 'PP_STUDENT_PASSWORD')),
};
export const poolFor = (role) => pools[role]();
export const authPool = () => pools.auth();

// Run fn(conn) on a connection of the role's account. @app_user_id tells the triggers WHO is acting (for the audit log).
export async function withUser(session, fn) {
  const conn = await poolFor(session.role).getConnection();
  try {
    await conn.query('SET @app_user_id = ?', [session.userId]);
    return await fn(conn);
  } finally {
    conn.release();
  }
}
