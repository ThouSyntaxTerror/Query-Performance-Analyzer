'use client';
import { useCallback, useEffect, useState } from 'react';
import { Header, JobsTable, Status, Tabs, api, fmt, useAction, useUser } from '../components';

const STATUSES = ['APPLIED', 'SHORTLISTED', 'INTERVIEW', 'REJECTED'];

export default function Admin() {
  const user = useUser('admin');
  const [tab, setTab] = useState('stats');
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');
  const [cands, setCands] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [audit, setAudit] = useState([]);
  const [who, setWho] = useState([]);
  const [objs, setObjs] = useState(null);
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [jobForm, setJobForm] = useState({ company_id: '', title: '', description: '', min_cgpa: 6, vacancies: 2, package_lpa: 8, deadline: '' });
  const [coForm, setCoForm] = useState({ name: '', industry: '', location: '' });
  const [run, Msg] = useAction();

  const loadStats = useCallback(() => api('/api/admin/stats').then(setStats), []);
  const loadCands = useCallback((id) => id ? api(`/api/admin/candidates/${id}`).then(setCands) : setCands([]), []);
  useEffect(() => {
    if (!user) return;
    loadStats(); api('/api/jobs').then(setJobs); api('/api/admin/companies').then(setCompanies);
  }, [user]); // eslint-disable-line
  useEffect(() => {
    if (tab === 'audit') api('/api/admin/audit').then(setAudit);
    if (tab === 'who') api('/api/admin/inserted-by').then(setWho);
    if (tab === 'db' && !objs) api('/api/admin/db-objects').then(setObjs);
  }, [tab]); // eslint-disable-line

  const changeStatus = (a, status) => run(async () => { await api(`/api/admin/applications/${a.application_id}`, { method: 'PATCH', body: { status } }); await loadCands(jobId); }, `${a.full_name} set to ${status}`);
  const place = (a) => run(async () => { await api(`/api/admin/applications/${a.application_id}`, { method: 'PATCH', body: { place: true } }); await loadCands(jobId); await loadStats(); api('/api/jobs').then(setJobs); }, `${a.full_name} placed (one MySQL transaction)`);
  const addJob = () => run(async () => { await api('/api/admin/jobs', { method: 'POST', body: jobForm }); api('/api/jobs').then(setJobs); loadStats(); }, 'Job posted. MySQL triggers built its skill vector.');
  const addCompany = () => run(async () => { await api('/api/admin/companies', { method: 'POST', body: coForm }); api('/api/admin/companies').then(setCompanies); }, 'Company added');
  const search = () => run(async () => setFound(await api(`/api/admin/resume-search?q=${encodeURIComponent(q)}`)), 'Search done');

  if (!user) return <div className="wrap"><p className="muted">Loading...</p></div>;
  return (
    <>
      <Header user={user} />
      <div className="wrap">
        <Tabs value={tab} onChange={setTab} tabs={[['stats', 'Dashboard'], ['cands', 'Applicants'], ['jobs', 'Jobs'], ['add', 'Add job or company'], ['resumes', 'Resumes (MongoDB)'], ['audit', 'Audit log'], ['who', 'Who inserts rows'], ['db', 'Database objects']]} />
        <Msg />

        {tab === 'stats' && stats && (
          <>
            <div className="grid g4" style={{ marginTop: 16 }}>
              {[['students', 'Students'], ['companies', 'Companies'], ['open_jobs', 'Open jobs'], ['applications', 'Applications'], ['placements', 'Placed'], ['avg_package', 'Avg package (LPA)']].map(([k, l]) => (
                <div className="stat" key={k}><b>{fmt(stats.totals[k])}</b><span>{l}</span></div>))}
            </div>
            <div className="grid g2" style={{ marginTop: 4 }}>
              <div className="card"><h2>Companies (MySQL view v_placement_stats)</h2>
                <table><thead><tr><th>Company</th><th className="num">Jobs</th><th className="num">Applications</th><th className="num">Placed</th><th className="num">Avg LPA</th></tr></thead>
                  <tbody>{stats.companies.map((c) => <tr key={c.company_id}><td>{c.company}</td><td className="num">{c.jobs}</td><td className="num">{c.applications}</td><td className="num">{c.placed}</td><td className="num">{c.avg_package_lpa ?? '-'}</td></tr>)}</tbody></table></div>
              <div className="card"><h2>Branches (view v_branch_stats)</h2>
                <table><thead><tr><th>Branch</th><th className="num">Students</th><th className="num">Applications</th><th className="num">Placed</th><th className="num">%</th></tr></thead>
                  <tbody>{stats.branches.map((b) => <tr key={b.branch}><td>{b.branch}</td><td className="num">{b.students}</td><td className="num">{b.applications}</td><td className="num">{b.placed}</td><td className="num">{b.placed_pct}</td></tr>)}</tbody></table></div>
            </div>
            <div className="grid g2">
              <div className="card"><h2>Popular jobs (GROUP BY ... HAVING COUNT(*) at least 80)</h2>
                <table><tbody>{stats.popular.map((p) => <tr key={p.job_id}><td>{p.title} <span className="muted">{p.company}</span></td><td className="num">{p.applications} applications</td><td className="num">avg match {p.avg_match}%</td></tr>)}</tbody></table></div>
              <div className="card"><h2>Top skills (MongoDB aggregation pipeline)</h2>
                {stats.nosql.error ? <div className="err">MongoDB: {stats.nosql.error}</div> : (
                  <table><tbody>{stats.nosql.skills.map((s) => <tr key={s.skill}><td>{s.skill}</td><td className="num">{s.students} students</td><td className="num">avg CGPA {s.avg_cgpa}</td></tr>)}</tbody></table>)}
                {stats.nosql.resumes != null && <p className="muted">{fmt(stats.nosql.resumes)} resume documents in MongoDB</p>}</div>
            </div>
          </>
        )}

        {tab === 'cands' && (
          <div className="card">
            <div className="bar">
              <select value={jobId} onChange={(e) => { setJobId(e.target.value); loadCands(e.target.value); }}>
                <option value="">Choose a job to see its applicants...</option>
                {jobs.map((j) => <option key={j.job_id} value={j.job_id}>{j.title} at {j.company} ({j.status}, {j.vacancies} vacancies)</option>)}
              </select>
            </div>
            {cands.length > 0 && (
              <table style={{ marginTop: 14 }}>
                <thead><tr><th>Student</th><th>Branch</th><th className="num">CGPA</th><th className="num">Match</th><th>Status</th><th>Change</th><th /></tr></thead>
                <tbody>{cands.map((a) => (
                  <tr key={a.application_id}><td><b>{a.full_name}</b></td><td>{a.branch}</td><td className="num">{a.cgpa}</td><td className="num match">{a.match_score}%</td>
                    <td><Status s={a.status} /></td>
                    <td>{a.status !== 'SELECTED' && <select value={a.status} onChange={(e) => changeStatus(a, e.target.value)} style={{ width: 130 }}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>}</td>
                    <td className="num">{(a.status === 'SHORTLISTED' || a.status === 'INTERVIEW') && <button className="primary" onClick={() => place(a)}>Place</button>}</td></tr>
                ))}</tbody>
              </table>
            )}
            <p className="muted">Ranked by match score: cosine similarity between the student's skill vector and the job's vector, computed by a MySQL function.</p>
          </div>
        )}

        {tab === 'jobs' && <div className="card"><JobsTable jobs={jobs} /></div>}

        {tab === 'add' && (
          <div className="grid g2">
            <div className="card"><h2>Post a job</h2>
              <label className="f">Company</label>
              <select value={jobForm.company_id} onChange={(e) => setJobForm({ ...jobForm, company_id: e.target.value })}><option value="">Choose...</option>{companies.map((c) => <option key={c.company_id} value={c.company_id}>{c.name}</option>)}</select>
              <label className="f">Title</label><input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} />
              <label className="f">Description (mention the skills: python, sql, react ...)</label><textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} />
              <div className="grid g4">
                {[['min_cgpa', 'Min CGPA'], ['vacancies', 'Vacancies'], ['package_lpa', 'Package (LPA)']].map(([k, l]) => <div key={k}><label className="f">{l}</label><input type="number" step="0.1" value={jobForm[k]} onChange={(e) => setJobForm({ ...jobForm, [k]: e.target.value })} /></div>)}
                <div><label className="f">Deadline</label><input type="date" value={jobForm.deadline} onChange={(e) => setJobForm({ ...jobForm, deadline: e.target.value })} /></div>
              </div>
              <div className="row"><button className="primary" onClick={addJob}>Post job</button></div>
            </div>
            <div className="card"><h2>Add a company</h2>
              {[['name', 'Name'], ['industry', 'Industry'], ['location', 'Location']].map(([k, l]) => <div key={k}><label className="f">{l}</label><input value={coForm[k]} onChange={(e) => setCoForm({ ...coForm, [k]: e.target.value })} /></div>)}
              <div className="row"><button className="primary" onClick={addCompany}>Add company</button></div>
            </div>
          </div>
        )}

        {tab === 'resumes' && (
          <div className="card">
            <h2>Full-text search over resume documents (MongoDB text index)</h2>
            <div className="bar"><input placeholder="e.g. kubernetes docker" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} /><button className="primary" onClick={search}>Search</button></div>
            {found && (found.length === 0 ? <p className="muted">No resume matches.</p> : (
              <table style={{ marginTop: 12 }}><thead><tr><th>Student</th><th>Branch</th><th className="num">CGPA</th><th>Skills</th></tr></thead>
                <tbody>{found.map((r) => <tr key={r.student_id}><td><b>{r.full_name}</b></td><td>{r.branch}</td><td className="num">{r.cgpa}</td><td>{r.skills.map((s) => <span className="pill" key={s}>{s}</span>)}</td></tr>)}</tbody></table>))}
            {stats?.nosql.events?.length > 0 && <><h3>Latest events (MongoDB collection events)</h3>
              <table><tbody>{stats.nosql.events.map((e, i) => <tr key={i}><td>{e.type}</td><td className="muted">user {e.user_id}</td><td className="muted">{new Date(e.at).toLocaleString()}</td></tr>)}</tbody></table></>}
          </div>
        )}

        {tab === 'audit' && (
          <div className="card"><h2>Audit log written by MySQL triggers</h2>
            <table><thead><tr><th>#</th><th>Table</th><th>Row</th><th>Action</th><th>Old</th><th>New</th><th>Changed by</th><th>When</th></tr></thead>
              <tbody>{audit.map((a) => <tr key={a.audit_id}><td>{a.audit_id}</td><td>{a.table_name}</td><td>{a.row_id}</td><td>{a.action}</td><td>{a.old_value ?? ''}</td><td>{a.new_value ?? ''}</td><td><b>{a.changed_by}</b></td><td>{a.changed_at}</td></tr>)}</tbody></table></div>
        )}

        {tab === 'who' && (
          <div className="card"><h2>Who inserts the rows? (every main table stores created_by)</h2>
            <table><thead><tr><th>Table</th><th>Inserted by role</th><th className="num">Rows</th><th className="num">Different users</th></tr></thead>
              <tbody>{who.map((w, i) => <tr key={i}><td><b>{w.table_name}</b></td><td>{w.role}</td><td className="num">{fmt(w.rows_inserted)}</td><td className="num">{w.distinct_users}</td></tr>)}</tbody></table>
            <p className="muted">Admins insert companies, jobs, students and placements. Students insert their own applications through a stored procedure. Triggers insert the audit log.</p></div>
        )}

        {tab === 'db' && objs && (
          <div className="grid g2">
            <div className="card"><h2>Triggers</h2><table><thead><tr><th>Name</th><th>Table</th><th>When</th></tr></thead>
              <tbody>{objs.triggers.map((t) => <tr key={t.name}><td><b>{t.name}</b></td><td>{t.on_table}</td><td>{t.timing} {t.event}</td></tr>)}</tbody></table></div>
            <div className="card"><h2>Procedures and functions</h2><table><tbody>{objs.routines.map((r) => <tr key={r.name}><td><b>{r.name}</b></td><td>{r.type}</td></tr>)}</tbody></table>
              <h3>Views</h3>{objs.views.map((v) => <span className="pill" key={v.name}>{v.name}</span>)}</div>
            <div className="card"><h2>Tables</h2><table><tbody>{objs.tables.map((t) => <tr key={t.name}><td><b>{t.name}</b></td><td className="num">{fmt(t.approx_rows)} rows</td></tr>)}</tbody></table></div>
            <div className="card"><h2>Foreign keys and delete rules</h2><table><tbody>{objs.fks.map((f, i) => <tr key={i}><td>{f.child}</td><td>references {f.parent}</td><td className="num">{f.on_delete}</td></tr>)}</tbody></table></div>
          </div>
        )}
      </div>
    </>
  );
}
