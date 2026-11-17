// Two connection pools to the SAME MySQL database, using two different restricted accounts:
//   app    = qa_app    reads and writes the analyzer tables (saved queries, runs, plans, recommendations)
//   runner = qa_runner SELECT on the four shop tables only; the only account that executes user-supplied SQL
import mysql from 'mysql2/promise';

export const DB_NAME = 'shop_query_analyzer';
export const QUERY_TIMEOUT_MS = 5000;

function make(user, passwordVar, limit) {
  const password = process.env[passwordVar];
  if (!password) throw new Error(`${passwordVar} is missing. Run "npm run setup" first (see README).`);
  return mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user, password, database: DB_NAME,
    connectionLimit: limit,
    dateStrings: true,          // show timestamps exactly as the MySQL terminal does
    decimalNumbers: true,       // DECIMAL columns as numbers
    supportBigNumbers: true,    // BIGINT as numbers while they are safe integers
    bigNumberStrings: false,
  });
}

const g = globalThis;
export const appPool = () => (g.__qaApp ??= make('qa_app', 'QA_APP_PASSWORD', 5));
export const runnerPool = () => (g.__qaRunner ??= make('qa_runner', 'QA_RUNNER_PASSWORD', 3));
