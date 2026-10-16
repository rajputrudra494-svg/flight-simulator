// Deterministic city layout: a street grid of blocks (urban, park, port),
// buildings with heights driven by downtown "districts", landmarks, a bridge
// and an obstacle grid so aircraft, bullets and the camera collide with
// buildings. Pure data (no three.js) so it also runs in Node tests.
import { mulberry32 } from './noise.js';

export const CELL = { NONE: 0, URBAN: 1, PARK: 2, PORT: 3 };

// Facade styles understood by the building shader (City.js)
export const STYLE = { GLASS: 0, OFFICE: 1, RESIDENTIAL: 2, GULF: 3, GOLD: 4, WAREHOUSE: 5 };
export const SHAPE = { BOX: 0, ROUND: 1, HEX: 2 };

export class CityLayout {
  constructor(map, def) {
    this.map = map;
    this.def = def;
    this.cell = def.cell || 120;
    this.street = def.street || 18;
    const N = Math.ceil((def.radius * 2) / this.cell) + 4;
    this.N = N;
    this.x0 = def.x - (N / 2) * this.cell;
    this.z0 = def.z - (N / 2) * this.cell;
    this.types = new Uint8Array(N * N);
    this.heightClass = new Uint8Array(N * N);
    this.buildings = [];
    this.containers = [];
    this.cranes = [];
    this.landmarks = [];
    this.spires = [];
    this.obstacles = [];
    this.buckets = new Array(N * N);
    this.rand = mulberry32((def.seed || 77) >>> 0);
    this._cells();
    this._buildings();
    this._landmarks();
    if (def.bridge) this._bridge(def.bridge);
  }

  index(x, z) {
    const i = Math.floor((x - this.x0) / this.cell);
    const j = Math.floor((z - this.z0) / this.cell);
    if (i < 0 || j < 0 || i >= this.N || j >= this.N) return -1;
    return j * this.N + i;
  }

  typeAt(x, z) {
    const k = this.index(x, z);
    return k < 0 ? 0 : this.types[k];
  }

  center(i, j) {
    return { x: this.x0 + (i + 0.5) * this.cell, z: this.z0 + (j + 0.5) * this.cell };
  }

  // tallest obstacle containing (x, z) whose underside is below height y
  obstacleTop(x, z, y = Infinity) {
    const k = this.index(x, z);
    if (k < 0) return -Infinity;
    const list = this.buckets[k];
    if (!list) return -Infinity;
    let best = -Infinity;
    for (let n = 0; n < list.length; n++) {
      const o = this.obstacles[list[n]];
      if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
      if (o.bottom > y + 3) continue;
      if (o.top > best) best = o.top;
    }
    return best;
  }

