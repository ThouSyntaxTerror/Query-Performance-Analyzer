# NoSQL and vector data model

This project uses two database paradigms:

| Paradigm | System | What it stores | Why this system |
|---|---|---|---|
| SQL (relational) | MySQL 8.0 | The shop data, saved queries, runs, per-table accesses, recommendations | Structured, related, constrained data: keys, foreign keys, cascades, transactions, triggers, privileges |
| NoSQL (document) | MongoDB 8.2 | One nested document per analysed run: plan tree, metrics, rating, suggestions, embedding | A run is a self-contained, nested record whose shape varies (plans have different numbers of steps, queries touch different tables). Reading it as one document avoids joining several tables |
| Vector similarity | Inside MySQL (JSON embedding + SQL function) and stored in the MongoDB document | A 30-number embedding per query | Similarity needs only the vector and a metric; MySQL 8.0 has no vector type, so it is built from JSON and `fn_cosine_similarity` |

MySQL stays the source of truth. Every run is written to MySQL first; the same run is then written to MongoDB as a document with the same `execution_id`. If MongoDB is down, the analysis still works and `npm run mongo:sync` repairs the copy.

## Database and collection

- MongoDB database: `shop_query_analyzer_docs` (a separate database; no other MongoDB database is touched).
- Collection: `plans`, one document per run (`execution_id` is the same number as in MySQL `query_executions`).

## Document structure

```json
{
  "execution_id": 1,
  "query_id": 1,
  "label": "Full scan: orders in March 2024 (no index on order_date)",
  "sql_text": "SELECT COUNT(*) FROM orders WHERE order_date BETWEEN ...",
  "is_preset": true,
  "run_note": "warm-up",
  "executed_at": "2026-11-17T12:10:36.000Z",
  "server_version": "8.0.46",
  "metrics": {
    "duration_ms": 57.1, "rows_examined": 50000, "rows_returned": 1,
    "estimated_cost": 5449, "estimated_rows": 1,
    "scan_efficiency_pct": 4.2, "cost_per_1000_rows_ms": 1.14, "worst_q_error": 2.55
  },
  "rating": { "score": 45, "grade": "NEEDS WORK", "reasons": [ { "points": 35, "text": "..." } ] },
  "suggestions": [ { "title": "Add an index on orders(order_date)", "why": "...", "code": "CREATE INDEX ..." } ],
  "tables": [
    { "table": "orders", "type": "ALL", "method": "Table scan", "index": null,
      "examined": 50000, "kept": 2123, "selectivity_pct": 4.2, "loops": 1 }
  ],
  "features": { "joins": [], "temporaryTable": false, "sort": false, "aggregate": true },
  "columns": ["COUNT(*)"],
  "plan": {
    "text": "-> Aggregate: count(0) ...",
    "nodes": [ { "id": 0, "depth": 0, "description": "Aggregate: count(0)",
                 "estimate": { "cost": 5449, "rows": 1 },
                 "measured": { "startMs": 57.1, "endMs": 57.1, "rows": 1, "loops": 1 } } ]
  },
  "embedding": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  "stored_at": "2026-11-17T12:30:00.000Z"
}
```

Embedded (nested) rather than referenced: `tables`, `suggestions`, `rating.reasons` and `plan.nodes` are always read together with the run, so they live inside the document. The only reference is the key `execution_id` / `query_id` back to MySQL.

## Indexes (created by `ensureIndexes` in `lib/mongo.mjs`)

| Index | Fields | Purpose |
|---|---|---|
| `uq_execution_id` | `execution_id` (unique) | One document per run; makes the sync an upsert |
| `ix_query_time` | `query_id`, `executed_at` (descending) | History of one query, newest first |
| `ix_table_access` | `tables.table`, `tables.type` (multikey) | "Which runs scanned `orders`?"; one index entry per element of the `tables` array |
| `ix_rating` | `rating.score` | Find the worst or best rated runs |
| `ix_duration` | `metrics.duration_ms` (descending) | Slowest runs |
| `tx_label_sql` | text index on `label`, `sql_text` | Full-text search over queries |

## Embeddings and metadata

- **What is embedded:** the SQL text of each query.
- **Approach:** a transparent feature-count embedding, not a machine-learning model. `fn_query_embedding` counts 30 constructs and names (SELECT, JOIN, GROUP BY, ORDER BY, LIMIT, WHERE, LIKE, IN, EXISTS, WITH, COUNT, SUM, AVG, MAX, DISTINCT, BETWEEN, HAVING, UNION, the four table names, and the columns status, order_date, customer_id, category, city, email, total_amount, price).
- **Storage:** a JSON array of 30 numbers, in the MySQL column `saved_queries.embedding` and in the MongoDB field `embedding`.
- **Metadata stored with the vector:** label, SQL text, run count, rating, tables touched, timings.
- **Metric:** cosine similarity, `(a . b) / (|a| |b|)`; 1 means the same direction.

## Retrieval strategy

1. Look up the embedding of the query being analysed.
2. Compute `fn_cosine_similarity` against every other stored query inside MySQL (a join of `saved_queries` with itself).
3. Sort by similarity, keep the top 5, and show their label and average run time.

With 11 stored queries an exact scan is correct and instant; an approximate index would only be needed for very large collections.

## Operations on the NoSQL side (mongosh)

```js
use shop_query_analyzer_docs
db.plans.countDocuments()
db.plans.findOne({ execution_id: 1 }, { label: 1, rating: 1, tables: 1, _id: 0 })

// aggregation pipeline: full table scans per table
db.plans.aggregate([
  { $unwind: '$tables' },
  { $match: { 'tables.type': 'ALL' } },
  { $group: { _id: '$tables.table', scans: { $sum: 1 }, avg_rows_examined: { $avg: '$tables.examined' } } },
  { $sort: { scans: -1 } }
])

// aggregation: slowest queries
db.plans.aggregate([
  { $group: { _id: '$label', runs: { $sum: 1 }, avg_ms: { $avg: '$metrics.duration_ms' } } },
  { $sort: { avg_ms: -1 } }, { $limit: 3 }
])

db.plans.distinct('label', { 'rating.score': { $lt: 60 } })             // filter
db.plans.distinct('label', { $text: { $search: 'wildcard' } })          // full-text search

// create / update / delete
db.plans.insertOne({ demo: true, label: 'demo document', rating: { score: 0 } })
db.plans.updateOne({ demo: true }, { $set: { 'rating.score': 99 } })
db.plans.deleteOne({ demo: true })
```

## Keeping the two databases equal

- A run analysed on the web page is written to MySQL, then to MongoDB.
- `npm run mongo:sync` upserts every MySQL run into MongoDB, creates the indexes and removes documents whose run no longer exists in MySQL, then prints both counts.
- Checked: after one run through the page, the MySQL row and the MongoDB document had the same `execution_id`, duration and rows examined, and both counts were equal.

## Why not only one of them

- Relational facts need constraints and transactions (a run must belong to a saved query, deleting a query must delete its runs): MySQL.
- A run viewed as a whole, with a variable-length plan tree and nested lists, is awkward as seven joined tables and natural as one document: MongoDB.
- Both keep the vector, so similarity can be computed where the relational data is (MySQL) and the document can be searched on its own (MongoDB).
