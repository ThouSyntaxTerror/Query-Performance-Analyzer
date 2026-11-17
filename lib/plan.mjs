// Parser for MySQL 8.0 "EXPLAIN ANALYZE" output (TREE format), verified against MySQL 8.0.46.
//
// A line looks like:
//   -> Index lookup on o using fk_orders_customer (customer_id=c.customer_id)  (cost=2.53 rows=10.1) (actual time=0.025..0.0276 rows=10 loops=625)
//                                                                              ^^^^^ ESTIMATE (optimizer)              ^^^^^^ MEASURED (executor)
// Nothing here is invented: every number comes from those two brackets. Missing brackets stay null.

const N = '[0-9]+(?:\\.[0-9]+)?(?:e[+-]?[0-9]+)?';
const EST = new RegExp(`\\(cost=(${N})(?:\\.\\.(${N}))?\\s+rows=(${N})\\)`, 'i');
const ACT = new RegExp(`\\(actual time=(${N})\\.\\.(${N})\\s+rows=(${N})\\s+loops=(${N})\\)`, 'i');

export const BASE_TABLES = ['customers', 'products', 'orders', 'order_items'];

export function parsePlan(text) {
  const nodes = [];
  const stack = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\s*)-> (.*)$/);
    if (!m) continue;
    const depth = Math.floor(m[1].length / 4);
    const body = m[2];
    const est = body.match(EST);
    const act = body.match(ACT);
    const cut = [est?.index, act?.index, body.indexOf('(never executed)')].filter((x) => x !== undefined && x >= 0);
    const description = (cut.length ? body.slice(0, Math.min(...cut)) : body).trim();
    const node = {
      id: nodes.length,
      depth,
      parent: depth === 0 ? null : stack[depth - 1] ?? null,
      description,
      estimate: est ? { cost: Number(est[2] ?? est[1]), rows: Number(est[3]) } : null,
      measured: act ? { startMs: Number(act[1]), endMs: Number(act[2]), rows: Number(act[3]), loops: Number(act[4]) } : null,
      neverExecuted: body.includes('(never executed)'),
    };
    stack[depth] = node.id;
    stack.length = depth + 1;
    nodes.push(node);
  }
  return nodes;
}

// alias -> base table, read from the FROM / JOIN clauses of the SQL text
function aliasMap(sql) {
  const map = {};
  const stop = new Set(['where', 'join', 'inner', 'left', 'right', 'cross', 'natural', 'straight_join', 'on', 'using',
    'group', 'order', 'limit', 'having', 'union', 'window', 'for', 'lock', 'into', 'set', 'as']);
  const re = /\b(?:from|join)\s+`?([a-z_][a-z0-9_]*)`?(?:\s+(?:as\s+)?`?([a-z_][a-z0-9_]*)`?)?/gi;
  for (const m of sql.matchAll(re)) {
    const table = m[1].toLowerCase();
    const alias = m[2]?.toLowerCase();
    if (!BASE_TABLES.includes(table)) continue;
    map[table] = table;
    if (alias && !stop.has(alias)) map[alias] = table;
  }
  return map;
}

function classify(description) {
  let m;
  if (/^Rows fetched before execution/i.test(description)) return { kind: 'access', method: 'Constant row', alias: null };
  if ((m = description.match(/^(Single-row )?(covering )?index lookup on (\S+) using (\S+)(?: \((.*)\))?/i))) {
    return { kind: 'access', method: m[1] ? 'Single-row index lookup' : 'Index lookup', covering: !!m[2], alias: m[3], index: m[4], cond: m[5] ?? null };
  }
  if ((m = description.match(/^(covering )?index range scan on (\S+) using (\S+) over (.*)$/i))) {
    return { kind: 'access', method: 'Index range scan', covering: !!m[1], alias: m[2], index: m[3], cond: m[4].replace(/\?{4,}/g, '...') };
  }
  if ((m = description.match(/^(covering )?index scan on (\S+) using (\S+)/i))) {
    return { kind: 'access', method: 'Index scan', covering: !!m[1], alias: m[2], index: m[3], cond: null };
  }
  if ((m = description.match(/^Table scan on (\S+)/i))) return { kind: 'access', method: 'Table scan', alias: m[1] };
  if (/^Filter: /i.test(description)) return { kind: 'filter' };
  return { kind: 'operator' };
}

const rnd = (x) => Math.round(x);

// Table accesses (one per base-table node), with measured rows examined and a plain-language reason.
export function buildAccesses(nodes, sql, tableRows = {}) {
  const aliases = aliasMap(sql);
  const onlyTable = [...new Set(Object.values(aliases))].length === 1 ? Object.values(aliases)[0] : null;
  const out = [];
  for (const node of nodes) {
    const c = classify(node.description);
    if (c.kind !== 'access') continue;
    const table = c.method === 'Constant row' ? onlyTable : aliases[(c.alias ?? '').toLowerCase()] ?? null;
    if (!table) continue;                       // temporary table / CTE / derived table: not a base table
    const m = node.measured;
    const examined = m && !node.neverExecuted ? rnd(m.rows * m.loops) : 0;
    const parent = node.parent === null ? null : nodes[node.parent];
    const filter = parent && /^Filter: /i.test(parent.description) ? parent.description.replace(/^Filter: /i, '') : null;
    const kept = filter && parent.measured ? rnd(parent.measured.rows * parent.measured.loops) : examined;
    const access = {
      table_name: table,
      table_alias: c.alias && c.alias !== table ? c.alias : null,
      access_method: c.method,
      index_name: c.index ?? null,
      index_condition: c.cond ? c.cond.slice(0, 400) : null,
      filter_condition: filter ? filter.slice(0, 600) : null,
      estimated_rows: node.estimate ? rnd(node.estimate.rows) : null,
      rows_examined: examined,
      rows_kept: kept,
      loops: m ? rnd(m.loops) : 0,
      covering: !!c.covering,
      node_id: node.id,
    };
    access.explanation = explainAccess(access, tableRows[table]);
    out.push(access);
  }
  return out;
}

