// Re-sync React Flight 'T' row length prefixes after text edits.
//
// The RSC flight stream (inline `self.__next_f.push([1,"..."])` chunks) encodes
// long strings as rows:   <id>:T<hex-byte-length>,<text>
// where <text> runs for EXACTLY that many characters and the following row may
// start immediately (no newline separator!). If text edits change a T-row's
// length without updating the prefix, the client parser desyncs and hydration
// crashes ("t.reason.enqueueModel is not a function").
//
// This tool measures the *actual* text of every T row (using a structurally
// consistent stream as the oracle — the file itself, or its pristine twin from
// next-app/) and rewrites stale prefixes.
//
// Usage:
//   node tools/fix-flight-rows.mjs            dry run, all content html files
//   node tools/fix-flight-rows.mjs --apply    write fixes (only when validation passes)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, '..');
const PRISTINE_ROOT = path.join(ROOT, '..', 'next-app');

const PUSH_RE = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;

// Concatenate all inline flight chunks into the decoded stream.
export function decodeStream(html) {
  let stream = '';
  let skipped = 0;
  for (const m of html.matchAll(PUSH_RE)) {
    try {
      stream += JSON.parse(m[1]);
    } catch (e) {
      skipped++;
    }
  }
  return { stream, skipped };
}

// Read `L` utf-8 bytes starting at `start` (must land exactly on a char boundary).
function sliceByBytes(s, start, L) {
  let bytes = 0;
  let i = start;
  while (bytes < L && i < s.length) {
    const cp = s.codePointAt(i);
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
    i += cp > 0xffff ? 2 : 1;
  }
  if (bytes !== L) throw new Error(`byte metric mismatch at ${start}: consumed ${bytes}, expected ${L}`);
  return { text: s.slice(start, i), end: i };
}

// Sequential walk of a structurally CONSISTENT flight stream.
// Every T row's declared length is trusted; a wrong length derails the walk
// and throws (which is exactly how we detect the metric / inconsistency).
export function walkStream(stream, metric) {
  const rows = [];
  let pos = 0;
  while (pos < stream.length) {
    if (stream[pos] === '\n') pos++;
    const m = /^([0-9a-f]{1,6}):/.exec(stream.slice(pos, pos + 8));
    let id, p;
    if (m) {
      id = m[1];
      p = pos + m[0].length;
    } else if (stream.startsWith(':H', pos)) {
      // id-less hint rows, e.g. ":HL[\"/_next/...css\",\"style\"]"
      id = '';
      p = pos + 1;
    } else {
      throw new Error(`row parse failed at ${pos}: ${JSON.stringify(stream.slice(pos, pos + 40))}`);
    }
    const tag = stream[p];
    if (tag === 'T') {
      const m2 = /^T([0-9a-f]+),/.exec(stream.slice(p, p + 10));
      if (!m2) throw new Error(`T prefix parse failed at ${p}: ${JSON.stringify(stream.slice(p, p + 30))}`);
      const declared = parseInt(m2[1], 16);
      const textStart = p + m2[0].length;
      let text, end;
      if (metric === 'bytes') {
        ({ text, end } = sliceByBytes(stream, textStart, declared));
      } else {
        text = stream.slice(textStart, textStart + declared);
        if (text.length !== declared) throw new Error(`char metric read past stream end at ${textStart}`);
        end = textStart + declared;
      }
      rows.push({ id, tag: 'T', start: pos, declared, hex: m2[1], textStart, textEnd: end, text });
      pos = end;
    } else {
      const nl = stream.indexOf('\n', p);
      const end = nl === -1 ? stream.length : nl;
      rows.push({ id, tag, start: pos, contentStart: p, end });
      pos = end + 1;
    }
    if (rows.length > 5000) throw new Error('runaway walk');
  }
  return rows;
}

// Try to establish a walkable oracle from a decoded stream.
export function tryWalk(stream) {
  let charsErr = null;
  try {
    return { rows: walkStream(stream, 'chars'), metric: 'chars' };
  } catch (e) {
    charsErr = e;
  }
  try {
    return { rows: walkStream(stream, 'bytes'), metric: 'bytes' };
  } catch (e) {
    return { error: `chars: ${charsErr.message} | bytes: ${e.message}` };
  }
}

function metricLen(text, metric) {
  return metric === 'bytes' ? Buffer.byteLength(text, 'utf8') : text.length;
}