  _addObstacle(x0, x1, z0, z1, bottom, top) {
    const id = this.obstacles.length;
    this.obstacles.push({ x0, x1, z0, z1, bottom, top });
    const c = this.cell;
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / c)), i1 = Math.min(this.N - 1, Math.floor((x1 - this.x0) / c));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / c)), j1 = Math.min(this.N - 1, Math.floor((z1 - this.z0) / c));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = j * this.N + i;
        (this.buckets[k] || (this.buckets[k] = [])).push(id);
      }
    }
  }

  _density(x, z) {
    let peak = 0;
    for (const d of this.def.districts || []) {
      const t = Math.hypot(x - d.x, z - d.z) / d.r;
      peak = Math.max(peak, d.h * Math.exp(-t * t));
    }
    return peak;
  }

  _excluded(x, z, margin = 0) {
    const map = this.map;
    const ab = map.airbase;
    if (ab) {
      const { u, v } = map.toAirbaseLocal(x, z);
      if (Math.abs(u) < ab.halfL + 450 + margin && Math.abs(v) < ab.halfW + 380 + margin) return true;
    }
    for (const e of this.def.exclude || []) if (Math.hypot(x - e.x, z - e.z) < e.r + margin) return true;
    return false;
  }

  // buildings under the runway approach paths stay low
  _approachCap(x, z) {
    const ab = this.map.airbase;
    if (!ab) return Infinity;
    const { u, v } = this.map.toAirbaseLocal(x, z);
    const beyond = Math.abs(u) - ab.length / 2;
    if (beyond > 0 && beyond < 7000 && Math.abs(v) < 500 + beyond * 0.15) return 18 + beyond * 0.02;
    return Infinity;
  }

  _cells() {
    const { def, map, N } = this;
    const base = map.base;
    const wl = map.waterLevel;
    const half = (this.cell - this.street) / 2;
    const water = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const { x, z } = this.center(i, j);
        const k = j * N + i;
        const hs = [base(x, z), base(x - half, z - half), base(x + half, z - half), base(x - half, z + half), base(x + half, z + half)];
        let mn = Infinity, mx = -Infinity;
        for (const h of hs) { mn = Math.min(mn, h); mx = Math.max(mx, h); }
        if (mn < wl + 1.5) { water[k] = 1; continue; }
        const dist = Math.hypot(x - def.x, z - def.z);
        const ragged = def.radius * (0.84 + 0.26 * map.n2.noise(x / 2600 + 3.1, z / 2600 - 7.7));
        if (dist > ragged) continue;
        if (def.shape && !def.shape(x, z)) continue;
        if (mx - mn > 16) continue;
        if (this._excluded(x, z)) continue;
        let type = CELL.URBAN;
        const parkChance = (def.parks ?? 0.07) * (0.6 + (dist / def.radius) * 0.8);
        if (this.rand() < parkChance && this._density(x, z) < 260) type = CELL.PARK;
        this.types[k] = type;
      }
    }
    // port: urban cells on the shore inside the port sector become docks
    if (def.port) {
      const P = def.port;
      for (let j = 1; j < N - 1; j++) {
        for (let i = 1; i < N - 1; i++) {
          const k = j * N + i;
          if (!this.types[k]) continue;
          const { x, z } = this.center(i, j);
          if (Math.hypot(x - P.x, z - P.z) > P.r) continue;
          let shore = false;
          for (let dj = -1; dj <= 1 && !shore; dj++) for (let di = -1; di <= 1; di++) if (water[(j + dj) * N + i + di]) { shore = true; break; }
          if (shore || this.rand() < 0.35) this.types[k] = CELL.PORT;
        }
      }
    }
    this.water = water;
  }

  _height(x, z, dist) {
    const def = this.def;
    const peak = this._density(x, z);
    const low = (def.lowRise ?? 14) * (1 - Math.min(1, dist / def.radius) * 0.5);
    return { peak, low };
  }

  _place(b) {
    const map = this.map;
    const hw = b.w / 2, hd = b.d / 2;
    let y0 = Infinity;
    for (const [dx, dz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd], [0, 0]]) y0 = Math.min(y0, map.base(b.x + dx, b.z + dz));
    b.y0 = y0 - 1.2;
    const cap = this._approachCap(b.x, b.z);
    if (b.h > cap) b.h = Math.max(6, cap);
    this.buildings.push(b);
    this._addObstacle(b.x - hw, b.x + hw, b.z - hd, b.z + hd, -1e4, b.y0 + b.h);
    return b;
  }

  _tower(x, z, w, d, h, opts) {
    const r = this.rand;
    const gulf = this.def.style === 'gulf';
    let style = opts.style;
    if (style === undefined) {
      if (gulf) style = r() < 0.45 ? STYLE.GULF : r() < 0.6 ? STYLE.GOLD : STYLE.GLASS;
      else style = h > 70 ? (r() < 0.72 ? STYLE.GLASS : STYLE.OFFICE) : h > 28 ? (r() < 0.65 ? STYLE.OFFICE : STYLE.GLASS) : STYLE.RESIDENTIAL;
    }
    const seed = r();
    const lit = 0.35 + r() * 0.45;
    let shape = SHAPE.BOX;
    if (h > 60 && r() < (gulf ? 0.35 : 0.2)) shape = gulf && r() < 0.6 ? SHAPE.HEX : SHAPE.ROUND;
    if (shape !== SHAPE.BOX) w = d = Math.min(w, d);
    const tint = opts.tint ?? this._tint(style);
    // tall towers sometimes step back in tiers
    if (shape === SHAPE.BOX && h > 90 && r() < 0.45) {
      const t1 = h * (0.45 + r() * 0.2), t2 = h * (0.75 + r() * 0.1);
      this._place({ x, z, w, d, h: t1, style, shape, seed, lit, tint });
      const b2 = this._place({ x, z, w: w * 0.78, d: d * 0.78, h: t2, style, shape, seed, lit, tint });
      const b3 = this._place({ x, z, w: w * 0.55, d: d * 0.55, h, style, shape, seed, lit, tint });
      if (h > 140 && r() < 0.7) this.spires.push({ x, z, y: b3.y0 + b3.h, h: 12 + r() * 30 });
      void b2;
      return;
    }
    const b = this._place({ x, z, w, d, h, style, shape, seed, lit, tint });
    if (h > 120 && r() < 0.55) this.spires.push({ x, z, y: b.y0 + b.h, h: 10 + r() * 35 });
  }

  _tint(style) {
    const r = this.rand();
    switch (style) {
      case STYLE.GLASS: return [[0.32, 0.48, 0.58], [0.25, 0.4, 0.45], [0.38, 0.46, 0.52], [0.22, 0.3, 0.42]][Math.floor(r * 4)];
      case STYLE.OFFICE: return [[0.72, 0.7, 0.66], [0.6, 0.6, 0.6], [0.78, 0.74, 0.66], [0.5, 0.52, 0.55]][Math.floor(r * 4)];
      case STYLE.RESIDENTIAL: return [[0.66, 0.42, 0.32], [0.82, 0.78, 0.7], [0.72, 0.62, 0.5], [0.85, 0.82, 0.76], [0.55, 0.5, 0.46]][Math.floor(r * 5)];
      case STYLE.GULF: return [[0.92, 0.88, 0.8], [0.86, 0.8, 0.7], [0.95, 0.94, 0.92]][Math.floor(r * 3)];
      case STYLE.GOLD: return [[0.78, 0.62, 0.34], [0.7, 0.58, 0.4]][Math.floor(r * 2)];
      default: return [0.6, 0.6, 0.6];
    }
  }

  _buildings() {
    const { N, def } = this;
    const r = this.rand;
    const inner = this.cell - this.street - 8;
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const type = this.types[k];
        if (!type || type === CELL.PARK) continue;
        const { x, z } = this.center(i, j);
        const dist = Math.hypot(x - def.x, z - def.z);
        if (type === CELL.PORT) {
          this._portBlock(x, z, inner);
          continue;
        }
        const { peak, low } = this._height(x, z, dist);
        this.heightClass[k] = Math.min(255, Math.round(peak));
        const jitter = (s) => (r() - 0.5) * s;
        if (peak > 110) {
          // downtown: one or two towers, sometimes on a podium
          if (r() < 0.35) this._place({ x, z, w: inner, d: inner, h: 10 + r() * 12, style: STYLE.OFFICE, shape: SHAPE.BOX, seed: r(), lit: 0.6, tint: this._tint(STYLE.OFFICE) });
          if (r() < 0.62) {
            const s = inner * (0.55 + r() * 0.3);
            this._tower(x + jitter(inner - s), z + jitter(inner - s), s, s * (0.75 + r() * 0.4), peak * (0.45 + r() * 0.75), {});
          } else {
            const s = inner * 0.42;
            this._tower(x - inner * 0.26, z + jitter(10), s, s * (0.8 + r() * 0.4), peak * (0.35 + r() * 0.7), {});
            this._tower(x + inner * 0.26, z + jitter(10), s, s * (0.8 + r() * 0.4), peak * (0.35 + r() * 0.7), {});
          }
        } else if (peak > 35) {
          // midtown: up to four mid-rise buildings
          for (let q = 0; q < 4; q++) {
            if (r() < 0.12) continue;
            const qx = x + (q % 2 ? 1 : -1) * inner * 0.25, qz = z + (q < 2 ? 1 : -1) * inner * 0.25;
            const s = inner * 0.5 * (0.7 + r() * 0.25);
            this._tower(qx, qz, s, s * (0.8 + r() * 0.4), Math.max(low, 12 + r() * peak), {});
          }
        } else {
          // suburbs: small low buildings
          const n = 2;
          for (let a = 0; a < n; a++) {
            for (let b = 0; b < n; b++) {
              if (r() < 0.22) continue;
              const qx = x + (a - (n - 1) / 2) * inner / n, qz = z + (b - (n - 1) / 2) * inner / n;
              const s = (inner / n) * (0.5 + r() * 0.3);
              this._tower(qx, qz, s, s * (0.8 + r() * 0.5), low * (0.45 + r() * 0.7), { style: STYLE.RESIDENTIAL });
            }
          }
        }
      }
    }
  }

  _portBlock(x, z, inner) {
    const r = this.rand;
    if (r() < 0.3) {
      // warehouse
      this._place({ x, z, w: inner * 0.9, d: inner * (0.45 + r() * 0.3), h: 12 + r() * 8, style: STYLE.WAREHOUSE, shape: SHAPE.BOX, seed: r(), lit: 0.2, tint: [0.62, 0.64, 0.66] });
      return;
    }
    const colors = [[0.7, 0.18, 0.12], [0.12, 0.32, 0.6], [0.85, 0.62, 0.12], [0.2, 0.5, 0.3], [0.85, 0.85, 0.82], [0.5, 0.2, 0.45], [0.9, 0.42, 0.1]];
    let top = -Infinity;
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 6; col++) {
        if (r() < 0.25) continue;
        const cx = x - inner * 0.42 + col * (inner * 0.84 / 5);
        const cz = z - inner * 0.4 + row * (inner * 0.8 / 5);
        const stack = 1 + Math.floor(r() * 4);
        const y0 = this.map.base(cx, cz);
        for (let s = 0; s < stack; s++) {
          this.containers.push({ x: cx, z: cz, y: y0 + s * 2.6, color: colors[Math.floor(r() * colors.length)], rot: row % 2 });
        }
        top = Math.max(top, y0 + stack * 2.6);
      }
    }
    if (top > -Infinity) this._addObstacle(x - inner / 2, x + inner / 2, z - inner / 2, z + inner / 2, -1e4, top);
    if (r() < 0.25) this.cranes.push({ x: x + (r() - 0.5) * inner * 0.6, z, y: this.map.base(x, z), h: 45 + r() * 15, rot: r() < 0.5 ? 0 : Math.PI / 2 });
  }

  _landmarks() {
    for (const lm of this.def.landmarks || []) {
      const y0 = this.map.base(lm.x, lm.z) - 1;
      const L = { ...lm, y0 };
      this.landmarks.push(L);
      if (lm.type === 'needle') {
        this._addObstacle(lm.x - 9, lm.x + 9, lm.z - 9, lm.z + 9, -1e4, y0 + lm.h);
        this._addObstacle(lm.x - 26, lm.x + 26, lm.z - 26, lm.z + 26, y0 + lm.h * 0.76, y0 + lm.h * 0.84);
      } else if (lm.type === 'supertall') {
        const tiers = [[34, 0.32], [28, 0.55], [21, 0.76], [13, 0.9], [7, 0.97], [2.5, 1.0]];
        for (const [hw, f] of tiers) this._addObstacle(lm.x - hw, lm.x + hw, lm.z - hw, lm.z + hw, -1e4, y0 + lm.h * f);
      } else if (lm.type === 'stadium') {
        this._addObstacle(lm.x - lm.r, lm.x + lm.r, lm.z - lm.r * 0.8, lm.z + lm.r * 0.8, -1e4, y0 + lm.h);
      } else if (lm.type === 'twin') {
        for (const s of [-1, 1]) this._addObstacle(lm.x + s * 40 - 22, lm.x + s * 40 + 22, lm.z - 22, lm.z + 22, -1e4, y0 + lm.h);
        this._addObstacle(lm.x - 20, lm.x + 20, lm.z - 5, lm.z + 5, y0 + lm.h * 0.4, y0 + lm.h * 0.43);
      }
    }
  }

  _bridge(b) {
    const deckY = b.deckY;
    this.bridge = { ...b };
    this._addObstacle(b.x0, b.x1, b.z - 15, b.z + 15, deckY - 3.5, deckY + 1.5);
    for (const tx of b.towers) this._addObstacle(tx - 7, tx + 7, b.z - 19, b.z + 19, -1e4, deckY + b.towerH);
  }

  // open ground (park or plaza) near a point, for placing ground units
  openSpot(x, z, rand, maxR = 3000) {
    let best = null;
    for (let n = 0; n < 200; n++) {
      const a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * maxR;
      const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
      const t = this.typeAt(px, pz);
      if (t === CELL.PARK || t === CELL.PORT) {
        if (this.obstacleTop(px, pz) > this.map.base(px, pz) + 1) continue;
        best = { x: px, z: pz, y: this.map.base(px, pz) };
        break;
      }
    }
    return best;
  }

  // a flat rooftop near a point (for rooftop air-defence sites)
  roofSpot(x, z, rand, minH = 30, maxH = 160) {
    const cand = this.buildings.filter((b) => b.h >= minH && b.h <= maxH && b.w > 22 && b.d > 22 && Math.hypot(b.x - x, b.z - z) < 4000);
    if (!cand.length) return null;
    const b = cand[Math.floor(rand() * cand.length)];
    return { x: b.x, z: b.z, y: b.y0 + b.h };
  }
}