const fmt = (n) => Number(n).toLocaleString('en-US');

// Why were this table's rows examined? Built only from the measured numbers above.
export function explainAccess(a, tableTotal) {
  const total = tableTotal != null ? ` (the table holds ${fmt(tableTotal)} rows)` : '';
  const covering = a.covering ? ' The index alone held every column the query needed, so the table rows themselves were not read.' : '';
  const filter = a.filter_condition ? ` The filter ${a.filter_condition} then kept ${fmt(a.rows_kept)} and discarded ${fmt(a.rows_examined - a.rows_kept)}.` : '';
  switch (a.access_method) {
    case 'Table scan':
      return `No index could be used for this part of the query, so MySQL read the whole table: ${fmt(a.rows_examined)} rows${total}.${filter || ' No filter was applied at this step, so every row was passed on.'}`;
    case 'Index range scan':
      return `Index ${a.index_name} covers the range ${a.index_condition}, so MySQL read only the matching slice of the index: ${fmt(a.rows_examined)} entries instead of the whole table${total}.${filter}${covering}`;
    case 'Index scan':
      return `MySQL walked the whole of index ${a.index_name} (${fmt(a.rows_examined)} entries${tableTotal != null ? ` of ${fmt(tableTotal)} rows` : ''}) because no condition could narrow it.${filter}${covering}`;
    case 'Single-row index lookup':
      return `${a.index_name} identifies one row per probe (${a.index_condition ?? 'unique key'}). ${fmt(a.loops)} probe(s) read ${fmt(a.rows_examined)} row(s) in total.${covering}`;
    case 'Index lookup':
      return `Index ${a.index_name} was used for (${a.index_condition ?? 'the condition'}): MySQL jumps straight to the matching rows instead of scanning the table${total}. ` +
        (a.loops > 1 ? `The lookup ran ${fmt(a.loops)} times, once per row from the other side of the join, reading ${fmt(a.rows_examined)} rows in total.` : `It read ${fmt(a.rows_examined)} row(s).`) + covering;
    case 'Constant row':
      return `The primary-key / unique lookup was resolved while MySQL was still planning the query (before execution), so the row was fetched once and no table scan happened at run time.`;
    default:
      return `${a.access_method}: ${fmt(a.rows_examined)} rows read.`;
  }
}

// Totals for the run. Duration, rows returned and rows examined are MEASURED; cost and estimated rows are ESTIMATES.
export function summarize(nodes, accesses) {
  const root = nodes[0];
  if (!root?.measured) throw new Error('The plan contains no "actual time" information, so nothing can be measured.');
  return {
    duration_ms: root.measured.endMs * (root.measured.loops || 1),
    rows_returned: rnd(root.measured.rows * (root.measured.loops || 1)),
    rows_examined: accesses.reduce((s, a) => s + a.rows_examined, 0),
    estimated_cost: root.estimate ? root.estimate.cost : null,
    estimated_rows: root.estimate ? rnd(root.estimate.rows) : null,
  };
}

// Short spoken-style explanation of one run (every number is measured unless it says "estimate").
export function presenterText(run) {
  const { execution: e, access = [], recommendations = [] } = run;
  const parts = [];
  parts.push(`MySQL ${run.plan.version} executed the query in ${e.duration_ms} ms (measured) and returned ${fmt(e.rows_returned)} ${e.rows_returned === 1 ? 'row' : 'rows'} after examining ${fmt(e.rows_examined)} ${e.rows_examined === 1 ? 'row' : 'rows'} (measured).`);
  const worst = [...access].sort((a, b) => b.rows_examined - a.rows_examined)[0];
  if (worst) {
    parts.push(worst.access_method === 'Table scan'
      ? `The costliest step was a full scan of ${worst.table_name}: no usable index, so it read ${fmt(worst.rows_examined)} rows${worst.filter_condition ? ` to keep ${fmt(worst.rows_kept)}` : ''}.`
      : `The costliest step was ${worst.access_method.toLowerCase()} on ${worst.table_name} using ${worst.index_name ?? 'an index'}, which read ${fmt(worst.rows_examined)} rows.`);
  }
  if (e.rows_returned > 0 && e.rows_examined >= 5 * e.rows_returned) {
    parts.push(`That is ${(e.rows_examined / e.rows_returned).toFixed(1)} rows examined per row returned, so most of the work was spent on rows that were thrown away.`);
  } else if (e.rows_returned > 0) {
    parts.push(`That is ${(e.rows_examined / e.rows_returned).toFixed(1)} rows examined per row returned, so the query reads little more than it needs.`);
  }
  if (e.estimated_cost != null) parts.push(`The optimizer's estimated cost was ${e.estimated_cost} (an estimate, not a measurement; estimates can differ from what really happened).`);
  const top = recommendations.find((r) => r.status === 'OPEN');
  if (top) parts.push(`Recommendation stored by a MySQL trigger: ${top.suggestion}.`);
  return parts.join(' ');
}
