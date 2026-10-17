// Live cockpit displays drawn on 2D canvases: Airbus / Boeing style primary
// flight and navigation displays, engine and system pages, flight management
// computer screens and the autopilot readouts for the airliners; radar,
// stores, tactical-situation, engine and threat pages, panoramic displays and
// up-front data for the fighters; plus animated analogue instrument panels
// (attitude ball, airspeed, altimeter, engine gauges) for the older cockpits.
import * as THREE from 'three';

const MONO = '"Share Tech Mono", Consolas, monospace';
const SANS = '"Arial Narrow", Arial, sans-serif';
export const C = {
  green: '#3cff62', amber: '#ffb11a', cyan: '#2fe0ff', red: '#ff3a2e', white: '#f2f5f2', magenta: '#ff5ce1', yellow: '#ffe81a',
  sky: '#1d86d8', ground: '#8a5524', tape: '#3d444b', grey: '#7f878d',
};

const _f = new THREE.Vector3();
export function headingOf(q) {
  _f.set(0, 0, -1).applyQuaternion(q);
  return (Math.atan2(_f.x, -_f.z) + Math.PI * 2) % (Math.PI * 2);
}
const deg = (r) => (r * 180) / Math.PI;
const pad3 = (n) => String(Math.round(n) % 360).padStart(3, '0');

// A canvas texture redrawn at its own rate, staggered so the displays don't
// all upload on the same frame.
export class Display {
  constructor(w, h, rate, draw, phase = 0) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.rate = rate;
    this.draw = draw;
    this.timer = phase;
  }

  redraw(g) {
    this.timer = 1 / this.rate;
    this.draw(this.ctx, this.canvas.width, this.canvas.height, g);
    this.tex.needsUpdate = true;
  }

  dispose() { this.tex.dispose(); }
}

// Redraws at most one display per frame (the most overdue one) so canvas
// drawing and texture uploads never pile up on the same frame. Displays that
// have never been drawn go first.
export function updateDisplays(list, dt, g) {
  let pick = null, worst = 0;
  for (const d of list) {
    d.timer -= dt;
    const late = d.drawn ? -d.timer * d.rate : 1e6;
    if (d.timer <= 0 && late >= worst) {
      worst = late;
      pick = d;
    }
  }
  if (pick) {
    pick.redraw(g);
    pick.drawn = true;
  }
}

function txt(ctx, s, x, y, size, color, align = 'center', font = MONO) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function line(ctx, x0, y0, x1, y1, color, w = 2) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function flightData(g) {
  const p = g.ac;
  const fm = p.fm;
  const att = fm.attitude(g._att || (g._att = {}));
  return {
    p, fm, att,
    kts: fm.ias * 1.94384,
    alt: p.position.y * 3.28084,
    vs: p.velocity.y * 196.85,
    hdg: att.heading,
    mach: fm.mach,
    gs: (fm.groundSpeed ?? fm.airspeed) * 1.94384,
  };
}

