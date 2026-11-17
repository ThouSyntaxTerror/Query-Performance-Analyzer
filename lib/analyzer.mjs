// The analysis pipeline. Everything that is shown is read back from the MySQL database,
// so the web page and the MySQL terminal always show the same records.
import { DB_NAME, QUERY_TIMEOUT_MS, appPool, runnerPool } from './db.mjs';
import { BASE_TABLES, buildAccesses, parsePlan, presenterText, summarize } from './plan.mjs';
import { UserError, validateSql } from './sqlguard.mjs';

export { UserError };

// ---- run the user's SQL under EXPLAIN ANALYZE as the restricted qa_runner account
async function explainAnalyze(sql) {
  const conn = await runnerPool().getConnection();
  try {
    // MySQL stops a SELECT that exceeds max_execution_time. For EXPLAIN ANALYZE it does NOT raise an error:
    // it returns a PARTIAL plan. So a run that reaches the limit is detected below and discarded.
    await conn.query(`SET SESSION max_execution_time = ${QUERY_TIMEOUT_MS}`);
    await conn.query('START TRANSACTION READ ONLY');
    const started = performance.now();
    let rows;
    try {
      [rows] = await conn.query('EXPLAIN ANALYZE ' + sql);
    } catch (e) {
      throw new UserError(`MySQL rejected the query: ${e.sqlMessage || e.message}`);
    } finally {
      await conn.query('ROLLBACK').catch(() => {});
    }
    const wallMs = performance.now() - started;
    if (wallMs >= QUERY_TIMEOUT_MS * 0.97) {
      throw new UserError(`The query was stopped after ${QUERY_TIMEOUT_MS / 1000} seconds (timeout). The partial plan was discarded and nothing was stored.`);
    }
    return { text: rows[0].EXPLAIN, wallMs };
  } finally {
    conn.release();
  }
}

async function tableRowCounts(tables) {
  const out = {};
  for (const t of new Set(tables)) {
    if (!BASE_TABLES.includes(t)) continue;               // table names come from a fixed whitelist
    const [[r]] = await appPool().query(`SELECT COUNT(*) AS n FROM \`${t}\``);
    out[t] = r.n;
  }
  return out;
}

