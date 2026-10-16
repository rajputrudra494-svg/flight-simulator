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
  } else if (style === 'india') {
    ring(56, 'rgba(255,153,51,0.95)');
    ring(38, 'rgba(245,245,245,0.95)');
    ring(20, 'rgba(19,136,8,0.95)');
  } else if (style === 'sweden') {
    ring(54, 'rgba(31,90,166,0.95)');
    ctx.fillStyle = 'rgba(250,205,30,0.95)';
    const crown = (cx, cy, s) => {
      ctx.beginPath();
      ctx.moveTo(cx - s, cy + s * 0.6);
      ctx.lineTo(cx - s, cy - s * 0.3);
      ctx.lineTo(cx - s * 0.5, cy + s * 0.1);
      ctx.lineTo(cx, cy - s * 0.6);
      ctx.lineTo(cx + s * 0.5, cy + s * 0.1);
      ctx.lineTo(cx + s, cy - s * 0.3);
      ctx.lineTo(cx + s, cy + s * 0.6);
      ctx.closePath();
      ctx.fill();
    };
    crown(-18, -14, 13);
    crown(18, -14, 13);
    crown(0, 18, 13);
  } else if (style === 'china') {
    ctx.fillStyle = 'rgba(200,30,30,0.92)';
    ctx.fillRect(-62, -11, 124, 22);
    ctx.fillStyle = 'rgba(250,215,40,0.95)';
    ctx.fillRect(-62, -13, 124, 3);
    ctx.fillRect(-62, 10, 124, 3);
    const star = (r0, r1, col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? r1 : r0;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    };
    star(46, 19, 'rgba(250,215,40,0.95)');
    star(40, 16, 'rgba(200,30,30,0.95)');
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

// Soft round glow used for navigation lights, strobes and beacons.
export function getGlowTexture() {
  const key = 'glow';
  if (cache.has(key)) return cache.get(key);
  const S = 64;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.75)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  cache.set(key, tex);
  return tex;
}

// ---------------------------------------------------------------------------
// Airline liveries. The fuselage loft maps u along the length and v around the
// circumference (v = 0 on the right-hand side, 0.25 on top, 0.5 on the left,
// 0.75 underneath), so everything here is painted in (z, theta) space.
// ---------------------------------------------------------------------------

function sectionAt(sections, z) {
  if (z <= sections[0].z) return sections[0];
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    if (z <= b.z) {
      const t = (z - a.z) / Math.max(1e-6, b.z - a.z);
      return { z, w: a.w + (b.w - a.w) * t, top: a.top + (b.top - a.top) * t, bot: a.bot + (b.bot - a.bot) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t };
    }
  }
  return sections[sections.length - 1];
}

// angle around the section (0 = side midline, + up) of a point at height y
function thetaAt(sec, y) {
  const d = y - (sec.y ?? 0);
  const r = d >= 0 ? sec.top : sec.bot;
  return Math.asin(Math.max(-1, Math.min(1, d / Math.max(r, 1e-3))));
}

class FuselagePainter {
  constructor(sections, W = 2048, H = 512) {
    this.secs = sections;
    this.W = W;
    this.H = H;
    this.z0 = sections[0].z;
    this.z1 = sections[sections.length - 1].z;
    this.c = document.createElement('canvas');
    this.c.width = W;
    this.c.height = H;
    this.ctx = this.c.getContext('2d');
    // pixels per metre along the length and around a typical cabin section
    const mid = sectionAt(sections, (this.z0 + this.z1) * 0.45);
    this.radius = Math.max(mid.top, mid.w);
    this.pxU = W / (this.z1 - this.z0);
    this.pxV = H / (Math.PI * 2 * this.radius);
  }

  x(z) { return ((z - this.z0) / (this.z1 - this.z0)) * this.W; }

  // canvas y of angle theta on a side (+1 right, -1 left)
  y(theta, side) {
    let v = side > 0 ? theta / (Math.PI * 2) : (Math.PI - theta) / (Math.PI * 2);
    v = ((v % 1) + 1) % 1;
    return (1 - v) * this.H;
  }

