// Procedural liveries: camouflage, panel lines, rivets and weathering plus a
// matching normal map so panel lines catch the light.
import * as THREE from 'three';
import { mulberry32 } from '../world/noise.js';

const cache = new Map();

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function drawCamo(ctx, size, livery, rand) {
  ctx.fillStyle = livery.base;
  ctx.fillRect(0, 0, size, size);
  // countershading: lighter belly band on the fuselage UV (v 0.6..0.9)
  if (livery.belly) {
    const g = ctx.createLinearGradient(0, size * 0.55, 0, size * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, livery.belly);
    g.addColorStop(0.7, livery.belly);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, size * 0.55, size, size * 0.4);
  }
  for (const layer of livery.camo || []) {
    ctx.fillStyle = layer.color;
    for (let i = 0; i < layer.count; i++) {
      const x = rand() * size, y = rand() * size;
      const r = (layer.size * (0.6 + rand() * 0.8) * size) / 1024;
      ctx.beginPath();
      if (layer.type === 'splinter') {
        const n = 4 + Math.floor(rand() * 3);
        const a0 = rand() * Math.PI;
        for (let k = 0; k < n; k++) {
          const a = a0 + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.6;
          const rr = r * (0.5 + rand() * 0.9);
          const px = x + Math.cos(a) * rr * 1.6, py = y + Math.sin(a) * rr * 0.8;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      } else {
        // organic blob from overlapping circles
        for (let k = 0; k < 5; k++) {
          const ox = x + (rand() - 0.5) * r * 1.6, oy = y + (rand() - 0.5) * r;
          ctx.moveTo(ox + r * 0.6, oy);
          ctx.ellipse(ox, oy, r * (0.4 + rand() * 0.5), r * (0.3 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  }
}

function drawPanels(ctx, hctx, size, rand, alpha) {
  // panel lines on colour (dark, translucent) and height (recessed) canvases
  const lines = [];
  // longitudinal stations (vertical lines in canvas = constant u)
  let x = 0;
  while (x < size) {
    x += size * (0.035 + rand() * 0.06);
    lines.push({ x0: x, y0: 0, x1: x, y1: size, partial: rand() < 0.35 });
  }
  let y = 0;
  while (y < size) {
    y += size * (0.04 + rand() * 0.07);
    lines.push({ x0: 0, y0: y, x1: size, y1: y, partial: rand() < 0.5 });
  }
  const lw = Math.max(1, size / 700);
  for (const l of lines) {
    let { x0, y0, x1, y1 } = l;
    if (l.partial) {
      if (x0 === x1) {
        const a = rand() * size, b = a + size * (0.1 + rand() * 0.4);
        y0 = a; y1 = b;
      } else {
        const a = rand() * size, b = a + size * (0.1 + rand() * 0.4);
        x0 = a; x1 = b;
      }
    }
    ctx.strokeStyle = `rgba(20,24,28,${alpha})`;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    hctx.strokeStyle = 'rgb(60,60,60)';
    hctx.lineWidth = lw * 1.5;
    hctx.beginPath(); hctx.moveTo(x0, y0); hctx.lineTo(x1, y1); hctx.stroke();
    // rivets
    if (rand() < 0.4) {
      ctx.fillStyle = `rgba(20,24,28,${alpha * 0.6})`;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const step = size / 120;
      for (let t = 0; t < len; t += step) {
        const px = x0 + ((x1 - x0) * t) / len + (x0 === x1 ? lw * 3 : 0);
        const py = y0 + ((y1 - y0) * t) / len + (y0 === y1 ? lw * 3 : 0);
        ctx.fillRect(px, py, lw, lw);
      }
    }
  }
  // access hatches
  for (let i = 0; i < 26; i++) {
    const w = size * (0.015 + rand() * 0.04), h = size * (0.012 + rand() * 0.03);
    const px = rand() * size, py = rand() * size;
    ctx.strokeStyle = `rgba(20,24,28,${alpha * 0.9})`;
    ctx.lineWidth = lw;
    ctx.strokeRect(px, py, w, h);
    hctx.strokeStyle = 'rgb(80,80,80)';
    hctx.lineWidth = lw * 1.4;
    hctx.strokeRect(px, py, w, h);
  }
}

function weather(ctx, size, rand, amount) {
  for (let i = 0; i < 260 * amount; i++) {
    const x = rand() * size, y = rand() * size;
    const w = size * (0.002 + rand() * 0.008), h = size * (0.02 + rand() * 0.08);
    ctx.fillStyle = `rgba(30,30,28,${0.03 + rand() * 0.05})`;
    ctx.fillRect(x, y, w, h);
  }
  for (let i = 0; i < 120 * amount; i++) {
    const x = rand() * size, y = rand() * size;
    const r = size * (0.01 + rand() * 0.05);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rand() < 0.5;
    g.addColorStop(0, light ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
}

function heightToNormal(hcanvas, strength = 2.5) {
  const size = hcanvas.width;
  const src = hcanvas.getContext('2d').getImageData(0, 0, size, size).data;
  const out = canvas(size);
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const h = (x, y) => src[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x - 1, y) - h(x + 1, y)) * strength;
      const dy = (h(x, y - 1) - h(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = ((dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

export function getLiveryTextures(id, livery, size = 1024, withNormal = true) {
  const key = id + ':' + size + ':' + withNormal;
  if (cache.has(key)) return cache.get(key);
  const rand = mulberry32(livery.seed || 7);
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const hc = canvas(size);
  const hctx = hc.getContext('2d');
  hctx.fillStyle = '#fff';
  hctx.fillRect(0, 0, size, size);
  drawCamo(ctx, size, livery, rand);
  drawPanels(ctx, hctx, size, rand, livery.panelAlpha ?? 0.35);
  weather(ctx, size, rand, livery.weather ?? 1);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  let normalMap = null;
  if (withNormal) {
    normalMap = new THREE.CanvasTexture(heightToNormal(hc));
    normalMap.colorSpace = THREE.NoColorSpace;
    normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
    normalMap.anisotropy = 4;
  }
  const out = { map, normalMap };
  cache.set(key, out);
  return out;
}

export function getRoundelTexture(style) {
  const key = 'roundel:' + style;
  if (cache.has(key)) return cache.get(key);
  const S = 128;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.translate(S / 2, S / 2);
  const ring = (r, col) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  };
  if (style === 'star') {
    // low-visibility star and bar
    ctx.fillStyle = 'rgba(70,74,80,0.85)';
    ctx.fillRect(-60, -10, 120, 20);
    ring(34, 'rgba(70,74,80,0.85)');
    ctx.fillStyle = 'rgba(150,155,160,0.9)';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 12 : 30;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (style === 'redstar') {
    ring(46, 'rgba(255,255,255,0.95)');
    ctx.fillStyle = '#b3201d';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 17 : 42;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.clearRect(-64, -64, 0, 0);
  } else {
    ring(56, 'rgba(40,60,110,0.95)');
    ring(40, 'rgba(240,240,240,0.95)');
    ring(22, 'rgba(180,30,30,0.95)');
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

export function getTextTexture(text, color = 'rgba(40,44,50,0.85)', w = 256, h = 128, font = 'bold 72px Arial') {
  const key = 'text:' + text + color + font;
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}
