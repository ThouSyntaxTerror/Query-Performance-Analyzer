// Shared helpers for the setup scripts. Never prints passwords.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const projectRoot = path.resolve(import.meta.dirname, '..');
export const envFile = path.join(projectRoot, '.env.local');

export function loadEnv() {
  if (!fs.existsSync(envFile)) return false;
  process.loadEnvFile(envFile);
  return true;
}

export function appendEnv(lines) {
  const text = fs.readFileSync(envFile, 'utf8');
  fs.appendFileSync(envFile, (text.endsWith('\n') ? '' : '\n') + lines.join('\n') + '\n');
}

export function die(message) {
  console.error('\nSTOP: ' + message + '\n');
  process.exit(1);
}

const CANDIDATES = [
  'C:/Program Files/MySQL/MySQL Server 8.0/bin/mysql.exe',
  'C:/Program Files/MySQL/MySQL Server 8.4/bin/mysql.exe',
];
export const mysqlBin = () => process.env.MYSQL_BIN || CANDIDATES.find((p) => fs.existsSync(p)) || 'mysql';

export const hostPort = () => ({ host: process.env.MYSQL_HOST || '127.0.0.1', port: Number(process.env.MYSQL_PORT || 3306) });

// Run the mysql command-line client; the password travels in the environment, not on the command line.
export function runMysql({ user, password, args = [], input, inherit = false }) {
  const { host, port } = hostPort();
  return spawnSync(mysqlBin(), ['--no-defaults', '-h', host, '-P', String(port), '-u', user, '--default-character-set=utf8mb4', ...args], {
    env: { ...process.env, MYSQL_PWD: password },
    input,
    encoding: 'utf8',
    stdio: inherit ? ['inherit', 'inherit', 'inherit'] : 'pipe',
    maxBuffer: 1 << 26,
  });
}

export const PASSWORD_VARS = { root: 'MYSQL_ROOT_PASSWORD', qa_app: 'QA_APP_PASSWORD', qa_viewer: 'QA_VIEWER_PASSWORD', qa_runner: 'QA_RUNNER_PASSWORD' };
