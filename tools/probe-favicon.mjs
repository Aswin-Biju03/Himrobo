// Decode a PNG (favicon) to RGBA pixels: prints size, dominant colors and ink bbox.
// usage: node tools/probe-favicon.mjs <file.png>
import fs from 'node:fs';
import zlib from 'node:zlib';

const file = process.argv[2];
const buf = fs.readFileSync(file);

if (buf.toString('latin1', 1, 4) !== 'PNG') {
  console.error('not a PNG:', file);
  process.exit(1);
}

let pos = 8;
let w = 0, h = 0, bitDepth = 0, colorType = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    w = data.readUInt32BE(0); h = data.readUInt32BE(4);
    bitDepth = data[8]; colorType = data[9];
  }
  if (type === 'IDAT') idat.push(data);
  pos += 12 + len;
}
console.log(`size: ${w}x${h}, bitDepth: ${bitDepth}, colorType: ${colorType}`);
if (bitDepth !== 8) { console.error('only 8-bit PNG supported'); process.exit(1); }
const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
if (!channels) { console.error('unsupported color type'); process.exit(1); }

const raw = zlib.inflateSync(Buffer.concat(idat));
const stride = w * channels;
const out = Buffer.alloc(h * stride);
let rp = 0;
for (let y = 0; y < h; y++) {
  const filter = raw[rp++];
  const line = raw.subarray(rp, rp + stride); rp += stride;
  const cur = out.subarray(y * stride, (y + 1) * stride);
  const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= channels ? cur[x - channels] : 0;
    const b = prev[x];
    const c = x >= channels ? prev[x - channels] : 0;
    let v = line[x];
    if (filter === 1) v += a;
    else if (filter === 2) v += b;
    else if (filter === 3) v += (a + b) >> 1;
    else if (filter === 4) {
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      v += (pa <= pb && pa <= pc) ? a : (pb <= pc) ? b : c;
    }
    cur[x] = v & 0xff;
  }
}

const px = (x, y) => {
  const i = y * stride + x * channels;
  if (colorType === 6) return [out[i], out[i + 1], out[i + 2], out[i + 3]];
  if (colorType === 2) return [out[i], out[i + 1], out[i + 2], 255];
  if (colorType === 4) return [out[i], out[i], out[i], out[i + 1]];
  return [out[i], out[i], out[i], 255];
};

console.log('corners:', JSON.stringify({
  tl: px(0, 0), tr: px(w - 1, 0), bl: px(0, h - 1), br: px(w - 1, h - 1),
}));

// histogram (quantized to reduce noise) + ink bbox (any pixel that is not the corner bg)
const hist = new Map();
let minX = w, minY = h, maxX = -1, maxY = -1;
const bg = px(0, 0);
const isInk = (p) => Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) + Math.abs(p[3] - bg[3]) > 24;
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const p = px(x, y);
    const key = p.join(',');
    hist.set(key, (hist.get(key) || 0) + 1);
    if (isInk(p)) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
}
const top = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log('top colors:');
for (const [c, n] of top) console.log(`  ${c}  x${n}`);
console.log(`ink bbox: x ${minX}..${maxX}, y ${minY}..${maxY}  (${maxX - minX + 1}x${maxY - minY + 1} of ${w}x${h})`);
