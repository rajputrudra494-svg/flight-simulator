// Procedural panel artwork for the cockpit interiors. Every panel is painted
// twice into a shared texture atlas: an albedo layer (panel paint, screws,
// switch bodies, white legends) and an emissive layer holding what glows when
// the integral panel lighting is on (legends, knob pointers) plus the lit
// annunciators. Styles follow the manufacturers' flight decks: Airbus
// blue-grey with square push-button "lights out" panels, Boeing grey with
// toggles and knobs, the Soviet turquoise, Concorde's crowded light-grey
// panels and the dark grey / black fighter consoles.
import * as THREE from 'three';

export const STYLES = {
  airbus: { panel: '#55606b', sub: '#4a545e', line: '#2a3036', text: '#e6e9ea', screw: '#79838c', button: '#2b3035', knob: '#1c1f22', trim: '#8f979e', frame: '#3c444b', glare: '#2c3237', carpet: '#3a3e44', seat: '#3a3f47', light: '#fff1d6' },
  boeing: { panel: '#4c5156', sub: '#43474c', line: '#25282b', text: '#f0ece2', screw: '#757a7f', button: '#26292c', knob: '#18191b', trim: '#7d7f80', frame: '#33373b', glare: '#1e2124', carpet: '#3d3a38', seat: '#c9b99a', light: '#ffd29a' },
  soviet: { panel: '#4f8a8c', sub: '#467c7e', line: '#24403f', text: '#f1f1e8', screw: '#93a7a6', button: '#2c3434', knob: '#1a1c1c', trim: '#8f9a8c', frame: '#3c5a5a', glare: '#2a2f2e', carpet: '#4b4339', seat: '#5b4a3c', light: '#ffc9a0' },
  concorde: { panel: '#6b6c6a', sub: '#5f605e', line: '#323331', text: '#f2f0e8', screw: '#8c8c88', button: '#2b2c2b', knob: '#1b1b1a', trim: '#b4ad98', frame: '#4c4c4a', glare: '#232423', carpet: '#4a4440', seat: '#4b4f5a', light: '#ffdcae' },
  fighter: { panel: '#4d5256', sub: '#43474b', line: '#1b1d1f', text: '#e8ece6', screw: '#666c70', button: '#202325', knob: '#141516', trim: '#4a4f53', frame: '#2a2d30', glare: '#1a1b1c', carpet: '#2a2c2e', seat: '#3b3e33', light: '#c8f5b0' },
  fighterRu: { panel: '#4d8587', sub: '#457678', line: '#22393a', text: '#f0f0e6', screw: '#8ea3a2', button: '#263031', knob: '#161818', trim: '#557c7c', frame: '#365656', glare: '#1f2424', carpet: '#2c2e2c', seat: '#4b3f33', light: '#ffd0b0' },
  fighterDark: { panel: '#2b2e31', sub: '#26292b', line: '#141516', text: '#e6e8e4', screw: '#5b6064', button: '#1a1c1e', knob: '#121314', trim: '#3a3e41', frame: '#222427', glare: '#151617', carpet: '#232527', seat: '#33352e', light: '#d8f0ff' },
};

// Deterministic random numbers so panels look the same every flight.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FONT = '"Arial Narrow", "Roboto Condensed", Arial, sans-serif';

// Two layered canvases (albedo + emissive) with a simple shelf allocator.
export class PanelAtlas {
  constructor(size) {
    this.size = size;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      return c;
    };
    this.albedo = mk();
    this.emissive = mk();
    this.a = this.albedo.getContext('2d');
    this.e = this.emissive.getContext('2d');
    this.a.fillStyle = '#ffffff';
    this.a.fillRect(0, 0, size, size);
    this.e.fillStyle = '#000000';
    this.e.fillRect(0, 0, size, size);
    this.shelfY = 0;
    this.shelfH = 0;
    this.cursorX = 16; // a white strip on the left serves untextured surfaces
    this.plain = [4 / size, 1 - 4 / size];
    this.k = size / 2048;
  }

  // Reserve a w x h pixel region (in 2048-atlas units, scaled to the atlas).
  alloc(w, h) {
    w = Math.max(4, Math.min(this.size - 18, Math.round(w * this.k)));
    h = Math.max(4, Math.round(h * this.k));
    if (this.cursorX + w > this.size) {
      this.shelfY += this.shelfH + 2;
      this.shelfH = 0;
      this.cursorX = 16;
    }
    const r = { x: this.cursorX, y: this.shelfY, w, h };
    this.cursorX += w + 2;
    this.shelfH = Math.max(this.shelfH, h);
    if (r.y + h > this.size) console.warn('cockpit atlas overflow');
    const S = this.size;
    r.u0 = r.x / S;
    r.u1 = (r.x + w) / S;
    r.v0 = 1 - (r.y + h) / S;
    r.v1 = 1 - r.y / S;
    return r;
  }

  textures() {
    const make = (canvas) => {
      const t = new THREE.CanvasTexture(canvas);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      return t;
    };
    this.mapTex = make(this.albedo);
    this.emTex = make(this.emissive);
    return { map: this.mapTex, emissiveMap: this.emTex };
  }

  dispose() {
    this.mapTex?.dispose();
    this.emTex?.dispose();
  }
}

