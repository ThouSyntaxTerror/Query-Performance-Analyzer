import { guard } from '@/lib/auth.mjs';
import { poolFor, withUser } from '@/lib/db.mjs';

export const GET = guard(async ({ session }) => (await poolFor(session.role).query('SELECT company_id, name FROM companies ORDER BY name'))[0], { role: 'admin' });

export const POST = guard(async ({ session, request }) => {
  const b = await request.json();
  const r = await withUser(session, (c) => c.query(
    'INSERT INTO companies (name, industry, location, website, created_by) VALUES (?,?,?,?,?)',
    [String(b.name).trim(), String(b.industry).trim(), String(b.location).trim(), b.website || null, session.userId]));
  return { company_id: r[0].insertId };
}, { role: 'admin' });
