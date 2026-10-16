// 3D cockpit interiors shown in the cockpit camera: instrument panel with live
// multi-function displays (radar, stores, engine, targeting-pod video),
// glare shield, HUD combiner, consoles, stick and throttle for fighters; a
// glass flight deck with PFD / ND / engine displays, yokes or sidesticks,
// throttle quadrant and windshield frame for airliners.
import * as THREE from 'three';
import { sampleSection } from './geometry.js';

const MONO = '"Share Tech Mono", Consolas, monospace';
const GREEN = '#6dff9a';
const AMBER = '#ffbf47';
const CYAN = '#5ee0ff';
const RED = '#ff5a48';
const WHITE = '#e8f1ee';
const MAGENTA = '#ff6ad5';

// Monochrome targeting-pod video for the centre display.
const tgpVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
`;
export const tgpFragment = /* glsl */ `
  uniform sampler2D tVideo;
  uniform float uTime;
  uniform float uMode; // 0 TV (green), 1 white-hot IR
  varying vec2 vUv;
  float hash( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
  void main() {
    vec3 c = texture2D( tVideo, vUv ).rgb;
    c = c / ( 1.0 + c ); // HDR -> display
    float l = dot( c, vec3( 0.3, 0.59, 0.11 ) );
    l = pow( clamp( l * 1.5, 0.0, 1.0 ), 0.9 );
    if ( uMode > 0.5 ) l = 1.0 - l * 0.85;
    l += ( hash( vUv * 400.0 + uTime ) - 0.5 ) * 0.06;
    l *= 0.92 + 0.08 * sin( vUv.y * 600.0 );
    vec3 col = uMode > 0.5 ? vec3( l ) : vec3( l * 0.55, l * 1.0, l * 0.62 );
    float vig = smoothstep( 0.75, 0.35, length( vUv - 0.5 ) );
    gl_FragColor = vec4( col * ( 0.6 + 0.4 * vig ), 1.0 );
  }
`;

export function makeTgpMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { tVideo: { value: null }, uTime: { value: 0 }, uMode: { value: 0 } },
    vertexShader: tgpVertex,
    fragmentShader: tgpFragment,
    toneMapped: false,
  });
}

class Screen {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false });
  }

  commit() { this.tex.needsUpdate = true; }

  dispose() {
    this.tex.dispose();
    this.mat.dispose();
  }
}

function bezel(ctx, x, y, w, h, label) {
  ctx.fillStyle = '#16191c';
  ctx.fillRect(x - 10, y - 10, w + 20, h + 20);
  ctx.strokeStyle = '#3a4046';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 10, y - 10, w + 20, h + 20);
  // push buttons around the bezel
  ctx.fillStyle = '#2c3136';
  for (let i = 0; i < 5; i++) {
    const bx = x + (w / 5) * (i + 0.5) - 9;
    ctx.fillRect(bx, y - 9, 18, 6);
    ctx.fillRect(bx, y + h + 3, 18, 6);
  }
  ctx.fillStyle = '#020604';
  ctx.fillRect(x, y, w, h);
  if (label) {
    ctx.fillStyle = '#7d8790';
    ctx.font = `13px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h + 24);
  }
}

function heading(q) {
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  return (Math.atan2(f.x, -f.z) + Math.PI * 2) % (Math.PI * 2);
}

// ---------------------------------------------------------------------------
// Fighter cockpit
// ---------------------------------------------------------------------------
const SIDESTICK = ['f16', 'f22', 'f35', 'rafale'];
const ONE_PIECE = ['f16', 'f22', 'f35', 'j20', 'su57'];

