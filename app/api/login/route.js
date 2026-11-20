import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { authPool } from '@/lib/db.mjs';
import { startSession } from '@/lib/auth.mjs';

export async function POST(request) {
  const { username, password } = await request.json().catch(() => ({}));
  const [[user]] = await authPool().query(
    'SELECT u.user_id, u.username, u.password_hash, u.role, s.student_id FROM users u LEFT JOIN students s ON s.user_id = u.user_id WHERE u.username = ?',
    [String(username || '')]);
  if (!user || !(await bcrypt.compare(String(password || ''), user.password_hash))) {
    return NextResponse.json({ error: 'Wrong username or password' }, { status: 401 });
  }
  await startSession(user);
  return NextResponse.json({ username: user.username, role: user.role });
}
