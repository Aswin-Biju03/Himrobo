// Thin custom Next.js server for the clone.
//
// Next.js owns page routing (the app/ route handlers serve the captured HTML). This
// server handles the paths Next reserves for itself, mirroring the proven static-clone
// serve.js behaviour:
//   - any URL with ?_rsc=...        -> 404, so the original client router falls back to
//                                      full-page navigation (keeps the Privacy / Terms links working)
//   - /_next/image?url=...&w=...    -> the pre-downloaded local width variant (fully offline)
//   - /_next/static/**              -> the ORIGINAL site's compiled chunks/fonts from vendor/,
//                                      served at their original paths (byte-identical runtime)
//
// Usage: node server.mjs [port] [--dev]
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import next from 'next';
import { IMAGE_MAP } from './lib/images.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.join(__dirname, 'vendor');
const IMAGES = path.join(__dirname, 'public', 'images');

const dev = process.argv.includes('--dev');
const port = Number(process.argv.find((a) => /^\d+$/.test(a)) || process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.glb': 'model/gltf-binary',
};

function sendFile(req, res, filePath) {
  res.writeHead(200, {
    'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
}

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('Not found');
}

const app = next({ dev });
await app.prepare();
const handle = app.getRequestHandler();

createServer((req, res) => {
  // Collapse duplicate leading slashes ("//", "///x"): new URL('//', base) throws, and an
  // uncaught throw in this handler would kill the process. Unparseable URLs answer 404.
  let url;
  try {
    const raw = (req.url || '/').replace(/^\/{2,}/, '/');
    url = new URL(raw, `http://${req.headers.host || 'localhost'}`);
  } catch {
    return notFound(res);
  }

  // 1) Next.js router data fetches -> 404 forces the full-navigation fallback.
  if (url.searchParams.has('_rsc')) return notFound(res);

  // 1b) /diag.html reports: accept a POST body and store it under _diag-incoming/.
  if (url.pathname === '/__diag-report') {
    if (req.method !== 'POST') return notFound(res);
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        const dir = path.join(__dirname, '_diag-incoming');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(dir, `report-${stamp}.txt`);
        fs.writeFileSync(file, body);
        console.log(`[diag] report saved: ${file} (${body.length} bytes)`);
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        res.end(`ok ${body.length}`);
      } catch (err) {
        console.error('[diag] report write failed:', err);
        res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('write failed');
      }
    });
    req.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
    return;
  }

  // 2) Image optimizer endpoint -> local pre-generated width variants.
  if (url.pathname === '/_next/image') {
    const raw = url.searchParams.get('url') || '';
    let name = '';
    try { name = decodeURIComponent(raw); } catch { name = raw; }
    name = name.split('?')[0].split('/').pop();
    const base = IMAGE_MAP[name];
    if (base) {
      const w = url.searchParams.get('w');
      for (const candidate of [w, '1600', '1280', '768', '384'].filter(Boolean)) {
        const file = path.join(IMAGES, `${base}-${candidate}.png`);
        if (fs.existsSync(file)) return sendFile(req, res, file);
      }
    }
    return notFound(res);
  }

  // 3) The original site's compiled assets at their original paths.
  if (url.pathname.startsWith('/_next/static/')) {
    const file = path.join(VENDOR, url.pathname);
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return sendFile(req, res, file);
    // otherwise fall through: Next's own build assets (dev mode etc.)
  }

  // 4) Everything else: Next (pages live in app/).
  handle(req, res);
}).listen(port, () => {
  console.log(`Mind Robotics clone (Next.js, ${dev ? 'dev' : 'production'}) listening on http://localhost:${port}`);
});