// ---------------------------------------------------------------------------
// Primary flight display
// ---------------------------------------------------------------------------
export function drawPFD(ctx, W, H, g, maker = 'airbus') {
  const d = flightData(g);
  const boeing = maker !== 'airbus';
  const s = W / 512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  // attitude
  const cx = W * 0.47, cy = H * 0.46;
  const pxDeg = 6.2 * s;
  ctx.save();
  ctx.beginPath();
  if (boeing) ctx.roundRect(cx - 118 * s, cy - 130 * s, 236 * s, 255 * s, 26 * s);
  else {
    ctx.moveTo(cx - 120 * s, cy - 125 * s);
    ctx.lineTo(cx + 120 * s, cy - 125 * s);
    ctx.lineTo(cx + 120 * s, cy + 95 * s);
    ctx.quadraticCurveTo(cx, cy + 150 * s, cx - 120 * s, cy + 95 * s);
    ctx.closePath();
  }
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-d.att.roll * Math.PI) / 180);
  const py = d.att.pitch * pxDeg;
  ctx.fillStyle = boeing ? '#1478d4' : C.sky;
  ctx.fillRect(-400 * s, -800 * s + py, 800 * s, 800 * s);
  ctx.fillStyle = boeing ? '#7a4b20' : C.ground;
  ctx.fillRect(-400 * s, py, 800 * s, 800 * s);
  line(ctx, -400 * s, py, 400 * s, py, C.white, 2.5 * s);
  ctx.lineWidth = 2 * s;
  for (let a = -30; a <= 30; a += 2.5) {
    if (!a) continue;
    const yy = py - a * pxDeg;
    const major = a % 10 === 0, half = a % 5 === 0;
    const w = major ? 34 : half ? 17 : 8;
    line(ctx, -w * s, yy, w * s, yy, C.white, 2 * s);
    if (major) {
      txt(ctx, String(Math.abs(a)), -(w + 14) * s, yy, 15 * s, C.white);
      txt(ctx, String(Math.abs(a)), (w + 14) * s, yy, 15 * s, C.white);
    }
  }
  ctx.restore();
  // roll scale
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2 * s;
  const rr = 112 * s;
  ctx.beginPath();
  ctx.arc(cx, cy, rr, -Math.PI / 2 - 0.79, -Math.PI / 2 + 0.79);
  ctx.stroke();
  for (const a of [-45, -30, -20, -10, 10, 20, 30, 45]) {
    const t = ((a - 90) * Math.PI) / 180;
    const l = Math.abs(a) === 30 || Math.abs(a) === 45 ? 12 : 7;
    line(ctx, cx + Math.cos(t) * rr, cy + Math.sin(t) * rr, cx + Math.cos(t) * (rr + l * s), cy + Math.sin(t) * (rr + l * s), C.white, 2 * s);
  }
  // fixed index + roll pointer
  ctx.fillStyle = boeing ? C.white : C.yellow;
  ctx.beginPath();
  ctx.moveTo(cx, cy - rr - 1 * s); ctx.lineTo(cx - 7 * s, cy - rr - 13 * s); ctx.lineTo(cx + 7 * s, cy - rr - 13 * s); ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((-d.att.roll * Math.PI) / 180);
  ctx.fillStyle = boeing ? C.white : C.yellow;
  ctx.beginPath();
  ctx.moveTo(0, -rr + 2 * s); ctx.lineTo(-8 * s, -rr + 15 * s); ctx.lineTo(8 * s, -rr + 15 * s); ctx.closePath();
  ctx.fill();
  ctx.restore();
  // flight director bars
  const fdP = THREE.MathUtils.clamp(-d.vs / 400, -4, 4) * pxDeg * 0.5;
  line(ctx, cx - 60 * s, cy + fdP, cx + 60 * s, cy + fdP, boeing ? C.magenta : C.green, 3 * s);
  line(ctx, cx + THREE.MathUtils.clamp(-d.att.roll, -20, 20) * 2 * s, cy - 60 * s, cx + THREE.MathUtils.clamp(-d.att.roll, -20, 20) * 2 * s, cy + 60 * s, boeing ? C.magenta : C.green, 3 * s);
  // aircraft symbol
  ctx.fillStyle = boeing ? '#000' : '#000';
  ctx.strokeStyle = boeing ? C.white : C.yellow;
  ctx.lineWidth = 3 * s;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * 26 * s, cy - 4 * s);
    ctx.lineTo(cx + sx * 70 * s, cy - 4 * s);
    ctx.lineTo(cx + sx * 70 * s, cy + 4 * s);
    ctx.lineTo(cx + sx * 34 * s, cy + 4 * s);
    ctx.lineTo(cx + sx * 34 * s, cy + 14 * s);
    ctx.lineTo(cx + sx * 26 * s, cy + 14 * s);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.fillRect(cx - 5 * s, cy - 5 * s, 10 * s, 10 * s);
  ctx.strokeRect(cx - 5 * s, cy - 5 * s, 10 * s, 10 * s);

  // speed tape
  const tx = 10 * s, tw = 66 * s, ty = cy - 130 * s, th = 260 * s;
  ctx.fillStyle = C.tape;
  ctx.fillRect(tx, ty, tw, th);
  ctx.save();
  ctx.beginPath(); ctx.rect(tx, ty, tw, th); ctx.clip();
  const kPx = 3.2 * s;
  for (let v = Math.floor((d.kts - 45) / 10) * 10; v <= d.kts + 45; v += 10) {
    if (v < 30) continue;
    const yy = cy - (v - d.kts) * kPx;
    line(ctx, tx + tw - 12 * s, yy, tx + tw, yy, C.white, 2 * s);
    if (v % 20 === 0) txt(ctx, String(v), tx + tw - 18 * s, yy, 18 * s, C.white, 'right');
  }
  // overspeed barber pole
  const vmo = 340;
  if (d.kts + 45 > vmo) {
    const yy = cy - (vmo - d.kts) * kPx;
    for (let k = 0; k < 30; k++) {
      ctx.fillStyle = k % 2 ? '#000' : C.red;
      ctx.fillRect(tx + tw - 8 * s, yy - (k + 1) * 8 * s, 8 * s, 8 * s);
    }
  }
  // speed trend
  const trend = THREE.MathUtils.clamp((g.ac.fm.accel || 0) * 1.94384 * 10, -40, 40);
  if (Math.abs(trend) > 2) {
    line(ctx, tx + tw - 4 * s, cy, tx + tw - 4 * s, cy - trend * kPx, C.yellow, 2 * s);
  }
  ctx.restore();
  if (boeing) {
    ctx.fillStyle = '#000';
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2 * s;
    ctx.fillRect(tx + 2 * s, cy - 16 * s, tw - 6 * s, 32 * s);
    ctx.strokeRect(tx + 2 * s, cy - 16 * s, tw - 6 * s, 32 * s);
    txt(ctx, String(Math.round(d.kts)), tx + tw - 10 * s, cy, 22 * s, C.white, 'right');
    txt(ctx, String(Math.round(d.kts / 10) * 10), tx + tw / 2, ty - 12 * s, 18 * s, C.magenta);
  } else {
    line(ctx, tx, cy, tx + tw + 16 * s, cy, C.yellow, 3 * s);
    txt(ctx, `.${String(Math.round(d.mach * 1000)).padStart(3, '0').slice(0, 2)}`, tx + tw / 2, ty + th + 16 * s, 18 * s, C.green);
  }
  // altitude tape
  const ax = W - 118 * s, aw = 70 * s;
  ctx.fillStyle = C.tape;
  ctx.fillRect(ax, ty, aw, th);
  ctx.save();
  ctx.beginPath(); ctx.rect(ax, ty, aw, th); ctx.clip();
  const fPx = 0.22 * s;
  for (let v = Math.floor((d.alt - 650) / 100) * 100; v <= d.alt + 650; v += 100) {
    const yy = cy - (v - d.alt) * fPx;
    line(ctx, ax, yy, ax + (v % 500 === 0 ? 12 : 7) * s, yy, C.white, 2 * s);
    if (v % 500 === 0) txt(ctx, boeing ? String(v) : String(Math.round(v / 100)).padStart(3, '0'), ax + 16 * s, yy, 17 * s, C.white, 'left');
  }
  ctx.restore();
  ctx.fillStyle = '#000';
  ctx.strokeStyle = boeing ? C.white : C.yellow;
  ctx.lineWidth = 2 * s;
  ctx.fillRect(ax - 4 * s, cy - 17 * s, aw + 4 * s, 34 * s);
  ctx.strokeRect(ax - 4 * s, cy - 17 * s, aw + 4 * s, 34 * s);
  txt(ctx, String(Math.max(0, Math.round(d.alt / 20) * 20)), ax + aw - 4 * s, cy, 21 * s, boeing ? C.white : C.green, 'right');
  const selAlt = Math.max(1000, Math.round(d.alt / 1000) * 1000);
  txt(ctx, String(selAlt), ax + aw / 2, ty - 12 * s, 18 * s, boeing ? C.magenta : C.cyan);
  // vertical speed
  const vx = W - 40 * s;
  ctx.fillStyle = C.tape;
  ctx.beginPath();
  ctx.moveTo(vx, cy - 110 * s); ctx.lineTo(vx + 26 * s, cy - 80 * s); ctx.lineTo(vx + 26 * s, cy + 80 * s); ctx.lineTo(vx, cy + 110 * s);
  ctx.closePath();
  ctx.fill();
  const vsN = Math.sign(d.vs) * Math.min(1, Math.sqrt(Math.abs(d.vs) / 6000));
  line(ctx, vx + 34 * s, cy, vx + 4 * s, cy - vsN * 100 * s, boeing ? C.white : C.green, 3 * s);
  if (Math.abs(d.vs) > 400) txt(ctx, String(Math.round(Math.abs(d.vs) / 100)), vx + 13 * s, cy + (d.vs > 0 ? -122 : 122) * s, 16 * s, boeing ? C.white : C.green);
  // heading
  const hy = H - 34 * s;
  if (boeing) {
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 140 * s, hy - 40 * s, 280 * s, 80 * s); ctx.clip();
    const R = 150 * s, hcy = hy + R - 22 * s;
    ctx.fillStyle = '#2a2f34';
    ctx.beginPath(); ctx.arc(cx, hcy, R, 0, Math.PI * 2); ctx.fill();
    for (let a = 0; a < 360; a += 5) {
      const t = ((a - d.hdg) * Math.PI) / 180 - Math.PI / 2;
      const l = a % 10 === 0 ? 12 : 6;
      line(ctx, cx + Math.cos(t) * R, hcy + Math.sin(t) * R, cx + Math.cos(t) * (R - l * s), hcy + Math.sin(t) * (R - l * s), C.white, 2 * s);
      if (a % 30 === 0) txt(ctx, String(a / 10), cx + Math.cos(t) * (R - 24 * s), hcy + Math.sin(t) * (R - 24 * s), 15 * s, C.white);
    }
    ctx.restore();
    ctx.fillStyle = '#000';
    ctx.fillRect(cx - 34 * s, hy - 48 * s, 68 * s, 22 * s);
    txt(ctx, `${pad3(d.hdg)}`, cx, hy - 37 * s, 18 * s, C.white);
    txt(ctx, 'MAG', cx + 52 * s, hy - 37 * s, 13 * s, C.green);
  } else {
    ctx.fillStyle = C.tape;
    ctx.fillRect(cx - 120 * s, hy - 14 * s, 240 * s, 30 * s);
    ctx.save();
    ctx.beginPath(); ctx.rect(cx - 120 * s, hy - 14 * s, 240 * s, 30 * s); ctx.clip();
    for (let a = Math.floor(d.hdg / 5) * 5 - 25; a <= d.hdg + 25; a += 5) {
      const xx = cx + (a - d.hdg) * 4.8 * s;
      line(ctx, xx, hy - 14 * s, xx, hy - (a % 10 === 0 ? 4 : 8) * s, C.white, 2 * s);
      if (a % 10 === 0) txt(ctx, String(((a % 360) + 360) % 360 / 10), xx, hy + 6 * s, 15 * s, C.white);
    }
    ctx.restore();
    line(ctx, cx, hy - 22 * s, cx, hy - 2 * s, C.yellow, 3 * s);
  }
  // flight mode annunciations
  const fm = g.ac.fm;
  const thrMode = fm.onGround ? (fm.throttle > 0.8 ? 'TOGA' : 'IDLE') : fm.throttle > 0.92 ? 'THR CLB' : 'SPEED';
  const vert = Math.abs(d.vs) < 300 ? 'ALT' : d.vs > 0 ? 'CLB' : 'DES';
  if (boeing) {
    const modes = [fm.onGround ? 'TO/GA' : 'SPD', 'LNAV', Math.abs(d.vs) < 300 ? 'VNAV PTH' : 'VNAV SPD'];
    modes.forEach((m, i) => {
      txt(ctx, m, cx - 100 * s + i * 100 * s, 18 * s, 17 * s, C.green);
      if (i) line(ctx, cx - 150 * s + i * 100 * s, 6 * s, cx - 150 * s + i * 100 * s, 32 * s, C.white, 1.5 * s);
    });
    ctx.strokeStyle = C.green;
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(cx - 34 * s, 44 * s, 68 * s, 24 * s);
    txt(ctx, fm.onGround ? 'FD' : 'CMD', cx, 56 * s, 18 * s, C.green);
  } else {
    const cols = [thrMode, vert, fm.onGround ? 'RWY' : 'NAV', fm.onGround ? '' : 'CAT 3', 'AP1'];
    cols.forEach((m, i) => {
      const x = (W / 5) * (i + 0.5);
      txt(ctx, m, x, 16 * s, 16 * s, i === 4 ? C.white : C.green);
      if (i) line(ctx, (W / 5) * i, 4 * s, (W / 5) * i, 48 * s, C.white, 1.5 * s);
    });
    txt(ctx, '1FD2', W * 0.9, 34 * s, 15 * s, C.white);
    txt(ctx, 'A/THR', W * 0.9, 50 * s, 14 * s, C.white);
    txt(ctx, 'QNH', 30 * s, H - 26 * s, 14 * s, C.white);
    txt(ctx, '1013', 30 * s, H - 10 * s, 15 * s, C.cyan);
  }
}

