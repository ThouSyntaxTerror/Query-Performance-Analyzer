import { guard } from '@/lib/auth.mjs';
import { withUser } from '@/lib/db.mjs';
import { extractSkills } from '@/lib/skills.mjs';
import { getResume, logEvent, saveResume } from '@/lib/mongo.mjs';

export const GET = guard(async ({ session }) => {
  const [profile] = await withUser(session, async (c) => (await c.query('CALL sp_my_profile(?)', [session.studentId]))[0][0]);
  const doc = await getResume(session.studentId).catch(() => null);
  return { profile, projects: doc?.projects ?? [], certifications: doc?.certifications ?? [], skills: doc?.skills ?? extractSkills(profile.resume_text) };
}, { role: 'student' });

// MySQL gets the resume text (triggers recompute the vector and skills); MongoDB gets the nested document.
export const PUT = guard(async ({ session, request }) => {
  const { resume_text, projects = [], certifications = [] } = await request.json();
  const text = String(resume_text || '').trim();
  if (text.length < 20) { const e = new Error('The resume text is too short'); e.sqlState = '45000'; e.sqlMessage = e.message; throw e; }
  await withUser(session, (c) => c.query('CALL sp_update_resume(?, ?, ?)', [session.studentId, text, session.userId]));
  await saveResume(session.studentId, { resume_text: text, skills: extractSkills(text), projects, certifications });
  await logEvent({ type: 'RESUME_UPDATE', user_id: session.userId, student_id: session.studentId });
  return { ok: true, skills: extractSkills(text) };
}, { role: 'student' });
