// Takes the README screenshots of the running app (npm run dev, port 3200) with headless Edge/Chrome via the DevTools protocol.
// Usage: node docs/screenshots.mjs
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = 'http://localhost:3200';
const OUT = path.resolve(import.meta.dirname, 'img');
const exe = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = path.join(OUT, '..', '.tmp-profile');

const proc = spawn(exe, ['--headless=new', '--disable-gpu', '--remote-debugging-port=9334', '--user-data-dir=' + profile, 'about:blank'], { stdio: 'ignore' });
await sleep(3000);
const targets = await (await fetch('http://localhost:9334/json')).json();
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d.result); };
const cmd = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const js = async (expr) => (await cmd('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

// helpers that work with React-controlled inputs
const setSelect = (n, value) => js(`(() => { const s = document.querySelectorAll('select')[${n}]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, '${value}'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
const click = (text) => js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(text)}).click()`);

async function shot(name) {
  const h = await js('document.documentElement.scrollHeight');
  await cmd('Emulation.setDeviceMetricsOverride', { width: 1180, height: h, deviceScaleFactor: 1, mobile: false });
  await sleep(500);
  const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
  console.log('saved', name, h);
}

await cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await cmd('Emulation.setDeviceMetricsOverride', { width: 1180, height: 900, deviceScaleFactor: 1, mobile: false });
await cmd('Page.navigate', { url: BASE });
await sleep(4000);

await shot('ui_home');                           // empty page: query box and Analyze button

await setSelect(0, '1');                         // preset 1: full scan
await sleep(300);
await click('Analyze');
await sleep(4000);
await shot('ui_report');

ws.close(); proc.kill();
await sleep(1500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
