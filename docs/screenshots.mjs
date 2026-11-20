// Takes the README screenshots of the running portal (npm run dev, port 3300) with headless Edge/Chrome via the DevTools protocol.
// Usage: node docs/screenshots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:3300';
const OUT = path.resolve(import.meta.dirname, 'img');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = path.join(OUT, '..', '.tmp-profile');

async function login(username, password) {
  const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) });
  return r.headers.get('set-cookie').match(/pp_session=([^;]+)/)[1];
}
const adminToken = await login('admin', 'admin123');
const studentToken = await login('student001', 'student123');

const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9335', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
await sleep(3000);
const targets = await (await fetch('http://localhost:9335/json')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d.result); };
const cmd = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const clickTab = (text) => js(`[...document.querySelectorAll('.tabs button')].find((b) => b.textContent.trim().startsWith(${JSON.stringify(text)})).click()`);

async function shot(name, url, token, steps) {
  await cmd('Network.clearBrowserCookies');
  if (token) await cmd('Network.setCookie', { name: 'pp_session', value: token, url: BASE });
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
  await cmd('Page.navigate', { url: BASE + url });
  await sleep(4500);
  if (steps) { await steps(); await sleep(2500); }
  const h = await js('document.documentElement.scrollHeight');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1180, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
  console.log('saved', name, h);
}
await cmd('Network.enable');
await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await shot('ui_login', '/login', null);
await shot('ui_student_recommended', '/student', studentToken, () => clickTab('Recommended'));
await shot('ui_student_applications', '/student', studentToken, () => clickTab('My applications'));
await shot('ui_admin_dashboard', '/admin', adminToken);
await shot('ui_admin_database', '/admin', adminToken, () => clickTab('Database objects'));
await shot('ui_admin_who', '/admin', adminToken, () => clickTab('Who inserts'));
ws.close(); proc.kill();
await sleep(1500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
