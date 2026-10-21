// Procedurally generated textures (no external assets needed).
import * as THREE from 'three';
import { bakeNoiseRGBA, bakeNormalMap, mulberry32, tileableFbm } from './noise.js';

const cache = new Map();

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const NOISE_SIZE = 256;
let noiseData = null;
function getNoiseData() {
  if (!noiseData) noiseData = bakeNoiseRGBA(NOISE_SIZE, 11);
  return noiseData;
}

// Bilinear sample of the shader noise texture on the CPU (matches GPU sampling
// at full resolution), used to keep tree placement consistent with the terrain
// shader's forest mask. u/v are in texture repeats; returns [0,1].
export function sampleNoiseCPU(u, v, channel) {
  const data = getNoiseData();
  const S = NOISE_SIZE;
  const x = u * S - 0.5, y = v * S - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const ix0 = ((x0 % S) + S) % S, iy0 = ((y0 % S) + S) % S;
  const ix1 = (ix0 + 1) % S, iy1 = (iy0 + 1) % S;
  const a = data[(iy0 * S + ix0) * 4 + channel];
  const b = data[(iy0 * S + ix1) * 4 + channel];
  const c = data[(iy1 * S + ix0) * 4 + channel];
  const d = data[(iy1 * S + ix1) * 4 + channel];
  return ((a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy) / 255;
}

export function getNoiseTexture() {
  return cached('noise', () => {
    const size = NOISE_SIZE;
    const tex = new THREE.DataTexture(getNoiseData(), size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

export function getWaterNormalTexture() {
  return cached('waterNormal', () => {
    const size = 256;
    const tex = new THREE.DataTexture(bakeNormalMap(size, 5, 2.4), size, size, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.colorSpace = THREE.NoColorSpace;
    tex.needsUpdate = true;
    return tex;
  });
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(canvas, { srgb = true, repeat = false, mips = true } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = mips;
  tex.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

// 2x2 atlas of cumulus puffs. R = density (alpha), G = edge factor.
export function getCloudAtlas(size = 256) {
  return cached('clouds' + size, () => {
    const S = size * 2;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * size, oy = Math.floor(cell / 2) * size;
      const rand = mulberry32(cell * 977 + 13);
      const blobs = [];
      const nb = 6 + Math.floor(rand() * 5);
      for (let b = 0; b < nb; b++) {
        blobs.push({
          x: 0.5 + (rand() - 0.5) * 0.45,
          y: 0.55 + (rand() - 0.5) * 0.35,
          r: 0.16 + rand() * 0.18,
        });
      }
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size, v = y / size;
          let d = 0;
          for (const b of blobs) {
            const dx = (u - b.x) / b.r, dy = (v - b.y) / b.r;
            const q = dx * dx + dy * dy;
            if (q < 1) d += (1 - q) * (1 - q);
          }
          const n = tileableFbm(u + cell * 0.31, v, 4, 5, 77 + cell);
          let dens = Math.min(1, d * 0.9) * (0.75 + n * 0.6);
          // flatten bottom
          dens *= Math.min(1, (0.92 - v) * 6);
          // fade at cell borders
          const edge = Math.min(u, v, 1 - u, 1 - v) * 12;
          dens = Math.max(0, Math.min(1, dens * Math.min(1, edge)));
          const i = ((oy + y) * S + ox + x) * 4;
          img.data[i] = 255;
          img.data[i + 1] = Math.round(Math.max(0, Math.min(1, 1 - dens * 1.4)) * 255);
          img.data[i + 2] = Math.round(Math.max(0, Math.min(1, 1 - v)) * 255);
          img.data[i + 3] = Math.round(Math.pow(dens, 1.2) * 255);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = canvasTexture(canvas, { srgb: false });
    tex.premultiplyAlpha = false;
    return tex;
  });
}

// Soft particle sprites in a 2x2 atlas: smoke, fire, spark/glow, debris dust
export function getParticleAtlas() {
  return cached('particles', () => {
    const size = 128;
    const S = size * 2;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(S, S);
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * size, oy = Math.floor(cell / 2) * size;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const u = x / size - 0.5, v = y / size - 0.5;
          const r = Math.sqrt(u * u + v * v) * 2;
          let a = 0, c = 255;
          if (cell === 0) {
            // smoke
            const n = tileableFbm(x / size, y / size, 3, 5, 5);
            a = Math.max(0, 1 - r) ** 1.5 * (0.6 + n * 0.8);
            c = 200 + n * 55;
          } else if (cell === 1) {
            // fire
            const n = tileableFbm(x / size, y / size, 4, 4, 9);
            a = Math.max(0, 1 - r * (1 + n * 0.5)) ** 1.2;
            c = 255;
          } else if (cell === 2) {
            // glow
            a = Math.exp(-r * r * 6) + Math.max(0, 1 - r) * 0.2;
          } else {
            // ring / shockwave
            a = Math.exp(-((r - 0.75) ** 2) * 120) * 0.9;
          }
          a = Math.max(0, Math.min(1, a));
          const i = ((oy + y) * S + ox + x) * 4;
          img.data[i] = c;
          img.data[i + 1] = c;
          img.data[i + 2] = c;
          img.data[i + 3] = Math.round(a * 255);
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = canvasTexture(canvas, { srgb: false });
    // the particle shader indexes cells from the top-left (cell 0 smoke, 1 fire,
    // 2 glow, 3 ring): keep the canvas rows in that order on the GPU
    tex.flipY = false;
    return tex;
  });
}

export function getRunwayTexture(lengthPx = 2048, heading = 90) {
  const fmt = (h) => String(Math.round((((h % 360) + 360) % 360) / 10) || 36).padStart(2, '0');
  const nearNum = fmt(heading);
  const farNum = fmt(heading + 180);
  return cached('runway' + lengthPx + nearNum, () => {
    const W = 128, H = lengthPx;
    const canvas = makeCanvas(W, H);
    const ctx = canvas.getContext('2d');
    // asphalt
    ctx.fillStyle = '#3a3b3d';
    ctx.fillRect(0, 0, W, H);
    const rand = mulberry32(5);
    for (let i = 0; i < 9000; i++) {
      const g = 40 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${g},${g},${g + 2},${0.25 + rand() * 0.3})`;
      ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 2, 1 + rand() * 3);
    }
    // tyre marks near both ends
    for (const end of [0.12, 0.88]) {
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(15,15,15,${0.05 + rand() * 0.12})`;
        const x = W * 0.5 + (rand() - 0.5) * W * 0.35;
        ctx.fillRect(x, H * end + (rand() - 0.5) * H * 0.12, 2 + rand() * 3, 20 + rand() * 120);
      }
    }
    const pxPerM = H / 3000;
    ctx.fillStyle = '#e8e8e2';
    // edge lines
    ctx.fillRect(3, 0, 2, H);
    ctx.fillRect(W - 5, 0, 2, H);
    // centreline dashes 30m line / 20m gap
    for (let m = 150; m < 3000 - 150; m += 50) {
      ctx.fillRect(W / 2 - 1, m * pxPerM, 2, 30 * pxPerM);
    }
    // threshold piano keys and touchdown markings at both ends
    const drawEnd = (flip) => {
      const y0 = (m) => (flip ? H - m * pxPerM : m * pxPerM);
      const key = (m0, m1, x, w) => {
        const a = y0(m0), b = y0(m1);
        ctx.fillRect(x, Math.min(a, b), w, Math.abs(b - a));
      };
      for (let k = 0; k < 8; k++) {
        key(8, 50, 10 + k * 7.2, 4.5);
        key(8, 50, W - 10 - k * 7.2 - 4.5, 4.5);
      }
      // aiming point blocks
      key(300, 360, 26, 14);
      key(300, 360, W - 40, 14);
      // touchdown zone bars
      for (const m of [150, 450, 600]) {
        key(m, m + 22, 32, 4);
        key(m, m + 22, 38, 4);
        key(m, m + 22, W - 36, 4);
        key(m, m + 22, W - 42, 4);
      }
    };
    drawEnd(false);
    drawEnd(true);
    // runway numbers: the landing end (canvas bottom) reads upright on approach
    const num = (txt, y, flip) => {
      ctx.save();
      ctx.font = 'bold 34px Arial';
      ctx.textAlign = 'center';
      ctx.translate(W / 2, y);
      if (flip) ctx.rotate(Math.PI);
      ctx.scale(1, 2.4);
      ctx.fillText(txt, 0, 12);
      ctx.restore();
    };
    num(farNum, 75 * pxPerM, true);
    num(nearNum, H - 75 * pxPerM, false);
    const tex = canvasTexture(canvas);
    tex.anisotropy = 8;
    return tex;
  });
}

export function getConcreteTexture() {
  return cached('concrete', () => {
    const S = 256;
    const canvas = makeCanvas(S, S);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8e8e88';
    ctx.fillRect(0, 0, S, S);
    const rand = mulberry32(17);
    for (let i = 0; i < 4000; i++) {
      const g = 110 + Math.floor(rand() * 50);
      ctx.fillStyle = `rgba(${g},${g},${g - 4},0.35)`;
      ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
    }
    ctx.strokeStyle = 'rgba(40,40,40,0.5)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i <= S; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
    }
    return canvasTexture(canvas, { repeat: true });
  });
}

export function getLensflareTextures() {
  return cached('flare', () => {
    const mk = (size, fn) => {
      const canvas = makeCanvas(size, size);
      const ctx = canvas.getContext('2d');
      fn(ctx, size);
      return canvasTexture(canvas, { mips: false });
    };
    const main = mk(256, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,250,1)');
      g.addColorStop(0.08, 'rgba(255,250,230,0.9)');
      g.addColorStop(0.25, 'rgba(255,220,170,0.25)');
      g.addColorStop(1, 'rgba(255,200,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(s / 2, s / 2);
        ctx.rotate((i * Math.PI) / 6);
        const lg = ctx.createLinearGradient(-s / 2, 0, s / 2, 0);
        lg.addColorStop(0, 'rgba(255,240,220,0)');
        lg.addColorStop(0.5, 'rgba(255,240,220,0.25)');
        lg.addColorStop(1, 'rgba(255,240,220,0)');
        ctx.fillStyle = lg;
        ctx.fillRect(-s / 2, -1, s, 2);
        ctx.restore();
      }
    });
    const ring = mk(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(180,220,255,0.18)');
      g.addColorStop(0.85, 'rgba(255,200,160,0.12)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    const dot = mk(64, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
    return { main, ring, dot };
  });
}
