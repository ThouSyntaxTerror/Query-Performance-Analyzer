// Accepts exactly one read-only SELECT (or WITH ... SELECT) statement. Anything else is rejected before it
// reaches MySQL. This is the first of three layers; the other two are the qa_runner account (SELECT on the
// four shop tables only) and a READ ONLY transaction with a server-enforced timeout.

export class UserError extends Error {}

const FORBIDDEN = new RegExp(
  '\\b(' + [
    'insert', 'update', 'delete', 'replace', 'drop', 'alter', 'create', 'truncate', 'rename', 'grant', 'revoke',
    'call', 'do', 'handler', 'load', 'lock', 'unlock', 'set', 'use', 'show', 'explain', 'analyze', 'kill',
    'shutdown', 'into', 'outfile', 'dumpfile', 'sleep', 'benchmark', 'get_lock', 'release_lock', 'load_file',
    'prepare', 'execute', 'deallocate', 'savepoint', 'rollback', 'commit', 'begin', 'start', 'flush', 'reset',
    'optimize', 'repair', 'install', 'uninstall', 'import', 'table',
  ].join('|') + ')\\b', 'i');

// Walks the text once: removes comments (this also removes optimizer hints such as /*+ MAX_EXECUTION_TIME(...) */)
// and builds a "masked" copy in which the inside of quoted strings and identifiers is blanked out.
function scan(sql) {
  let clean = '';
  let masked = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (c === '/' && next === '*') {
      const end = sql.indexOf('*/', i + 2);
      if (end === -1) throw new UserError('Unterminated comment.');
      clean += ' '; masked += ' '; i = end + 2;
    } else if (c === '#' || (c === '-' && next === '-' && (sql[i + 2] === undefined || /\s/.test(sql[i + 2])))) {
      const end = sql.indexOf('\n', i);
      clean += ' '; masked += ' '; i = end === -1 ? sql.length : end + 1;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      for (; j < sql.length; j++) {
        if (sql[j] === '\\' && c !== '`') { j++; continue; }
        if (sql[j] === c) { if (sql[j + 1] === c) { j++; continue; } break; }
      }
      if (j >= sql.length) throw new UserError('Unterminated quote.');
      clean += sql.slice(i, j + 1);
      masked += c + ' '.repeat(j - i - 1) + c;
      i = j + 1;
    } else {
      clean += c; masked += c; i++;
    }
  }
  return { clean, masked };
}

export function validateSql(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new UserError('Enter a SQL query first.');
  if (raw.length > 20000) throw new UserError('The query is too long (limit 20,000 characters).');
  const { clean, masked } = scan(raw);
  const text = clean.trim().replace(/;\s*$/, '').trim();
  const m = masked.trim().replace(/;\s*$/, '').trim();
  if (!m) throw new UserError('Enter a SQL query first.');
  if (m.includes(';')) throw new UserError('Only one statement is allowed (a semicolon was found in the middle).');
  if (!/^(select|with)\b/i.test(m)) throw new UserError('Only a single SELECT or WITH ... SELECT query can be analysed.');
  const bad = m.match(FORBIDDEN);
  if (bad) throw new UserError(`The keyword "${bad[1].toUpperCase()}" is not allowed: only read-only queries can be analysed.`);
  return text.replace(/\s+\n/g, '\n');
}
