// Renders docs/diagrams/*.mmd to docs/img/*.png using Mermaid (from a CDN) and headless Edge/Chrome.
// Usage: node docs/build-diagrams.mjs [name ...]   (needs internet access and Edge or Chrome installed)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname);
const browsers = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const exe = browsers.find((b) => fs.existsSync(b));
if (!exe) throw new Error('Edge or Chrome not found');

const tmp = path.join(root, '.tmp'); fs.mkdirSync(tmp, { recursive: true });
const names = process.argv.slice(2).length ? process.argv.slice(2) : ['architecture','workflow','er_model','permissions','plan_reading'];

for (const n of names) {
  const code = fs.readFileSync(path.join(root, 'diagrams', n + '.mmd'), 'utf8');
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff;padding:24px">
<pre class="mermaid">${code.replace(/&(?!lt;|gt;)/g, '&amp;')}</pre>
<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.esm.min.mjs";
mermaid.initialize({ startOnLoad: true, theme: 'base', securityLevel: 'loose', fontFamily: 'Arial, sans-serif', flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' }, sequence: { useMaxWidth: false }, er: { useMaxWidth: false }, themeVariables: { fontSize: '17px', primaryColor: '#dbe7ff', lineColor: '#44506b', edgeLabelBackground: '#ffffff' } });
</script></body>`;
  const file = path.join(tmp, n + '.html');
  fs.writeFileSync(file, html);
  // pass 1: dump the rendered DOM to read the natural size of the SVG
  const dom = execFileSync(exe, ['--headless', '--disable-gpu', '--window-size=1600,1000', '--virtual-time-budget=15000', '--dump-dom', pathToFileURL(file).href], { maxBuffer: 1 << 28 }).toString();
  const vb = dom.match(/viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/);
  const w = Math.ceil(vb ? +vb[1] : 1400) + 56, h = Math.ceil(vb ? +vb[2] : 900) + 56;
  execFileSync(exe, ['--headless', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=2', `--window-size=${w},${h}`, '--virtual-time-budget=15000',
    `--screenshot=${path.join(root, 'img', n + '.png')}`, pathToFileURL(file).href], { stdio: 'ignore' });
  console.log('rendered', n);
}
fs.rmSync(tmp, { recursive: true, force: true });
