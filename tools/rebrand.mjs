// Config-driven literal text replacement for the rebranded clone.
//
// Replaces in every text surface of the project so the SSR markup, the embedded
// RSC payload and the original client bundles all stay consistent — that is what
// keeps hydration intact after changing text.
//
// Usage:
//   node tools/rebrand.mjs          apply tools/rebrand.config.json
//   node tools/rebrand.mjs --dry    show what would change (no writes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeStream, tryWalk, resyncFlightRows } from './fix-flight-rows.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const dry = process.argv.includes('--dry');

const cfg = JSON.parse(fs.readFileSync(path.join(here, 'rebrand.config.json'), 'utf8'));
const rules = (cfg.replacements || []).filter((r) => r.from && r.to && r.from !== r.to);
if (!rules.length) {
  console.log('rebrand.config.json has no active replacements (every rule needs non-empty "from" and "to").');
  process.exit(0);
}

function listTargets() {
  const files = [];
  for (const pattern of cfg.targets || []) {
    const dir = path.join(ROOT, path.dirname(pattern));
    const glob = path.basename(pattern);
    if (!fs.existsSync(dir)) continue;
    const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (re.test(name) && fs.statSync(full).isFile()) files.push(full);
    }
  }
  return [...new Set(files)];
}

let total = 0;
let touched = 0;
for (const file of listTargets()) {
  const originalText = fs.readFileSync(file, 'utf8');
  let text = originalText;
  const rel = path.relative(ROOT, file);
  let fileHits = 0;
  for (const r of rules) {
    const count = text.split(r.from).length - 1;
    if (!count) continue;
    console.log(`${dry ? 'DRY ' : ''}${String(count).padStart(4)}x  "${r.from}" -> "${r.to}"   [${rel}]`);
    if (!dry) text = text.split(r.from).join(r.to);
    fileHits += count;
    total += count;
  }
  if (fileHits && !dry) {
    if (file.endsWith('.html')) {
      // Flight 'T' rows carry hex length prefixes: edits must be re-synced or
      // hydration desyncs. Oracle = the pre-edit state (must be walkable).
      const oracle = tryWalk(decodeStream(originalText).stream);
      if (oracle.error) {
        console.log(`WARN  ${rel}: flight stream not walkable before edit — T-row resync skipped (${String(oracle.error).slice(0, 90)})`);
      } else {
        const res = resyncFlightRows(text, { ...oracle, stream: decodeStream(originalText).stream });
        for (const f of res.fixes) {
          if (f.error) console.log(`WARN  ${rel}: T-row ${f.id}: ${f.error}`);
          else console.log(`      T-row resync ${f.id}: T${f.from} -> T${f.to} (${f.declared} -> ${f.actual})`);
        }
        if (res.valid) text = res.html;
        else console.log(`WARN  ${rel}: T-row resync validation FAILED (${res.validation}) — writing without resync; run tools/fix-flight-rows.mjs`);
      }
    }
    fs.writeFileSync(file, text);
    touched++;
  }
}
console.log('---');
console.log(`${dry ? 'Would replace' : 'Replaced'} ${total} occurrence(s)${touched ? ` in ${touched} file(s)` : ''}.`);
