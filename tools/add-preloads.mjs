// Preload the scene GLB models at page load, idempotently.
//
// Why: the captured scenes mount lazily — each scene fetches its `/models/*.glb`
// files only when its section first scrolls into view (`hand.glb` was measured
// starting ~13s into a slow scroll-through; the services batch at ~6.7s). On a
// cold Ctrl+F5 that leaves the canvas areas empty until the download + parse +
// first frame happen right after arrival. Preloading all 7 models in the page
// HTML starts the downloads in parallel with the app boot; by the time any
// section is reached the models are already warm (verified: the app's own
// `fetch` reuses the preloaded response from the memory cache — one of the two
// probe files revalidated with a 300-byte 304, the other was fully reused).
//
// `crossorigin="anonymous"` is required: it makes the preload's request mode
// (CORS) match the loader's `fetch`, otherwise Chrome falls back to an HTTP
// revalidation instead of reusing the preloaded response.
//
// Chrome may log a cosmetic DevTools hint ("preloaded but not used within a
// few seconds from the window's load event") until a scene consumes each
// preload. It is a Log-domain warning — not a console error — and the verify
// suites fail on errors only.
//
// Usage: node tools/add-preloads.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const CONTENT = path.join(root, 'content');
const MODELS_DIR = path.join(root, 'public', 'models');
// Only the home page renders the WebGL scenes.
const PAGE = 'index.html';

const MARKER = '<!-- him-model-preloads -->';

let fail = 0;
const ok = (cond, label, detail = '') => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label + (detail ? ' [' + detail + ']' : ''));
  if (!cond) fail = 1;
};

// ------------------------------------------------------------------ models
const models = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.glb')).sort();
ok(models.length >= 7, 'GLB models discovered', models.length + ' files');
ok(models.includes('arm.glb') && models.includes('hand.glb'), 'expected keys present (arm, hand)');

const BLOCK =
  MARKER +
  models
    .map((m) => `<link rel="preload" as="fetch" crossorigin="anonymous" href="/models/${m}"/>`)
    .join('');

// ------------------------------------------------------------------ inject
const file = path.join(CONTENT, PAGE);
let html = fs.readFileSync(file, 'utf8');
const before = html.length;

const bodyCloses = html.split('</body>').length - 1;
if (bodyCloses !== 1) {
  ok(false, PAGE + ': exactly one </body>', 'found ' + bodyCloses);
} else {
  const markerCount = html.split(MARKER).length - 1;
  const RENEW = new RegExp(MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:<link[^>]*>)*');
  if (markerCount > 1) {
    ok(false, PAGE + ': duplicate him-model-preloads markers', String(markerCount));
  } else if (RENEW.test(html)) {
    html = html.replace(RENEW, BLOCK); // refresh links (idempotent re-run)
  } else if (markerCount === 1) {
    ok(false, PAGE + ': partial him-model-preloads block, fix manually');
  } else {
    html = html.replace('</body>', BLOCK + '</body>');
  }

  // Validations before write.
  const injected = html.split(MARKER).length - 1;
  const links = html.match(/<link rel="preload" as="fetch" crossorigin="anonymous" href="\/models\/[^"]+\.glb"\/>/g) || [];
  const checks =
    injected === 1 &&
    links.length === models.length &&
    models.every((m) => html.includes('href="/models/' + m + '"')) &&
    html.split('</body>').length - 1 === 1 &&
    html.split('</html>').length - 1 === 1;
  if (!checks) {
    ok(false, PAGE + ': post-inject structure', 'marker=' + injected + ' links=' + links.length);
  } else {
    if (!DRY) fs.writeFileSync(file, html);
    ok(true, PAGE + (DRY ? ': would inject (dry)' : ': injected'), before + ' -> ' + html.length + ' bytes, ' + links.length + ' preloads');
  }
}

console.log(DRY ? (fail ? 'DRY RUN — with failures' : 'DRY RUN — all good') : (fail ? 'FAILED' : 'done'));
process.exit(fail);