// ---------------------------------------------------------------------------
// Navigation display (ARC mode) with the route home, the airport and traffic
// ---------------------------------------------------------------------------
export function drawND(ctx, W, H, g, maker = 'airbus') {
  const d = flightData(g);
  const p = d.p;
  const boeing = maker !== 'airbus';
  const s = W / 512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.82, R = H * 0.66;
  const hd = (d.hdg * Math.PI) / 180;
  const range = 40 * 1852; // 40 NM
  const toScreen = (wx, wz) => {
    const dx = wx - p.position.x, dz = wz - p.position.z;
    const right = dx * Math.cos(hd) + dz * Math.sin(hd);
    const along = dx * Math.sin(hd) - dz * Math.cos(hd);
    return [cx + (right / range) * R, cy - (along / range) * R, Math.hypot(right, along)];
  };
  // compass arc
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI * 0.86, -Math.PI * 0.14); ctx.stroke();
  ctx.setLineDash([6 * s, 8 * s]);
  ctx.beginPath(); ctx.arc(cx, cy, R / 2, -Math.PI * 0.84, -Math.PI * 0.16); ctx.stroke();
  ctx.setLineDash([]);
  for (let a = 0; a < 360; a += 5) {
    let t = ((a - d.hdg) * Math.PI) / 180;
    t = Math.atan2(Math.sin(t), Math.cos(t));
    if (Math.abs(t) > Math.PI * 0.36) continue;
    const tt = t - Math.PI / 2;
    const l = a % 10 === 0 ? 14 : 7;
    line(ctx, cx + Math.cos(tt) * R, cy + Math.sin(tt) * R, cx + Math.cos(tt) * (R - l * s), cy + Math.sin(tt) * (R - l * s), C.white, 2 * s);
    if (a % 30 === 0) txt(ctx, String(a / 10), cx + Math.cos(tt) * (R - 28 * s), cy + Math.sin(tt) * (R - 28 * s), 18 * s, C.white);
  }
  txt(ctx, '20', cx - R / 2 * 0.72, cy - R / 2 * 0.72, 14 * s, C.cyan);
  // the route: final approach fix on the extended centreline, then the runway
  const ab = g.battle.map.airbase;
  const fafD = 12000;
  const faf = [ab.x - (ab.dirX || 0) * fafD, ab.z - (ab.dirZ || 1) * fafD];
  const routeCol = boeing ? C.magenta : C.green;
  ctx.save();
  ctx.beginPath(); ctx.rect(0, 30 * s, W, H - 30 * s); ctx.clip();
  const [fx, fy] = toScreen(faf[0], faf[1]);
  const [rx, ry] = toScreen(ab.x, ab.z);
  ctx.strokeStyle = routeCol;
  ctx.lineWidth = 3 * s;
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(fx, fy); ctx.lineTo(rx, ry); ctx.stroke();
  // waypoint star and airport
  ctx.fillStyle = routeCol;
  ctx.save();
  ctx.translate(fx, fy);
  ctx.strokeStyle = boeing ? C.magenta : C.white;
  ctx.lineWidth = 2 * s;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const t = (i * Math.PI) / 2;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(t) * 9 * s, Math.sin(t) * 9 * s);
  }
  ctx.stroke();
  ctx.restore();
  txt(ctx, 'FAF01', fx + 30 * s, fy - 12 * s, 15 * s, boeing ? C.magenta : C.white);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(rx, ry, 9 * s, 0, Math.PI * 2); ctx.stroke();
  txt(ctx, 'ATOL', rx + 28 * s, ry + 14 * s, 15 * s, C.white);
  // traffic
  for (const a of g.battle.aircraft) {
    if (a === p || !a.alive) continue;
    const [tx, ty, dist] = toScreen(a.position.x, a.position.z);
    if (dist > range * 1.1) continue;
    const dAlt = Math.round((a.position.y - p.position.y) * 3.28084 / 100);
    const close = dist < 6000 && Math.abs(dAlt) < 12;
    ctx.fillStyle = close ? C.amber : boeing ? C.white : C.cyan;
    ctx.beginPath();
    ctx.moveTo(tx, ty - 8 * s); ctx.lineTo(tx + 8 * s, ty); ctx.lineTo(tx, ty + 8 * s); ctx.lineTo(tx - 8 * s, ty); ctx.closePath();
    if (close) ctx.fill();
    else { ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = 2 * s; ctx.stroke(); }
    txt(ctx, `${dAlt >= 0 ? '+' : '-'}${String(Math.abs(dAlt)).padStart(2, '0')}`, tx, ty + (dAlt >= 0 ? -16 : 16) * s, 13 * s, ctx.fillStyle);
  }
  ctx.restore();
  // own aircraft
  if (boeing) {
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(cx, cy - 18 * s); ctx.lineTo(cx + 10 * s, cy + 8 * s); ctx.lineTo(cx - 10 * s, cy + 8 * s); ctx.closePath(); ctx.stroke();
  } else {
    line(ctx, cx, cy - 20 * s, cx, cy + 14 * s, C.yellow, 4 * s);
    line(ctx, cx - 18 * s, cy - 6 * s, cx + 18 * s, cy - 6 * s, C.yellow, 4 * s);
    line(ctx, cx - 7 * s, cy + 10 * s, cx + 7 * s, cy + 10 * s, C.yellow, 4 * s);
  }
  // header data
  const tas = d.kts * (1 + p.position.y / 50000);
  txt(ctx, `GS${Math.round(d.gs)} TAS${Math.round(tas)}`, 10 * s, 18 * s, 16 * s, C.white, 'left');
  txt(ctx, '270/ 18', 10 * s, 38 * s, 15 * s, C.green, 'left');
  const distNm = Math.hypot(faf[0] - p.position.x, faf[1] - p.position.z) / 1852;
  txt(ctx, 'FAF01', W - 10 * s, 18 * s, 16 * s, C.white, 'right');
  txt(ctx, `${distNm.toFixed(1)}NM`, W - 10 * s, 38 * s, 15 * s, routeCol, 'right');
  if (boeing) {
    ctx.fillStyle = '#000';
    ctx.strokeStyle = C.white;
    ctx.lineWidth = 2 * s;
    ctx.strokeRect(cx - 30 * s, 8 * s, 60 * s, 24 * s);
    txt(ctx, pad3(d.hdg), cx, 20 * s, 18 * s, C.white);
    txt(ctx, 'TRK', cx - 52 * s, 20 * s, 14 * s, C.green);
    txt(ctx, 'MAG', cx + 54 * s, 20 * s, 14 * s, C.green);
  } else {
    line(ctx, cx, cy - R - 16 * s, cx, cy - R + 6 * s, C.yellow, 4 * s);
  }
}

// ---------------------------------------------------------------------------
// Engine / warning display (Airbus E/WD, Boeing upper EICAS)
// ---------------------------------------------------------------------------
function dial(ctx, x, y, r, v, max, label, s, opts = {}) {
  const a0 = Math.PI * 0.75, span = Math.PI * 1.25;
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath(); ctx.arc(x, y, r, a0, a0 + span); ctx.stroke();
  // red line
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 4 * s;
  ctx.beginPath(); ctx.arc(x, y, r, a0 + span * 0.92, a0 + span); ctx.stroke();
  const t = a0 + span * THREE.MathUtils.clamp(v / max, 0, 1);
  if (opts.fill) {
    ctx.fillStyle = 'rgba(160,160,160,0.35)';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, a0, t); ctx.closePath(); ctx.fill();
  }
  line(ctx, x, y, x + Math.cos(t) * r * 1.05, y + Math.sin(t) * r * 1.05, opts.col || C.green, 3.5 * s);
  ctx.strokeStyle = C.white;
  ctx.lineWidth = 1.5 * s;
  ctx.strokeRect(x - 2 * s, y - r * 0.55, r * 1.05, r * 0.5);
  txt(ctx, opts.text || v.toFixed(1), x + r * 0.98, y - r * 0.3, 17 * s, opts.col || C.green, 'right');
  if (label) txt(ctx, label, x, y + r * 0.6, 13 * s, C.cyan);
}

