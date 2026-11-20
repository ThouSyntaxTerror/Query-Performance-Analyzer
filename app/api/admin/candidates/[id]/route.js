import { guard } from '@/lib/auth.mjs';
import { poolFor } from '@/lib/db.mjs';

// Applicants of one job, best match (cosine similarity) first
export const GET = guard(async ({ session, params }) => {
  const [[rows]] = await poolFor(session.role).query('CALL sp_rank_candidates(?, 25)', [Number(params.id)]);
  return rows;
}, { role: 'admin' });
