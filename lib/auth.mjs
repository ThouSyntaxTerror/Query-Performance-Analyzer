import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const COOKIE = 'pp_session';
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-only-secret-change-me-in-env-file-0000');

export async function startSession(user) {
  const token = await new SignJWT({ userId: user.user_id, username: user.username, role: user.role, studentId: user.student_id ?? null })
    .setProtectedHeader({ alg: 'HS256' }).setExpirationTime('8h').sign(key());
  (await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 });
}
export async function endSession() { (await cookies()).delete(COOKIE); }

export async function getSession() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try { return (await jwtVerify(token, key())).payload; } catch { return null; }
}

// Wraps an API handler: login required, optional role check, MySQL errors turned into readable messages.
export function guard(handler, { role } = {}) {
  return async (request, ctx) => {
    const s = await getSession();
    if (!s) return NextResponse.json({ error: 'Please log in' }, { status: 401 });
    if (role && s.role !== role) return NextResponse.json({ error: `This is only for ${role}s` }, { status: 403 });
    try {
      const params = ctx?.params ? await ctx.params : {};
      return NextResponse.json(await handler({ session: s, request, params }));
    } catch (e) {
      if (e.sqlState === '45000') return NextResponse.json({ error: e.sqlMessage }, { status: 400 });          // rule raised by a trigger or procedure
      if (e.code === 'ER_TABLEACCESS_DENIED_ERROR' || e.code === 'ER_PROCACCESS_DENIED_ERROR' || e.errno === 1142 || e.errno === 1370 || e.errno === 1143) {
        return NextResponse.json({ error: 'Database denied this action: ' + e.sqlMessage }, { status: 403 });
      }
      if (e.errno === 1452) return NextResponse.json({ error: 'That record does not exist (foreign key check failed)' }, { status: 400 });
      if (e.errno === 1451) return NextResponse.json({ error: 'This row is still referenced by other rows and cannot be deleted' }, { status: 409 });
      if (e.code === 'ER_DUP_ENTRY') return NextResponse.json({ error: 'Already exists: ' + e.sqlMessage }, { status: 409 });
      if ([1264, 1265, 1366, 1406, 1292].includes(e.errno)) return NextResponse.json({ error: 'Invalid value: ' + e.sqlMessage }, { status: 400 });
      if (e.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || e.errno === 3819) return NextResponse.json({ error: 'Invalid value: ' + e.sqlMessage }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: e.sqlMessage || e.message }, { status: 500 });
    }
  };
}