// Recompute stale T-row prefixes in `html`, using `oracle` = { rows, stream, metric }.
// Returns { html, fixes, valid, validation }.
export function resyncFlightRows(html, oracle) {
  const { stream, skipped } = decodeStream(html);
  const metric = oracle.metric;
  const fixes = [];
  let out = html;

  for (let i = 0; i < oracle.rows.length; i++) {
    const r = oracle.rows[i];
    if (r.tag !== 'T') continue;

    const needle = `${r.id}:T${r.hex},`;
    const found = stream.indexOf(needle);
    if (found === -1) {
      fixes.push({ id: r.id, error: `T-row header "${needle}" not found in stream` });
      continue;
    }
    const textStart2 = found + needle.length;

    // find where this row's text ends = start of the next row (oracle knows the next row)
    let textEnd2 = stream.length;
    const next = oracle.rows[i + 1];
    if (next) {
      const candidates = [];
      if (next.tag === 'T') candidates.push(`${next.id}:T${next.hex},`);
      candidates.push(oracle.stream.slice(next.start, next.start + 28));
      candidates.push(oracle.stream.slice(next.start, next.start + 12));
      let idx = -1;
      for (const c of candidates) {
        if (!c) continue;
        const j = stream.indexOf(c, textStart2);
        if (j !== -1) { idx = j; break; }
      }
      if (idx === -1) {
        fixes.push({ id: r.id, error: `anchor for next row ${next.id} not found after text start` });
        continue;
      }
      textEnd2 = idx;
    }

    const text2 = stream.slice(textStart2, textEnd2);
    const actual = metricLen(text2, metric);
    if (actual !== r.declared) {
      const newHex = actual.toString(16);
      const rawNeedle = `${r.id}:T${r.hex},`;
      const occurrences = out.split(rawNeedle).length - 1;
      if (occurrences !== 1) {
        fixes.push({ id: r.id, error: `raw header not unique (${occurrences} occurrences)` });
        continue;
      }
      out = out.replace(rawNeedle, `${r.id}:T${newHex},`);
      fixes.push({ id: r.id, from: r.hex, to: newHex, declared: r.declared, actual, delta: actual - r.declared });
    }
  }

  // validation: the fixed file must walk cleanly and keep the same row layout
  let valid = false;
  let validation = '';
  const dec2 = decodeStream(out);
  try {
    const rows2 = walkStream(dec2.stream, metric);
    const seq2 = rows2.map((x) => x.id + ':' + x.tag).join(' ');
    const seqO = oracle.rows.map((x) => x.id + ':' + x.tag).join(' ');
    if (seq2 === seqO) {
      valid = true;
      validation = `walk ok, ${rows2.length} rows, seq matches oracle`;
    } else {
      const a = seq2.split(' ');
      const b = seqO.split(' ');
      let at = -1;
      for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { at = i; break; }
      validation = `walk ok but SEQ MISMATCH at row ${at}: fixed[${a[at]}] oracle[${b[at]}]`;
    }
  } catch (e) {
    validation = 'walk failed: ' + e.message;
  }
  if (skipped) validation += ` (${skipped} undecodable push chunk(s))`;

  return { html: out, fixes, valid, validation };
}

// ---------------------------------------------------------------- CLI
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const apply = process.argv.includes('--apply');
  const NAMES = ['index.html', 'privacy.html', 'terms-of-use.html', '404.html'];
  let fixesTotal = 0;
  let applied = 0;
  let problems = 0;

  for (const name of NAMES) {
    const file = path.join(ROOT, 'content', name);
    const html = fs.readFileSync(file, 'utf8');

    let oracle = null;
    let oracleSrc = '';
    const self = tryWalk(decodeStream(html).stream);
    if (!self.error) {
      oracle = { ...self, stream: decodeStream(html).stream };
      oracleSrc = 'self';
    } else {
      const pf = path.join(PRISTINE_ROOT, 'content', name);
      let pristineNote = '';
      if (fs.existsSync(pf)) {
        const pd = decodeStream(fs.readFileSync(pf, 'utf8')).stream;
        const pw = tryWalk(pd);
        if (!pw.error) {
          oracle = { ...pw, stream: pd };
          oracleSrc = 'pristine';
        } else {
          pristineNote = ` | pristine unwalkable: ${String(pw.error).slice(0, 100)}`;
        }
      } else {
        pristineNote = ' | pristine twin not found';
      }
      if (!oracle) {
        console.log(`\n### ${name}: NO ORACLE (self unwalkable: ${self.error.slice(0, 100)}${pristineNote})`);
        problems++;
        continue;
      }
    }

    const res = resyncFlightRows(html, oracle);
    const tRows = oracle.rows.filter((r) => r.tag === 'T').length;
    console.log(`\n### ${name}  [oracle: ${oracleSrc}, metric: ${oracle.metric}, rows: ${oracle.rows.length}, T rows: ${tRows}, pushes skipped: ${decodeStream(html).skipped}]`);
    const errs = res.fixes.filter((f) => f.error);
    if (!res.fixes.length) console.log('  all T-row lengths OK');
    for (const f of res.fixes) {
      if (f.error) console.log(`  ERROR row ${f.id}: ${f.error}`);
      else console.log(`  row ${f.id}: T${f.from} -> T${f.to}  (declared ${f.declared} -> actual ${f.actual}, delta ${f.delta >= 0 ? '+' : ''}${f.delta})`);
    }
    console.log(`  validation: ${res.valid ? 'PASS' : 'FAIL'} (${res.validation})`);
    if (errs.length || !res.valid) problems++;
    fixesTotal += res.fixes.filter((f) => !f.error).length;
    if (res.fixes.length && !errs.length && res.valid && apply && res.html !== html) {
      fs.writeFileSync(file, res.html);
      applied++;
      console.log('  APPLIED');
    }
  }

  console.log(`\n${fixesTotal} length fix(es); ${apply ? applied + ' file(s) rewritten; ' : 'dry run; '}problems: ${problems}`);
  if (problems) process.exitCode = 1;
}
