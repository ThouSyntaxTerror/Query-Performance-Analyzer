'use client';
import { useCallback, useEffect, useState } from 'react';
import { Header, JobsTable, Status, Tabs, api, fmt, useAction, useUser } from '../components';

export default function Student() {
  const user = useUser('student');
  const [tab, setTab] = useState('jobs');
  const [filters, setFilters] = useState({ q: '', minPackage: '', maxCgpa: '' });
  const [jobs, setJobs] = useState([]);
  const [recs, setRecs] = useState([]);
  const [apps, setApps] = useState([]);
  const [profile, setProfile] = useState(null);
  const [resume, setResume] = useState('');
  const [projects, setProjects] = useState('');
  const [certs, setCerts] = useState('');
  const [run, Msg] = useAction();

  const loadJobs = useCallback(() => {
    const p = new URLSearchParams({ q: filters.q, minPackage: filters.minPackage || 0, maxCgpa: filters.maxCgpa || 10 });
    return api(`/api/jobs?${p}`).then(setJobs);
  }, [filters]);
  const loadAll = useCallback(() => Promise.all([
    api('/api/me/recommendations').then(setRecs), api('/api/me/applications').then(setApps),
    api('/api/me/profile').then((p) => { setProfile(p); setResume(p.profile.resume_text); setProjects(p.projects.map((x) => x.title).join('\n')); setCerts(p.certifications.map((x) => x.name).join('\n')); }),
  ]), []);
  useEffect(() => { if (user) { loadJobs(); loadAll(); } }, [user]); // eslint-disable-line

  const apply = (j) => run(async () => { await api('/api/apply', { method: 'POST', body: { job_id: j.job_id } }); await loadAll(); await loadJobs(); }, `Applied to ${j.title} at ${j.company}`);
  const save = () => run(async () => {
    await api('/api/me/profile', { method: 'PUT', body: {
      resume_text: resume,
      projects: projects.split('\n').map((t) => t.trim()).filter(Boolean).map((title) => ({ title })),
      certifications: certs.split('\n').map((t) => t.trim()).filter(Boolean).map((name) => ({ name })),
    } });
    await loadAll();
  }, 'Profile saved. Your skill vector and recommendations were recalculated.');

  if (!user) return <div className="wrap"><p className="muted">Loading...</p></div>;
  return (
    <>
      <Header user={user} />
      <div className="wrap">
        <Tabs value={tab} onChange={setTab} tabs={[['jobs', 'Browse jobs'], ['recs', 'Recommended for me'], ['apps', `My applications (${apps.length})`], ['profile', 'My profile']]} />
        <Msg />

        {tab === 'jobs' && (
          <div className="card">
            <div className="bar">
              <input placeholder="Search title or company" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              <input placeholder="Min package (LPA)" type="number" value={filters.minPackage} onChange={(e) => setFilters({ ...filters, minPackage: e.target.value })} />
              <input placeholder="My CGPA (hide jobs above)" type="number" step="0.1" value={filters.maxCgpa} onChange={(e) => setFilters({ ...filters, maxCgpa: e.target.value })} />
              <button className="primary" onClick={loadJobs}>Search</button>
            </div>
            <div style={{ marginTop: 14 }}><JobsTable jobs={jobs} onApply={apply} /></div>
            <p className="muted">The database checks your CGPA, the deadline and the vacancies when you apply. If a rule fails, MySQL refuses and the message appears above.</p>
          </div>
        )}

        {tab === 'recs' && (
          <div className="card">
            <h2>Best matches (cosine similarity of your skills and the job)</h2>
            <JobsTable jobs={recs} onApply={apply} extra />
          </div>
        )}

        {tab === 'apps' && (
          <div className="card">
            {apps.length === 0 ? <p className="muted">No applications yet.</p> : (
              <table>
                <thead><tr><th>Job</th><th>Company</th><th className="num">Package</th><th className="num">Match</th><th>Status</th><th>Applied</th></tr></thead>
                <tbody>{apps.map((a) => (
                  <tr key={a.application_id}><td><b>{a.title}</b></td><td>{a.company}</td><td className="num">{a.package_lpa}</td>
                    <td className="num match">{a.match_score}%</td><td><Status s={a.status} /></td><td>{a.applied_at}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )}

        {tab === 'profile' && profile && (
          <div className="card">
            <h2>{profile.profile.full_name}</h2>
            <p className="muted" style={{ marginTop: 0 }}>{profile.profile.branch}, CGPA {profile.profile.cgpa}, class of {profile.profile.graduation_year}, {profile.profile.email}</p>
            <div>{profile.skills.map((s) => <span className="pill" key={s}>{s}</span>)}</div>
            <label className="f">Resume text (MySQL: the skill vector is rebuilt from this)</label>
            <textarea value={resume} onChange={(e) => setResume(e.target.value)} />
            <div className="grid g3">
              <div><label className="f">Projects, one per line (MongoDB document)</label><textarea value={projects} onChange={(e) => setProjects(e.target.value)} /></div>
              <div><label className="f">Certifications, one per line (MongoDB document)</label><textarea value={certs} onChange={(e) => setCerts(e.target.value)} /></div>
            </div>
            <div className="row"><button className="primary" onClick={save}>Save profile</button></div>
          </div>
        )}
      </div>
    </>
  );
}
