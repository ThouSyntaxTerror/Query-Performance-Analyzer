'use client';
import { useEffect, useState } from 'react';
import { QueryInput, RatingCard, RunView, api } from './components';

export default function Page() {
  const [presets, setPresets] = useState([]);
  const [sql, setSql] = useState('');
  const [run, setRun] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api('/api/state').then((s) => setPresets(s.presets)).catch((e) => setErr(e.message)); }, []);

  async function analyze() {
    setBusy(true); setErr(''); setRun(null);
    try { setRun(await api('/api/analyze', { method: 'POST', body: { sql } })); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  }

  return (
    <div className="wrap">
      <h1>MySQL Query Analyzer</h1>

      <div className="card">
        <QueryInput presets={presets} value={sql} onChange={setSql} />
        <div className="row">
          <button className="primary" onClick={analyze} disabled={busy}>{busy ? 'Analyzing...' : 'Analyze'}</button>
        </div>
        {err && <div className="err">{err}</div>}
      </div>

      {run && (
        <>
          <div className="card"><RatingCard run={run} /></div>
          <div className="card">
            <details>
              <summary className="muted" style={{ cursor: 'pointer' }}>Technical details: measured values, estimates, plan, tables</summary>
              <p style={{ marginTop: 12 }}>{run.presenter}</p>
              <RunView run={run} />
            </details>
          </div>
        </>
      )}
    </div>
  );
}
