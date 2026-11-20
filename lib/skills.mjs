// The skill vocabulary (same 32 skills, same order, as the MySQL function fn_skill_embedding)
export const SKILLS = ['python', 'java', 'javascript', 'typescript', 'react', 'nodejs', 'sql', 'mysql', 'mongodb', 'postgresql', 'html', 'css', 'c++', 'c', 'machine learning', 'deep learning', 'data analysis', 'statistics', 'excel', 'power bi', 'tableau', 'aws', 'docker', 'kubernetes', 'git', 'linux', 'django', 'spring', 'rest api', 'testing', 'networking', 'cybersecurity'];

export function extractSkills(text) {
  const t = ' ' + String(text).toLowerCase().replace(/[^a-z0-9+#]+/g, ' ') + ' ';
  return SKILLS.filter((s) => t.includes(' ' + s + ' '));
}
