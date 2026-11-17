// Turns one measured run into a 0-100 rating, a list of reasons and concrete suggestions for the query.
// Every input is a measured value (time, rows examined, rows kept by the filter) or the SQL text itself.
// The scoring is a transparent heuristic (documented in docs/REPORT.md), not something MySQL reports.

const fmt = (n) => Number(n).toLocaleString('en-US');
const WORDS = new Set(['and', 'or', 'not', 'between', 'like', 'in', 'is', 'null', 'true', 'false']);

// columns used in a filter such as "(orders.order_date between '2024-03-01' and '2024-03-31')"
function filterColumns(filter) {
  const text = filter.replace(/'(?:[^']|'')*'/g, "''").replace(/`/g, '').replace(/\b\w+\./g, '');
  const cols = [];
  for (const m of text.matchAll(/\b([a-z_]\w*)\s*(?:=|<>|!=|<=|>=|<|>|\bbetween\b|\blike\b|\bin\b)/gi)) {
    const c = m[1].toLowerCase();
    if (!WORDS.has(c) && !cols.includes(c)) cols.push(c);
  }
  return cols;
}

export function rateRun(run) {
  const e = run.execution;
  const sql = e.sql_text;
  const lower = sql.toLowerCase().replace(/\s+/g, ' ');
  const reasons = [];
  const suggestions = [];
  let score = 100;
  const penalty = (points, text) => { score -= points; reasons.push({ points, text }); };

  const examined = run.access.reduce((s, a) => s + a.rows_examined, 0);
  const wasted = run.access.reduce((s, a) => s + Math.max(0, a.rows_examined - (a.rows_kept ?? a.rows_examined)), 0);
  const wastePct = examined ? (wasted / examined) * 100 : 0;
  const isAggregate = /\b(count|sum|avg|min|max)\s*\(|\bgroup by\b/.test(lower);

  // 1. time
  const ms = e.duration_ms;
  if (ms >= 500) penalty(30, `Slow: ${Math.round(ms)} ms`);
  else if (ms >= 100) penalty(20, `Fairly slow: ${Math.round(ms)} ms`);
  else if (ms >= 30) penalty(10, `${Math.round(ms)} ms is noticeable for a simple query`);
  else if (ms >= 10) penalty(5, `${Math.round(ms)} ms`);

  // 2. rows read and then thrown away by a filter
  if (wasted >= 1000 && wastePct >= 90) penalty(35, `${fmt(wasted)} of the ${fmt(examined)} rows read (${Math.round(wastePct)}%) were thrown away by a filter`);
  else if (wasted >= 1000 && wastePct >= 50) penalty(25, `${fmt(wasted)} of the ${fmt(examined)} rows read (${Math.round(wastePct)}%) were thrown away by a filter`);
  else if (wasted >= 1000 && wastePct >= 20) penalty(10, `${fmt(wasted)} rows read were thrown away by a filter (${Math.round(wastePct)}%)`);

  // 3. whole-table scans of big tables
  const bigScans = run.access.filter((a) => a.access_method === 'Table scan' && a.rows_examined >= 20000);
  if (bigScans.length) penalty(10, `Reads every row of ${bigScans.map((a) => a.table_name).join(', ')} (${fmt(Math.max(...bigScans.map((a) => a.rows_examined)))} rows)`);

  // ---- suggestions
  for (const a of run.access) {
    if (a.access_method !== 'Table scan' || !a.filter_condition || a.rows_examined < 1000) continue;
    const keptPct = (a.rows_kept / a.rows_examined) * 100;
    const cols = filterColumns(a.filter_condition).slice(0, 2);
    if (cols.length && keptPct < 20) {
      suggestions.push({
        title: `Add an index on ${a.table_name}(${cols.join(', ')})`,
        why: `The filter on ${a.table_name} keeps only ${fmt(a.rows_kept)} of ${fmt(a.rows_examined)} rows, but with no index MySQL must read them all.`,
        code: `CREATE INDEX idx_${a.table_name}_${cols.join('_')} ON ${a.table_name} (${cols.join(', ')});`,
      });
    } else if (cols.length) {
      suggestions.push({
        title: `Narrow the filter on ${a.table_name}`,
        why: `The filter keeps ${Math.round(keptPct)}% of the table, so an index on ${cols.join(', ')} would help little. Add another condition or limit the rows you need.`,
      });
    }
  }

  if (/\blike '%/.test(lower)) {
    suggestions.push({
      title: "Avoid a leading % in LIKE",
      why: "A pattern that starts with % cannot use an index, so every row is checked. Search by prefix (LIKE 'abc%') if you can.",
    });
  }
  const where = lower.split(' where ')[1] ?? '';
  const fn = where.match(/\b(date_format|year|month|day|date|lower|upper|substring|concat|round)\s*\(\s*\w+(?:\.\w+)?\s*[,)]/);
  if (fn) {
    suggestions.push({
      title: `Do not wrap a column in ${fn[1].toUpperCase()}() inside WHERE`,
      why: 'Applying a function to a column hides it from its index. Compare the bare column to a value or a range instead.',
    });
  }
  if (/select\s+(distinct\s+)?\*/.test(lower)) {
    penalty(5, 'SELECT * reads every column');
    suggestions.push({ title: 'List only the columns you need instead of SELECT *', why: 'Fewer columns means less data to read and send.' });
  }
  if (run.plan.nodes.some((n) => /subquery in condition; dependent/i.test(n.description))) {
    penalty(10, 'Correlated subquery: it runs once for every outer row');
    suggestions.push({
      title: 'Rewrite the correlated subquery as a JOIN',
      why: 'Join to a grouped derived table (SELECT key, AVG(x) ... GROUP BY key) so the aggregate is computed once, not once per row.',
    });
  }
  if (!isAggregate && !/\blimit\b/.test(lower) && e.rows_returned >= 1000) {
    penalty(10, `Returns ${fmt(e.rows_returned)} rows with no LIMIT`);
    suggestions.push({
      title: 'Add a LIMIT',
      why: `It returns ${fmt(e.rows_returned)} rows. If the page only needs some of them, limit it.`,
      code: `${sql.replace(/\s+$/, '')}\nLIMIT 100`,
    });
  }
  if (isAggregate && ms >= 100 && examined >= 100000) {
    suggestions.push({
      title: 'Precompute the totals if this runs often',
      why: `It reads ${fmt(examined)} rows every time. A summary table updated when orders change avoids that.`,
    });
  }

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 'GOOD' : score >= 60 ? 'FAIR' : 'NEEDS WORK';
  const rows = (n) => `${fmt(n)} ${n === 1 ? 'row' : 'rows'}`;
  const t = Math.round(ms * 100) / 100;
  const base = `Runs in ${t} ms and reads ${rows(examined)}${wasted >= 1000 ? `, ${fmt(wasted)} of them thrown away` : ''}, returning ${fmt(e.rows_returned)}.`;
  const summary = grade === 'GOOD' && !suggestions.length ? `${base} Nothing to change.`
    : grade === 'GOOD' ? `${base} Fine overall; see the small suggestions below.`
    : base;
  return { score, grade, summary, reasons, suggestions };
}
