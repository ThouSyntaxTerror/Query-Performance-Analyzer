import { guard } from '@/lib/auth.mjs';
import { searchResumes } from '@/lib/mongo.mjs';

// NoSQL full-text search over resume documents in MongoDB
export const GET = guard(async ({ request }) => {
  const q = new URL(request.url).searchParams.get('q') || '';
  return q.trim() ? searchResumes(q.trim(), 10) : [];
}, { role: 'admin' });
