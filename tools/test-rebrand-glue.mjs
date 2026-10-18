// Non-mutating test of the rebrand.mjs flight-resync glue on current files.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeStream, tryWalk, resyncFlightRows } from './fix-flight-rows.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
for (const name of ['index.html', 'privacy.html', 'terms-of-use.html', '404.html']) {
  const file = path.join(ROOT, 'content', name);
  const originalText = fs.readFileSync(file, 'utf8');
  // glue as in rebrand.mjs: oracle = pre-edit state, resync the post-edit text
  const oracle = tryWalk(decodeStream(originalText).stream);
  if (oracle.error) {
    console.log(`${name}: WARN oracle not walkable: ${oracle.error}`);
    continue;
  }
  const res = resyncFlightRows(originalText, { ...oracle, stream: decodeStream(originalText).stream });
  console.log(`${name}: oracle=${oracle.metric}/${oracle.rows.length} rows, fixes=${res.fixes.length}, valid=${res.valid} (${res.validation.slice(0, 60)})`);
}
