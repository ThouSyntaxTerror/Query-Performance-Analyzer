// npm run warmup  -  runs every preset query through the real analysis pipeline (EXPLAIN ANALYZE on MySQL)
// a different number of times, so the workload-priority ranking has real measured data to rank.
// Skips itself if runs already exist (use  npm run warmup -- --force  to add more).
import { die, loadEnv } from './_env.mjs';

if (!loadEnv()) die('.env.local not found.');
const { analyzeSql, getState } = await import('../lib/analyzer.mjs');
const { appPool, runnerPool } = await import('../lib/db.mjs');

// how often each preset "runs in production": cheap queries are run often, heavy ones less often
const REPEATS = [
  ['Primary-key lookup', 20], ['Prefix LIKE', 15], ['Indexed lookup', 10], ['Full scan: orders', 6],
  ['Low-selectivity', 4], ['CTE', 4], ['Join: orders', 3], ['Aggregation', 3], ['Leading wildcard', 3],
  ['Three-table join', 2], ['Correlated', 2],
];

const [[{ n }]] = await appPool().query('SELECT COUNT(*) AS n FROM query_executions');
if (n > 0 && !process.argv.includes('--force')) {
  console.log(`query_executions already holds ${n} runs: nothing to do (use --force to add more).`);
} else {
  const { presets } = await getState();
  for (const p of presets) {
    const times = REPEATS.find(([prefix]) => p.label.startsWith(prefix))?.[1] ?? 1;
    let last;
    for (let i = 0; i < times; i++) last = await analyzeSql({ sql: p.sql_text, note: 'warm-up' });
    console.log(`  ${String(times).padStart(2)} runs  ${String(last.execution.duration_ms).padStart(9)} ms (last)  ${p.label}`);
  }
}
await appPool().end();
await runnerPool().end();
