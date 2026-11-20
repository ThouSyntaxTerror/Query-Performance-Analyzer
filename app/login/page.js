'use client';
import { useState } from 'react';
import { api } from '../components';

export default function Login() {
  const [f, setF] = useState({ username: '', password: '' });
  const [err, setErr] = useState('');
  async function submit(e) {
    e.preventDefault();
    try { const u = await api('/api/login', { method: 'POST', body: f }); window.location.href = u.role === 'admin' ? '/admin' : '/student'; }
    catch (x) { setErr(x.message); }
  }
  return (
    <form className="card login" onSubmit={submit}>
      <h1>Placement Portal</h1>
      <p className="muted">Sign in as an admin (placement officer) or as a student.</p>
      <input placeholder="Username" value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoFocus />
      <input placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
      <button className="primary" style={{ width: '100%' }}>Sign in</button>
      {err && <div className="err">{err}</div>}
    </form>
  );
}
