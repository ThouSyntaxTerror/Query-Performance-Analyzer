'use client';
import { useCallback, useEffect, useState } from 'react';
import { CompareView, QueryInput, RunView, Tag, api, fmt, ms } from './components';

export default function Page() {
  const [state, setState] = useState(null);
  const [mode, setMode] = useState('single');         // single | queries | runs
  const [sqlA, setSqlA] = useState('');
  const [sqlB, setSqlB] = useState('');
  const [note, setNote] = useState('');
  const [runs, setRuns] = useState({ queryId: '', list: [], a: '', b: '' });
  const [single, setSingle] = useState(null);
  const [pair, setPair] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const refresh = useCallback(() => api('/api/state').then(setState).catch((e) => setErr(e.message)), []);
  useEffect(() => { refresh(); }, [refresh]);

  const reset = (m) => { setMode(m); setErr(''); setSingle(null); setPair(null); };

  async function pickQuery(queryId) {
    if (!queryId) { setRuns({ queryId: '', list: [], a: '', b: '' }); return; }
    const list = await api(`/api/runs?queryId=${queryId}`);
    setRuns({ queryId, list, a: list[1]?.execution_id ?? list[0]?.execution_id ?? '', b: list[0]?.execution_id ?? '' });
  }

  async function go() {
    setBusy(true); setErr(''); setSingle(null); setPair(null);
    try {
      if (mode === 'single') {
        setSingle(await api('/api/analyze', { method: 'POST', body: { sql: sqlA, note } }));
      } else if (mode === 'queries') {
        const a = await api('/api/analyze', { method: 'POST', body: { sql: sqlA } });
        const b = await api('/api/analyze', { method: 'POST', body: { sql: sqlB } });
        setPair({ a, b });
      } else {
        if (!runs.a || !runs.b) throw new Error('Choose a query and two runs first.');
        setPair({ a: await api(`/api/run/${runs.a}`), b: await api(`/api/run/${runs.b}`) });
      }
      refresh();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }

  if (!state) return <div className="wrap">{err ? <div className="err">{err}</div> : <p className="muted">Connecting to MySQL...</p>}</div>;
  const n = (name) => state.counts.find((c) => c.table_name === name)?.n;

  return (
    <div className="wrap">
      <h1>MySQL Query Analyzer</h1>
      <p className="sub">Run a query on a real shop database, see exactly how MySQL executed it, and find out why it was fast or slow.</p>

      <div className="strip">
        <span>MySQL <b>{state.info.version}</b></span>
        <span>database <b>{state.info.db}</b></span>
        <span>app account <b>{state.info.account}</b></span>
        <span><b>{fmt(n('query_executions'))}</b> runs stored</span>
        <span><b>{fmt(n('saved_queries'))}</b> saved queries</span>
        <span><b>{fmt(n('orders'))}</b> orders, <b>{fmt(n('order_items'))}</b> order items</span>
        <span>timeout <b>{state.info.timeoutMs / 1000} s</b>, read-only</span>
      </div>

      <div className="card">
        <h2>1. Choose what to do</h2>
        <div className="seg">
          <button className={mode === 'single' ? 'on' : ''} onClick={() => reset('single')}>Analyze one query</button>
          <button className={mode === 'queries' ? 'on' : ''} onClick={() => reset('queries')}>Compare two queries</button>
          <button className={mode === 'runs' ? 'on' : ''} onClick={() => reset('runs')}>Compare two runs</button>
        </div>

        <h2 style={{ marginTop: 18 }}>2. Pick or write the SQL</h2>
        {mode === 'single' && <QueryInput presets={state.presets} value={sqlA} onChange={setSqlA} showNote note={note} onNote={setNote} />}
        {mode === 'queries' && (
          <div className="grid g2">
            <QueryInput title="Query A" presets={state.presets} value={sqlA} onChange={setSqlA} />
            <QueryInput title="Query B" presets={state.presets} value={sqlB} onChange={setSqlB} />
          </div>
        )}
        {mode === 'runs' && (
          <div>
            <p className="muted" style={{ marginTop: 0 }}>Pick a query that has been run more than once (for example before and after you add an index in the MySQL terminal), then two of its stored runs.</p>
            <select value={runs.queryId} onChange={(e) => pickQuery(e.target.value)}>
              <option value="">Choose a query with stored runs...</option>
              {state.queries.map((q) => <option key={q.query_id} value={q.query_id}>{q.label} ({q.runs} runs)</option>)}
            </select>
            {runs.list.length > 0 && (
              <div className="grid g2" style={{ marginTop: 10 }}>
                {['a', 'b'].map((k) => (
                  <label key={k}>Run {k.toUpperCase()}
                    <select value={runs[k]} onChange={(e) => setRuns({ ...runs, [k]: e.target.value })}>
                      {runs.list.map((r) => <option key={r.execution_id} value={r.execution_id}>#{r.execution_id} at {r.executed_at}: {ms(r.duration_ms)} ms, {fmt(r.rows_examined)} rows examined{r.run_note ? `, ${r.run_note}` : ''}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <h2 style={{ marginTop: 18 }}>3. Run</h2>
        <div className="row">
          <button className="primary" onClick={go} disabled={busy}>{busy ? 'Running on MySQL...' : mode === 'single' ? 'Run analysis' : 'Run and compare'}</button>
          <span className="muted">Only one read-only SELECT or WITH query is accepted. It runs as <code>qa_runner</code>, which can read the four shop tables and nothing else.</span>
        </div>
        {err && <div className="err">{err}</div>}
      </div>

      {single && <div className="card"><RunView run={single} heading="Result" /></div>}
      {pair && <div className="card"><CompareView a={pair.a} b={pair.b} /></div>}
      {(single || pair) && (
        <div className="card say">
          <h2>Say this to your professor</h2>
          {single && <p style={{ margin: 0 }}>{single.presenter}</p>}
          {pair && <><p><b>Run A.</b> {pair.a.presenter}</p><p style={{ marginBottom: 0 }}><b>Run B.</b> {pair.b.presenter}</p></>}
        </div>
      )}

      <div className="card">
        <h2>Which queries should be fixed first? (stored runs, from the MySQL view <code>v_workload_priority</code>)</h2>
        <p className="muted" style={{ marginTop: 0 }}>Priority is total time spent: how often a query ran multiplied by how long it takes. A fast query that runs very often can matter more than a slow one that runs once.</p>
        <table>
          <thead><tr><th>#</th><th>Query</th><th className="num">Runs</th><th className="num">Avg ms</th><th className="num">Total ms</th><th className="num">Share</th><th className="num">Examined per returned</th></tr></thead>
          <tbody>{state.priority.map((p) => (
            <tr key={p.query_id}><td>{p.priority_rank}</td><td>{p.label}</td><td className="num">{fmt(p.runs)}</td><td className="num">{ms(p.avg_ms)}</td><td className="num">{ms(p.total_ms)}</td><td className="num">{p.pct_of_workload}%</td><td className="num">{p.examined_per_returned ?? 'n/a'}</td></tr>
          ))}</tbody>
        </table>

        <h2 style={{ marginTop: 22 }}>Latest stored runs</h2>
        <table>
          <thead><tr><th>Run</th><th>Query</th><th>When</th><th className="num">ms</th><th className="num">Examined</th><th className="num">Returned</th></tr></thead>
          <tbody>{state.recent.map((r) => (
            <tr key={r.execution_id}><td>#{r.execution_id}</td><td>{r.label}{r.run_note ? ` (${r.run_note})` : ''}</td><td>{r.executed_at}</td><td className="num">{ms(r.duration_ms)}</td><td className="num">{fmt(r.rows_examined)}</td><td className="num">{fmt(r.rows_returned)}</td></tr>
          ))}</tbody>
        </table>
        <p className="muted">These rows are read from the database, so this table matches <code>SELECT * FROM query_executions ORDER BY execution_id DESC LIMIT 8;</code> in the MySQL terminal.</p>
      </div>

      <div className="card">
        <h2>How to read this page</h2>
        <p style={{ marginTop: 0 }}><Tag kind="measured" /> numbers were counted by MySQL while it really executed the query (<code>EXPLAIN ANALYZE</code>). <Tag kind="estimate" /> numbers are the optimizer's guesses made before running; they are shown dashed and are never used as results.</p>
        <p style={{ marginBottom: 0 }}>A <b>table scan</b> reads every row of the table; an <b>index lookup</b> or <b>range scan</b> jumps to just the matching rows. The more rows examined per row returned, the more work was wasted, which is what the MySQL triggers watch for when they create recommendations.</p>
      </div>
    </div>
  );
}
