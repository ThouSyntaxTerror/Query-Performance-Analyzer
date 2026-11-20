import { guard } from '@/lib/auth.mjs';

export const GET = guard(async ({ session }) => ({ userId: session.userId, username: session.username, role: session.role, studentId: session.studentId }));
