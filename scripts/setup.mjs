// npm run setup  -  creates the project database, tables, data, stored logic, accounts and permissions.
// Uses root (from .env.local) for setup only. Never drops anything and never touches other databases.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';
import { appendEnv, die, hostPort, loadEnv, projectRoot, runMysql } from './_env.mjs';

const DB = 'shop_query_analyzer';
const OUR_TABLES = ['customers', 'products', 'orders', 'order_items', 'saved_queries', 'query_executions', 'query_plans', 'execution_table_access', 'recommendations'];
const sqlFile = (name) => path.join(projectRoot, 'sql', name);

if (!loadEnv()) die('.env.local was not found. Copy .env.local.example to .env.local and enter your MySQL root password in it (see README).');
const rootUser = process.env.MYSQL_ROOT_USER || 'root';
const rootPw = process.env.MYSQL_ROOT_PASSWORD;
if (!rootPw || rootPw.includes('PUT_YOUR_ROOT_PASSWORD')) die('MYSQL_ROOT_PASSWORD is not set in .env.local.');

const { host, port } = hostPort();
let root;
try {
  root = await mysql.createConnection({ host, port, user: rootUser, password: rootPw });
} catch (e) {
  die(`Could not log in to MySQL at ${host}:${port} as ${rootUser} (${e.code}). Check the password in .env.local and that the MySQL80 service is running.`);
}

const [[{ v: version }]] = await root.query('SELECT VERSION() AS v');
console.log(`Connected to MySQL ${version} at ${host}:${port} as ${rootUser}.`);
if (!version.startsWith('8.')) die(`This project targets MySQL 8.x, found ${version}.`);

function runFile(file, what) {
  const r = runMysql({ user: rootUser, password: rootPw, input: fs.readFileSync(sqlFile(file)) });
  if (r.status !== 0) die(`${what} failed:\n${(r.stderr || '').trim()}`);
  console.log(`  ok  ${file}  (${what})`);
}

// ---- 1. database: create only if it does not exist; never drop or overwrite
const [exists] = await root.query('SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?', [DB]);
if (exists.length === 0) {
  console.log(`Database ${DB} does not exist yet: creating it.`);
  runFile('01_schema.sql', 'tables and constraints');
  runFile('02_seed.sql', 'deterministic sample data');
  runFile('03_stored_logic.sql', 'functions, procedures, triggers, view');
} else {
  const [t] = await root.query('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?', [DB]);
  const have = new Set(t.map((r) => r.TABLE_NAME));
  if (!OUR_TABLES.every((n) => have.has(n))) {
    die(`A database called ${DB} already exists but is not this project's database. Nothing was changed. Rename or remove it yourself, then run setup again.`);
  }
  console.log(`Database ${DB} already exists with this project's tables: leaving data untouched.`);
}

// ---- 2. accounts: create only missing ones, with generated passwords saved to .env.local
const ACCOUNTS = [
  ['qa_app', 'QA_APP_PASSWORD', ''],
  ['qa_viewer', 'QA_VIEWER_PASSWORD', ''],
  ['qa_runner', 'QA_RUNNER_PASSWORD', 'WITH MAX_USER_CONNECTIONS 5'],
];
const newLines = [];
for (const [user, key, extra] of ACCOUNTS) {
  const [[{ c }]] = await root.query("SELECT COUNT(*) AS c FROM mysql.user WHERE User = ? AND Host = 'localhost'", [user]);
  let pw = process.env[key];
  if (c > 0) {
    if (!pw) die(`MySQL account ${user} already exists but ${key} is not in .env.local. It was not modified. Add its password to .env.local, or drop the account yourself if it is not needed.`);
    console.log(`  account ${user} already exists: kept as is`);
    continue;
  }
  if (!pw) {
    pw = crypto.randomBytes(18).toString('base64url');
    process.env[key] = pw;
    newLines.push(`${key}=${pw}`);
  }
  await root.query(`CREATE USER '${user}'@'localhost' IDENTIFIED BY ${root.escape(pw)} ${extra}`);
  console.log(`  account ${user} created`);
}
if (newLines.length) appendEnv(newLines);

// ---- 3. roles and grants, then preset queries
runFile('04_permissions.sql', 'roles and grants');
if (exists.length === 0) runFile('05_presets.sql', 'preset queries');

// ---- 4. verify each account can log in and see its role
for (const [user, key] of ACCOUNTS) {
  try {
    const c = await mysql.createConnection({ host, port, user, password: process.env[key], database: DB });
    const [[r]] = await c.query('SELECT CURRENT_USER() AS u, CURRENT_ROLE() AS r');
    console.log(`  login ok: ${r.u}  active role: ${r.r}`);
    await c.end();
  } catch (e) {
    die(`Account ${user} could not log in (${e.code}). Check ${key} in .env.local.`);
  }
}
await root.end();
console.log('\nSetup finished. Next: npm run warmup  (measured sample runs), then npm run dev');
