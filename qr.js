'use strict';
/*
 * Small offline QR code generator (byte mode, error correction level M, versions 1-10).
 * Returns a square array of booleans: true = dark module.
 */
function qrMatrix(text) {
  const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
  const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
  const bytes = Array.from(new TextEncoder().encode(text));

  const rawModules = (v) => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) {
      const na = Math.floor(v / 7) + 2;
      r -= (25 * na - 10) * na - 55;
      if (v >= 7) r -= 36;
    }
    return r;
  };
  const dataCodewords = (v) => Math.floor(rawModules(v) / 8) - ECC_PER_BLOCK[v] * NUM_BLOCKS[v];

  let ver = 1;
  for (; ; ver++) {
    if (ver > 10) throw new Error('Text too long for QR code');
    const ccBits = ver <= 9 ? 8 : 16;
    if (4 + ccBits + 8 * bytes.length <= dataCodewords(ver) * 8) break;
  }

  // ---- data bits ----
  const bits = [];
  const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); // byte mode
  put(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }

  // ---- Reed-Solomon ----
  const mul = (x, y) => {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  };
  const rsDivisor = (d) => {
    const r = new Array(d).fill(0);
    r[d - 1] = 1;
    let root = 1;
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) {
        r[j] = mul(r[j], root);
        if (j + 1 < d) r[j] ^= r[j + 1];
      }
      root = mul(root, 2);
    }
    return r;
  };
  const rsRemainder = (dat, div) => {
    const r = new Array(div.length).fill(0);
    for (const b of dat) {
      const f = b ^ r.shift();
      r.push(0);
      div.forEach((c, i) => { r[i] ^= mul(c, f); });
    }
    return r;
  };

  // ---- split into blocks, add ECC, interleave ----
  const numBlocks = NUM_BLOCKS[ver];
  const eccLen = ECC_PER_BLOCK[ver];
  const rawCw = Math.floor(rawModules(ver) / 8);
  const numShort = numBlocks - (rawCw % numBlocks);
  const shortLen = Math.floor(rawCw / numBlocks);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < numShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const all = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((b, j) => {
      if (i !== shortLen - eccLen || j >= numShort) all.push(b[i]);
    });
  }

  // ---- matrix ----
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const setF = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        const x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setF(x, y, d !== 2 && d !== 4);
      }
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);

  let pos = [];
  if (ver > 1) {
    const na = Math.floor(ver / 7) + 2;
    const step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
    pos = [6];
    for (let p = size - 7; pos.length < na; p -= step) pos.splice(1, 0, p);
  }
  const n = pos.length;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setF(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  const drawFormat = (mask) => {
    const d = (0 << 3) | mask; // ECC level M has format bits 0
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsF = ((d << 10) | rem) ^ 0x5412;
    const bit = (i) => ((bitsF >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i));
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8));
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i));
    setF(8, size - 8, true);
  };
  drawFormat(0);

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    const bitsV = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const color = ((bitsV >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3), b = Math.floor(i / 3);
      setF(a, b, color); setF(b, a, color);
    }
  }

  // ---- place codewords in zigzag ----
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && bi < all.length * 8) {
          mod[y][x] = ((all[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0;
          bi++;
        }
      }
    }
  }

  // ---- masking ----
  const applyMask = (m) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = ((x * y) % 2) + ((x * y) % 3) === 0; break;
          case 6: inv = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break;
          default: inv = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0; break;
        }
        if (!fn[y][x] && inv) mod[y][x] = !mod[y][x];
      }
    }
  };
  const penalty = () => {
    let p = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          const cur = pass ? mod[b][a] : mod[a][b];
          const prev = pass ? mod[b - 1][a] : mod[a][b - 1];
          if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
      }
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    }
    const pats = ['10111010000', '00001011101'];
    const scan = (s) => { for (const pt of pats) { let i = s.indexOf(pt); while (i >= 0) { p += 40; i = s.indexOf(pt, i + 1); } } };
    for (let a = 0; a < size; a++) {
      let r = '', c = '';
      for (let b = 0; b < size; b++) { r += mod[a][b] ? '1' : '0'; c += mod[b][a] ? '1' : '0'; }
      scan(r); scan(c);
    }
    let dark = 0;
    for (const row of mod) for (const v of row) if (v) dark++;
    const total = size * size;
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    p += Math.max(0, k) * 10;
    return p;
  };

  let best = 0, bestPen = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m); drawFormat(m);
    const pen = penalty();
    if (pen < bestPen) { bestPen = pen; best = m; }
    applyMask(m);
  }
  applyMask(best); drawFormat(best);
  return mod;
}

/* Draws the QR on a canvas using whole-pixel modules so it stays sharp. */
function drawQR(canvas, text, maxSize) {
  const m = qrMatrix(text);
  const quiet = 2;
  const modules = m.length + quiet * 2;
  const scale = Math.max(1, Math.floor(maxSize / modules));
  canvas.width = canvas.height = scale * modules;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  for (let y = 0; y < m.length; y++) {
    for (let x = 0; x < m.length; x++) {
      if (m[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    }
  }
  return canvas;
}

if (typeof module !== 'undefined') module.exports = { qrMatrix };