  // band between two angles on both sides over [za, zb]
  // fill the angle range [thA, thB] on one side over canvas columns x0..x0+w,
  // splitting it where it wraps across the texture seam
  span(x0, w, thA, thB, side) {
    let va = side > 0 ? thA / (Math.PI * 2) : (Math.PI - thB) / (Math.PI * 2);
    let vb = side > 0 ? thB / (Math.PI * 2) : (Math.PI - thA) / (Math.PI * 2);
    if (vb < va) [va, vb] = [vb, va];
    const k = Math.floor(va);
    va -= k;
    vb -= k;
    const rect = (v0, v1) => this.ctx.fillRect(x0, (1 - v1) * this.H, w, Math.max(1, (v1 - v0) * this.H));
    if (vb <= 1) rect(va, vb);
    else {
      rect(va, 1);
      rect(0, Math.min(1, vb - 1));
    }
  }

  // band between two angles on both sides over [za, zb]
  band(za, zb, thA, thB, color) {
    this.ctx.fillStyle = color;
    const x0 = this.x(za), w = this.x(zb) - x0;
    for (const side of [1, -1]) this.span(x0, w, thA, thB, side);
  }

  // stripe whose angles follow a function of z (swoosh), painted column by column
  stripe(za, zb, fn, color) {
    this.ctx.fillStyle = color;
    const step = 2;
    for (let px = Math.max(0, Math.floor(this.x(za))); px < Math.min(this.W, this.x(zb)); px += step) {
      const z = this.z0 + (px / this.W) * (this.z1 - this.z0);
      const r = fn(z);
      if (!r) continue;
      for (const side of [1, -1]) this.span(px, step, r[0], r[1], side);
    }
  }