export function drawEngines(ctx, W, H, g, maker = 'airbus', engines = 2) {
  const d = flightData(g);
  const fm = d.fm;
  const s = W / 512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const boeing = maker !== 'airbus';
  const rev = fm.reverser ? fm.reverser.power || 0 : 0;
  const thr = Math.max(fm.throttle, rev * 0.8);
  const n1 = 21.5 + thr * 76;
  const egt = 410 + thr * 520;
  const n = Math.max(2, Math.min(4, engines));
  const colW = (boeing ? W * 0.62 : W) / n;
  const r = Math.min(54, colW * 0.36 / s) * s;
  for (let i = 0; i < n; i++) {
    const x = colW * (i + 0.5) - (boeing ? 0 : 0);
    const jitter = Math.sin(i * 3.1 + g.t * 0.7) * 0.15;
    dial(ctx, x, 70 * s, r, n1 + jitter, 110, i === 0 ? 'N1' : '', s, { fill: boeing, text: (n1 + jitter).toFixed(1) });
    dial(ctx, x, 70 * s + r * 2.4, r * 0.8, egt, 1100, i === 0 ? 'EGT' : '', s, { col: boeing ? C.white : C.green, text: String(Math.round(egt + jitter * 20)), fill: boeing });
    if (rev > 0.05) txt(ctx, 'REV', x, 70 * s - r * 0.15, 15 * s, rev > 0.9 ? C.green : C.amber);
    txt(ctx, (60 + thr * 38 + jitter).toFixed(1), x, 70 * s + r * 4.1, 16 * s, C.green);
    txt(ctx, String(Math.round(800 + thr * 2600)), x, 70 * s + r * 4.6, 16 * s, C.green);
  }
  txt(ctx, 'N2 %', W * 0.02, 70 * s + r * 4.1, 13 * s, C.cyan, 'left');
  txt(ctx, 'FF', W * 0.02, 70 * s + r * 4.6, 13 * s, C.cyan, 'left');
  const fob = Math.round(fm.mass * 0.18);
  const flapsDown = g.ac.controls.gear;
  if (boeing) {
    const x = W * 0.66;
    txt(ctx, 'TOTAL FUEL', x, 36 * s, 14 * s, C.cyan, 'left');
    txt(ctx, `${(fob / 1000).toFixed(1)}`, x + 10 * s, 58 * s, 20 * s, C.white, 'left');
    txt(ctx, 'TAT +12c', x, 86 * s, 15 * s, C.white, 'left');
    // gear
    txt(ctx, 'GEAR', x + 70 * s, 130 * s, 14 * s, C.cyan);
    ctx.lineWidth = 2 * s;
    for (let k = 0; k < 3; k++) {
      const bx = x + 20 * s + k * 34 * s, by = 146 * s;
      ctx.strokeStyle = flapsDown ? C.green : C.white;
      if (flapsDown) { ctx.strokeRect(bx, by, 30 * s, 20 * s); txt(ctx, 'DN', bx + 15 * s, by + 10 * s, 13 * s, C.green); }
      else txt(ctx, 'UP', bx + 15 * s, by + 10 * s, 13 * s, C.white);
    }
    // flaps
    txt(ctx, 'FLAPS', x + 70 * s, 196 * s, 14 * s, C.cyan);
    ctx.strokeStyle = C.white;
    ctx.strokeRect(x + 58 * s, 210 * s, 24 * s, 120 * s);
    ctx.fillStyle = C.white;
    ctx.fillRect(x + 58 * s, 210 * s, 24 * s, (flapsDown ? 0.8 : 0.02) * 120 * s);
    txt(ctx, flapsDown ? '30' : 'UP', x + 102 * s, 210 * s + (flapsDown ? 96 : 4) * s, 15 * s, C.magenta);
    // crew alerts
    const w = g.warnings || {};
    const msgs = [];
    if (w.stall) msgs.push(['STALL', C.red]);
    if (w.pullup) msgs.push(['GND PROX', C.red]);
    if (fm.brakeTemp > 420) msgs.push(['BRAKE TEMP', C.amber]);
    if (fm.autobrake && fm.autobrake.active) msgs.push(['AUTOBRAKE', C.white]);
    if (fm.spoilers > 0.1 && !fm.onGround) msgs.push(['SPEEDBRAKE EXTENDED', C.amber]);
    msgs.forEach(([m, c], i) => txt(ctx, m, x - 10 * s, H - 150 * s + i * 22 * s, 16 * s, c, 'left'));
  } else {
    // Airbus: flap indication and memo
    txt(ctx, 'FOB :', W * 0.6, H * 0.53, 16 * s, C.white, 'left');
    txt(ctx, `${fob} KG`, W * 0.78, H * 0.53, 17 * s, C.green, 'left');
    txt(ctx, 'S', W * 0.62, H * 0.6, 15 * s, C.white);
    txt(ctx, 'F', W * 0.92, H * 0.6, 15 * s, C.white);
    txt(ctx, 'FLAP', W * 0.77, H * 0.65, 14 * s, C.white);
    ctx.fillStyle = C.green;
    const fx = W * 0.66 + (flapsDown ? 0.85 : 0) * W * 0.22;
    ctx.fillRect(fx - 4 * s, H * 0.59, 8 * s, 10 * s);
    line(ctx, 0, H * 0.7, W, H * 0.7, C.white, 2 * s);
    const memo = fm.onGround
      ? ['T.O MEMO', 'AUTO BRK.....MAX', 'SIGNS ON', 'SPLRS ARM', 'FLAPS T.O', 'T.O CONFIG NORMAL']
      : flapsDown
        ? ['LDG MEMO', 'LDG GEAR DN', 'SIGNS ON', 'SPLRS ARM', 'FLAPS FULL']
        : ['SEAT BELTS', 'NO SMOKING', 'ENG A.ICE', 'GND SPLRS ARMED'];
    memo.forEach((m, i) => txt(ctx, m, 16 * s + (i > 3 ? W * 0.5 : 0), H * 0.75 + (i % 4) * 22 * s, 16 * s, i === 0 && memo.length > 4 ? C.white : C.green, 'left'));
    const w = g.warnings || {};
    if (w.stall || w.pullup) txt(ctx, w.stall ? 'STALL' : 'GPWS TERRAIN', W * 0.75, H * 0.78, 18 * s, C.red);
  }
}

// ---------------------------------------------------------------------------
// System display (Airbus SD wheel page / Boeing lower EICAS)
// ---------------------------------------------------------------------------
export function drawSystem(ctx, W, H, g, maker = 'airbus') {
  const d = flightData(g);
  const fm = d.fm;
  const s = W / 512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const boeing = maker !== 'airbus';
  txt(ctx, boeing ? 'GEAR' : 'WHEEL', W / 2, 18 * s, 18 * s, C.white);
  line(ctx, W / 2 - 40 * s, 30 * s, W / 2 + 40 * s, 30 * s, C.white, 2 * s);
  const temp = Math.round(fm.brakeTemp ?? 15);
  const tCol = temp > 950 ? C.red : temp > 420 ? C.amber : C.green;
  const gearDown = g.ac.controls.gear;
  // nose gear and main gear blocks
  const gearBox = (x, y, label) => {
    ctx.strokeStyle = gearDown ? C.green : C.grey;
    ctx.lineWidth = 3 * s;
    ctx.beginPath(); ctx.moveTo(x - 16 * s, y + 12 * s); ctx.lineTo(x, y - 12 * s); ctx.lineTo(x + 16 * s, y + 12 * s); ctx.closePath(); ctx.stroke();
    if (label) txt(ctx, label, x, y + 28 * s, 14 * s, C.cyan);
  };
  gearBox(W / 2, 90 * s, '');
  gearBox(W * 0.25, 190 * s, '');
  gearBox(W * 0.75, 190 * s, '');
  for (const [x, k] of [[W * 0.25, 0], [W * 0.75, 1]]) {
    txt(ctx, 'REL', x, 240 * s, 13 * s, fm.brakePressure > 0.05 ? C.green : '#555');
    txt(ctx, String(temp + k * 5), x - 36 * s, 266 * s, 18 * s, tCol);
    txt(ctx, String(temp + k * 3), x + 36 * s, 266 * s, 18 * s, tCol);
    txt(ctx, `${k * 2 + 1}     ${k * 2 + 2}`, x, 290 * s, 14 * s, C.white);
  }
  txt(ctx, '°C', W / 2, 266 * s, 14 * s, C.cyan);
  const ab = fm.autobrake;
  txt(ctx, 'AUTO BRK', W / 2, 330 * s, 15 * s, C.white);
  txt(ctx, ab && ab.available ? `${ab.mode}${ab.active ? (ab.decelOk ? ' DECEL' : '') : ''}` : 'OFF', W / 2, 352 * s, 18 * s, ab && ab.active ? C.green : C.cyan);
  if (fm.antiskid) txt(ctx, 'ANTI SKID', W / 2, 135 * s, 16 * s, C.amber);
  const rev = fm.reverser;
  if (rev && rev.available) txt(ctx, `REV ${rev.state.toUpperCase()}`, W / 2, 380 * s, 15 * s, rev.state === 'deployed' ? C.green : rev.state === 'transit' ? C.amber : C.white);
  // permanent data strip
  line(ctx, 0, H - 64 * s, W, H - 64 * s, C.white, 2 * s);
  const sat = Math.round(15 - g.ac.position.y * 0.0065);
  txt(ctx, `TAT ${sat + 3 >= 0 ? '+' : ''}${sat + 3} °C`, 12 * s, H - 42 * s, 15 * s, C.white, 'left');
  txt(ctx, `SAT ${sat >= 0 ? '+' : ''}${sat} °C`, 12 * s, H - 18 * s, 15 * s, C.white, 'left');
  const now = new Date();
  txt(ctx, `${String(now.getUTCHours()).padStart(2, '0')} H ${String(now.getUTCMinutes()).padStart(2, '0')}`, W / 2, H - 30 * s, 17 * s, C.green);
  txt(ctx, `GW ${Math.round(fm.mass)} KG`, W - 12 * s, H - 30 * s, 15 * s, C.green, 'right');
}

// ---------------------------------------------------------------------------
// FMS control display unit
// ---------------------------------------------------------------------------
export function drawCDU(ctx, W, H, g, maker = 'airbus') {
  const d = flightData(g);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const s = W / 256;
  const lh = H / 14;
  const boeing = maker !== 'airbus';
  if (boeing) {
    txt(ctx, 'ACT RTE 1 LEGS', W / 2, lh * 0.8, 13 * s, C.white);
    const rows = [['FAF01', `${Math.round(d.alt / 100) * 100}`], ['RW09', '150/ 250'], ['MAP01', '---/ 3000'], ['HOLD', '210/ 4000']];
    rows.forEach(([a, b], i) => {
      txt(ctx, `${(i * 4 + 6).toFixed(0)}NM`, W * 0.35, lh * (2 + i * 2), 10 * s, C.white);
      txt(ctx, a, 8 * s, lh * (2.8 + i * 2), 13 * s, i === 0 ? C.magenta : C.white, 'left');
      txt(ctx, b, W - 8 * s, lh * (2.8 + i * 2), 13 * s, C.white, 'right');
    });
    txt(ctx, '<RTE 2 LEGS', 8 * s, lh * 12.8, 12 * s, C.white, 'left');
    txt(ctx, 'RTE DATA>', W - 8 * s, lh * 12.8, 12 * s, C.white, 'right');
  } else {
    txt(ctx, 'FROM', 8 * s, lh * 0.8, 10 * s, C.white, 'left');
    txt(ctx, 'AERO531', W - 8 * s, lh * 0.8, 11 * s, C.white, 'right');
    const rows = [['ATOL', '1032', `${Math.round(d.kts)}/FL${String(Math.round(d.alt / 100)).padStart(3, '0')}`], ['FAF01', '1041', '210/ 4000'], ['D235K', '1043', '180/ 3000'], ['RW09', '1047', '137/  12'], ['(DECEL)', '1046', '---/----']];
    rows.forEach(([a, t, b], i) => {
      const y = lh * (2.2 + i * 2);
      txt(ctx, a, 8 * s, y, 13 * s, i === 1 ? C.white : C.green, 'left');
      txt(ctx, t, W * 0.48, y, 12 * s, C.green);
      txt(ctx, b, W - 8 * s, y, 12 * s, C.green, 'right');
    });
    txt(ctx, '----- END OF F-PLN -----', W / 2, lh * 12.2, 10 * s, C.white);
    txt(ctx, 'DEST   TIME  DIST  EFOB', 8 * s, lh * 13, 9 * s, C.white, 'left');
  }
}

