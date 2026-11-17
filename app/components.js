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
export function QueryInput({ title, presets, value, onChange, showNote, note, onNote }) {
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
      {title && <h3 style={{ marginTop: 0 }}>{title}</h3>}
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
      {showNote && (
        <div className="row"><input type="text" value={note} onChange={(e) => onNote(e.target.value)} maxLength={100}
          placeholder="Optional run label, e.g. before index / after index" /></div>
      )}
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

      <h3>Measured by MySQL during this run <Tag kind="measured" /></h3>
      <div className="grid g4">
        <div className="stat m"><b>{ms(e.duration_ms)} ms</b><span>Execution time (root node of the plan)</span></div>
        <div className="stat m"><b>{fmt(e.rows_examined)}</b><span>Rows examined (sum over table accesses)</span></div>
        <div className="stat m"><b>{fmt(e.rows_returned)}</b><span>Rows returned</span></div>
        <div className="stat m"><b>{ratio(e.rows_examined, e.rows_returned)}</b><span>Rows examined per row returned</span></div>
      </div>
      <h3>Estimated by the optimizer before running <Tag kind="estimate" /></h3>
      <div className="grid g4">
        <div className="stat e"><b>{e.estimated_cost == null ? 'n/a' : fmt(e.estimated_cost)}</b><span>Cost units (not milliseconds)</span></div>
        <div className="stat e"><b>{e.estimated_rows == null ? 'n/a' : fmt(e.estimated_rows)}</b><span>Rows expected from the root step</span></div>
      </div>

      <h3>Tables accessed and why their rows were examined</h3>
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

      <h3>Recommendations stored for this query (created by MySQL triggers from any of its runs)</h3>
      {run.recommendations.length === 0 ? <p className="muted">None: nothing in the stored runs of this query crossed a trigger threshold.</p> : (
        <table><tbody>
          {run.recommendations.map((r) => (
            <tr key={r.rec_id}><td><span className={`badge sev-${r.severity}`}>{r.severity}</span></td><td>{r.suggestion}</td><td className="muted">{r.status}</td></tr>
          ))}
        </tbody></table>
      )}

      <h3>Actual MySQL execution plan (EXPLAIN ANALYZE)</h3>
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
      <details><summary className="muted" style={{ cursor: 'pointer', marginTop: 8 }}>Show the raw text exactly as MySQL returned it</summary><pre>{run.plan.text}</pre></details>

      <h3>Similar stored queries (cosine similarity computed inside MySQL)</h3>
      <table>
        <thead><tr><th>Query</th><th className="num">Similarity</th><th className="num">Avg ms</th></tr></thead>
        <tbody>{run.similar.map((s) => <tr key={s.query_id}><td>{s.label}</td><td className="num">{Number(s.similarity).toFixed(3)}</td><td className="num">{ms(s.avg_ms)}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- comparison of two runs
function change(a, b, lowerIsBetter = true) {
  if (a == null || b == null) return { text: 'n/a' };
  if (a === 0 && b === 0) return { text: 'no change' };
  if (a === 0) return { text: 'new' };
  const pct = ((b - a) / a) * 100;
  if (Math.abs(pct) < 1) return { text: 'about the same' };
  const better = lowerIsBetter ? pct < 0 : pct > 0;
  return { text: `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`, cls: better ? 'good' : 'bad' };
}

export function CompareView({ a, b }) {
  const ea = a.execution, eb = b.execution;
  const rows = [
    ['Execution time (ms)', 'measured', ea.duration_ms, eb.duration_ms, ms],
    ['Rows examined', 'measured', ea.rows_examined, eb.rows_examined, fmt],
    ['Rows returned', 'measured', ea.rows_returned, eb.rows_returned, fmt],
    ['Examined per returned', 'measured', ea.rows_returned ? ea.rows_examined / ea.rows_returned : null, eb.rows_returned ? eb.rows_examined / eb.rows_returned : null, (v) => (v == null ? 'n/a' : v.toFixed(1))],
    ['Optimizer cost', 'estimate', ea.estimated_cost, eb.estimated_cost, fmt],
    ['Optimizer rows', 'estimate', ea.estimated_rows, eb.estimated_rows, fmt],
  ];
  const tables = [...new Set([...a.access, ...b.access].map((x) => x.table_name))];
  const how = (run, t) => run.access.filter((x) => x.table_name === t).map((x) => `${x.access_method}${x.index_name ? ` (${x.index_name})` : ''}: ${fmt(x.rows_examined)} rows`).join('; ') || 'not accessed';
  const t = change(ea.duration_ms, eb.duration_ms);
  const x = change(ea.rows_examined, eb.rows_examined);
  return (
    <div>
      <h2>Comparison: run A versus run B</h2>
      <table>
        <thead><tr><th>Metric</th><th>Kind</th><th className="num">A (#{ea.execution_id})</th><th className="num">B (#{eb.execution_id})</th><th className="num">B compared with A</th></tr></thead>
        <tbody>
          {rows.map(([name, kind, va, vb, f]) => {
            const c = change(va, vb);
            return <tr key={name}><td>{name}</td><td><Tag kind={kind} /></td><td className="num">{f(va)}</td><td className="num">{f(vb)}</td><td className={`num ${c.cls || ''}`}>{c.text}</td></tr>;
          })}
        </tbody>
      </table>
      <h3>How each table was reached</h3>
      <table>
        <thead><tr><th>Table</th><th>Run A</th><th>Run B</th></tr></thead>
        <tbody>{tables.map((tb) => <tr key={tb}><td><b>{tb}</b></td><td>{how(a, tb)}</td><td>{how(b, tb)}</td></tr>)}</tbody>
      </table>
      <p className="say card" style={{ marginTop: 14 }}>
        <b>In words:</b> run B took {ms(eb.duration_ms)} ms against {ms(ea.duration_ms)} ms for run A (<span className={t.cls}>{t.text}</span>, measured) and examined {fmt(eb.rows_examined)} rows against {fmt(ea.rows_examined)} (<span className={x.cls}>{x.text}</span>, measured).
        {ea.query_id !== eb.query_id ? ' The two runs are different queries, so differences also reflect different work, not only different plans.' : ' Both runs are the same query, so any difference comes from the plan, data or caching.'}
        {' '}Single-run timings vary a little (caching, other programs), so repeat a run before drawing conclusions from small differences.
      </p>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card"><RunView run={a} heading="Run A" /></div>
        <div className="card"><RunView run={b} heading="Run B" /></div>
      </div>
    </div>
  );
}
