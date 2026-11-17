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

// ---------------------------------------------------------------- the short answer: rating + what to change
export function RatingCard({ run }) {
  const r = run.rating;
  const tone = r.grade === 'GOOD' ? 'good' : r.grade === 'FAIR' ? 'fair' : 'poor';
  return (
    <div>
      <div className="rating">
        <div className={`score ${tone}`}><b>{r.score}</b><span>/ 100</span></div>
        <div className="verdict">
          <div className={`grade ${tone}`}>{r.grade}</div>
          <div>{r.summary}</div>
          <div className="meter"><i className={tone} style={{ width: `${r.score}%` }} /></div>
        </div>
      </div>

      {r.reasons.length > 0 && (
        <>
          <h3>Why this score</h3>
          <table><tbody>
            {r.reasons.map((x, i) => <tr key={i}><td className="num bad">-{x.points}</td><td>{x.text}</td></tr>)}
          </tbody></table>
        </>
      )}

      <h3>{r.suggestions.length ? 'Suggested changes' : 'Suggested changes: none'}</h3>
      {r.suggestions.length === 0 && <p className="muted" style={{ margin: 0 }}>This query does not need changes.</p>}
      {r.suggestions.map((s, i) => (
        <div className="acc" key={i}>
          <b>{i + 1}. {s.title}</b>
          <p className="why">{s.why}</p>
          {s.code && <pre>{s.code}</pre>}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- DBMS analysis: scores, access paths, totals
const pct = (v) => (v == null ? 'n/a' : `${v >= 10 ? Math.round(v) : v.toFixed(1)}%`);

function Tile({ big, label, note }) {
  return (
    <div className="stat">
      <b>{big}</b>
      <span><strong>{label}</strong><br />{note}</span>
    </div>
  );
}

export function AnalysisPanel({ run }) {
  const m = run.metrics;
  const e = run.execution;
  const w = m.workload;
  const a = m.accuracy;
  const f = m.features;
  const tables = [...new Set(m.accessPaths.map((p) => p.table))];
  const feats = [
    f.joins.length ? `${f.joins.join(' + ')} (inner side ran ${fmt(f.innerLoops)} time${f.innerLoops === 1 ? '' : 's'})` : null,
    f.temporaryTable ? 'temporary table' : null,
    f.sort ? 'sort (filesort)' : null,
    f.materialize ? 'materialized CTE' : null,
    f.aggregate ? 'aggregation' : null,
    f.coveringIndex ? 'covering index (index-only read)' : null,
  ].filter(Boolean);

  return (
    <div>
      <h3>Scores</h3>
      <div className="grid g4">
        <Tile big={pct(m.scanEfficiency)} label="Scan efficiency"
          note={`${fmt(m.kept)} rows kept of ${fmt(m.examined)} examined. Low means rows were read only to be discarded.`} />
        <Tile big={a.worst ? `x${a.worst.q.toFixed(1)}` : 'n/a'} label="Optimizer accuracy (q-error)"
          note={a.worst ? `Worst step: "${a.worst.step.slice(0, 48)}": expected ${fmt(Math.round(a.worst.est))} rows, got ${fmt(Math.round(a.worst.act))}. x1.0 is exact.` : 'No step has both an estimate and a measurement.'} />
        <Tile big={m.costPer1000 == null ? 'n/a' : `${ms(m.costPer1000)} ms`} label="Cost per 1,000 rows"
          note="Measured time divided by rows examined, times 1,000." />
        <Tile big={w ? `#${w.priority_rank} of ${w.ofTotal}` : 'n/a'} label="Workload priority"
          note={w ? `${fmt(w.runs)} run${w.runs === 1 ? '' : 's'}, average ${ms(w.avg_ms)} ms, ${w.pct_of_workload}% of all stored time (runs x average time).` : 'Not ranked yet.'} />
      </div>

      <h3>This run</h3>
      <table><tbody>
        <tr><td className="muted">Rows returned</td><td className="num">{fmt(e.rows_returned)}</td>
          <td className="muted">Columns returned</td><td className="num">{m.columns ? `${m.columns.count} (${m.columns.names.join(', ')})` : 'n/a'}</td></tr>
        <tr><td className="muted">Rows examined</td><td className="num">{fmt(m.examined)}</td>
          <td className="muted">Tables accessed</td><td className="num">{tables.length} ({tables.join(', ')})</td></tr>
        <tr><td className="muted">Execution time</td><td className="num">{ms(e.duration_ms)} ms</td>
          <td className="muted">Execution features</td><td className="num">{feats.length ? feats.join('; ') : 'none'}</td></tr>
      </tbody></table>

      <h3>How MySQL executed it</h3>
      <table>
        <thead><tr><th>Table</th><th>Access type</th><th>Index</th><th className="num">Examined</th><th className="num">Kept</th><th className="num">Selectivity</th><th className="num">Loops</th></tr></thead>
        <tbody>
          {m.accessPaths.map((p, i) => (
            <tr key={i}>
              <td><b>{p.table}</b></td>
              <td><span className={`badge ${p.type === 'ALL' ? 'scan' : 'idx'}`}>{p.type}</span> <span className="muted">{p.method}</span></td>
              <td>{p.index ? <code>{p.index}</code> : <span className="muted">none</span>}</td>
              <td className="num">{fmt(p.examined)}</td><td className="num">{fmt(p.kept)}</td>
              <td className="num">{p.selectivity == null ? <span className="muted">no filter</span> : pct(p.selectivity)}</td>
              <td className="num">{fmt(p.loops)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>All queries run so far (from the MySQL database)</h3>
      <div className="totals">
        <span><b>{fmt(m.totals.runs)}</b> queries run</span>
        <span><b>{fmt(m.totals.queries)}</b> distinct</span>
        <span><b>{fmt(m.totals.rows_examined)}</b> rows examined</span>
        <span><b>{fmt(m.totals.rows_returned)}</b> rows returned</span>
        <span><b>{fmt(m.totals.total_ms)}</b> ms spent</span>
        {m.totals.mongo_documents != null && <span><b>{fmt(m.totals.mongo_documents)}</b> plan documents in MongoDB</span>}
      </div>
    </div>
  );
}
