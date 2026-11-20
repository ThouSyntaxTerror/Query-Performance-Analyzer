// Run the mysql command-line client with a password taken from .env.local (never typed or printed).
//   node scripts/mysql-cli.mjs --as root -e "SHOW DATABASES"
//   node scripts/mysql-cli.mjs --as qa_viewer -D shop_query_analyzer -e "SELECT COUNT(*) FROM customers"
//   node scripts/mysql-cli.mjs --as root --file sql/06_three_queries.sql
import fs from 'node:fs';
import path from 'node:path';
import { PASSWORD_VARS, die, loadEnv, projectRoot, runMysql } from './_env.mjs';

if (!loadEnv()) die('.env.local not found.');
const args = process.argv.slice(2);
let as = 'root';
let file = null;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--as') as = args[++i];
  else if (args[i] === '--file') file = args[++i];
  else rest.push(args[i]);
}
const varName = PASSWORD_VARS[as];
if (!varName || !process.env[varName]) die(`No password available for ${as}.`);
const user = as === 'root' ? process.env.MYSQL_ROOT_USER || 'root' : as;
const r = runMysql({
  user,
  password: process.env[varName],
  args: rest,
  input: file ? fs.readFileSync(path.resolve(projectRoot, file)) : undefined,
  inherit: !file,
});
if (file) { process.stdout.write(r.stdout || ''); process.stderr.write(r.stderr || ''); }
process.exit(r.status ?? 1);