// Autopilot readouts (FCU / MCP windows) and the master warning lights: one
// strip mapped onto several small quads.
export function drawFCU(ctx, W, H, g, maker = 'airbus') {
  const d = flightData(g);
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, W, H);
  const col = maker === 'airbus' ? '#ff9d2a' : '#f4f4f0';
  const vals = [String(Math.round(d.kts / 5) * 5), pad3(Math.round(d.hdg)), String(Math.max(0, Math.round(d.alt / 100) * 100)), Math.abs(d.vs) < 100 ? '-----' : `${d.vs > 0 ? '+' : '-'}${String(Math.round(Math.abs(d.vs) / 100)).padStart(2, '0')}00`];
  const cw = W / 6;
  vals.forEach((v, i) => txt(ctx, v, cw * (i + 0.5), H / 2, H * 0.62, col));
  // master warning (red) and caution (amber) light cells
  const w = g.warnings || {};
  const warn = w.pullup || w.stall || w.missile;
  const caut = w.radar || (g.ac.fm.brakeTemp ?? 0) > 420;
  const blink = Math.floor(g.t * 3) % 2 === 0;
  ctx.fillStyle = warn && blink ? '#ff2a1a' : '#1a0605';
  ctx.fillRect(cw * 4 + 4, 4, cw - 8, H - 8);
  ctx.fillStyle = caut ? '#ffa000' : '#1a1205';
  ctx.fillRect(cw * 5 + 4, 4, cw - 8, H - 8);
}

// Small standby attitude display.
export function drawStandby(ctx, W, H, g) {
  const d = flightData(g);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, s = W / 128;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, W * 0.36, 0, Math.PI * 2); ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate((-d.att.roll * Math.PI) / 180);
  const py = d.att.pitch * 1.6 * s;
  ctx.fillStyle = C.sky; ctx.fillRect(-W, -W * 2 + py, W * 2, W * 2);
  ctx.fillStyle = C.ground; ctx.fillRect(-W, py, W * 2, W * 2);
  line(ctx, -W, py, W, py, C.white, 1.5 * s);
  ctx.restore();
  line(ctx, cx - 26 * s, cy, cx - 8 * s, cy, C.yellow, 3 * s);
  line(ctx, cx + 8 * s, cy, cx + 26 * s, cy, C.yellow, 3 * s);
  txt(ctx, String(Math.round(d.kts)), 4 * s, cy, 12 * s, C.white, 'left');
  txt(ctx, String(Math.round(d.alt / 10) * 10), W - 4 * s, cy, 11 * s, C.white, 'right');
}

// Airbus A380 onboard information system screens.
export function drawOIS(ctx, W, H, g) {
  ctx.fillStyle = '#0b1016';
  ctx.fillRect(0, 0, W, H);
  const s = W / 384;
  ctx.fillStyle = '#16314d';
  ctx.fillRect(0, 0, W, 34 * s);
  txt(ctx, 'OIS  FLT OPS', W / 2, 17 * s, 16 * s, C.white, 'center', SANS);
  ['PERFORMANCE', 'LOADSHEET', 'CHARTS', 'MEL / CDL', 'LOGBOOK', 'DOCUMENTATION'].forEach((t, i) => {
    ctx.fillStyle = i === 2 ? '#2a5c8f' : '#1b2633';
    ctx.fillRect(16 * s, (50 + i * 44) * s, W - 32 * s, 36 * s);
    txt(ctx, t, 28 * s, (68 + i * 44) * s, 16 * s, C.white, 'left', SANS);
  });
  txt(ctx, `GW ${Math.round(g.ac.fm.mass / 1000)} T`, 16 * s, H - 16 * s, 14 * s, C.cyan, 'left', SANS);
}

// ---------------------------------------------------------------------------
// Fighter multi-function display pages
// ---------------------------------------------------------------------------
function osb(ctx, W, H, labels, col) {
  // option labels along the display edges, next to the bezel buttons
  const s = W / 384;
  labels.forEach((t, i) => {
    if (!t) return;
    const side = Math.floor(i / 5), k = i % 5;
    const pos = (k + 0.5) / 5;
    const x = side === 0 ? W * pos : side === 2 ? W * pos : side === 1 ? W - 8 * s : 8 * s;
    const y = side === 0 ? 16 * s : side === 2 ? H - 14 * s : H * pos;
    txt(ctx, t, x, y, 14 * s, col, side === 1 ? 'right' : side === 3 ? 'left' : 'center');
  });
}

function relPos(p, a, hd) {
  const dx = a.position.x - p.position.x, dz = a.position.z - p.position.z;
  return { right: dx * Math.cos(hd) + dz * Math.sin(hd), along: dx * Math.sin(hd) - dz * Math.cos(hd) };
}

export function drawRadarPage(ctx, W, H, g, col = C.green) {
  const p = g.ac;
  const s = W / 384;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const range = 40000;
  const x0 = 40 * s, x1 = W - 40 * s, y0 = 40 * s, y1 = H - 40 * s;
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5 * s;
  for (const k of [0.25, 0.5, 0.75]) {
    line(ctx, x0, y0 + (y1 - y0) * k, x1, y0 + (y1 - y0) * k, col, 1 * s);
    line(ctx, x0 + (x1 - x0) * k, y0, x0 + (x1 - x0) * k, y1, col, 1 * s);
  }
  ctx.globalAlpha = 1;
  ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // antenna sweep
  const sweep = (Math.sin(g.t * 1.6) + 1) / 2;
  line(ctx, x0 + (x1 - x0) * sweep, y1, x0 + (x1 - x0) * sweep, y1 - 12 * s, col, 3 * s);
  const hd = headingOf(p.quaternion);
  const tgt = g.targeting ? g.targeting.target : null;
  for (const a of g.battle.aircraft) {
    if (a === p || !a.alive || a.dying) continue;
    const r = relPos(p, a, hd);
    if (r.along <= 0 || r.along > range) continue;
    const az = Math.atan2(r.right, r.along);
    if (Math.abs(az) > 1.05) continue;
    const x = x0 + (x1 - x0) * (0.5 + az / 2.1), y = y1 - (y1 - y0) * (r.along / range);
    const c = a.team === 'civil' ? C.white : a.team === p.team ? C.cyan : col === C.green ? C.green : C.red;
    ctx.fillStyle = c;
    ctx.fillRect(x - 6 * s, y - 4 * s, 12 * s, 8 * s);
    if (a === tgt) {
      ctx.strokeStyle = C.yellow;
      ctx.lineWidth = 2 * s;
      ctx.strokeRect(x - 10 * s, y - 8 * s, 20 * s, 16 * s);
      txt(ctx, `${Math.round(a.position.y / 304.8)}`, x + 16 * s, y, 13 * s, C.yellow, 'left');
    }
  }
  osb(ctx, W, H, ['CRM', 'RWS', 'NORM', 'OVRD', 'CNTL', '', 'A', '6B', '', '', 'SWAP', 'FCR', 'DCLT', 'SMS', 'HSD', '40', '', '', '', ''], col);
}

export function drawStoresPage(ctx, W, H, g, col = C.green) {
  const p = g.ac;
  const s = W / 384;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, y = 70 * s;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2.5 * s;
  ctx.beginPath();
  ctx.moveTo(cx, y); ctx.lineTo(cx + 14 * s, y + 80 * s); ctx.lineTo(cx + 120 * s, y + 140 * s); ctx.lineTo(cx + 120 * s, y + 158 * s);
  ctx.lineTo(cx + 16 * s, y + 150 * s); ctx.lineTo(cx + 40 * s, y + 200 * s); ctx.lineTo(cx - 40 * s, y + 200 * s); ctx.lineTo(cx - 16 * s, y + 150 * s);
  ctx.lineTo(cx - 120 * s, y + 158 * s); ctx.lineTo(cx - 120 * s, y + 140 * s); ctx.lineTo(cx - 14 * s, y + 80 * s); ctx.closePath();
  ctx.stroke();
  const total = p.spec.weapons.missiles;
  const n = Math.min(8, total);
  const live = Math.round((p.missiles / Math.max(1, total)) * n);
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
    ctx.fillStyle = i < live ? col : '#1f3a26';
    ctx.fillRect(cx + side * (40 + k * 22) * s - 4 * s, y + (118 + k * 6) * s, 8 * s, 34 * s);
  }
  txt(ctx, `${p.missiles} MSL`, 16 * s, H - 70 * s, 18 * s, col, 'left');
  txt(ctx, `GUN ${p.gunAmmo}`, 16 * s, H - 46 * s, 18 * s, col, 'left');
  txt(ctx, `CM ${p.flares}`, W - 16 * s, H - 70 * s, 18 * s, p.flares > 0 ? col : C.amber, 'right');
  txt(ctx, 'MASTER ARM', W - 16 * s, H - 46 * s, 16 * s, col, 'right');
  osb(ctx, W, H, ['AAM', 'SLAV', '', 'INV', 'CNTL', '', '', '', '', '', 'SWAP', 'SMS', '', 'FCR', 'TGP', '', '', '', '', ''], col);
}

