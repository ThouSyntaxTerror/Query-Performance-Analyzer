import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';

// Search and filter jobs. Students see open jobs only; admins also see closed ones.
export const GET = guard(async ({ session, request }) => {
  const u = new URL(request.url).searchParams;
  const q = `%${u.get('q') || ''}%`;
  const minPackage = Number(u.get('minPackage') || 0);
  const maxCgpa = Number(u.get('maxCgpa') || 10);
  const statusFilter = session.role === 'admin' ? (u.get('status') || 'ALL') : 'OPEN';
  const [rows] = await poolFor(session.role).query(
    `SELECT j.job_id, j.title, c.name AS company, c.location, j.package_lpa, j.min_cgpa, j.vacancies, j.deadline, j.status
       FROM jobs j JOIN companies c ON c.company_id = j.company_id
      WHERE (j.title LIKE ? OR c.name LIKE ?) AND j.package_lpa >= ? AND j.min_cgpa <= ?
        AND (? = 'ALL' OR j.status = ?)
      ORDER BY j.package_lpa DESC LIMIT 60`, [q, q, minPackage, maxCgpa, statusFilter, statusFilter]);
  return rows;
});