// ---- analyse a query: run it, parse the plan, store everything, return the stored run
export async function analyzeSql({ sql: rawSql, label, note }) {
  const sql = validateSql(rawSql);
  const { text } = await explainAnalyze(sql);
  const nodes = parsePlan(text);
  if (nodes.length === 0) throw new UserError('MySQL returned a plan in an unexpected format.');

  const draft = buildAccesses(nodes, sql);
  const counts = await tableRowCounts(draft.map((a) => a.table_name));
  const accesses = buildAccesses(nodes, sql, counts);
  const s = summarize(nodes, accesses);
  const [[{ v: version }]] = await appPool().query('SELECT VERSION() AS v');
  const savedLabel = (label && label.trim()) || 'Custom: ' + sql.replace(/\s+/g, ' ').slice(0, 70);

  const conn = await appPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('CALL sp_save_query(?, ?, 0, @qid)', [savedLabel.slice(0, 100), sql]);
    const [[{ qid }]] = await conn.query('SELECT @qid AS qid');
    await conn.query('CALL sp_log_execution(?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, @eid)',
      [qid, s.duration_ms, s.rows_returned, s.rows_examined, s.estimated_cost, s.estimated_rows,
        note ? String(note).slice(0, 100) : null, text, JSON.stringify(nodes), version]);
    const [[{ eid }]] = await conn.query('SELECT @eid AS eid');
    for (const a of accesses) {
      await conn.query(
        `INSERT INTO execution_table_access
           (execution_id, table_name, table_alias, access_method, index_name, index_condition, filter_condition,
            estimated_rows, rows_examined, rows_kept, loops, explanation)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [eid, a.table_name, a.table_alias, a.access_method, a.index_name, a.index_condition, a.filter_condition,
          a.estimated_rows, a.rows_examined, a.rows_kept, a.loops, a.explanation]);
    }
    await conn.commit();
    return getRun(eid);
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ---- read one stored run back from the database
export async function getRun(executionId) {
  const id = Number(executionId);
  if (!Number.isInteger(id)) throw new UserError('Bad run id.');
  const pool = appPool();
  const [[execution]] = await pool.query(
    `SELECT e.execution_id, e.query_id, e.executed_at, e.duration_ms, e.rows_returned, e.rows_examined,
            e.estimated_cost, e.estimated_rows, e.run_note, q.label, q.sql_text, q.is_preset
       FROM query_executions e JOIN saved_queries q ON q.query_id = e.query_id
      WHERE e.execution_id = ?`, [id]);
  if (!execution) throw new UserError(`Run ${id} does not exist.`);
  const [[plan]] = await pool.query('SELECT plan_text, plan_json, server_version FROM query_plans WHERE execution_id = ?', [id]);
  const [access] = await pool.query('SELECT * FROM execution_table_access WHERE execution_id = ? ORDER BY access_id', [id]);
  const [recommendations] = await pool.query(
    `SELECT rec_id, suggestion, severity, status FROM recommendations WHERE query_id = ?
      ORDER BY FIELD(severity, 'HIGH', 'MEDIUM', 'LOW'), rec_id`, [execution.query_id]);
  const [similar] = await pool.query(
    `SELECT b.query_id, b.label, ROUND(fn_cosine_similarity(a.embedding, b.embedding), 3) AS similarity,
            (SELECT ROUND(AVG(e.duration_ms), 3) FROM query_executions e WHERE e.query_id = b.query_id) AS avg_ms
       FROM saved_queries a JOIN saved_queries b ON b.query_id <> a.query_id
      WHERE a.query_id = ? ORDER BY similarity DESC LIMIT 5`, [execution.query_id]);
  const run = {
    execution, access, recommendations, similar,
    plan: { text: plan.plan_text, nodes: plan.plan_json, version: plan.server_version },
  };
  run.presenter = presenterText(run);
  return run;
}

export async function listRuns(queryId) {
  const [rows] = await appPool().query(
    `SELECT execution_id, executed_at, duration_ms, rows_examined, rows_returned, run_note
       FROM query_executions WHERE query_id = ? ORDER BY execution_id DESC LIMIT 30`, [Number(queryId)]);
  return rows;
}

// ---- data for the top of the page: proof that it is the same database as the terminal
export async function getState() {
  const pool = appPool();
  const [[info]] = await pool.query('SELECT VERSION() AS version, DATABASE() AS db, CURRENT_USER() AS account');
  const [counts] = await pool.query(
    `SELECT 'customers' AS table_name, COUNT(*) AS n FROM customers
     UNION ALL SELECT 'products', COUNT(*) FROM products
     UNION ALL SELECT 'orders', COUNT(*) FROM orders
     UNION ALL SELECT 'order_items', COUNT(*) FROM order_items
     UNION ALL SELECT 'saved_queries', COUNT(*) FROM saved_queries
     UNION ALL SELECT 'query_executions', COUNT(*) FROM query_executions
     UNION ALL SELECT 'query_plans', COUNT(*) FROM query_plans
     UNION ALL SELECT 'execution_table_access', COUNT(*) FROM execution_table_access
     UNION ALL SELECT 'recommendations', COUNT(*) FROM recommendations`);
  const [presets] = await pool.query('SELECT query_id, label, sql_text FROM saved_queries WHERE is_preset = 1 ORDER BY query_id');
  const [withRuns] = await pool.query(
    `SELECT q.query_id, q.label, COUNT(e.execution_id) AS runs
       FROM saved_queries q JOIN query_executions e ON e.query_id = q.query_id
      GROUP BY q.query_id, q.label ORDER BY q.query_id`);
  const [[priority]] = await pool.query('CALL sp_workload_priority(10)');
  const [recent] = await pool.query(
    `SELECT e.execution_id, q.label, e.executed_at, e.duration_ms, e.rows_examined, e.rows_returned, e.run_note
       FROM query_executions e JOIN saved_queries q ON q.query_id = e.query_id
      ORDER BY e.execution_id DESC LIMIT 8`);
  return { info: { ...info, timeoutMs: QUERY_TIMEOUT_MS }, counts, presets, queries: withRuns, priority, recent };
}
