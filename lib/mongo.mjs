// NoSQL side of the project: every analysed run is also stored as ONE nested document in MongoDB.
// Database: shop_query_analyzer_docs (its own database; no other MongoDB database is touched). Collection: plans.
// MySQL keeps the relational facts (runs, table accesses, recommendations); MongoDB keeps the whole run as a document
// (plan tree, metrics, rating, suggestions, embedding), which is flexible, nested data that suits a document store.
import { MongoClient } from 'mongodb';

const g = globalThis;
const uri = () => process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
export const MONGO_DB = () => process.env.MONGODB_DB || 'shop_query_analyzer_docs';

async function collection() {
  if (!g.__qaMongo) {
    g.__qaMongo = new MongoClient(uri(), { serverSelectionTimeoutMS: 2500 }).connect().catch((e) => { g.__qaMongo = null; throw e; });
  }
  const client = await g.__qaMongo;
  return client.db(MONGO_DB()).collection('plans');
}

export async function closeMongo() {
  if (g.__qaMongo) { (await g.__qaMongo).close(); g.__qaMongo = null; }
}

// idempotent: creating an index that already exists does nothing
export async function ensureIndexes() {
  const c = await collection();
  await c.createIndex({ execution_id: 1 }, { unique: true, name: 'uq_execution_id' });
  await c.createIndex({ query_id: 1, executed_at: -1 }, { name: 'ix_query_time' });
  await c.createIndex({ 'tables.table': 1, 'tables.type': 1 }, { name: 'ix_table_access' });   // multikey: one entry per table in the array
  await c.createIndex({ 'rating.score': 1 }, { name: 'ix_rating' });
  await c.createIndex({ 'metrics.duration_ms': -1 }, { name: 'ix_duration' });
  await c.createIndex({ label: 'text', sql_text: 'text' }, { name: 'tx_label_sql' });          // full-text search
}

// Shape of the stored document (see docs/NOSQL_MODEL.md)
export function toDocument(run) {
  const e = run.execution;
  const m = run.metrics;
  return {
    execution_id: e.execution_id,
    query_id: e.query_id,
    label: e.label,
    sql_text: e.sql_text,
    is_preset: !!e.is_preset,
    run_note: e.run_note ?? null,
    executed_at: new Date(String(e.executed_at).replace(' ', 'T')),
    server_version: run.plan.version,
    metrics: {
      duration_ms: e.duration_ms,
      rows_examined: e.rows_examined,
      rows_returned: e.rows_returned,
      estimated_cost: e.estimated_cost,
      estimated_rows: e.estimated_rows,
      scan_efficiency_pct: Math.round(m.scanEfficiency * 10) / 10,
      cost_per_1000_rows_ms: m.costPer1000,
      worst_q_error: m.accuracy.worst ? Math.round(m.accuracy.worst.q * 100) / 100 : null,
    },
    rating: { score: run.rating.score, grade: run.rating.grade, reasons: run.rating.reasons },
    suggestions: run.rating.suggestions,
    tables: m.accessPaths.map((p) => ({ table: p.table, type: p.type, method: p.method, index: p.index, examined: p.examined, kept: p.kept, selectivity_pct: p.selectivity, loops: p.loops })),
    features: m.features,
    columns: m.columns ? m.columns.names : [],
    plan: { text: run.plan.text, nodes: run.plan.nodes },
    embedding: e.embedding,
    stored_at: new Date(),
  };
}

export async function saveRunDocument(run) {
  const doc = toDocument(run);
  await (await collection()).replaceOne({ execution_id: doc.execution_id }, doc, { upsert: true });
  return doc;
}

export async function countDocuments() {
  return (await collection()).countDocuments();
}

// keeps MongoDB equal to MySQL: removes documents whose run no longer exists in MySQL
export async function deleteStale(executionIds) {
  return (await collection()).deleteMany({ execution_id: { $nin: executionIds } });
}