// Moving tactical map (HSD / TSD): ownship centred low, contacts and the base.
export function drawTSD(ctx, W, H, g, color = true) {
  const p = g.ac;
  const s = W / 384;
  const col = color ? C.cyan : C.green;
  ctx.fillStyle = color ? '#081018' : '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.66;
  const range = 60000, R = H * 0.6;
  const hd = headingOf(p.quaternion);
  if (color) {
    // faint terrain shading and grid
    ctx.strokeStyle = 'rgba(80,140,190,0.18)';
    ctx.lineWidth = 1;
    for (let k = -6; k <= 6; k++) {
      line(ctx, cx + k * 40 * s, 0, cx + k * 40 * s, H, 'rgba(80,140,190,0.16)', 1);
      line(ctx, 0, cy + k * 40 * s, W, cy + k * 40 * s, 'rgba(80,140,190,0.16)', 1);
    }
  }
  ctx.strokeStyle = col;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 1.5 * s;
  for (const k of [0.33, 0.66, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
  ctx.globalAlpha = 1;
  const ab = g.battle.map.airbase;
  const plot = (wx, wz) => {
    const dx = wx - p.position.x, dz = wz - p.position.z;
    const right = dx * Math.cos(hd) + dz * Math.sin(hd), along = dx * Math.sin(hd) - dz * Math.cos(hd);
    return [cx + (right / range) * R, cy - (along / range) * R];
  };
  const [bx, by] = plot(ab.x, ab.z);
  ctx.strokeStyle = color ? C.white : col;
  ctx.lineWidth = 2 * s;
  ctx.beginPath(); ctx.arc(bx, by, 8 * s, 0, Math.PI * 2); ctx.stroke();
  txt(ctx, 'BASE', bx, by + 18 * s, 13 * s, color ? C.white : col);
  for (const a of g.battle.aircraft) {
    if (a === p || !a.alive || a.dying) continue;
    const [x, y] = plot(a.position.x, a.position.z);
    if (x < 0 || x > W || y < 0 || y > H) continue;
    const friend = a.team === p.team, civil = a.team === 'civil';
    ctx.fillStyle = civil ? C.white : friend ? (color ? '#38ff6a' : col) : color ? C.red : col;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    if (friend) ctx.arc(x, y, 7 * s, Math.PI, 0);
    else if (civil) ctx.rect(x - 6 * s, y - 6 * s, 12 * s, 12 * s);
    else { ctx.moveTo(x, y - 8 * s); ctx.lineTo(x + 8 * s, y); ctx.lineTo(x, y + 8 * s); ctx.lineTo(x - 8 * s, y); ctx.closePath(); }
    ctx.stroke();
    // velocity leader
    const v = a.velocity;
    const lx = v.x * Math.cos(hd) + v.z * Math.sin(hd), lz = v.x * Math.sin(hd) - v.z * Math.cos(hd);
    line(ctx, x, y, x + lx * 0.06 * s, y - lz * 0.06 * s, ctx.fillStyle, 1.5 * s);
  }
  // ownship
  ctx.fillStyle = color ? C.white : col;
  ctx.beginPath(); ctx.moveTo(cx, cy - 12 * s); ctx.lineTo(cx + 9 * s, cy + 9 * s); ctx.lineTo(cx, cy + 4 * s); ctx.lineTo(cx - 9 * s, cy + 9 * s); ctx.closePath(); ctx.fill();
  txt(ctx, pad3(deg(hd)), cx, 22 * s, 18 * s, color ? C.white : col);
  osb(ctx, W, H, ['DEP', 'DCPL', 'NORM', '', 'CNTL', '', '', '', '', '', 'SWAP', 'HSD', 'SMS', 'FCR', 'TGP', '', '', '', '', ''], col);
}

export function drawEnginePage(ctx, W, H, g, col = C.green) {
  const fm = g.ac.fm;
  const s = W / 384;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const rpm = 62 + fm.throttle * 38 + fm.afterburner * 4;
  const n = g.ac.spec.design.nozzles ? Math.max(1, g.ac.spec.design.nozzles.length) : 1;
  const count = Math.min(2, n);
  for (let i = 0; i < count; i++) {
    const x = W * (count === 1 ? 0.5 : 0.3 + i * 0.4);
    dial(ctx, x, 110 * s, 52 * s, rpm, 110, 'RPM', s, { col, text: `${Math.round(rpm)}` });
    dial(ctx, x, 230 * s, 44 * s, 520 + fm.throttle * 380 + fm.afterburner * 120, 1100, 'FTIT', s, { col, text: `${Math.round(520 + fm.throttle * 380 + fm.afterburner * 120)}` });
  }
  txt(ctx, `NOZ ${Math.round(fm.afterburner * 100)}%`, 16 * s, H - 70 * s, 17 * s, fm.afterburner > 0.05 ? C.amber : col, 'left');
  txt(ctx, `FUEL ${Math.round(fm.mass * 0.25)}`, 16 * s, H - 46 * s, 17 * s, col, 'left');
  const hp = g.ac.health / g.ac.maxHealth;
  txt(ctx, `HYD ${Math.round(hp * 100)}%`, W - 16 * s, H - 70 * s, 17 * s, hp > 0.5 ? col : hp > 0.25 ? C.amber : C.red, 'right');
  const temp = fm.brakeTemp ?? 15;
  txt(ctx, `BRK ${Math.round(temp)}°`, W - 16 * s, H - 46 * s, 17 * s, temp > 950 ? C.red : temp > 420 ? C.amber : col, 'right');
  if (fm.chute && fm.chute.available) txt(ctx, `CHUTE ${fm.chute.state === 'stowed' ? 'RDY' : fm.chute.state.toUpperCase()}`, W / 2, H - 22 * s, 16 * s, fm.chute.state === 'failed' ? C.red : col);
  osb(ctx, W, H, ['ENG', 'FUEL', 'HYD', 'ELEC', 'BIT', '', '', '', '', '', 'SWAP', 'ENG', '', '', '', '', '', '', '', ''], col);
}

// Radar warning receiver: threats by bearing, closer = nearer the centre.
export function drawRWR(ctx, W, H, g, col = C.green) {
  const p = g.ac;
  const s = W / 384;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.42;
  ctx.strokeStyle = col;
  ctx.lineWidth = 2 * s;
  for (const k of [0.35, 0.7, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * k, 0, Math.PI * 2); ctx.stroke(); }
  for (let a = 0; a < 360; a += 30) {
    const t = (a * Math.PI) / 180;
    line(ctx, cx + Math.sin(t) * R * 0.92, cy - Math.cos(t) * R * 0.92, cx + Math.sin(t) * R, cy - Math.cos(t) * R, col, 2 * s);
  }
  const hd = headingOf(p.quaternion);
  for (const a of g.battle.aircraft) {
    if (a === p || !a.alive || a.dying || a.team === p.team || a.team === 'civil') continue;
    const r = relPos(p, a, hd);
    const dist = Math.hypot(r.right, r.along);
    if (dist > 50000) continue;
    const k = 0.35 + 0.6 * Math.min(1, dist / 50000);
    const t = Math.atan2(r.right, r.along);
    const x = cx + Math.sin(t) * R * k, y = cy - Math.cos(t) * R * k;
    const lockedMe = p.lockedBy > 0 && dist < 25000;
    txt(ctx, a.spec.id === 'su35' || a.spec.id === 'su57' ? '30' : a.spec.id.startsWith('mig') ? '29' : 'U', x, y, 20 * s, lockedMe ? C.red : col);
    if (lockedMe) { ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(x, y, 14 * s, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.fillStyle = col;
  ctx.beginPath(); ctx.moveTo(cx, cy - 8 * s); ctx.lineTo(cx + 6 * s, cy + 6 * s); ctx.lineTo(cx - 6 * s, cy + 6 * s); ctx.closePath(); ctx.fill();
  if (p.incoming > 0 && Math.floor(g.t * 4) % 2 === 0) txt(ctx, 'LAUNCH', cx, H - 22 * s, 20 * s, C.red);
}

// Up-front data entry display (green text).
export function drawDED(ctx, W, H, g) {
  const d = flightData(g);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const s = H / 96;
  const lines = [
    `UHF 242.00   STPT ▲1   ${String(new Date().getUTCHours()).padStart(2, '0')}:${String(new Date().getUTCMinutes()).padStart(2, '0')}`,
    `VHF  1       M${d.mach.toFixed(2)}   ${Math.round(d.alt)}FT`,
    `HDG ${pad3(d.hdg)}  G ${d.fm.gLoad.toFixed(1)}   FUEL ${Math.round(d.fm.mass * 0.25)}`,
  ];
  lines.forEach((l, i) => txt(ctx, l, 8 * s, 18 * s + i * 28 * s, 22 * s, '#7dff6a', 'left'));
}

// Large panoramic display (F-35 / J-20): map portal plus three smaller portals.
export function drawPanoramic(ctx, W, H, g) {
  const s = H / 384;
  ctx.fillStyle = '#05080c';
  ctx.fillRect(0, 0, W, H);
  // top menu strip of touch buttons
  ['TSD', 'FCR', 'SMS', 'ENG', 'FUEL', 'DAS', 'CKLST', 'ICAWS', 'TFLIR', 'ASR'].forEach((t, i) => {
    const x = (W / 10) * i;
    ctx.fillStyle = i === 0 || i === 1 ? '#0f3a52' : '#0c1a24';
    ctx.fillRect(x + 3 * s, 3 * s, W / 10 - 6 * s, 26 * s);
    txt(ctx, t, x + W / 20, 16 * s, 15 * s, C.cyan);
  });
  const portal = (x, y, w, h, fn) => {
    const c = g._portal || (g._portal = document.createElement('canvas'));
    c.width = Math.round(w);
    c.height = Math.round(h);
    fn(c.getContext('2d'), c.width, c.height, g);
    ctx.drawImage(c, x, y);
    ctx.strokeStyle = '#2b5a73';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
  };
  const top = 34 * s;
  portal(4 * s, top, W * 0.5 - 8 * s, H - top - 4 * s, (c, w, h, gg) => drawTSD(c, w, h, gg, true));
  portal(W * 0.5, top, W * 0.25 - 4 * s, (H - top) / 2 - 4 * s, (c, w, h, gg) => drawRadarPage(c, w, h, gg, C.cyan));
  portal(W * 0.75, top, W * 0.25 - 4 * s, (H - top) / 2 - 4 * s, (c, w, h, gg) => drawStoresPage(c, w, h, gg, C.cyan));
  portal(W * 0.5, top + (H - top) / 2, W * 0.5 - 4 * s, (H - top) / 2 - 4 * s, (c, w, h, gg) => drawEnginePage(c, w, h, gg, '#5effa0'));
}

export const FIGHTER_PAGES = {
  radar: (ctx, W, H, g, color) => drawRadarPage(ctx, W, H, g, color ? '#54ff8a' : C.green),
  sms: (ctx, W, H, g, color) => drawStoresPage(ctx, W, H, g, color ? C.cyan : C.green),
  tsd: (ctx, W, H, g, color) => drawTSD(ctx, W, H, g, color),
  eng: (ctx, W, H, g, color) => drawEnginePage(ctx, W, H, g, color ? '#5effa0' : C.green),
  rwr: (ctx, W, H, g, color) => drawRWR(ctx, W, H, g, color ? '#7dff6a' : C.green),
  ded: (ctx, W, H, g) => drawDED(ctx, W, H, g),
  pano: (ctx, W, H, g) => drawPanoramic(ctx, W, H, g),
  standby: (ctx, W, H, g) => drawStandby(ctx, W, H, g),
};

// ---------------------------------------------------------------------------
// Analogue instrument panels
// ---------------------------------------------------------------------------
// The static parts (panel paint, bezels, dial faces, scales) are painted once
// into a background canvas; each update copies it and draws the moving parts.
function needle(ctx, x, y, r, t, w, col = '#f4f4ee') {
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - Math.sin(t) * r * 0.15, y + Math.cos(t) * r * 0.15);
  ctx.lineTo(x + Math.sin(t) * r, y - Math.cos(t) * r);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

function dialFace(ctx, x, y, r, opts = {}) {
  ctx.fillStyle = '#18191a';
  ctx.beginPath(); ctx.arc(x, y, r * 1.14, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#4a4c4e';
  ctx.beginPath(); ctx.arc(x, y, r * 1.08, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#070707';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  const n = opts.ticks || 10, a0 = opts.a0 ?? -2.4, a1 = opts.a1 ?? 2.4;
  for (let i = 0; i <= n * 2; i++) {
    const t = a0 + ((a1 - a0) * i) / (n * 2);
    const major = i % 2 === 0;
    ctx.strokeStyle = '#ececE4';
    ctx.lineWidth = r * (major ? 0.045 : 0.025);
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(t) * r * (major ? 0.76 : 0.84), y - Math.cos(t) * r * (major ? 0.76 : 0.84));
    ctx.lineTo(x + Math.sin(t) * r * 0.95, y - Math.cos(t) * r * 0.95);
    ctx.stroke();
    if (major && opts.nums) {
      const v = opts.nums[i / 2];
      if (v !== undefined) txt(ctx, String(v), x + Math.sin(t) * r * 0.6, y - Math.cos(t) * r * 0.6, r * 0.2, '#ececE4', 'center', SANS);
    }
  }
  if (opts.arc) {
    for (const [f0, f1, col] of opts.arc) {
      ctx.strokeStyle = col;
      ctx.lineWidth = r * 0.07;
      ctx.beginPath();
      ctx.arc(x, y, r * 0.9, a0 + (a1 - a0) * f0 - Math.PI / 2, a0 + (a1 - a0) * f1 - Math.PI / 2);
      ctx.stroke();
    }
  }
  if (opts.label) txt(ctx, opts.label, x, y + r * 0.4, r * 0.19, '#d8d8d0', 'center', SANS);
}

const GAUGE_DRAW = {
  // attitude indicator ball (moving) with a fixed aircraft symbol
  adi(ctx, x, y, r, d, bg) {
    if (bg) {
      ctx.fillStyle = '#18191a';
      ctx.beginPath(); ctx.arc(x, y, r * 1.14, 0, Math.PI * 2); ctx.fill();
      return;
    }
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.translate(x, y);
    ctx.rotate((-d.att.roll * Math.PI) / 180);
    const py = d.att.pitch * r * 0.028;
    ctx.fillStyle = d.soviet ? '#2b7fd0' : '#d8d6d0';
    ctx.fillRect(-r * 2, -r * 4 + py, r * 4, r * 4);
    ctx.fillStyle = d.soviet ? '#6e4424' : '#1a1a1a';
    ctx.fillRect(-r * 2, py, r * 4, r * 4);
    ctx.strokeStyle = d.soviet ? '#fff' : '#ff9a30';
    ctx.lineWidth = r * 0.04;
    ctx.beginPath(); ctx.moveTo(-r * 2, py); ctx.lineTo(r * 2, py); ctx.stroke();
    ctx.strokeStyle = d.soviet ? '#fff' : '#333';
    for (let a = -60; a <= 60; a += 10) {
      if (!a) continue;
      const yy = py - a * r * 0.028;
      ctx.strokeStyle = a > 0 ? (d.soviet ? '#fff' : '#222') : '#e8e8e0';
      ctx.lineWidth = r * 0.02;
      ctx.beginPath(); ctx.moveTo(-r * 0.25, yy); ctx.lineTo(r * 0.25, yy); ctx.stroke();
    }
    ctx.restore();
    // bezel, roll scale and the fixed aircraft symbol
    ctx.strokeStyle = '#3c3e40';
    ctx.lineWidth = r * 0.1;
    ctx.beginPath(); ctx.arc(x, y, r * 1.02, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#ffb000';
    ctx.lineWidth = r * 0.07;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.62, y); ctx.lineTo(x - r * 0.18, y); ctx.lineTo(x - r * 0.1, y + r * 0.1);
    ctx.moveTo(x + r * 0.62, y); ctx.lineTo(x + r * 0.18, y); ctx.lineTo(x + r * 0.1, y + r * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#ffb000';
    ctx.beginPath(); ctx.arc(x, y, r * 0.05, 0, Math.PI * 2); ctx.fill();
  },
  hsi(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 0, label: '' }); return; }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((-d.hdg * Math.PI) / 180);
    for (let a = 0; a < 360; a += 5) {
      const t = (a * Math.PI) / 180;
      ctx.strokeStyle = '#ececE4';
      ctx.lineWidth = r * (a % 10 ? 0.02 : 0.035);
      ctx.beginPath();
      ctx.moveTo(Math.sin(t) * r * (a % 10 ? 0.86 : 0.8), -Math.cos(t) * r * (a % 10 ? 0.86 : 0.8));
      ctx.lineTo(Math.sin(t) * r * 0.95, -Math.cos(t) * r * 0.95);
      ctx.stroke();
      if (a % 30 === 0) {
        ctx.save();
        ctx.translate(Math.sin(t) * r * 0.66, -Math.cos(t) * r * 0.66);
        ctx.rotate(t);
        txt(ctx, a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a / 10), 0, 0, r * 0.18, '#ececE4', 'center', SANS);
        ctx.restore();
      }
    }
    ctx.restore();
    // course arrow towards the airbase
    const t = ((d.brg - d.hdg) * Math.PI) / 180;
    needle(ctx, x, y, r * 0.75, t, r * 0.06, '#ffd400');
    ctx.fillStyle = '#ff9a30';
    ctx.beginPath(); ctx.moveTo(x, y - r * 0.2); ctx.lineTo(x + r * 0.12, y + r * 0.15); ctx.lineTo(x - r * 0.12, y + r * 0.15); ctx.closePath(); ctx.fill();
  },
  asi(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 8, nums: d.metric ? [0, 200, 400, 600, 800, 1000, 1200, 1400, 1600] : [0, 100, 200, 300, 400, 500, 600, 700, 800], label: d.metric ? 'KM/H' : 'KNOTS', a0: -2.6, a1: 2.6 }); return; }
    const v = d.metric ? d.kts * 1.852 / 1600 : d.kts / 800;
    needle(ctx, x, y, r * 0.86, -2.6 + 5.2 * THREE.MathUtils.clamp(v, 0, 1), r * 0.06);
  },
  alt(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 10, nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], label: d.metric ? 'M x1000' : 'ALT', a0: 0, a1: Math.PI * 2 }); return; }
    const a = d.metric ? d.altM : d.alt;
    const unit = d.metric ? 1000 : 1000;
    needle(ctx, x, y, r * 0.9, ((a % unit) / unit) * Math.PI * 2, r * 0.05);
    needle(ctx, x, y, r * 0.55, ((a / (unit * 10)) % 1) * Math.PI * 2, r * 0.09);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + r * 0.1, y - r * 0.12, r * 0.55, r * 0.24);
    txt(ctx, String(Math.round(a / 100) * 100).padStart(5, '0'), x + r * 0.38, y, r * 0.2, '#ececE4');
  },
  vsi(ctx, x, y, r, d, bg) {
    // zero at nine o'clock, climb clockwise, both scales meet at three o'clock
    if (bg) { dialFace(ctx, x, y, r, { ticks: 6, nums: [6, 4, 2, 0, 2, 4, 6], label: 'VERT SPD', a0: -Math.PI / 2 - Math.PI * 0.95, a1: -Math.PI / 2 + Math.PI * 0.95 }); return; }
    const v = THREE.MathUtils.clamp(d.vs / 6000, -1, 1);
    needle(ctx, x, y, r * 0.86, -Math.PI / 2 + v * Math.PI * 0.95, r * 0.06);
  },
  rpm(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 10, nums: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], label: 'RPM %', arc: [[0.95, 1, '#e02a20']] }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp(d.rpm / 105, 0, 1), r * 0.06);
  },
  egt(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 6, nums: [2, 4, 6, 8, 10, 12], label: 'EGT x100', arc: [[0.85, 1, '#e02a20'], [0.7, 0.85, '#e0a020']] }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp(d.egt / 1200, 0, 1), r * 0.06);
  },
  fuel(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 5, nums: [0, 2, 4, 6, 8, 10], label: 'FUEL x1000' }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp(d.fuel / 10000, 0, 1), r * 0.06);
  },
  g(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 6, nums: [-3, 0, 3, 6, 9, 12], label: 'G', a0: -2.4, a1: 2.4 }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp((d.fm.gLoad + 3) / 15, 0, 1), r * 0.06);
  },
  aoa(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 6, nums: [0, 5, 10, 15, 20, 25, 30], label: 'AOA', arc: [[0.75, 1, '#e02a20']] }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp(deg(d.fm.alpha) / 30, 0, 1), r * 0.06);
  },
  mach(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 6, nums: ['.5', '1.0', '1.5', '2.0', '2.5', '3.0'], label: 'MACH' }); return; }
    needle(ctx, x, y, r * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp((d.mach - 0.5) / 2.5, 0, 1), r * 0.06);
  },
  clock(ctx, x, y, r, d, bg) {
    if (bg) { dialFace(ctx, x, y, r, { ticks: 12, a0: 0, a1: Math.PI * 2, label: '' }); return; }
    const now = new Date();
    needle(ctx, x, y, r * 0.5, ((now.getHours() % 12) / 12 + now.getMinutes() / 720) * Math.PI * 2, r * 0.07);
    needle(ctx, x, y, r * 0.8, (now.getMinutes() / 60) * Math.PI * 2, r * 0.05);
    needle(ctx, x, y, r * 0.85, (now.getSeconds() / 60) * Math.PI * 2, r * 0.025, '#ff9a30');
  },
  // monochrome radar / TV scope inside a round-cornered hood
  scope(ctx, x, y, r, d, bg, g) {
    if (bg) {
      ctx.fillStyle = '#121314';
      ctx.fillRect(x - r * 1.2, y - r * 1.2, r * 2.4, r * 2.4);
      return;
    }
    const w = Math.round(r * 2), c = d.scratch;
    c.width = c.height = w;
    drawRadarPage(c.getContext('2d'), w, w, g, '#4dff7a');
    ctx.save();
    ctx.beginPath(); ctx.roundRect(x - r, y - r, r * 2, r * 2, r * 0.2); ctx.clip();
    ctx.drawImage(c, x - r, y - r);
    ctx.restore();
  },
  // engine gauge cluster (n engines x rows of small dials)
  eng(ctx, x, y, r, d, bg, g, o) {
    const n = o.engines || 4, rows = o.rows || 3;
    const cw = (r * 2) / n, rh = (r * 2) / rows, gr = Math.min(cw, rh) * 0.4;
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < rows; k++) {
        const gx = x - r + cw * (i + 0.5), gy = y - r + rh * (k + 0.5);
        if (bg) dialFace(ctx, gx, gy, gr, { ticks: 5, label: k === 0 ? `N${i + 1}` : '' });
        else {
          const v = k === 0 ? d.rpm / 105 : k === 1 ? d.egt / 1200 : 0.55 + Math.sin(i + k) * 0.05;
          needle(ctx, gx, gy, gr * 0.86, -2.4 + 4.8 * THREE.MathUtils.clamp(v + Math.sin(g.t * 0.6 + i * 2) * 0.004, 0, 1), gr * 0.08);
        }
      }
    }
  },
  annun(ctx, x, y, r, d, bg, g, o) {
    const cols = o.cols || 4, rows = o.rows || 3;
    const w = (r * 2) / cols, h = (r * 1.2) / rows;
    const labels = ['FUEL', 'HYD', 'OIL', 'GEN', 'CANOPY', 'ENG FIRE', 'BRAKES', 'ANTI-SKID', 'O2 LOW', 'CADC', 'FLT CTL', 'NWS'];
    for (let i = 0; i < cols * rows; i++) {
      const cx = x - r + w * ((i % cols) + 0.5), cy = y - r * 0.6 + h * (Math.floor(i / cols) + 0.5);
      const lit = !bg && ((i === 5 && g.warnings?.missile) || (i === 6 && (d.fm.brakeTemp ?? 0) > 420) || (i === 7 && d.fm.antiskid));
      ctx.fillStyle = lit ? (i === 5 ? '#ff3020' : '#ffae20') : '#141414';
      ctx.fillRect(cx - w * 0.45, cy - h * 0.4, w * 0.9, h * 0.8);
      if (bg || lit) txt(ctx, labels[i % labels.length], cx, cy, h * 0.32, lit ? '#000' : '#5a5a54', 'center', SANS);
    }
  },
};