// Drawing helper bound to one atlas region; coordinates are in metres of
// panel surface, converted with `ppm` pixels per metre.
export class Painter {
  constructor(atlas, rect, wM, hM, style, seed = 1) {
    this.atlas = atlas;
    this.rect = rect;
    this.a = atlas.a;
    this.e = atlas.e;
    this.wM = wM;
    this.hM = hM;
    this.ppm = rect.w / wM;
    this.style = style;
    this.r = rng(seed);
    for (const c of [this.a, this.e]) {
      c.save();
      c.beginPath();
      c.rect(rect.x, rect.y, rect.w, rect.h);
      c.clip();
      c.translate(rect.x, rect.y);
      c.scale(this.ppm, this.ppm);
    }
  }

  done() {
    this.a.restore();
    this.e.restore();
  }

  px(n) { return n / this.ppm; }

  // panel base: paint with faint wear and darker edges
  base(color = this.style.panel) {
    const a = this.a;
    a.fillStyle = color;
    a.fillRect(0, 0, this.wM, this.hM);
    const n = Math.round(this.wM * this.hM * 900);
    for (let i = 0; i < n; i++) {
      a.fillStyle = this.r() < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
      const s = this.px(1 + this.r() * 3);
      a.fillRect(this.r() * this.wM, this.r() * this.hM, s, s);
    }
    this.e.fillStyle = '#000';
    this.e.fillRect(0, 0, this.wM, this.hM);
  }

  // a removable sub-panel: recessed seam, fasteners and an optional title
  module(x, y, w, h, title, opts = {}) {
    const a = this.a, st = this.style;
    a.fillStyle = opts.color || st.sub;
    a.fillRect(x, y, w, h);
    a.strokeStyle = st.line;
    a.lineWidth = this.px(2.2);
    a.strokeRect(x, y, w, h);
    a.strokeStyle = 'rgba(255,255,255,0.07)';
    a.lineWidth = this.px(1);
    a.beginPath();
    a.moveTo(x + this.px(2), y + h - this.px(2));
    a.lineTo(x + this.px(2), y + this.px(2));
    a.lineTo(x + w - this.px(2), y + this.px(2));
    a.stroke();
    const sr = Math.min(0.0035, Math.min(w, h) * 0.04);
    for (const [sx, sy] of [[x + sr * 2.2, y + sr * 2.2], [x + w - sr * 2.2, y + sr * 2.2], [x + sr * 2.2, y + h - sr * 2.2], [x + w - sr * 2.2, y + h - sr * 2.2]]) this.screw(sx, sy, sr);
    if (title) this.label(title, x + w / 2, y + Math.max(0.011, h * 0.08), opts.titleSize || 0.0085, { boxed: opts.boxed });
  }

  screw(x, y, r) {
    const a = this.a;
    a.fillStyle = this.style.screw;
    a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
    a.strokeStyle = 'rgba(0,0,0,0.6)';
    a.lineWidth = r * 0.35;
    const ang = this.r() * Math.PI;
    a.beginPath();
    a.moveTo(x - Math.cos(ang) * r * 0.7, y - Math.sin(ang) * r * 0.7);
    a.lineTo(x + Math.cos(ang) * r * 0.7, y + Math.sin(ang) * r * 0.7);
    a.stroke();
  }

  // Text drawn in pixel space (tiny fractional font sizes render poorly).
  text(c, str, x, y, sizeM, color, weight = 'bold', align = 'center') {
    c.save();
    c.translate(x, y);
    c.scale(1 / this.ppm, 1 / this.ppm);
    c.font = `${weight} ${Math.max(4, sizeM * this.ppm).toFixed(1)}px ${FONT}`;
    c.textAlign = align;
    c.textBaseline = 'middle';
    c.fillStyle = color;
    c.fillText(str, 0, 0);
    const w = c.measureText(str).width / this.ppm;
    c.restore();
    return w;
  }

