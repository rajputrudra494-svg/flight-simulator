// Seeded noise utilities used for terrain generation (CPU) and
// for building tileable noise textures that the shaders sample (GPU).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Integer hash -> [0,1)
export function hash2(x, y, seed = 0) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float64Array([
  1, 1, -1, 1, 1, -1, -1, -1,
  1, 0, -1, 0, 1, 0, -1, 0,
  0, 1, 0, -1, 0, 1, 0, -1,
]);

export class Simplex2 {
  constructor(seed = 1) {
    const rand = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  // Returns value in roughly [-1, 1]
  noise(xin, yin) {
    const perm = this.perm;
    const pm = this.permMod12;
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    let i1, j1;
    if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi = pm[ii + perm[jj]] * 2;
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[gi] * x0 + GRAD[gi + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi = pm[ii + i1 + perm[jj + j1]] * 2;
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[gi] * x1 + GRAD[gi + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi = pm[ii + 1 + perm[jj + 1]] * 2;
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[gi] * x2 + GRAD[gi + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  fbm(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 1, freq = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * this.noise(x * freq + o * 17.31, y * freq - o * 9.77);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }

  // Ridged multifractal, returns [0, 1]
  ridged(x, y, octaves = 5, lacunarity = 2.0, gain = 0.5) {
    let sum = 0, amp = 0.5, freq = 1, prev = 1, norm = 0;
    for (let o = 0; o < octaves; o++) {
      let n = 1 - Math.abs(this.noise(x * freq + o * 31.7, y * freq + o * 11.3));
      n *= n;
      sum += n * amp * prev;
      norm += amp;
      prev = n;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}

// ---------------------------------------------------------------------------
// Tileable gradient noise used to bake textures.
// ---------------------------------------------------------------------------
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

const TAU = Math.PI * 2;
function gradDot(ix, iy, period, seed, dx, dy) {
  const a = hash2(((ix % period) + period) % period, ((iy % period) + period) % period, seed) * TAU;
  return Math.cos(a) * dx + Math.sin(a) * dy;
}

function periodicPerlin(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const d00 = gradDot(xi, yi, period, seed, xf, yf);
  const d10 = gradDot(xi + 1, yi, period, seed, xf - 1, yf);
  const d01 = gradDot(xi, yi + 1, period, seed, xf, yf - 1);
  const d11 = gradDot(xi + 1, yi + 1, period, seed, xf - 1, yf - 1);
  const u = fade(xf), v = fade(yf);
  const a = d00 + (d10 - d00) * u;
  const b = d01 + (d11 - d01) * u;
  return (a + (b - a) * v) * 1.414; // ~[-1,1]
}

export function tileableFbm(u, v, basePeriod, octaves, seed) {
  let sum = 0, amp = 1, norm = 0, period = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += amp * periodicPerlin(u * period, v * period, period, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / norm;
}

// Bakes an RGBA tileable noise texture; each channel uses a different base frequency.
export function bakeNoiseRGBA(size = 256, seed = 7) {
  const data = new Uint8Array(size * size * 4);
  const periods = [3, 6, 12, 24];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const idx = (y * size + x) * 4;
      for (let c = 0; c < 4; c++) {
        const n = tileableFbm(u, v, periods[c], 4, seed + c * 1000);
        data[idx + c] = Math.max(0, Math.min(255, Math.round((n * 0.75 + 0.5) * 255)));
      }
    }
  }
  return data;
}

// Bakes a tileable normal map (RGB) from layered noise, for water ripples.
export function bakeNormalMap(size = 256, seed = 99, strength = 2.0) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      h[y * size + x] = tileableFbm(u, v, 4, 5, seed) + 0.5 * tileableFbm(u + 0.37, v, 9, 3, seed + 7);
    }
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)];
      const r = h[y * size + ((x + 1) % size)];
      const d = h[((y - 1 + size) % size) * size + x];
      const u = h[((y + 1) % size) * size + x];
      let nx = (l - r) * strength * size / 64;
      let ny = (d - u) * strength * size / 64;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const idx = (y * size + x) * 4;
      data[idx] = Math.round((nx * 0.5 + 0.5) * 255);
      data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      data[idx + 3] = 255;
    }
  }
  return data;
}

export function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