class FighterCockpit {
  constructor(model) {
    this.model = model;
    const spec = model.spec;
    const eye = model.eye;
    const info = model.canopyInfo;
    const c = info ? info.c : { w: 0.42, h: 0.6, y: eye.y - 0.5, frameAt: 0 };
    const group = new THREE.Group();
    group.name = 'cockpit';
    group.visible = false;
    this.group = group;
    this.mats = [];
    const mat = (o) => {
      const m = new THREE.MeshStandardMaterial(o);
      this.mats.push(m);
      return m;
    };
    const matte = mat({ color: 0x1b1e21, roughness: 0.92, metalness: 0.1 });
    const grey = mat({ color: 0x3a3f44, roughness: 0.75, metalness: 0.2 });
    const suit = mat({ color: 0x4d5538, roughness: 0.95 });
    const black = mat({ color: 0x0c0d0e, roughness: 0.6, metalness: 0.3 });
    const yellow = mat({ color: 0xd8b02a, roughness: 0.6 });
    const addMesh = (geo, m, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };

    const halfW = Math.min(0.42, c.w * 0.92);
    const pw = halfW * 1.9, ph = 0.32;
    const panelZ = eye.z - 0.62, panelY = eye.y - 0.31;
    // instrument panel with live displays
    this.screen = new Screen(1024, 400);
    const panel = addMesh(new THREE.PlaneGeometry(pw, ph), this.screen.mat, 0, panelY, panelZ);
    panel.rotation.x = -0.3;
    this.panel = panel;
    // targeting pod video over the centre display (fraction 0.385..0.615 of width)
    this.tgpMat = makeTgpMaterial();
    const tgp = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.2, ph * 0.5), this.tgpMat);
    tgp.position.set(0, ph * 0.08, 0.004);
    tgp.visible = false;
    panel.add(tgp);
    this.tgp = tgp;
    // glare shield hood over the panel
    const hood = new THREE.CylinderGeometry(pw * 0.5, pw * 0.5, 0.16, 20, 1, true, -Math.PI / 2, Math.PI);
    hood.rotateX(Math.PI / 2);
    hood.scale(1, 0.08, 1);
    const hoodMesh = addMesh(hood, matte, 0, panelY + ph * 0.48, panelZ - 0.07);
    hoodMesh.material.side = THREE.DoubleSide;
    // HUD combiner: two posts and a tinted glass plate
    const hudZ = eye.z - 0.6, hudY = eye.y - 0.14;
    for (const sx of [-1, 1]) addMesh(new THREE.BoxGeometry(0.012, 0.16, 0.02), black, sx * 0.085, hudY - 0.02, hudZ);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x5aa07a, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
    this.mats.push(glassMat);
    const combiner = addMesh(new THREE.PlaneGeometry(0.17, 0.14), glassMat, 0, hudY + 0.04, hudZ - 0.01);
    combiner.rotation.x = 0.3;
    addMesh(new THREE.BoxGeometry(0.2, 0.05, 0.12), black, 0, hudY - 0.1, hudZ + 0.02);
    // side consoles
    this.consoleScreen = new Screen(512, 256);
    this._drawConsoles();
    for (const sx of [-1, 1]) {
      const cx = sx * (halfW * 0.95);
      const box = addMesh(new THREE.BoxGeometry(0.2, 0.18, 0.62), grey, cx, eye.y - 0.72, eye.z - 0.02);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.62), this.consoleScreen.mat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.091;
      box.add(top);
    }
    // canopy sill rails and (for framed canopies) the windscreen bow
    if (info) {
      for (const sx of [-1, 1]) addMesh(new THREE.BoxGeometry(0.05, 0.05, info.cl * 0.8), matte, sx * c.w * 0.97, c.y + 0.03, info.cz0 + info.cl * 0.55);
      if (c.frameAt > 0 && !ONE_PIECE.includes(spec.id)) {
        // windscreen arch well ahead of the pilot's eye
        const z = Math.max(info.cz0 + info.cl * 0.18, Math.min(info.cz0 + info.cl * 0.32, eye.z - 0.85));
        const sec = sampleSection(info.canopySecs, z);
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const th = (i / 16) * Math.PI;
          pts.push(new THREE.Vector3(Math.cos(th) * sec.w * 0.985, sec.y + Math.sin(th) * sec.top * 0.985, z));
        }
        addMesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.022, 6, false), matte, 0, 0, 0);
      }
      // faint reflections on the inside of the canopy
      const innerMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c4, roughness: 0.04, metalness: 1, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.BackSide });
      this.mats.push(innerMat);
      const inner = new THREE.Mesh(model.canopy.geometry, innerMat);
      inner.renderOrder = 6;
      group.add(inner);
    }
    // stick: centre or side-mounted
    this.stick = new THREE.Group();
    const side = SIDESTICK.includes(spec.id);
    this.stick.position.set(side ? halfW * 0.95 : 0, side ? eye.y - 0.62 : eye.y - 0.92, side ? eye.z - 0.12 : eye.z - 0.36);
    addMesh(new THREE.CylinderGeometry(0.014, 0.018, side ? 0.08 : 0.36, 8), black, 0, side ? 0.04 : 0.18, 0, this.stick);
    const grip = addMesh(new THREE.CapsuleGeometry(0.024, 0.07, 4, 8), black, 0, side ? 0.11 : 0.38, 0, this.stick);
    grip.rotation.x = -0.25;
    addMesh(new THREE.BoxGeometry(0.012, 0.012, 0.012), yellow, 0, side ? 0.155 : 0.43, -0.015, this.stick);
    group.add(this.stick);
    // throttle on the left console
    this.throttle = new THREE.Group();
    this.throttle.position.set(-halfW * 0.95, eye.y - 0.62, eye.z - 0.05);
    addMesh(new THREE.BoxGeometry(0.03, 0.12, 0.03), black, 0, 0.05, 0, this.throttle);
    addMesh(new THREE.BoxGeometry(0.05, 0.05, 0.07), black, 0, 0.12, -0.01, this.throttle);
    group.add(this.throttle);
    // legs
    for (const sx of [-1, 1]) {
      const legGeo = new THREE.CapsuleGeometry(0.075, 0.42, 4, 8);
      const leg = addMesh(legGeo, suit, sx * 0.12, eye.y - 0.8, eye.z - 0.2);
      leg.rotation.x = Math.PI / 2 - 0.25;
    }
    this.t = 0;
    this.redraw = 0;
    this.sweep = 0;
  }

  _drawConsoles() {
    const ctx = this.consoleScreen.ctx;
    ctx.fillStyle = '#2b3035';
    ctx.fillRect(0, 0, 512, 256);
    ctx.strokeStyle = '#151719';
    ctx.lineWidth = 3;
    for (let i = 0; i < 4; i++) ctx.strokeRect(8, 8 + i * 62, 496, 56);
    ctx.fillStyle = '#c9d0d6';
    ctx.font = `14px ${MONO}`;
    const labels = ['FUEL', 'ECM', 'RADIO', 'LIGHTS', 'OXY', 'EXT', 'MODE', 'IFF'];
    for (let i = 0; i < 16; i++) {
      const x = 30 + (i % 8) * 60, y = 26 + Math.floor(i / 8) * 124;
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(x, y + 12, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#9aa3aa';
      ctx.fillText(labels[i % 8], x - 18, y + 40);
    }
    this.consoleScreen.commit();
  }

  update(dt, ctx) {
    this.t += dt;
    const ac = this.model;
    const p = ctx.ac;
    // stick and throttle follow the controls
    const cc = p.controls;
    this.stick.rotation.set((cc.pitch || 0) * 0.28, 0, -(cc.roll || 0) * 0.28);
    this.throttle.rotation.x = -(p.fm.throttle - 0.5) * 0.6;
    // targeting pod video
    const tgpTex = ctx.tgpTexture;
    this.tgp.visible = !!tgpTex;
    if (tgpTex) {
      this.tgpMat.uniforms.tVideo.value = tgpTex;
      this.tgpMat.uniforms.uTime.value = this.t;
    }
    this.redraw -= dt;
    if (this.redraw > 0) return;
    this.redraw = 0.1;
    this.sweep = (this.sweep + 0.1 * 1.4) % 2;
    this._drawPanel(ctx, !!tgpTex);
    void ac;
  }

  _drawPanel(g, tgpOn) {
    const s = this.screen;
    const ctx = s.ctx;
    const W = s.canvas.width, H = s.canvas.height;
    const p = g.ac;
    const fm = p.fm;
    ctx.fillStyle = '#25292d';
    ctx.fillRect(0, 0, W, H);
    // left: radar
    const m = 70, dw = 250, dh = 220, dy = 60;
    bezel(ctx, m, dy, dw, dh, 'RDR  A/A');
    this._radar(ctx, m, dy, dw, dh, g);
    // right: stores / engine
    const rx = W - m - dw;
    bezel(ctx, rx, dy, dw, dh, 'SMS  ENG');
    this._stores(ctx, rx, dy, dw, dh, p);
    // centre: TGP / UFC
    const cw = W * 0.2, cx = W / 2 - cw / 2, ch = H * 0.5, cy = H * 0.5 - ch / 2 - H * 0.08;
    bezel(ctx, cx, cy, cw, ch, tgpOn ? 'TGP  TV' : 'HSI');
    if (!tgpOn) this._hsi(ctx, cx, cy, cw, ch, p, g);
    // up-front readouts
    ctx.font = `20px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = GREEN;
    const kts = Math.round(fm.ias * 1.944), alt = Math.round(p.position.y * 3.281);
    ctx.fillText(`${kts} KT   M${fm.mach.toFixed(2)}   ${alt} FT`, W / 2, 36);
    // caution lights row
    const warns = g.warnings || {};
    const lights = [['MSL', warns.missile, RED], ['PULL UP', warns.pullup, RED], ['LOCK', warns.radar, AMBER], ['STALL', warns.stall, AMBER], ['AB', fm.afterburner > 0.05, AMBER], ['GEAR', p.controls.gear, GREEN]];
    lights.forEach(([label, on, col], i) => {
      const lx = 90 + i * ((W - 180) / 5), ly = H - 40;
      ctx.fillStyle = on ? col : '#2f3439';
      ctx.fillRect(lx - 46, ly - 16, 92, 26);
      ctx.fillStyle = on ? '#111' : '#606870';
      ctx.font = `bold 15px ${MONO}`;
      ctx.fillText(label, lx, ly + 3);
    });
    s.commit();
  }

  _radar(ctx, x, y, w, h, g) {
    const p = g.ac;
    const cx = x + w / 2, by = y + h - 12;
    const R = h - 24;
    const range = 20000;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.strokeStyle = 'rgba(109,255,154,0.35)';
    ctx.lineWidth = 1;
    for (const k of [0.33, 0.66, 1]) {
      ctx.beginPath();
      ctx.arc(cx, by, R * k, -Math.PI * 0.82, -Math.PI * 0.18);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, by); ctx.lineTo(cx + Math.cos(-Math.PI * 0.82) * R, by + Math.sin(-Math.PI * 0.82) * R);
    ctx.moveTo(cx, by); ctx.lineTo(cx + Math.cos(-Math.PI * 0.18) * R, by + Math.sin(-Math.PI * 0.18) * R);
    ctx.stroke();
    // sweeping scan line
    const sw = this.sweep < 1 ? this.sweep : 2 - this.sweep;
    const sa = -Math.PI * 0.82 + sw * Math.PI * 0.64;
    ctx.strokeStyle = 'rgba(109,255,154,0.7)';
    ctx.beginPath(); ctx.moveTo(cx, by); ctx.lineTo(cx + Math.cos(sa) * R, by + Math.sin(sa) * R); ctx.stroke();
    const hd = heading(p.quaternion);
    const cs = Math.cos(hd), sn = Math.sin(hd);
    const tgt = g.targeting ? g.targeting.target : null;
    for (const a of g.battle.aircraft) {
      if (a === p || !a.alive || a.dying) continue;
      const dx = a.position.x - p.position.x, dz = a.position.z - p.position.z;
      const right = dx * cs + dz * sn;
      const along = dx * sn - dz * cs;
      if (along <= 0) continue;
      const dist = Math.hypot(right, along);
      if (dist > range) continue;
      const ang = Math.atan2(right, along);
      if (Math.abs(ang) > Math.PI * 0.32) continue;
      const r = (dist / range) * R;
      const px = cx + Math.sin(ang) * r, py = by - Math.cos(ang) * r;
      ctx.fillStyle = a.team === 'civil' ? WHITE : a.team === p.team ? CYAN : RED;
      ctx.fillRect(px - 5, py - 4, 10, 8);
      if (a === tgt) {
        ctx.strokeStyle = AMBER;
        ctx.lineWidth = 2;
        ctx.strokeRect(px - 9, py - 8, 18, 16);
        ctx.lineWidth = 1;
      }
    }
    ctx.restore();
    ctx.fillStyle = GREEN;
    ctx.font = `14px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillText('20', x + 6, y + 18);
    ctx.textAlign = 'right';
    ctx.fillText('RWS', x + w - 6, y + 18);
  }

  _stores(ctx, x, y, w, h, p) {
    const cx = x + w / 2;
    // top-down aircraft silhouette
    ctx.strokeStyle = 'rgba(109,255,154,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, y + 18); ctx.lineTo(cx + 12, y + 70); ctx.lineTo(cx + 80, y + 108); ctx.lineTo(cx + 80, y + 120);
    ctx.lineTo(cx + 14, y + 112); ctx.lineTo(cx + 30, y + 146); ctx.lineTo(cx - 30, y + 146); ctx.lineTo(cx - 14, y + 112);
    ctx.lineTo(cx - 80, y + 120); ctx.lineTo(cx - 80, y + 108); ctx.lineTo(cx - 12, y + 70); ctx.closePath();
    ctx.stroke();
    const total = p.spec.weapons.missiles;
    const n = Math.min(8, total);
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, k = Math.floor(i / 2);
      const live = i < Math.round((p.missiles / Math.max(1, total)) * n);
      ctx.fillStyle = live ? GREEN : '#244a31';
      ctx.fillRect(cx + side * (28 + k * 14) - 3, y + 92 + k * 4, 6, 22);
    }
    ctx.font = `16px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = GREEN;
    ctx.fillText(`MSL ${p.missiles}`, x + 10, y + 176);
    ctx.fillText(`GUN ${p.gunAmmo}`, x + 10, y + 198);
    ctx.textAlign = 'right';
    ctx.fillStyle = p.flares > 0 ? GREEN : AMBER;
    ctx.fillText(`CHAFF/FLR ${p.flares}`, x + w - 10, y + 176);
    const rpm = Math.round(60 + p.fm.throttle * 40);
    ctx.fillStyle = p.fm.afterburner > 0.05 ? AMBER : GREEN;
    ctx.fillText(`RPM ${rpm}%  NOZ ${Math.round(p.fm.afterburner * 100)}`, x + w - 10, y + 198);
    const hp = p.health / p.maxHealth;
    ctx.fillStyle = hp > 0.5 ? GREEN : hp > 0.25 ? AMBER : RED;
    ctx.fillText(`HYD ${Math.round(hp * 100)}%`, x + w - 10, y + 22);
  }

  _hsi(ctx, x, y, w, h, p, g) {
    const cx = x + w / 2, cy = y + h / 2 + 6, R = Math.min(w, h) * 0.4;
    const hd = heading(p.quaternion);
    ctx.strokeStyle = GREEN;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = GREEN;
    ctx.font = `12px ${MONO}`;
    ctx.textAlign = 'center';
    for (let d = 0; d < 360; d += 30) {
      const a = (d * Math.PI) / 180 - hd - Math.PI / 2;
      ctx.fillText(d === 0 ? 'N' : d === 90 ? 'E' : d === 180 ? 'S' : d === 270 ? 'W' : String(d / 10), cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12) + 4);
    }
    // bearing to the airbase
    const ab = g.battle.map.airbase;
    const brg = Math.atan2(ab.x - p.position.x, -(ab.z - p.position.z));
    const a = brg - hd - Math.PI / 2;
    ctx.strokeStyle = CYAN;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85); ctx.stroke();
    ctx.fillStyle = WHITE;
    ctx.fillText(String(Math.round((hd * 180) / Math.PI)).padStart(3, '0'), cx, y + 16);
  }

  dispose() {
    this.screen.dispose();
    this.consoleScreen.dispose();
    this.tgpMat.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => { if (o.isMesh && o.geometry && o.geometry !== this.model.canopy?.geometry) o.geometry.dispose(); });
  }
}

// ---------------------------------------------------------------------------
// Airliner flight deck
// ---------------------------------------------------------------------------
class AirlinerCockpit {
  constructor(model) {
    this.model = model;
    const spec = model.spec;
    const d = spec.design;
    const eye = model.eye;
    const group = new THREE.Group();
    group.name = 'flightdeck';
    group.visible = false;
    this.group = group;
    this.mats = [];
    const mat = (o) => {
      const m = new THREE.MeshStandardMaterial(o);
      this.mats.push(m);
      return m;
    };
    const wall = mat({ color: 0x8c9096, roughness: 0.85, side: THREE.DoubleSide });
    const darkGrey = mat({ color: 0x2b2f34, roughness: 0.8, side: THREE.DoubleSide });
    const black = mat({ color: 0x111213, roughness: 0.6, metalness: 0.2 });
    const seatMat = mat({ color: 0x3b3f46, roughness: 0.95 });
    const addMesh = (geo, m, x, y, z, parent = group) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      parent.add(mesh);
      return mesh;
    };
    // flight deck width from the fuselage (or upper-deck hump) section
    const secs = d.hump ? d.hump.sections : d.fuselage;
    const sec = sampleSection(secs, d.pilotEye.z);
    const hw = Math.max(1.0, Math.min(sec.w * 0.9, 1.9));
    const ys = eye.y - 0.24, yh = eye.y + 0.44, floorY = eye.y - 1.2;
    const zw = eye.z - 1.15;
    // main instrument panel
    this.screen = new Screen(2048, 400);
    const pw = hw * 1.7, ph = 0.42;
    const panel = addMesh(new THREE.PlaneGeometry(pw, ph), this.screen.mat, 0, eye.y - 0.5, eye.z - 0.92);
    panel.rotation.x = -0.25;
    this.panelW = pw;
    // glare shield with the autopilot panel
    this.fcu = new Screen(1024, 64);
    const gs = addMesh(new THREE.BoxGeometry(pw, 0.07, 0.34), black, 0, eye.y - 0.27, eye.z - 1.05);
    const fcuFace = new THREE.Mesh(new THREE.PlaneGeometry(pw * 0.6, 0.06), this.fcu.mat);
    fcuFace.position.set(0, 0, 0.171);
    gs.add(fcuFace);
    this._drawFcu();
    // sill walls, posts and header (the windows are the gaps between them)
    addMesh(new THREE.BoxGeometry(hw * 2, ys - floorY, 0.05), darkGrey, 0, (ys + floorY) / 2, zw + 0.05);
    for (const sx of [-1, 1]) {
      const sideWall = addMesh(new THREE.BoxGeometry(0.05, ys - floorY, 2.4), wall, sx * hw, (ys + floorY) / 2, eye.z - 0.1);
      sideWall.castShadow = false;
      // window posts: windshield corner, side window divider, rear
      for (const [z, w] of [[zw + 0.15, 0.09], [eye.z - 0.25, 0.07], [eye.z + 0.75, 0.12]]) {
        addMesh(new THREE.BoxGeometry(0.06, yh - ys, w), darkGrey, sx * (hw - 0.02), (ys + yh) / 2, z);
      }
      // slanted windshield corner post
      const post = addMesh(new THREE.BoxGeometry(0.06, (yh - ys) * 1.08, 0.07), darkGrey, sx * hw * 0.82, (ys + yh) / 2, zw + 0.3);
      post.rotation.x = -0.45;
      post.rotation.z = sx * 0.12;
    }
    const centre = addMesh(new THREE.BoxGeometry(0.07, (yh - ys) * 1.08, 0.07), darkGrey, 0, (ys + yh) / 2, zw + 0.3);
    centre.rotation.x = -0.45;
    addMesh(new THREE.BoxGeometry(hw * 2, 0.12, 0.25), darkGrey, 0, yh + 0.02, zw + 0.5);
    // ceiling with the overhead panel
    this.overhead = new Screen(512, 512);
    this._drawOverhead();
    const ceil = addMesh(new THREE.PlaneGeometry(hw * 1.9, 1.7), wall, 0, yh + 0.12, eye.z + 0.15);
    ceil.rotation.x = Math.PI / 2;
    const ovh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), this.overhead.mat);
    ovh.position.set(0, 0, -0.005);
    ovh.rotation.y = Math.PI;
    ceil.add(ovh);
    addMesh(new THREE.BoxGeometry(hw * 2, 0.05, 2.6), darkGrey, 0, floorY, eye.z);
    addMesh(new THREE.BoxGeometry(hw * 2, yh - floorY, 0.05), wall, 0, (yh + floorY) / 2, eye.z + 1.3);
    // centre pedestal with thrust levers
    addMesh(new THREE.BoxGeometry(0.34, 0.3, 0.9), black, 0, eye.y - 0.85, eye.z - 0.35);
    this.levers = [];
    const nEng = (d.pods || []).reduce((n, p) => n + (p.x !== 0 ? 2 : 1), 0) + (d.nacelleBoxes ? 4 : 0);
    const n = Math.max(2, Math.min(4, nEng || 2));
    for (let i = 0; i < n; i++) {
      const lv = new THREE.Group();
      lv.position.set((i - (n - 1) / 2) * 0.06, eye.y - 0.7, eye.z - 0.45);
      addMesh(new THREE.BoxGeometry(0.02, 0.16, 0.02), black, 0, 0.08, 0, lv);
      addMesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), mat({ color: 0xd9dde2, roughness: 0.5 }), 0, 0.17, 0, lv);
      group.add(lv);
      this.levers.push(lv);
    }
    // control yokes (Boeing) or sidesticks (Airbus / Concorde style)
    const yoke = spec.id.startsWith('b') || spec.id === 'concorde' || spec.id === 'an124';
    this.yokes = [];
    for (const sx of [-1, 1]) {
      const x = sx * Math.abs(eye.x || 0.5);
      const grp = new THREE.Group();
      if (yoke) {
        grp.position.set(x, floorY + 0.05, eye.z - 0.5);
        addMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.6, 8), black, 0, 0.3, 0, grp);
        const wheel = new THREE.Group();
        wheel.position.set(0, 0.62, 0.02);
        const arc = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.018, 6, 20, Math.PI * 1.1), black);
        arc.rotation.z = -Math.PI * 0.05 + Math.PI;
        wheel.add(arc);
        addMesh(new THREE.BoxGeometry(0.12, 0.05, 0.04), black, 0, 0, 0, wheel);
        grp.add(wheel);
        grp.userData.wheel = wheel;
      } else {
        grp.position.set(sx * (hw - 0.22), eye.y - 0.6, eye.z - 0.1);
        addMesh(new THREE.BoxGeometry(0.16, 0.08, 0.3), black, 0, -0.04, 0, grp);
        addMesh(new THREE.CapsuleGeometry(0.022, 0.08, 4, 8), black, 0, 0.06, 0, grp);
      }
      group.add(grp);
      this.yokes.push(grp);
    }
    this.yokeStyle = yoke;
    // first officer's seat
    const fo = new THREE.Group();
    fo.position.set(Math.abs(eye.x || 0.5), floorY, eye.z + 0.35);
    addMesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), seatMat, 0, 0.5, 0, fo);
    addMesh(new THREE.BoxGeometry(0.5, 0.8, 0.1), seatMat, 0, 0.95, 0.25, fo);
    addMesh(new THREE.BoxGeometry(0.3, 0.2, 0.08), seatMat, 0, 1.45, 0.25, fo);
    group.add(fo);
    this.t = 0;
    this.redraw = 0;
  }

  _drawFcu() {
    const ctx = this.fcu.ctx;
    ctx.fillStyle = '#2a2e33';
    ctx.fillRect(0, 0, 1024, 64);
    ctx.font = `bold 22px ${MONO}`;
    ctx.textAlign = 'center';
    const items = [['SPD', '250'], ['HDG', '090'], ['ALT', '10000'], ['V/S', '----']];
    items.forEach(([l, v], i) => {
      const x = 130 + i * 250;
      ctx.fillStyle = '#9aa3aa';
      ctx.fillText(l, x - 60, 40);
      ctx.fillStyle = '#060a08';
      ctx.fillRect(x - 25, 14, 120, 36);
      ctx.fillStyle = AMBER;
      ctx.fillText(v, x + 35, 41);
    });
    this.fcu.commit();
  }

  _drawOverhead() {
    const ctx = this.overhead.ctx;
    ctx.fillStyle = '#5d636a';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#33383d';
    ctx.lineWidth = 3;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) ctx.strokeRect(10 + c * 166, 10 + r * 124, 158, 116);
    for (let i = 0; i < 60; i++) {
      const x = 30 + (i % 10) * 47, y = 30 + Math.floor(i / 10) * 80;
      ctx.fillStyle = '#1b1d20';
      ctx.fillRect(x - 12, y - 8, 24, 16);
      ctx.fillStyle = i % 7 === 0 ? '#3d8bff' : '#ffffff22';
      ctx.fillRect(x - 10, y - 6, 20, 5);
    }
    this.overhead.commit();
  }

  update(dt, g) {
    this.t += dt;
    const p = g.ac;
    const c = p.controls;
    for (const y of this.yokes) {
      if (this.yokeStyle) {
        y.rotation.x = -(c.pitch || 0) * 0.18;
        y.userData.wheel.rotation.z = -(c.roll || 0) * 0.9;
      } else y.rotation.set((c.pitch || 0) * 0.3, 0, -(c.roll || 0) * 0.3);
    }
    for (const lv of this.levers) lv.rotation.x = -(p.fm.throttle - 0.4) * 0.9;
    this.redraw -= dt;
    if (this.redraw > 0) return;
    this.redraw = 0.1;
    this._draw(g);
  }

  _draw(g) {
    const s = this.screen;
    const ctx = s.ctx;
    const W = s.canvas.width, H = s.canvas.height;
    ctx.fillStyle = '#4d535a';
    ctx.fillRect(0, 0, W, H);
    const dw = 270, dh = 270, y = 50;
    const xs = [70, 380, 760, 1020, 1400, 1710];
    const names = ['PFD', 'ND', 'EWD', 'SD', 'ND', 'PFD'];
    xs.forEach((x, i) => {
      bezel(ctx, x, y, dw, dh, names[i]);
      if (names[i] === 'PFD') this._pfd(ctx, x, y, dw, dh, g.ac);
      else if (names[i] === 'ND') this._nd(ctx, x, y, dw, dh, g);
      else if (names[i] === 'EWD') this._ewd(ctx, x, y, dw, dh, g.ac);
      else this._sd(ctx, x, y, dw, dh, g.ac);
    });
    s.commit();
  }

  _pfd(ctx, x, y, w, h, p) {
    const fm = p.fm;
    const att = fm.attitude(this._att || (this._att = {}));
    const cx = x + w / 2, cy = y + h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 50, y + 30, w - 100, h - 60);
    ctx.clip();
    ctx.translate(cx, cy);
    ctx.rotate((-att.roll * Math.PI) / 180);
    const py = att.pitch * 4;
    ctx.fillStyle = '#2f7fd8';
    ctx.fillRect(-300, -600 + py, 600, 600);
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(-300, py, 600, 600);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-300, py); ctx.lineTo(300, py); ctx.stroke();
    ctx.lineWidth = 1.5;
    for (let a = -30; a <= 30; a += 10) {
      if (!a) continue;
      ctx.beginPath(); ctx.moveTo(-25, py - a * 4); ctx.lineTo(25, py - a * 4); ctx.stroke();
    }
    ctx.restore();
    // aircraft symbol
    ctx.strokeStyle = '#ffd400';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(cx - 50, cy); ctx.lineTo(cx - 18, cy); ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + 50, cy); ctx.stroke();
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(cx - 4, cy - 4, 8, 8);
    // speed and altitude tapes
    ctx.fillStyle = '#1a1d22';
    ctx.fillRect(x + 4, y + 30, 44, h - 60);
    ctx.fillRect(x + w - 48, y + 30, 44, h - 60);
    ctx.font = `16px ${MONO}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = WHITE;
    ctx.fillText(String(Math.round(fm.ias * 1.944)), x + 26, cy + 6);
    ctx.fillText(String(Math.round(p.position.y * 3.281 / 10) * 10), x + w - 26, cy + 6);
    ctx.fillStyle = GREEN;
    ctx.font = `13px ${MONO}`;
    ctx.fillText(fm.onGround ? 'TOGA' : p.controls.gear ? 'FLAPS' : 'SPEED', x + 70, y + 20);
    ctx.fillText('ALT', x + w - 70, y + 20);
    ctx.fillStyle = CYAN;
    ctx.fillText(`M.${Math.round(fm.mach * 100)}`, x + 26, y + h - 12);
  }

  _nd(ctx, x, y, w, h, g) {
    const p = g.ac;
    const cx = x + w / 2, cy = y + h - 30, R = h - 60;
    const hd = heading(p.quaternion);
    ctx.strokeStyle = WHITE;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI * 0.85, -Math.PI * 0.15); ctx.stroke();
    ctx.font = `12px ${MONO}`;
    ctx.fillStyle = WHITE;
    ctx.textAlign = 'center';
    for (let dd = 0; dd < 360; dd += 10) {
      const a = (dd * Math.PI) / 180 - hd - Math.PI / 2;
      if (a < -Math.PI * 0.85 - 0.01 || a > -Math.PI * 0.15 + 0.01) {
        const a2 = a + Math.PI * 2;
        if (a2 < -Math.PI * 0.85 || a2 > -Math.PI * 0.15) continue;
      }
      if (dd % 30 === 0) ctx.fillText(String(dd / 10), cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12) + 4);
    }
    const range = 40000;
    const cs = Math.cos(hd), sn = Math.sin(hd);
    const plot = (wx, wz, col, size) => {
      const dx = wx - p.position.x, dz = wz - p.position.z;
      const right = dx * cs + dz * sn, along = dx * sn - dz * cs;
      const dist = Math.hypot(right, along);
      if (dist > range || along < -2000) return;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(cx + (right / range) * R, cy - (along / range) * R, size, 0, Math.PI * 2);
      ctx.fill();
    };
    const ab = g.battle.map.airbase;
    plot(ab.x, ab.z, MAGENTA, 6);
    for (const a of g.battle.aircraft) if (a !== p && a.alive) plot(a.position.x, a.position.z, a.team === 'civil' ? CYAN : a.team === p.team ? WHITE : RED, 4);
    ctx.fillStyle = '#ffd400';
    ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 8, cy + 6); ctx.lineTo(cx - 8, cy + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = GREEN;
    ctx.fillText(`HDG ${String(Math.round((hd * 180) / Math.PI)).padStart(3, '0')}`, cx, y + 20);
  }

  _ewd(ctx, x, y, w, h, p) {
    const n = Math.max(2, this.levers.length);
    const n1 = 22 + p.fm.throttle * 76;
    ctx.font = `14px ${MONO}`;
    ctx.textAlign = 'center';
    for (let i = 0; i < n; i++) {
      const cx = x + (w / n) * (i + 0.5), cy = y + 80, r = Math.min(38, (w / n) * 0.4);
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI * 0.8, Math.PI * 2.2); ctx.stroke();
      const a = Math.PI * 0.8 + (n1 / 110) * Math.PI * 1.4;
      ctx.strokeStyle = GREEN;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); ctx.stroke();
      ctx.fillStyle = GREEN;
      ctx.fillText(n1.toFixed(1), cx, cy + r + 18);
    }
    ctx.fillStyle = WHITE;
    ctx.fillText('N1 %', x + w / 2, y + 22);
    ctx.fillStyle = p.controls.gear ? GREEN : '#777';
    ctx.fillText(p.controls.gear ? 'FLAPS FULL  GEAR DN' : 'FLAPS UP  GEAR UP', x + w / 2, y + h - 50);
    ctx.fillStyle = p.fm.stallWarn ? RED : CYAN;
    ctx.fillText(p.fm.stallWarn ? 'STALL STALL' : 'NORMAL', x + w / 2, y + h - 24);
  }

  _sd(ctx, x, y, w, h, p) {
    ctx.font = `15px ${MONO}`;
    ctx.textAlign = 'left';
    const rows = [
      ['GW', `${Math.round(p.fm.mass / 1000)} T`],
      ['GS', `${Math.round(p.fm.airspeed * 1.944)} KT`],
      ['VS', `${Math.round(p.velocity.y * 196.85)} FPM`],
      ['G', p.fm.gLoad.toFixed(2)],
      ['AOA', `${((p.fm.alpha * 180) / Math.PI).toFixed(1)}`],
      ['BRK', p.controls.brakes ? 'ON' : 'OFF'],
    ];
    rows.forEach(([k, v], i) => {
      ctx.fillStyle = WHITE;
      ctx.fillText(k, x + 20, y + 40 + i * 34);
      ctx.fillStyle = GREEN;
      ctx.fillText(v, x + 110, y + 40 + i * 34);
    });
  }

  dispose() {
    this.screen.dispose();
    this.fcu.dispose();
    this.overhead.dispose();
    for (const m of this.mats) m.dispose();
    this.group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
  }
}

export function buildCockpit(model) {
  return model.airliner ? new AirlinerCockpit(model) : new FighterCockpit(model);
}