// Analogue panel: `layout.gauges` = [{ type, x, y, r }] in metres on a panel
// of `wM` x `hM`; `paintBg(ctx, ppm)` paints the panel behind them.
export class AnalogPanel {
  constructor(wM, hM, layout, opts = {}) {
    this.wM = wM;
    this.hM = hM;
    this.ppm = Math.min(opts.maxW || 1536, Math.round(wM * 1500)) / wM;
    const W = Math.round(wM * this.ppm), H = Math.round(hM * this.ppm);
    this.layout = layout;
    this.soviet = !!opts.soviet;
    this.metric = !!opts.metric;
    this.bg = document.createElement('canvas');
    this.bg.width = W;
    this.bg.height = H;
    const b = this.bg.getContext('2d');
    if (opts.paintBg) opts.paintBg(b, this.ppm, W, H);
    else {
      b.fillStyle = opts.color || '#3a3e42';
      b.fillRect(0, 0, W, H);
    }
    this.scratch = document.createElement('canvas');
    this.display = new Display(W, H, opts.rate || 12, (ctx, w, h, g) => this._draw(ctx, w, h, g), opts.phase || 0);
    this._data = {};
    // static faces into the background
    for (const gd of layout.gauges) {
      const fn = GAUGE_DRAW[gd.type];
      if (fn) fn(b, gd.x * this.ppm, gd.y * this.ppm, gd.r * this.ppm, this._dataFor(null), true, null, gd);
    }
  }

