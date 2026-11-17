// npm run mongo:sync  -  copies every run stored in MySQL into MongoDB as one document per run (upsert by execution_id),
// creates the MongoDB indexes, and prints both counts. Safe to run repeatedly. Uses only the database shop_query_analyzer_docs.
import { die, loadEnv } from './_env.mjs';

if (!loadEnv()) die('.env.local not found.');
const { getRun } = await import('../lib/analyzer.mjs');
const { appPool, runnerPool } = await import('../lib/db.mjs');
const { MONGO_DB, closeMongo, countDocuments, deleteStale, ensureIndexes, saveRunDocument } = await import('../lib/mongo.mjs');

try {
  await ensureIndexes();
} catch (e) {
  die(`MongoDB is not reachable (${e.message}). Start the MongoDB service and run again.`);
}
const [rows] = await appPool().query('SELECT execution_id FROM query_executions ORDER BY execution_id');
let n = 0;
for (const { execution_id } of rows) {
  await saveRunDocument(await getRun(execution_id));
  n++;
}
const removed = (await deleteStale(rows.map((r) => r.execution_id))).deletedCount;
console.log(`removed ${removed} stale document(s)`);
console.log(`MySQL runs: ${rows.length}   synced: ${n}   MongoDB documents in ${MONGO_DB()}.plans: ${await countDocuments()}`);
await closeMongo();
await appPool().end();
await runnerPool().end();