  // filled polygon given in (z, height y) world points, on both sides
  poly(points, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (const side of [1, -1]) {
      ctx.beginPath();
      points.forEach(([z, y], i) => {
        const th = thetaAt(sectionAt(this.secs, z), y);
        const px = this.x(z), py = this.y(th, side);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
      ctx.fill();
    }
  }

  // text centred at (z, height y) with the given letter height in metres
  text(str, z, y, heightM, color, weight = '700') {
    const ctx = this.ctx;
    const th = thetaAt(sectionAt(this.secs, z), y);
    const px = Math.max(6, heightM * this.pxV);
    for (const side of [1, -1]) {
      ctx.save();
      ctx.translate(this.x(z), this.y(th, side));
      // right side: canvas up is world up but the nose is on the viewer's
      // right, so mirror horizontally; left side: canvas up is world down
      ctx.scale(side > 0 ? -this.pxU / this.pxV : this.pxU / this.pxV, side > 0 ? 1 : -1);
      ctx.font = `${weight} ${px}px "Rajdhani", "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.fillText(str, 0, 0);
      ctx.restore();
    }
  }

  windows(rows) {
    const ctx = this.ctx;
    for (const row of rows) {
      for (let z = row.z0; z <= row.z1 + 1e-3; z += row.pitch) {
        const sec = sectionAt(this.secs, z);
        const th = thetaAt(sec, row.y);
        const dth = row.h / Math.max(sec.top, 1e-3);
        const w = Math.max(2, row.w * this.pxU), h = Math.max(2, (dth / (Math.PI * 2)) * this.H);
        for (const side of [1, -1]) {
          const cx = this.x(z), cy = this.y(th, side);
          ctx.fillStyle = 'rgba(24,32,44,0.96)';
          roundRect(ctx, cx - w / 2, cy - h / 2, w, h, Math.min(w, h) * 0.45);
          ctx.fill();
          ctx.fillStyle = 'rgba(160,190,215,0.22)';
          ctx.fillRect(cx - w * 0.3, cy - h * 0.3, w * 0.25, h * 0.3);
        }
      }
    }
  }

  doors(list, yLow, yHigh) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(70,78,88,0.7)';
    ctx.lineWidth = 1.5;
    for (const z of list) {
      const sec = sectionAt(this.secs, z);
      const a = thetaAt(sec, yLow), b = thetaAt(sec, yHigh);
      for (const side of [1, -1]) {
        const x0 = this.x(z - 0.45), x1 = this.x(z + 0.45);
        const y0 = this.y(a, side), y1 = this.y(b, side);
        ctx.strokeRect(x0, Math.min(y0, y1), x1 - x0, Math.abs(y1 - y0));
      }
    }
  }

  texture() {
    const tex = new THREE.CanvasTexture(this.c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function paintCockpit(p, ck) {
  if (!ck) return;
  const len = ck.z1 - ck.z0;
  const frame = 0.1;
  const panes = [[0, 0.38], [0.38 + frame / len, 0.7], [0.7 + frame / len, 1]];
  for (const [a, b] of panes) {
    const za = ck.z0 + len * a, zb = ck.z0 + len * b;
    // windscreens rake back at the top, side windows have a straight sill
    const rake = a === 0 ? len * 0.2 : 0;
    p.poly([[za + rake, ck.y1], [zb, ck.y1 - (a === 0 ? 0 : 0.04)], [zb, ck.y0 + 0.06], [za, ck.y0]], 'rgba(18,24,32,0.98)');
  }
}

function weatherAirliner(ctx, W, H, rand) {
  // faint panel seams and streaks
  ctx.strokeStyle = 'rgba(60,66,74,0.07)';
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 34 + rand() * 30) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(40,40,40,${0.012 + rand() * 0.025})`;
    ctx.fillRect(rand() * W, rand() * H, 1 + rand() * 3, 6 + rand() * 30);
  }
}

function drawLogo(ctx, kind, cx, cy, s, color) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? s * 0.42 : s;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'wave') {
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = 'round';
    for (const k of [-0.35, 0.35]) {
      ctx.beginPath();
      for (let t = -1; t <= 1.001; t += 0.05) ctx.lineTo(t * s, k * s + Math.sin(t * 3.2) * s * 0.3);
      ctx.stroke();
    }
  } else if (kind === 'globe') {
    ctx.lineWidth = s * 0.1;
    ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.stroke();
    for (const k of [0.45, 0.9]) {
      ctx.beginPath(); ctx.ellipse(0, 0, s * k, s, 0, 0, Math.PI * 2); ctx.stroke();
    }
    for (const k of [-0.5, 0, 0.5]) {
      const hw = Math.sqrt(1 - k * k) * s;
      ctx.beginPath(); ctx.moveTo(-hw, k * s); ctx.lineTo(hw, k * s); ctx.stroke();
    }
  } else if (kind === 'flag') {
    ctx.fillStyle = '#0057b7';
    ctx.fillRect(-s * 1.2, -s * 0.6, s * 2.4, s * 0.6);
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(-s * 1.2, 0, s * 2.4, s * 0.6);
  } else if (kind === 'falcon') {
    ctx.beginPath();
    ctx.moveTo(-s, -s * 0.2);
    ctx.quadraticCurveTo(-s * 0.2, -s * 0.15, 0, s * 0.5);
    ctx.quadraticCurveTo(s * 0.2, -s * 0.15, s, -s * 0.2);
    ctx.quadraticCurveTo(s * 0.3, s * 0.05, s * 0.12, s * 0.95);
    ctx.lineTo(-s * 0.12, s * 0.95);
    ctx.quadraticCurveTo(-s * 0.3, s * 0.05, -s, -s * 0.2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// Tail fin artwork, mapped with the fin's own UVs (u chord-wise, v up the fin).
function paintTail(livery) {
  const S = 512;
  const c = canvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = livery.tail;
  ctx.fillRect(0, 0, S, S);
  if (livery.logo === 'stripes') {
    ctx.fillStyle = livery.stripe;
    ctx.beginPath(); ctx.moveTo(0, S * 0.12); ctx.lineTo(S, S * 0.02); ctx.lineTo(S, S * 0.16); ctx.lineTo(0, S * 0.26); ctx.fill();
    ctx.fillStyle = livery.stripe2;
    ctx.beginPath(); ctx.moveTo(0, S * 0.29); ctx.lineTo(S, S * 0.19); ctx.lineTo(S, S * 0.25); ctx.lineTo(0, S * 0.35); ctx.fill();
  } else {
    // accent sweep at the root, logo high on the fin (canvas top = fin tip)
    ctx.fillStyle = livery.tailAccent;
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(0, S * 0.8); ctx.quadraticCurveTo(S * 0.5, S * 0.86, S, S * 0.66); ctx.lineTo(S, S); ctx.fill();
    ctx.fillStyle = livery.tail;
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(0, S * 0.87); ctx.quadraticCurveTo(S * 0.5, S * 0.93, S, S * 0.75); ctx.lineTo(S, S); ctx.fill();
    drawLogo(ctx, livery.logo, S * 0.58, S * 0.42, S * 0.17, livery.tailAccent);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function paintFuselageLivery(spec, sections, opts) {
  const L = spec.livery;
  const p = new FuselagePainter(sections);
  const ctx = p.ctx;
  const rand = mulberry32(L.seed || 5);
  ctx.fillStyle = L.top;
  ctx.fillRect(0, 0, p.W, p.H);
  const zEnd = p.z1;
  if (opts.main) {
    if (!L.noBelly) {
      // darker belly with a soft upper edge
      p.band(p.z0, zEnd, Math.PI + 0.42, Math.PI * 2 - 0.42, L.belly);
      p.band(p.z0, zEnd, Math.PI + 0.36, Math.PI + 0.42, L.belly + '99');
      p.band(p.z0, zEnd, Math.PI * 2 - 0.42, Math.PI * 2 - 0.36, L.belly + '99');
    }
    // cheatline swoosh that sweeps up towards the fin
    const wy = (opts.windows[0] && opts.windows[0].y) || 0.3;
    const thW = thetaAt(sectionAt(sections, (p.z0 + zEnd) * 0.5), wy);
    const zr0 = p.z0 + (zEnd - p.z0) * 0.6, zr1 = p.z0 + (zEnd - p.z0) * 0.93;
    const swoosh = (base, width) => (z) => {
      if (z < p.z0 + (zEnd - p.z0) * 0.08) return null;
      const t = Math.max(0, Math.min(1, (z - zr0) / (zr1 - zr0)));
      const a = base + t * t * 1.25;
      return [a, a + width * (1 + t * 0.6)];
    };
    p.stripe(p.z0, zEnd, swoosh(thW - 0.33, 0.1), L.stripe);
    p.stripe(p.z0, zEnd, swoosh(thW - 0.43, 0.045), L.stripe2);
    p.windows(opts.windows);
    if (opts.doors) p.doors(opts.doors, wy - 1.25, wy + 0.75);
    // airline name above the windows, registration aft
    const r = p.radius;
    p.text(L.airline, p.z0 + (zEnd - p.z0) * 0.36, wy + r * 0.42, r * 0.3, L.stripe);
    p.text(L.reg || `N${((L.seed || 100) * 7) % 900 + 100}${L.airline.slice(0, 2)}`, p.z0 + (zEnd - p.z0) * 0.84, wy + 0.05, r * 0.09, 'rgba(40,46,56,0.85)', '600');
    if (L.subtitle) p.text(L.subtitle, p.z0 + (zEnd - p.z0) * 0.36, wy + r * 0.17, r * 0.1, L.stripe, '600');
    // APU exhaust
    p.band(zEnd - 0.6, zEnd, -Math.PI * 0.999, Math.PI * 0.999, '#444a50');
  } else {
    // upper deck / hump: windows only
    p.windows(opts.windows);
  }
  paintCockpit(p, opts.cockpit);
  weatherAirliner(ctx, p.W, p.H, rand);
  return p.texture();
}

export function getAirlinerTextures(spec, sections, humpSections = null) {
  const key = 'airliner:' + spec.id;
  if (cache.has(key)) return cache.get(key);
  const d = spec.design;
  const fuselage = paintFuselageLivery(spec, sections, { main: true, windows: d.windows || [], doors: d.doors, cockpit: d.hump ? null : d.cockpit });
  const hump = humpSections ? paintFuselageLivery(spec, humpSections, { main: false, windows: d.hump.windows || [], cockpit: d.hump.cockpit }) : null;
  const tail = paintTail(spec.livery);
  const wing = getLiveryTextures('wing:' + spec.id, { base: '#c4c9ce', camo: [], panelAlpha: 0.22, seed: (spec.livery.seed || 3) + 1, weather: 0.5 }, 1024, true);
  const out = { fuselage, hump, tail, wing };
  cache.set(key, out);
  return out;
}
