// Dedicated close-up check of the composed H's crossbar junctions, from tools/marks-him.json.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const him = JSON.parse(fs.readFileSync(path.join(here, 'marks-him.json'), 'utf8'));
const letters = him.letters;
const paths = (a) => a.map((lg) => (Array.isArray(lg) ? lg : [lg]).map((p) => `<path d="${p}"></path>`).join('')).join('');
const svg = (vb, w, fill, cls = '') => `<svg class="${cls}" viewBox="${vb}" width="${w}" fill="${fill}">${paths(letters)}</svg>`;
const html = `<!doctype html><meta charset="utf-8"><style>
body{background:#101010;color:#ddd;font:13px system-ui}
svg{background:#1d1d1d;display:block;margin:8px 0 22px}
svg.light{background:#f4f4f2}
h3{margin:20px 0 4px}
</style>
<h3>LEFT junction — dark (viewBox -8 28 45 44)</h3>${svg('-8 28 45 44', 1100, '#fff')}
<h3>RIGHT junction — dark (viewBox -52 28 60 44)</h3>${svg('-52 28 60 44', 1100, '#fff')}
<h3>LEFT junction — light</h3>${svg('-8 28 45 44', 1100, '#111', 'light')}
<h3>RIGHT junction — light</h3>${svg('-52 28 60 44', 1100, '#111', 'light')}
<h3>full HIM — light</h3>${svg('0 0 333 100', 1100, '#111', 'light')}
`;
fs.writeFileSync(path.join(here, 'junction-check.html'), html);
console.log('wrote tools/junction-check.html');
