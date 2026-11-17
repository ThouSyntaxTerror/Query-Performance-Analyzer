// DBMS-style metrics derived from one stored run. Inputs are the measured plan (nodes), the per-table accesses and,
// for the workload score, the MySQL view v_workload_priority. Nothing here is a constant: each value is computed.

// the traditional EXPLAIN "type" names that correspond to the access methods printed by EXPLAIN ANALYZE (tree format)
const EXPLAIN_TYPE = {
  'Table scan': 'ALL',
  'Index scan': 'index',
  'Index range scan': 'range',
  'Index lookup': 'ref',
  'Single-row index lookup': 'eq_ref',
  'Constant row': 'const',
};

// q-error: how many times too high or too low an estimate was (1 = exact)
const qError = (est, act) => {
  const e = Math.max(est, 1);
  const a = Math.max(act, 1);
  return Math.max(e / a, a / e);
};

export function computeMetrics(run, workload) {
  const e = run.execution;
  const nodes = run.plan.nodes;

  const examined = run.access.reduce((s, a) => s + a.rows_examined, 0);
  const kept = run.access.reduce((s, a) => s + (a.rows_kept ?? a.rows_examined), 0);

  // ---- access paths with selectivity (share of rows that pass the filter)
  const accessPaths = run.access.map((a) => ({
    table: a.table_name,
    type: EXPLAIN_TYPE[a.access_method] ?? a.access_method,
    method: a.access_method,
    index: a.index_name,
    examined: a.rows_examined,
    kept: a.rows_kept ?? a.rows_examined,
    selectivity: a.filter_condition && a.rows_examined ? ((a.rows_kept ?? a.rows_examined) / a.rows_examined) * 100 : null,
    loops: a.loops,
  }));

  // ---- cardinality estimation accuracy: optimizer's estimated rows versus measured rows, per plan step
  const pairs = nodes
    .filter((n) => n.estimate && n.measured && !n.neverExecuted)
    .map((n) => ({ step: n.description, est: n.estimate.rows, act: n.measured.rows, q: qError(n.estimate.rows, n.measured.rows) }));
  const worst = pairs.length ? pairs.reduce((a, b) => (b.q > a.q ? b : a)) : null;
  const geoMean = pairs.length ? Math.exp(pairs.reduce((s, p) => s + Math.log(p.q), 0) / pairs.length) : null;

  // ---- execution features read from the plan
  const text = nodes.map((n) => n.description);
  const joins = [...new Set(text.filter((d) => /^(nested loop|inner hash join|left hash join|hash join)/i.test(d)).map((d) => d.replace(/\s*\(.*$/, '')))];
  const innerLoops = Math.max(0, ...run.access.map((a) => a.loops));
  const features = {
    joins,
    innerLoops: joins.length ? innerLoops : 0,
    temporaryTable: text.some((d) => /<temporary>|temporary table/i.test(d)),
    sort: text.some((d) => /^Sort:/i.test(d)),
    materialize: text.some((d) => /^Materialize/i.test(d)),
    aggregate: text.some((d) => /aggregate/i.test(d)),
    coveringIndex: run.access.some((a) => /Covering|covering/.test(a.explanation)),
  };

  return {
    scanEfficiency: examined ? (kept / examined) * 100 : 100,
    examined,
    kept,
    costPer1000: examined ? (e.duration_ms / examined) * 1000 : null,
    accuracy: { worst, geoMean, steps: pairs.length },
    accessPaths,
    features,
    workload: workload ?? null,
  };
}
