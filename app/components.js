'use client';
import { useEffect, useState } from 'react';

export async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/login')) window.location.href = '/login';
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('en-US'));

// loads the logged-in user; sends visitors of the wrong area to their own page
export function useUser(expectedRole) {
  const [user, setUser] = useState(null);
  useEffect(() => {
    api('/api/me').then((u) => {
      if (expectedRole && u.role !== expectedRole) window.location.href = u.role === 'admin' ? '/admin' : '/student';
      else setUser(u);
    }).catch(() => {});
  }, [expectedRole]);
  return user;
}

export function Header({ user }) {
  async function logout() { await api('/api/logout', { method: 'POST' }); window.location.href = '/login'; }
  return (
    <div className="top"><div className="wrap">
      <span className="brand">Placement Portal</span>
      <div className="who"><span>{user.username}</span><span className="role">{user.role}</span><button onClick={logout}>Log out</button></div>
    </div></div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return <div className="tabs">{tabs.map(([id, label]) => <button key={id} className={value === id ? 'on' : ''} onClick={() => onChange(id)}>{label}</button>)}</div>;
}

export const Status = ({ s }) => <span className={`pill st-${s}`}>{s}</span>;

// run an action and show its result or error message
export function useAction() {
  const [msg, setMsg] = useState(null);
  const run = async (fn, okText) => {
    setMsg(null);
    try { const r = await fn(); setMsg({ ok: okText || 'Done' }); return r; } catch (e) { setMsg({ err: e.message }); return null; }
  };
  const Box = () => (msg ? <div className={msg.err ? 'err' : 'ok'}>{msg.err || msg.ok}</div> : null);
  return [run, Box];
}

export function JobsTable({ jobs, onApply, applyLabel = 'Apply', extra }) {
  if (!jobs.length) return <p className="muted">No jobs match.</p>;
  return (
    <table>
      <thead><tr><th>Job</th><th>Company</th><th className="num">Package (LPA)</th><th className="num">Min CGPA</th>{jobs[0]?.vacancies !== undefined && <th className="num">Vacancies</th>}<th>Deadline</th>{extra && <th className="num">Match</th>}<th /></tr></thead>
      <tbody>{jobs.map((j) => (
        <tr key={j.job_id}>
          <td><b>{j.title}</b></td><td>{j.company}{j.location ? <span className="muted"> ({j.location})</span> : null}</td>
          <td className="num">{j.package_lpa}</td><td className="num">{j.min_cgpa}</td>{j.vacancies !== undefined && <td className="num">{j.vacancies}</td>}<td>{j.deadline}</td>
          {extra && <td className="num match">{j.match_score}%<span className="meterbar" style={{ width: Math.round(j.match_score) * 0.6 }} /></td>}
          <td className="num">{onApply && <button onClick={() => onApply(j)}>{applyLabel}</button>}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
