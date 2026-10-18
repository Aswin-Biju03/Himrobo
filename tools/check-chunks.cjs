// Compile-check every .js file under vendor/ — catches any chunk left in a broken state
// (a single broken chunk kills the whole client app, e.g. 3D scenes won't render).
// Usage (from the next-app-custom folder):  node tools/check-chunks.cjs
const fs = require('fs'), vm = require('vm'), path = require('path');
const VENDOR = path.join(__dirname, '..', 'vendor');
let broken = 0, total = 0;
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith('.js')) {
      total++;
      try { new vm.Script(fs.readFileSync(p, 'utf8')); }
      catch (err) { broken++; console.log('BROKEN:', p, '::', err.message); }
    }
  }
}
walk(VENDOR);
console.log('scanned', total, 'js files | broken:', broken);
const C = path.join(VENDOR, '_next', 'static', 'chunks', '00vqtpq6zjam1.js');
const s = fs.readFileSync(C, 'utf8');
const i = s.indexOf('"DialogContactPanel",0,e=>{');
const b = s.indexOf('{', i);
const e2 = s.indexOf('],20699', b);
console.log('panel body length', e2 - b);
console.log('body tail :', JSON.stringify(s.slice(e2 - 100, e2)));
console.log('body start:', JSON.stringify(s.slice(b, b + 120)));
process.exit(broken ? 1 : 0);
