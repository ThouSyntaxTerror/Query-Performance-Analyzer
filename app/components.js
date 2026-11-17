'use client';
import { useRef, useState } from 'react';

export async function api(url, options = {}) {
  const res = await fetch(url, {
    method: options.method,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const fmt = (n) => (n == null ? '-' : Number(n).toLocaleString('en-US'));
export const ms = (v) => (v == null ? '-' : v >= 100 ? Number(v).toFixed(0) : v >= 1 ? Number(v).toFixed(1) : Number(v).toFixed(3));
export const ratio = (e, r) => (r > 0 ? (e / r).toFixed(1) : e > 0 ? 'n/a' : '0.0');

export const Tag = ({ kind }) => <span className={`tag ${kind}`}>{kind}</span>;

// ---------------------------------------------------------------- query input (preset / paste / upload)
export function QueryInput({ presets, value, onChange }) {
  const fileRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [fileErr, setFileErr] = useState('');

  async function upload(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileErr('');
    if (f.size > 100_000) { setFileErr('File is larger than 100 KB.'); return; }
    onChange(await f.text());
    setFileName(f.name);
    e.target.value = '';
  }

  return (
    <div>
      <select value="" onChange={(e) => { const p = presets.find((x) => String(x.query_id) === e.target.value); if (p) { onChange(p.sql_text); setFileName(''); } }}>
        <option value="">Choose a preset query...</option>
        {presets.map((p) => <option key={p.query_id} value={p.query_id}>{p.label}</option>)}
      </select>
      <textarea style={{ marginTop: 8 }} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false}
        placeholder="...or paste your own single SELECT / WITH query here" />
      <div className="row">
        <input ref={fileRef} type="file" accept=".sql,.txt" onChange={upload} hidden />
        <button onClick={() => fileRef.current?.click()}>Upload .sql file</button>
        {fileName && <span className="muted">loaded {fileName}</span>}
        {fileErr && <span className="bad">{fileErr}</span>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- one analysed run
export function RunView({ run, heading }) {
  const e = run.execution;
  return (
    <div>
      {heading && <h2>{heading}</h2>}
      <div className="muted" style={{ marginBottom: 8 }}>
        Run #{e.execution_id} of <b>{e.label}</b> at {e.executed_at}{e.run_note ? ` (${e.run_note})` : ''} on MySQL {run.plan.version}
      </div>
      <pre style={{ marginTop: 0 }}>{e.sql_text}</pre>

      <h3>Measured by MySQL while the query ran</h3>
      <div className="grid g4">
        <div className="stat m"><b>{ms(e.duration_ms)} ms</b><span>Execution time</span></div>
        <div className="stat m"><b>{fmt(e.rows_examined)}</b><span>Rows examined</span></div>
        <div className="stat m"><b>{fmt(e.rows_returned)}</b><span>Rows returned</span></div>
        <div className="stat m"><b>{ratio(e.rows_examined, e.rows_returned)}</b><span>Examined per row returned</span></div>
      </div>
      <h3>Estimated by the optimizer before it ran</h3>
      <div className="grid g4">
        <div className="stat e"><b>{e.estimated_cost == null ? 'n/a' : fmt(e.estimated_cost)}</b><span>Optimizer cost (not ms)</span></div>
        <div className="stat e"><b>{e.estimated_rows == null ? 'n/a' : fmt(e.estimated_rows)}</b><span>Rows expected</span></div>
      </div>

      <h3>Tables accessed</h3>
      {run.access.length === 0 && <p className="muted">No base-table access was found in this plan.</p>}
      {run.access.map((a) => (
        <div className="acc" key={a.access_id}>
          <div className="head">
            <b>{a.table_name}</b>{a.table_alias && <span className="muted">(alias {a.table_alias})</span>}
            <span className={`badge ${a.access_method === 'Table scan' ? 'scan' : 'idx'}`}>{a.access_method}</span>
            {a.index_name && <span>index <code>{a.index_name}</code></span>}
          </div>
          <div className="nums">
            <span><Tag kind="measured" /> examined <b>{fmt(a.rows_examined)}</b></span>
            <span><Tag kind="measured" /> kept <b>{fmt(a.rows_kept)}</b></span>
            <span><Tag kind="measured" /> loops <b>{fmt(a.loops)}</b></span>
            <span><Tag kind="estimate" /> rows per loop <b>{a.estimated_rows == null ? 'n/a' : fmt(a.estimated_rows)}</b></span>
          </div>
          {a.index_condition && <div className="muted">Index condition: <code>{a.index_condition}</code></div>}
          {a.filter_condition && <div className="muted">Filter applied to the rows: <code>{a.filter_condition}</code></div>}
          <p className="why"><b>Why:</b> {a.explanation}</p>
        </div>
      ))}

      <h3>Recommendations (MySQL triggers)</h3>
      {run.recommendations.length === 0 ? <p className="muted">None.</p> : (
        <table><tbody>
          {run.recommendations.map((r) => (
            <tr key={r.rec_id}><td><span className={`badge sev-${r.severity}`}>{r.severity}</span></td><td>{r.suggestion}</td><td className="muted">{r.status}</td></tr>
          ))}
        </tbody></table>
      )}

      <h3>EXPLAIN ANALYZE plan</h3>
      <div className="plan">
        {run.plan.nodes.map((n) => (
          <div key={n.id} className={`node ${/^Table scan on/.test(n.description) && !/<temporary>/.test(n.description) ? 'scan' : ''}`} style={{ marginLeft: n.depth * 18 }}>
            <span className="d">{n.description}</span><br />
            {n.estimate && <span className="chip e">estimate: cost {n.estimate.cost}, rows {fmt(Math.round(n.estimate.rows))}</span>}
            {n.measured && <span className="chip m">measured: {ms(n.measured.startMs)}..{ms(n.measured.endMs)} ms, rows {fmt(Math.round(n.measured.rows))}, loops {fmt(n.measured.loops)}</span>}
            {n.neverExecuted && <span className="chip e">never executed</span>}
            {!n.estimate && !n.measured && !n.neverExecuted && <span className="chip e">no numbers reported for this step</span>}
          </div>
        ))}
      </div>
      <details><summary className="muted" style={{ cursor: 'pointer', marginTop: 8 }}>Raw plan text</summary><pre>{run.plan.text}</pre></details>

      <h3>Similar queries (cosine similarity, computed in MySQL)</h3>
      <table>
        <thead><tr><th>Query</th><th className="num">Similarity</th><th className="num">Avg ms</th></tr></thead>
        <tbody>{run.similar.map((s) => <tr key={s.query_id}><td>{s.label}</td><td className="num">{Number(s.similarity).toFixed(3)}</td><td className="num">{ms(s.avg_ms)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