  // white legend that glows with the panel lighting
  label(text, x, y, size = 0.007, opts = {}) {
    const w = this.text(this.a, text, x, y, size, opts.color || this.style.text, opts.weight || 'bold', opts.align || 'center');
    this.text(this.e, text, x, y, size, opts.glow || '#9a9a9a', opts.weight || 'bold', opts.align || 'center');
    if (opts.boxed) {
      const bw = w + size * 0.8;
      for (const [c, col] of [[this.a, this.style.text], [this.e, '#707070']]) {
        c.strokeStyle = col;
        c.lineWidth = size * 0.1;
        c.strokeRect(x - bw / 2, y - size * 0.7, bw, size * 1.4);
      }
    }
  }

  // engraved line marks (e.g. grouping brackets)
  rule(x0, y0, x1, y1) {
    for (const [c, col] of [[this.a, this.style.text], [this.e, '#5a5a5a']]) {
      c.strokeStyle = col;
      c.lineWidth = this.px(1.4);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
  }

  // square push-button with a two-segment legend (Airbus style)
  pushButton(x, y, s, top, bottom, lit = null) {
    const a = this.a, e = this.e;
    a.fillStyle = '#111315';
    a.fillRect(x - s / 2 - this.px(1.5), y - s / 2 - this.px(1.5), s + this.px(3), s + this.px(3));
    a.fillStyle = this.style.button;
    a.fillRect(x - s / 2, y - s / 2, s, s);
    const g = a.createLinearGradient(x, y - s / 2, x, y + s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    a.fillStyle = g;
    a.fillRect(x - s / 2, y - s / 2, s, s);
    const fs = s * 0.24;
    const seg = (txt, yy, col, on) => {
      if (!txt) return;
      this.text(a, txt, x, yy, fs, on ? col : 'rgba(200,200,190,0.28)');
      if (on) this.text(e, txt, x, yy, fs, col);
    };
    seg(top, y - s * 0.2, top === 'FAULT' ? '#ffb030' : '#ffffff', lit === 'top');
    seg(bottom, y + s * 0.2, lit === 'blue' ? '#4aa8ff' : lit === 'green' ? '#40ff70' : '#ffffff', lit === 'bottom' || lit === 'blue' || lit === 'green');
  }

  // toggle switch seen from the front: hex nut and bat handle
  toggle(x, y, s = 0.009, up = true) {
    const a = this.a;
    a.fillStyle = '#8e9296';
    a.beginPath(); a.arc(x, y, s * 0.55, 0, Math.PI * 2); a.fill();
    a.fillStyle = '#c6c9cc';
    a.fillRect(x - s * 0.16, up ? y - s * 1.1 : y, s * 0.32, s * 1.1);
    a.fillStyle = '#e9ebec';
    a.beginPath(); a.arc(x, up ? y - s * 1.1 : y + s * 1.1, s * 0.22, 0, Math.PI * 2); a.fill();
  }

  // rotary knob with a glowing pointer line
  knob(x, y, r, ang = this.r() * 5 - 2.5, opts = {}) {
    const a = this.a, e = this.e;
    a.fillStyle = 'rgba(0,0,0,0.45)';
    a.beginPath(); a.arc(x + r * 0.12, y + r * 0.15, r * 1.05, 0, Math.PI * 2); a.fill();
    const g = a.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, opts.light || '#4a4e52');
    g.addColorStop(1, opts.color || this.style.knob);
    a.fillStyle = g;
    a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
    for (const [c, col] of [[a, '#e8e8e0'], [e, '#8a8a8a']]) {
      c.strokeStyle = col;
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.moveTo(x + Math.sin(ang) * r * 0.25, y - Math.cos(ang) * r * 0.25);
      c.lineTo(x + Math.sin(ang) * r * 0.9, y - Math.cos(ang) * r * 0.9);
      c.stroke();
    }
    if (opts.ticks) {
      for (let i = 0; i < opts.ticks; i++) {
        const t = -2.2 + (4.4 * i) / (opts.ticks - 1);
        for (const [c, col] of [[a, this.style.text], [e, '#7a7a7a']]) {
          c.strokeStyle = col;
          c.lineWidth = this.px(1.2);
          c.beginPath();
          c.moveTo(x + Math.sin(t) * r * 1.25, y - Math.cos(t) * r * 1.25);
          c.lineTo(x + Math.sin(t) * r * 1.5, y - Math.cos(t) * r * 1.5);
          c.stroke();
        }
      }
    }
  }

  // annunciator light; lit ones glow regardless of the panel lighting level
  annunciator(x, y, w, h, text, color, lit = false) {
    const a = this.a, e = this.e;
    a.fillStyle = '#0d0e0f';
    a.fillRect(x - w / 2, y - h / 2, w, h);
    this.text(a, text, x, y + h * 0.04, h * 0.42, lit ? color : 'rgba(170,170,160,0.25)');
    if (lit) {
      e.fillStyle = color;
      e.globalAlpha = 0.25;
      e.fillRect(x - w / 2, y - h / 2, w, h);
      e.globalAlpha = 1;
      this.text(e, text, x, y + h * 0.04, h * 0.42, color);
    }
  }

  // dark recessed window (numeric readouts, small screens)
  window(x, y, w, h) {
    const a = this.a;
    a.fillStyle = '#050606';
    a.fillRect(x - w / 2, y - h / 2, w, h);
    a.strokeStyle = 'rgba(255,255,255,0.08)';
    a.lineWidth = this.px(1);
    a.strokeRect(x - w / 2, y - h / 2, w, h);
  }

  // round instrument face (static analogue gauge)
  gauge(x, y, r, opts = {}) {
    const a = this.a, e = this.e;
    a.fillStyle = '#121314';
    a.beginPath(); a.arc(x, y, r * 1.12, 0, Math.PI * 2); a.fill();
    a.fillStyle = '#060606';
    a.beginPath(); a.arc(x, y, r, 0, Math.PI * 2); a.fill();
    const n = opts.ticks || 10;
    for (let i = 0; i <= n; i++) {
      const t = -2.4 + (4.8 * i) / n;
      for (const [c, col] of [[a, '#e9e9e2'], [e, '#8c8c8c']]) {
        c.strokeStyle = col;
        c.lineWidth = r * 0.05;
        c.beginPath();
        c.moveTo(x + Math.sin(t) * r * 0.78, y - Math.cos(t) * r * 0.78);
        c.lineTo(x + Math.sin(t) * r * 0.95, y - Math.cos(t) * r * 0.95);
        c.stroke();
      }
    }
    const v = opts.value ?? this.r();
    const t = -2.4 + 4.8 * v;
    for (const [c, col] of [[a, '#f2f2ea'], [e, '#a0a0a0']]) {
      c.strokeStyle = col;
      c.lineWidth = r * 0.07;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(t) * r * 0.8, y - Math.cos(t) * r * 0.8); c.stroke();
    }
    if (opts.label) this.label(opts.label, x, y + r * 0.45, r * 0.22, { weight: 'normal' });
  }