  _dataFor(g) {
    const d = this._data;
    d.soviet = this.soviet;
    d.metric = this.metric;
    d.scratch = this.scratch;
    if (!g) {
      Object.assign(d, { att: { pitch: 0, roll: 0, heading: 0 }, kts: 0, alt: 0, altM: 0, vs: 0, hdg: 0, brg: 0, rpm: 0, egt: 0, fuel: 0, mach: 0, fm: { gLoad: 1, alpha: 0 } });
      return d;
    }
    const fd = flightData(g);
    Object.assign(d, fd);
    d.altM = g.ac.position.y;
    const ab = g.battle.map.airbase;
    d.brg = (deg(Math.atan2(ab.x - g.ac.position.x, -(ab.z - g.ac.position.z))) + 360) % 360;
    const rev = fd.fm.reverser ? fd.fm.reverser.power || 0 : 0;
    const thr = Math.max(fd.fm.throttle, rev * 0.8);
    d.rpm = 62 + thr * 38 + (fd.fm.afterburner || 0) * 3;
    d.egt = 450 + thr * 420 + (fd.fm.afterburner || 0) * 150;
    d.fuel = fd.fm.mass * 0.22;
    return d;
  }

  _draw(ctx, W, H, g) {
    ctx.drawImage(this.bg, 0, 0);
    const d = this._dataFor(g);
    for (const gd of this.layout.gauges) {
      const fn = GAUGE_DRAW[gd.type];
      if (fn) fn(ctx, gd.x * this.ppm, gd.y * this.ppm, gd.r * this.ppm, d, false, g, gd);
    }
  }

  get tex() { return this.display.tex; }
  dispose() { this.display.dispose(); }
}
