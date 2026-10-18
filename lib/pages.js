// Shared helper: serve a captured page from content/ byte-identically.
// Requests carrying ?_rsc=... (the original Next.js client router's data fetches)
// get a 404, which makes the router fall back to full-page navigation.
import fs from 'node:fs';
import path from 'node:path';

const CONTENT_DIR = path.join(process.cwd(), 'content');

export function servePage(request, file, status = 200) {
  const url = new URL(request.url);
  if (url.searchParams.has('_rsc')) {
    return new Response('Not found', {
      status: 404,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  const html = fs.readFileSync(path.join(CONTENT_DIR, file));
  return new Response(html, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    },
  });
}