  // grid of small keys (CDU keyboards)
  keypad(x, y, cols, rows, kw, kh, gap, labels = []) {
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const kx = x + c * (kw + gap), ky = y + r * (kh + gap);
        const a = this.a;
        a.fillStyle = '#0c0d0e';
        a.fillRect(kx - this.px(1), ky - this.px(1), kw + this.px(2), kh + this.px(2));
        a.fillStyle = '#34383c';
        a.fillRect(kx, ky, kw, kh);
        a.fillStyle = 'rgba(255,255,255,0.1)';
        a.fillRect(kx, ky, kw, kh * 0.3);
        const t = labels[i++ % Math.max(1, labels.length)];
        if (t) this.label(t, kx + kw / 2, ky + kh / 2, Math.min(kh * 0.5, kw * 0.32), { glow: '#bdbdbd' });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Panel layouts
// ---------------------------------------------------------------------------

const AIRBUS_OVERHEAD = [
  ['ADIRS', ['IR 1', 'IR 3', 'IR 2']], ['FLT CTL', ['ELAC 1', 'SEC 1', 'FAC 1']], ['EVAC', ['COMMAND', 'HORN']],
  ['EMER ELEC PWR', ['GEN 1 LINE', 'RAT', 'MAN ON']], ['GPWS', ['SYS', 'G/S MODE', 'FLAP MODE', 'TERR']],
  ['RCDR', ['GND CTL', 'CVR TEST']], ['OXYGEN', ['MASK MAN', 'CREW SUPPLY']], ['CALLS', ['MECH', 'FWD', 'AFT', 'ALL']],
  ['ANTI ICE', ['WING', 'ENG 1', 'ENG 2', 'PROBE']], ['CABIN PRESS', ['MODE SEL', 'DITCHING']],
  ['AIR COND', ['PACK 1', 'HOT AIR', 'PACK 2', 'APU BLEED', 'X BLEED']], ['ELEC', ['BAT 1', 'BAT 2', 'GEN 1', 'APU GEN', 'EXT PWR', 'GEN 2', 'BUS TIE']],
  ['FUEL', ['L TK PUMP 1', 'L TK PUMP 2', 'CTR TK 1', 'MODE SEL', 'CTR TK 2', 'R TK PUMP 1', 'R TK PUMP 2']],
  ['HYD', ['ENG 1 PUMP', 'ELEC PUMP', 'PTU', 'ENG 2 PUMP']], ['FIRE', ['ENG 1', 'APU', 'ENG 2']], ['APU', ['MASTER SW', 'START']],
  ['EXT LT', ['STROBE', 'BEACON', 'WING', 'NAV & LOGO', 'RWY TURN OFF', 'LAND', 'NOSE']], ['INT LT', ['OVHD INTEG', 'ICE IND', 'STBY COMPASS', 'DOME']],
  ['SIGNS', ['SEAT BELTS', 'NO SMOKING', 'EMER EXIT LT']], ['WIPER', ['RAIN RPLNT']],
];
const BOEING_OVERHEAD = [
  ['ELECTRICAL', ['BATTERY', 'APU GEN', 'BUS TIE', 'L GEN', 'R GEN', 'UTILITY']], ['HYDRAULIC', ['L ENG', 'C1 ELEC', 'C2 ELEC', 'R ENG']],
  ['APU', ['START', 'RUN']], ['EMER LIGHTS', ['ARMED']], ['PASS OXYGEN', ['ON']], ['WINDOW HEAT', ['L FWD', 'L SIDE', 'R SIDE', 'R FWD']],
  ['ENGINE START', ['L', 'R', 'AUTOSTART']], ['FUEL', ['FWD PUMPS', 'AFT PUMPS', 'CTR L', 'CTR R', 'X FEED']],
  ['ANTI-ICE', ['WING', 'L ENG', 'R ENG']], ['LIGHTING', ['BEACON', 'NAV', 'LOGO', 'WING', 'STROBE', 'LANDING', 'TAXI']],
  ['AIR COND', ['PACK L', 'PACK R', 'TRIM AIR', 'RECIRC']], ['BLEED', ['L ENG', 'APU', 'R ENG', 'ISLN']], ['PRESSURIZATION', ['LDG ALT', 'OUTFLOW']],
  ['SIGNS', ['NO SMOKING', 'SEAT BELTS']],
];

// Overhead panel: modules in rows, push-buttons (Airbus) or toggles/knobs (Boeing).
export function paintOverhead(atlas, wM, hM, style, maker, seed = 7, px = 900) {
  const rect = atlas.alloc(px, Math.round((px * hM) / wM));
  const p = new Painter(atlas, rect, wM, hM, style, seed);
  p.base();
  const list = maker === 'airbus' ? AIRBUS_OVERHEAD : BOEING_OVERHEAD;
  const rows = maker === 'airbus' ? 5 : 4;
  let idx = 0;
  const m = 0.012, rowH = (hM - m * 2) / rows;
  for (let r = 0; r < rows; r++) {
    // three columns of modules per row with a few full-width ones
    const cols = r % 2 === 0 ? 3 : 4;
    const colW = (wM - m * 2) / cols;
    for (let c = 0; c < cols; c++) {
      const [title, items] = list[idx++ % list.length];
      const x = m + c * colW, y = m + r * rowH;
      p.module(x + 0.002, y + 0.002, colW - 0.004, rowH - 0.004, title);
      const n = items.length;
      const per = Math.min(n, Math.max(2, Math.floor((colW - 0.02) / 0.034)));
      const lines = Math.ceil(n / per);
      for (let i = 0; i < n; i++) {
        const cx = x + ((i % per) + 0.5) * ((colW - 0.004) / per) + 0.002;
        const cy = y + 0.028 + Math.floor(i / per) * ((rowH - 0.03) / Math.max(1, lines)) + (rowH - 0.03) / Math.max(1, lines) / 2 - 0.004;
        if (maker === 'airbus') {
          const lit = p.r() < 0.12 ? (p.r() < 0.5 ? 'blue' : 'green') : p.r() < 0.05 ? 'top' : null;
          p.pushButton(cx, cy, 0.021, p.r() < 0.6 ? 'FAULT' : '', p.r() < 0.5 ? 'OFF' : 'ON', lit);
        } else if (p.r() < 0.6) {
          p.toggle(cx, cy + 0.004, 0.008, p.r() < 0.7);
        } else p.knob(cx, cy + 0.002, 0.0085, undefined, { ticks: 4 });
        p.label(items[i], cx, cy + 0.02, 0.0052);
      }
      if (maker === 'boeing' && p.r() < 0.35) p.annunciator(x + colW / 2, y + rowH - 0.012, Math.min(0.05, colW * 0.4), 0.009, 'OFF', '#ffb030', p.r() < 0.15);
    }
  }
  p.done();
  return rect;
}

// Glare shield face: flight control unit (Airbus) / mode control panel (Boeing)
// across the middle, EFIS control panels at both ends and the master lights.
export function paintGlareshield(atlas, wM, hM, style, maker, seed = 11, px = 2030) {
  const rect = atlas.alloc(px, Math.max(48, Math.round((px * hM) / wM)));
  const p = new Painter(atlas, rect, wM, hM, style, seed);
  p.base(style.glare);
  const cw = Math.min(0.62, wM * 0.42);
  const x0 = wM / 2 - cw / 2;
  p.module(x0, 0.004, cw, hM - 0.008, '', { color: style.panel });
  const windows = [];
  const items = maker === 'airbus' ? ['SPD MACH', 'HDG TRK', 'ALT', 'V/S FPA'] : maker === 'boeing' ? ['IAS MACH', 'HEADING', 'ALTITUDE', 'VERT SPEED'] : ['SPEED', 'COURSE', 'ALT', 'V/S'];
  items.forEach((t, i) => {
    const cx = x0 + cw * (0.13 + i * 0.25);
    p.label(t, cx, 0.012, 0.0062);
    p.window(cx, hM * 0.42, 0.06, hM * 0.26);
    windows.push({ x: cx, y: hM * 0.42, w: 0.06, h: hM * 0.26 });
    p.knob(cx, hM * 0.78, Math.min(0.012, hM * 0.14));
  });
  // buttons along the FCU
  for (let i = 0; i < 6; i++) {
    const bx = x0 + cw * (0.06 + i * 0.176);
    p.pushButton(bx, hM * 0.78, 0.014, '', ['AP1', 'AP2', 'A/THR', 'LOC', 'EXPED', 'APPR'][i], i === 0 || i === 2 ? 'green' : null);
  }
  // EFIS control panels
  for (const side of [-1, 1]) {
    const ew = Math.min(0.2, wM * 0.13);
    const ex = side < 0 ? 0.035 : wM - 0.035 - ew;
    p.module(ex, 0.004, ew, hM - 0.008, '', { color: style.panel });
    p.knob(ex + ew * 0.2, hM * 0.55, 0.011, undefined, { ticks: 5 });
    p.knob(ex + ew * 0.55, hM * 0.55, 0.011, undefined, { ticks: 5 });
    p.window(ex + ew * 0.85, hM * 0.3, 0.035, hM * 0.2);
    for (let i = 0; i < 5; i++) p.pushButton(ex + ew * (0.12 + i * 0.19), hM * 0.18, 0.011, '', ['CSTR', 'WPT', 'VOR', 'NDB', 'ARPT'][i]);
    // master warning / caution lights at the outboard ends
    const mx = side < 0 ? 0.016 : wM - 0.016;
    p.annunciator(mx, hM * 0.35, 0.022, 0.016, 'WARN', '#ff3b30', false);
    p.annunciator(mx, hM * 0.7, 0.022, 0.016, 'CAUT', '#ffb000', false);
  }
  p.done();
  return { rect, windows };
}

// Main instrument panel face around the displays.
export function paintMainPanel(atlas, wM, hM, style, maker, displays, seed = 13, px = 2030) {
  const rect = atlas.alloc(px, Math.round((px * hM) / wM));
  const p = new Painter(atlas, rect, wM, hM, style, seed);
  p.base();
  // modules behind each display group
  p.module(0.004, 0.004, wM - 0.008, hM - 0.008, '');
  for (const d of displays) {
    const x = wM / 2 + d.x, y = d.y;
    const bw = d.w + 0.03, bh = d.h + 0.03;
    p.a.fillStyle = '#16181a';
    p.a.fillRect(x - bw / 2, y - bh / 2, bw, bh);
    p.a.strokeStyle = 'rgba(255,255,255,0.06)';
    p.a.lineWidth = p.px(1.5);
    p.a.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
    // brightness knob under each display
    p.knob(x + bw / 2 - 0.012, y + bh / 2 + 0.012, 0.005);
    if (d.label) p.label(d.label, x - bw / 2 + 0.02, y + bh / 2 + 0.011, 0.0055);
  }
  // autobrake + gear area on the centre panel, clocks at each side
  const cx = wM / 2;
  const lowY = hM - 0.04;
  if (maker === 'airbus') {
    ['LO', 'MED', 'MAX'].forEach((t, i) => p.pushButton(cx - 0.05 + i * 0.05, lowY, 0.022, 'DECEL', t));
    p.label('AUTO/BRK', cx, lowY - 0.022, 0.006);
  } else if (maker === 'boeing') {
    p.knob(cx - 0.04, lowY, 0.012, undefined, { ticks: 6 });
    p.label('AUTO BRAKE', cx - 0.04, lowY - 0.024, 0.006);
    p.annunciator(cx + 0.03, lowY, 0.04, 0.014, 'AUTOBRAKE', '#ffb000', false);
  }
  for (const side of [-1, 1]) {
    const gx = cx + side * (wM / 2 - 0.05);
    p.gauge(gx, 0.3, 0.02, { label: 'CLOCK', ticks: 12 });
    p.annunciator(gx - side * 0.06, 0.02, 0.05, 0.014, side < 0 ? 'MASTER WARN' : 'MASTER CAUT', side < 0 ? '#ff3b30' : '#ffb000', false);
  }
  p.done();
  return rect;
}

// Centre pedestal top: CDU keyboards, the thrust-lever quadrant gate, radio
// panels, engine masters and trim.
export function paintPedestal(atlas, wM, hM, style, maker, seed = 17, px = 460) {
  const rect = atlas.alloc(px, Math.round((px * hM) / wM));
  const p = new Painter(atlas, rect, wM, hM, style, seed);
  p.base();
  const cdus = [];
  // two CDU keyboards at the forward end
  const cduW = (wM - 0.03) / 2, cduH = Math.min(0.24, hM * 0.3);
  for (let i = 0; i < 2; i++) {
    const x = 0.01 + i * (cduW + 0.01), y = 0.01;
    p.module(x, y, cduW, cduH, '', { color: '#2d3236' });
    const sw = cduW * 0.72, sh = cduH * 0.38;
    p.window(x + cduW / 2, y + 0.012 + sh / 2, sw, sh);
    cdus.push({ x: x + cduW / 2 - wM / 2, y: y + 0.012 + sh / 2, w: sw, h: sh });
    for (let k = 0; k < 6; k++) for (const s of [0, 1]) p.keypad(x + (s ? cduW - 0.014 : 0.005), y + 0.016 + k * (sh / 6), 1, 1, 0.009, sh / 6 - 0.004, 0);
    p.keypad(x + 0.012, y + sh + 0.024, 6, 2, (cduW - 0.03) / 6 - 0.003, 0.012, 0.003, ['INIT', 'REF', 'RTE', 'LEGS', 'HOLD', 'PROG', 'MENU', 'PERF', 'DIR', 'FIX', 'N1', 'EXEC']);
    p.keypad(x + 0.012, y + sh + 0.058, 3, 4, 0.016, 0.011, 0.003, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '+/-']);
    p.keypad(x + 0.075, y + sh + 0.058, 5, 4, 0.012, 0.011, 0.003, 'ABCDEFGHIJKLMNOPQRST'.split(''));
  }
  // thrust lever quadrant gate
  const qy = cduH + 0.03, qh = Math.min(0.26, hM * 0.33);
  p.module(0.01, qy, wM - 0.02, qh, maker === 'airbus' ? '' : 'THRUST', { color: style.sub });
  const marks = maker === 'airbus' ? ['TOGA', 'FLX MCT', 'CL', '0', 'REV'] : ['FWD', '', 'IDLE', '', 'REV'];
  marks.forEach((t, i) => {
    const y = qy + 0.025 + (i / (marks.length - 1)) * (qh - 0.05);
    p.rule(0.02, y, 0.045, y);
    p.rule(wM - 0.045, y, wM - 0.02, y);
    if (t) {
      p.label(t, 0.055, y, 0.0058, { align: 'left' });
    }
  });
  p.a.fillStyle = '#0b0c0d';
  p.a.fillRect(wM * 0.3, qy + 0.02, wM * 0.4, qh - 0.04);
  // engine masters / fuel control switches and radio panels further aft
  const ry = qy + qh + 0.012;
  p.module(0.01, ry, wM - 0.02, 0.07, 'ENG');
  for (let i = 0; i < 2; i++) {
    p.knob(wM * (0.35 + i * 0.3), ry + 0.04, 0.011, 0, { color: '#c62b1f', light: '#ff6a5a' });
    p.label(`MASTER ${i + 1}`, wM * (0.35 + i * 0.3), ry + 0.062, 0.0055);
  }
  for (let i = 0; i < 2; i++) {
    const y = ry + 0.08 + i * 0.075;
    if (y + 0.07 > hM) break;
    p.module(0.01, y, wM - 0.02, 0.07, i ? 'AUDIO CONTROL' : 'RADIO MANAGEMENT');
    p.window(wM * 0.3, y + 0.028, 0.07, 0.016);
    p.window(wM * 0.7, y + 0.028, 0.07, 0.016);
    for (let k = 0; k < 7; k++) p.pushButton(0.03 + k * ((wM - 0.06) / 6), y + 0.054, 0.012, '', ['VHF1', 'VHF2', 'VHF3', 'HF1', 'HF2', 'NAV', 'ADF'][k]);
  }
  p.done();
  return { rect, cdus };
}

// Side console (sidestick / tiller side) and rear bulkhead with breakers.
export function paintConsole(atlas, wM, hM, style, kind, seed = 19, px = 380) {
  const rect = atlas.alloc(px, Math.round((px * hM) / wM));
  const p = new Painter(atlas, rect, wM, hM, style, seed);
  p.base(kind === 'bulkhead' ? style.trim : style.panel);
  if (kind === 'bulkhead') {
    // circuit breaker panels
    for (let m = 0; m < 3; m++) {
      const y = 0.02 + m * (hM / 3);
      p.module(0.02, y, wM - 0.04, hM / 3 - 0.03, ['ELEC', 'AVIONICS', 'FLT CTL'][m], { color: style.panel });
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < Math.floor((wM - 0.06) / 0.022); c++) {
          const x = 0.035 + c * 0.022, yy = y + 0.03 + r * ((hM / 3 - 0.06) / 4);
          p.a.fillStyle = '#121314';
          p.a.beginPath(); p.a.arc(x, yy, 0.0055, 0, Math.PI * 2); p.a.fill();
          p.a.fillStyle = p.r() < 0.1 ? '#e7e7e0' : '#2a2c2e';
          p.a.beginPath(); p.a.arc(x, yy, 0.0035, 0, Math.PI * 2); p.a.fill();
        }
      }
    }
  } else {
    const rows = Math.max(2, Math.floor(hM / 0.11));
    for (let r = 0; r < rows; r++) {
      const y = 0.01 + r * (hM / rows);
      const title = ['OXYGEN', 'LIGHTING', 'CPDLC', 'STEERING', 'MIC', 'TABLE'][Math.floor(p.r() * 6)];
      p.module(0.01, y, wM - 0.02, hM / rows - 0.016, title);
      for (let i = 0; i < 3; i++) {
        const x = wM * (0.25 + i * 0.25), yy = y + hM / rows * 0.55;
        if (p.r() < 0.5) p.knob(x, yy, 0.009, undefined, { ticks: 4 });
        else p.toggle(x, yy, 0.008);
      }
    }
  }
  p.done();
  return rect;
}

