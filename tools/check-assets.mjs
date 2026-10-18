// Check that every /_next/static asset referenced by a page is actually served (200).
// usage: node tools/check-assets.mjs [baseUrl] [pages...]
import { argv } from 'node:process';
const BASE = argv[2] || 'http://localhost:3300';
const PAGES = argv.slice(3).length ? argv.slice(3) : ['/', '/privacy', '/terms-of-use', '/definitely-not-a-page'];

for (const page of PAGES) {
  let html;
  try {
    const res = await fetch(BASE + page);
    html = await res.text();
    console.log(`\n### ${page} -> HTTP ${res.status}, ${html.length} bytes`);
  } catch (e) {
    console.log(`\n### ${page} -> FETCH ERROR ${e.message}`);
    continue;
  }
  const refs = new Set();
  for (const m of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./]+/g)) refs.add(m[0]);
  for (const m of html.matchAll(/"(?:src|href)":"(\/[^"]+)"/g)) {
    if (m[1].startsWith('/_next/')) refs.add(m[1]);
  }
  const bad = [];
  for (const ref of refs) {
    const url = ref.split('?')[0];
    if (!url.startsWith('/_next/static/')) continue;
    try {
      const r = await fetch(BASE + url, { method: 'GET' });
      if (!r.ok) bad.push(`${url} -> ${r.status}`);
    } catch (e) {
      bad.push(`${url} -> ERR ${e.message}`);
    }
  }
  console.log(`  asset refs: ${refs.size}, non-200: ${bad.length}`);
  for (const b of bad) console.log('  BAD ' + b);
}