// Fighter side consoles: dense modules of knobs, toggles and keypads.
const FIGHTER_LEFT = ['FUEL', 'EXT LIGHTING', 'COMM 1', 'COMM 2', 'AUDIO', 'FLT CONTROL', 'TEST', 'ANTI-G', 'ENG CONTROL', 'IFF'];
const FIGHTER_RIGHT = ['SNSR PWR', 'HUD', 'AVIONICS', 'OXYGEN', 'INTR LT', 'ENV CONT', 'EPU', 'ZEROIZE', 'KY-58', 'ELEC'];
export function paintFighterConsole(atlas, wM, hM, style, side, seed = 23) {
  const rect = atlas.alloc(256, Math.round((256 * hM) / wM));
  const p = new Painter(atlas, rect, wM, hM, style, seed + (side > 0 ? 50 : 0));
  p.base(style.sub);
  const titles = side < 0 ? FIGHTER_LEFT : FIGHTER_RIGHT;
  let y = 0.006, i = 0;
  while (y < hM - 0.05) {
    const h = 0.05 + Math.floor(p.r() * 3) * 0.018;
    const hh = Math.min(h, hM - y - 0.006);
    p.module(0.004, y, wM - 0.008, hh, titles[i++ % titles.length], { titleSize: 0.0065 });
    const n = 2 + Math.floor(p.r() * 3);
    for (let k = 0; k < n; k++) {
      const x = wM * ((k + 0.5) / n), yy = y + hh * 0.6;
      const t = p.r();
      if (t < 0.45) p.toggle(x, yy, 0.007, p.r() < 0.6);
      else if (t < 0.85) p.knob(x, yy, 0.0075, undefined, { ticks: 3 + Math.floor(p.r() * 3) });
      else p.window(x, yy, 0.025, 0.01);
    }
    y += hh + 0.004;
  }
  p.done();
  return rect;
}
