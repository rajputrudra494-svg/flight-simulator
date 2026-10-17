// 3D cockpit interiors shown in the cockpit camera, built per aircraft from
// the layouts in cockpitProfiles.js.
//  - Airliners: a closed flight deck shaped from the nose section with the
//    real window layout cut into it (posts, frames, glass), V-shaped glare
//    shield with the autopilot panel, main panel with live PFD / ND / engine /
//    system displays (or animated analogue instruments on Concorde and the
//    An-124), backlit overhead panel, centre pedestal with CDUs and thrust
//    levers, side consoles, yokes or sidesticks and the first officer's seat.
//  - Fighters: instrument panel with the type's MFDs and standby gauges (or
//    full analogue panels on the older jets), glare-shield coaming and HUD,
//    side consoles, stick and throttle, legs, canopy frame, mirrors and the
//    tinted canopy glass.
// Everything is lit by CockpitLighting: sunlight only enters through the
// glass, panel legends glow with the integral lighting as the light fades.
import * as THREE from 'three';
import { sampleSection, mergeGeometries } from './geometry.js';
import { CockpitLighting, tintGeometry, windowSDF } from './cockpitMaterials.js';
import { PanelAtlas, Painter, STYLES, paintOverhead, paintGlareshield, paintMainPanel, paintPedestal, paintConsole, paintFighterConsole } from './cockpitPanels.js';
import { Display, AnalogPanel, updateDisplays, drawPFD, drawND, drawEngines, drawSystem, drawCDU, drawFCU, drawStandby, drawOIS, FIGHTER_PAGES } from './cockpitDisplays.js';
import { airlinerProfile, fighterProfile } from './cockpitProfiles.js';

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

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3(1, 1, 1);
const _p = new THREE.Vector3();

// Collects static geometry per material; every piece gets UVs (atlas rect or
// the atlas' plain white strip) and the colour / occlusion attribute.
class Kit {
  constructor(plainUV) {
    this.plain = plainUV;
    this.lists = new Map();
  }

  static xf(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    _e.set(rx, ry, rz, 'XYZ');
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s);
    geo.applyMatrix4(_m);
    return geo;
  }

  // map uv of a geometry (or only of one BoxGeometry face) into an atlas rect
  uv(geo, rect = null, face = -1, sub = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const uv = g.attributes.uv;
    const groups = geo.groups && geo.groups.length ? geo.groups : null;
    for (let i = 0; i < uv.count; i++) {
      let inFace = rect && face < 0;
      if (rect && face >= 0 && groups) {
        // toNonIndexed keeps the triangle order of the groups
        const tri = Math.floor(i / 3) * 3;
        const grp = groups.find((gr) => tri >= gr.start && tri < gr.start + gr.count);
        inFace = grp && grp.materialIndex === face;
      }
      if (inFace) {
        let u = uv.getX(i), v = uv.getY(i);
        if (sub) {
          u = sub[0] + u * (sub[2] - sub[0]);
          v = sub[1] + v * (sub[3] - sub[1]);
        }
        uv.setXY(i, rect.u0 + u * (rect.u1 - rect.u0), rect.v0 + v * (rect.v1 - rect.v0));
      } else uv.setXY(i, this.plain[0], this.plain[1]);
    }
    return g;
  }

  add(key, geo, color, ao = 1, rect = null, face = -1, sub = null) {
    const g = this.uv(geo, rect, face, sub);
    tintGeometry(g, color, ao);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aCol'].includes(name)) g.deleteAttribute(name);
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
    return g;
  }

  mesh(key, material) {
    const list = this.lists.get(key);
    if (!list || !list.length) return null;
    const geo = mergeGeometries(list);
    for (const g of list) g.dispose();
    const m = new THREE.Mesh(geo, material);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    return m;
  }
}

// geometry with plain uvs + colour for a moving part
function part(kit, geo, color, ao = 1) {
  const g = kit.uv(geo);
  tintGeometry(g, color, ao);
  return g;
}

// geometry that keeps its own 0..1 uvs (screens and dynamic panels)
function screen(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  return tintGeometry(g, '#ffffff');
}

function tube(points, r, segs = 24, radial = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, radial, false);
}

// Seat with cushions, head rest and arm rests (seat reference point at origin).
function addSeat(kit, key, x, y, z, color, recline = 0.2) {
  const c = new THREE.Color(color);
  const dark = c.clone().multiplyScalar(0.7);
  kit.add(key, Kit.xf(new THREE.BoxGeometry(0.5, 0.13, 0.5), x, y + 0.48, z), c, 0.8);
  kit.add(key, Kit.xf(new THREE.BoxGeometry(0.5, 0.78, 0.13), x, y + 0.92, z + 0.28, -recline), c, 0.85);
  kit.add(key, Kit.xf(new THREE.BoxGeometry(0.3, 0.2, 0.1), x, y + 1.42, z + 0.38, -recline), c, 0.9);
  for (const sx of [-1, 1]) kit.add(key, Kit.xf(new THREE.BoxGeometry(0.06, 0.05, 0.36), x + sx * 0.29, y + 0.72, z + 0.02), dark, 0.8);
  kit.add(key, Kit.xf(new THREE.CylinderGeometry(0.08, 0.12, 0.42, 10), x, y + 0.21, z + 0.05), '#2a2c2e', 0.5);
}

// Dummy context for Painter when only one canvas (the albedo) is wanted.
function singleCanvasAtlas(ctx, W, H) {
  const sink = document.createElement('canvas');
  sink.width = sink.height = 1;
  return { a: ctx, e: sink.getContext('2d'), rect: { x: 0, y: 0, w: W, h: H } };
}

// ---------------------------------------------------------------------------
// Airliner flight deck
// ---------------------------------------------------------------------------
class AirlinerCockpit {
  constructor(model) {
    this.model = model;
    const spec = model.spec;
    const d = spec.design;
    const prof = airlinerProfile(spec.id);
    this.prof = prof;
    const st = STYLES[prof.style];
    const eye = model.eye;
    const cg = d.pilotEye.z - eye.z;
    const secs = d.hump ? d.hump.sections : d.fuselage;
    const sec = (z) => sampleSection(secs, z + cg);
    const R = new THREE.Vector3(0, eye.y, eye.z);
    const group = new THREE.Group();
    group.name = 'flightdeck';
    group.visible = false;
    this.group = group;
    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.holder.add(group);

    // ---- room dimensions
    const hw = Math.min(prof.hw, sec(R.z).w * 0.92);
    const floorY = R.y - 1.12;
    const roofAt = (z) => {
      const s = sec(z);
      return Math.min(R.y + (prof.narrow ? 0.5 : 0.62), (s.y ?? 0) + s.top - 0.1);
    };
    const yGs = R.y - 0.2, zGs = R.z - (prof.narrow ? 0.86 : 0.98), kS = 0.75, kV = 0.3;
    const zWs = (x, y) => zGs + (y - yGs) * kS + Math.abs(x) * kV;
    const zB = R.z + 1.05;
    const panelHW = Math.min(prof.panelHW, hw - 0.3);
    const roofY = roofAt(R.z);

    // ---- lighting / materials
    this.lighting = new CockpitLighting({
      ref: R,
      windows: prof.windows,
      room: [hw * 1.04, (floorY + roofY) / 2, (roofY - floorY) * 0.58],
      screen: [zGs, yGs, kS, kV],
      rear: zB,
      occluders: [
        { min: new THREE.Vector3(-panelHW - 0.08, floorY, zGs - 0.25), max: new THREE.Vector3(panelHW + 0.08, yGs, R.z - 0.73) },
        { min: new THREE.Vector3(-0.5, R.y + 0.4, R.z - 0.36), max: new THREE.Vector3(0.5, R.y + 0.66, R.z + 0.62) },
      ],
      panelLight: st.light,
    });
    const L = this.lighting;
    const atlasSize = model.quality && model.quality.textureSize >= 1024 ? 2048 : 1024;
    const atlas = new PanelAtlas(atlasSize);
    this.atlas = atlas;
    const kit = new Kit(atlas.plain);

    // ---- shell: rounded-box room tapering with the nose, closed in front by
    // the sloped V windshield surface and behind by the bulkhead
    const NT = 64, NZ = 22, NR = 8;
    const ring = (z, th) => {
      const s = sec(z);
      const w = Math.min(hw, s.w * 0.92);
      const top = Math.min(roofY, roofAt(z));
      const yc = (top + floorY) / 2, hh = (top - floorY) / 2;
      const c = Math.cos(th), sn = Math.sin(th), e = 2 / 5;
      return new THREE.Vector3(w * Math.sign(c) * Math.pow(Math.abs(c), e), yc + hh * Math.sign(sn) * Math.pow(Math.abs(sn), e), z);
    };
    const thAt = (i) => -Math.PI / 2 + (i / NT) * Math.PI * 2;
    const zStart = [];
    for (let i = 0; i <= NT; i++) {
      const th = thAt(i);
      let lo = R.z - 2.4, hi = zB;
      const f = (z) => { const p = ring(z, th); return p.z - zWs(p.x, p.y); };
      if (f(lo) >= 0) { zStart.push(lo); continue; }
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) >= 0) hi = mid; else lo = mid;
      }
      zStart.push(hi);
    }
    const pos = [], idx = [];
    const vert = (p) => { pos.push(p.x, p.y, p.z); return pos.length / 3 - 1; };
    // tube
    const tubeBase = 0;
    for (let i = 0; i <= NT; i++) {
      for (let j = 0; j <= NZ; j++) {
        const z = zStart[i] + (zB - zStart[i]) * (j / NZ);
        vert(ring(z, thAt(i)));
      }
    }
    for (let i = 0; i < NT; i++) {
      for (let j = 0; j < NZ; j++) {
        const a = tubeBase + i * (NZ + 1) + j, b = a + NZ + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    // windshield cap (radial grid projected onto the windshield surface)
    const capY = (yGs + roofY) / 2;
    const C = new THREE.Vector3(0, capY, zWs(0, capY));
    const capBase = pos.length / 3;
    for (let i = 0; i <= NT; i++) {
      const edge = ring(zStart[i], thAt(i));
      for (let r = 0; r <= NR; r++) {
        const t = r / NR;
        const x = C.x + (edge.x - C.x) * t, y = C.y + (edge.y - C.y) * t;
        vert(new THREE.Vector3(x, y, zWs(x, y)));
      }
    }
    for (let i = 0; i < NT; i++) {
      for (let r = 0; r < NR; r++) {
        const a = capBase + i * (NR + 1) + r, b = a + NR + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    // rear bulkhead cap
    const rearBase = pos.length / 3;
    const RC = new THREE.Vector3(0, (floorY + roofY) / 2, zB);
    for (let i = 0; i <= NT; i++) {
      const edge = ring(zB, thAt(i));
      for (let r = 0; r <= NR; r++) {
        const t = r / NR;
        vert(new THREE.Vector3(RC.x + (edge.x - RC.x) * t, RC.y + (edge.y - RC.y) * t, zB));
      }
    }
    for (let i = 0; i < NT; i++) {
      for (let r = 0; r < NR; r++) {
        const a = rearBase + i * (NR + 1) + r, b = a + NR + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    let shellGeo = new THREE.BufferGeometry();
    shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    shellGeo.setIndex(idx);
    shellGeo.computeVertexNormals();
    shellGeo = shellGeo.toNonIndexed();
    // colour: trim above, darker lower walls and carpet on the floor
    {
      const n = shellGeo.attributes.position.count;
      const col = new Float32Array(n * 4);
      const trim = new THREE.Color(st.trim), lower = new THREE.Color(st.panel).multiplyScalar(0.85), carpet = new THREE.Color(st.carpet);
      const tmp = new THREE.Color();
      const pa = shellGeo.attributes.position;
      for (let i = 0; i < n; i++) {
        const y = pa.getY(i);
        const k = THREE.MathUtils.smoothstep(y, floorY + 0.05, floorY + 0.25);
        const k2 = THREE.MathUtils.smoothstep(y, R.y - 0.55, R.y - 0.35);
        tmp.copy(carpet).lerp(lower, k).lerp(trim, k2);
        col.set([tmp.r, tmp.g, tmp.b, 0.55 + 0.45 * THREE.MathUtils.smoothstep(y, floorY, R.y - 0.2)], i * 4);
      }
      shellGeo.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
      const uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) uv.set(atlas.plain, i * 2);
      shellGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    }

    // ---- panel artwork
    const panelH = prof.analog ? 0.4 : 0.46;
    const ovW = 0.96, ovL = 1.0;
    // allocation order keeps the shelves of the atlas packed
    const ovRect = paintOverhead(atlas, ovW, ovL, st, prof.maker === 'airbus' ? 'airbus' : 'boeing', 7 + spec.id.length);
    const pedW = 0.5, pedL = 1.0;
    const ped = paintPedestal(atlas, pedW, pedL, st, prof.maker);
    const conW = Math.max(0.2, hw - 0.86), conL = 0.95;
    const conRect = paintConsole(atlas, conW, conL, st, 'console', 19, Math.min(380, Math.round((860 * conW) / conL)));
    const bhRect = paintConsole(atlas, 1.0, 0.9, st, 'bulkhead', 21, 280);
    let mainRect = null;
    if (!prof.analog) mainRect = paintMainPanel(atlas, panelHW * 2, panelH, st, prof.maker, prof.displays.filter((x) => x.page !== 'standby').map((x) => ({ ...x, label: '' })));
    const gsW = panelHW * 2 + 0.1, gsH = 0.085;
    const gs = paintGlareshield(atlas, gsW, gsH, st, prof.maker);
    const tex = atlas.textures();
    this.mainMat = L.material('interior', { map: tex.map, emissiveMap: tex.emissiveMap });
    this.glossMat = L.material('interior', { map: tex.map, emissiveMap: tex.emissiveMap, spec: 0.35, shine: 60 });
    this.shellMat = L.material('shell', { frameColor: st.frame });
    this.glassMat = L.material('glass', { tint: '#1c2a30', emissive: 0.035 });

    const shell = new THREE.Mesh(shellGeo, this.shellMat);
    shell.frustumCulled = false;
    group.add(shell);
    // the glass only needs the triangles around the window openings
    const glassGeo = new THREE.BufferGeometry();
    {
      const pa = shellGeo.attributes.position, na = shellGeo.attributes.normal;
      const gp = [], gn = [];
      const v = new THREE.Vector3();
      for (let t = 0; t < pa.count; t += 3) {
        let near = false;
        for (let k = 0; k < 3 && !near; k++) near = windowSDF(v.fromBufferAttribute(pa, t + k), R, prof.windows) < 2;
        if (!near) continue;
        for (let k = 0; k < 3; k++) {
          gp.push(pa.getX(t + k), pa.getY(t + k), pa.getZ(t + k));
          gn.push(na.getX(t + k), na.getY(t + k), na.getZ(t + k));
        }
      }
      glassGeo.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3));
      glassGeo.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
      glassGeo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((gp.length / 3) * 2), 2));
      tintGeometry(glassGeo, '#ffffff');
    }
    const glass = new THREE.Mesh(glassGeo, this.glassMat);
    glass.frustumCulled = false;
    glass.renderOrder = 7;
    group.add(glass);
    this._ownGeos = [shellGeo, glassGeo];

    const K = 'main', G = 'gloss';
    // ---- glare shield: V-shaped coaming following the windshield
    {
      const shape = new THREE.Shape();
      const back = R.z - 0.74;
      const gw = panelHW + 0.05;
      const n = 12;
      shape.moveTo(-gw, back);
      for (let i = 0; i <= n; i++) {
        const x = -gw + (2 * gw * i) / n;
        shape.lineTo(x, zWs(x, yGs) + 0.012);
      }
      shape.lineTo(gw, back);
      shape.lineTo(-gw, back);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: gsH + 0.01, bevelEnabled: false, curveSegments: 4 });
      geo.rotateX(Math.PI / 2);
      geo.translate(0, yGs, 0);
      kit.add(G, geo, st.glare, 0.9);
      // FCU / MCP face on the rear lip
      const face = new THREE.PlaneGeometry(gsW - 0.02, gsH);
      kit.add(K, Kit.xf(face, 0, yGs - gsH / 2 - 0.004, back + 0.002), '#ffffff', 1, gs.rect);
      // autopilot readouts + master lights: one dynamic strip mapped to several windows
      this.fcu = new Display(512, 48, 4, (c, w, h, g) => drawFCU(c, w, h, g, prof.maker), 0.05);
      const fcuMat = L.material('display', { map: this.fcu.tex });
      const quads = [];
      gs.windows.forEach((wd, i) => {
        const q = new THREE.PlaneGeometry(wd.w * 0.94, wd.h * 0.88);
        const uv = q.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 6);
        quads.push(Kit.xf(q, -gsW / 2 + wd.x, yGs - wd.y - 0.004, back + 0.0035));
      });
      // master warning / caution lights at both outboard ends
      for (const side of [-1, 1]) {
        for (const [cell, yy] of [[4, gsH * 0.35], [5, gsH * 0.7]]) {
          const q = new THREE.PlaneGeometry(0.02, 0.014);
          const uv = q.attributes.uv;
          for (let k = 0; k < uv.count; k++) uv.setX(k, (cell + 0.2 + uv.getX(k) * 0.6) / 6);
          quads.push(Kit.xf(q, side * (gsW / 2 - 0.016), yGs - yy - 0.004, back + 0.0035));
        }
      }
      const fq = mergeGeometries(quads.map((q) => tintGeometry(q.toNonIndexed(), '#ffffff')));
      const fm = new THREE.Mesh(fq, fcuMat);
      fm.frustumCulled = false;
      group.add(fm);
      this._ownGeos.push(fq);
    }

    // ---- main instrument panel (T-shaped: taller in the centre)
    const panelTop = yGs - 0.075, zPanel = R.z - 0.8, tilt = -0.1;
    const frame = new THREE.Object3D();
    frame.position.set(0, panelTop, zPanel);
    frame.rotation.x = tilt;
    frame.updateMatrix();
    const onPanel = (geo, x, yDown, zOff = 0) => {
      geo.translate(x, -yDown, zOff);
      geo.applyMatrix4(frame.matrix);
      return geo;
    };
    const wingH = prof.analog ? panelH : 0.36;
    this.displays = new Map();
    this.screens = [];
    if (prof.analog) {
      // analogue panel: one dynamic canvas painted with the instruments
      const wM = panelHW * 2, hM = panelH;
      const gauges = prof.analog.gauges.map((g) => ({ ...g, x: g.x + wM / 2 }));
      this.analog = new AnalogPanel(wM, hM, { gauges }, {
        soviet: prof.maker === 'soviet', metric: !!prof.metric, rate: 12, maxW: 1536,
        paintBg: (ctx, ppm, W, H) => {
          const at = singleCanvasAtlas(ctx, W, H);
          const p = new Painter(at, at.rect, wM, hM, st, 31);
          p.base();
          p.module(0.005, 0.005, wM - 0.01, hM - 0.01, '');
          for (const g of gauges) {
            if (g.type === 'eng' || g.type === 'annun') p.module(g.x - g.r - 0.01, g.y - g.r - 0.01, g.r * 2 + 0.02, g.r * 2 + 0.02, '', { color: st.sub });
          }
          p.label(prof.maker === 'soviet' ? 'ВНИМАНИЕ' : 'ENGINE INSTRUMENTS', wM / 2, 0.015, 0.008);
          p.done();
        },
      });
      this.analogMat = L.material('interior', { map: this.analog.tex, emissiveFromMap: true, emissive: 1.4 });
      const g = screen(onPanel(new THREE.PlaneGeometry(wM, hM), 0, hM / 2, 0.021));
      const am = new THREE.Mesh(g, this.analogMat);
      am.frustumCulled = false;
      group.add(am);
      this._ownGeos.push(g);
      kit.add(K, onPanel(new THREE.BoxGeometry(wM, hM, 0.04), 0, hM / 2), st.panel, 0.8);
    } else {
      // wing panel + centre column, both mapped from the painted panel
      kit.add(K, onPanel(new THREE.BoxGeometry(panelHW * 2, wingH, 0.04), 0, wingH / 2), '#ffffff', 1, mainRect, 4, [0, 1 - wingH / panelH, 1, 1]);
      const cw = 0.42;
      kit.add(K, onPanel(new THREE.BoxGeometry(cw, panelH, 0.04), 0, panelH / 2, 0.0015), '#ffffff', 1, mainRect, 4, [0.5 - cw / (panelHW * 4), 0, 0.5 + cw / (panelHW * 4), 1]);
    }
    // lower kick panels below the wings
    for (const sx of [-1, 1]) kit.add(K, onPanel(new THREE.BoxGeometry(panelHW - 0.21, 0.1, 0.03), sx * (0.21 + (panelHW - 0.21) / 2), wingH + 0.05, -0.02), st.sub, 0.6);
    // displays
    const pageDraw = {
      pfd: (c, w, h, g) => drawPFD(c, w, h, g, prof.maker),
      nd: (c, w, h, g) => drawND(c, w, h, g, prof.maker),
      ewd: (c, w, h, g) => drawEngines(c, w, h, g, prof.maker, prof.engines),
      sd: (c, w, h, g) => drawSystem(c, w, h, g, prof.maker),
      standby: (c, w, h, g) => drawStandby(c, w, h, g),
      ois: (c, w, h, g) => drawOIS(c, w, h, g),
    };
    const rates = { pfd: 15, nd: 6, ewd: 4, sd: 2, standby: 8, ois: 0.5 };
    let phase = 0;
    for (const dd of prof.displays || []) {
      if (!pageDraw[dd.page]) continue;
      if (!this.displays.has(dd.page)) {
        const aspect = dd.w / dd.h;
        const W = dd.page === 'standby' ? 128 : 384;
        const disp = new Display(W, Math.round(W / aspect), rates[dd.page], pageDraw[dd.page], (phase += 0.013));
        disp.mat = L.material('display', { map: disp.tex });
        this.displays.set(dd.page, disp);
      }
      const disp = this.displays.get(dd.page);
      const geo = screen(onPanel(new THREE.PlaneGeometry(dd.w, dd.h), dd.x, dd.y, 0.022));
      const mesh = new THREE.Mesh(geo, disp.mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      this._ownGeos.push(geo);
      // bezel frame
      const fw = 0.012, bw = dd.w + fw * 2, bh = dd.h + fw * 2;
      for (const [x, y, w, h] of [[0, -bh / 2 + fw / 2, bw, fw], [0, bh / 2 - fw / 2, bw, fw], [-bw / 2 + fw / 2, 0, fw, bh], [bw / 2 - fw / 2, 0, fw, bh]]) {
        kit.add(G, onPanel(new THREE.BoxGeometry(w, h, 0.014), dd.x + x, dd.y - y, 0.024), '#1d2023', 0.9);
      }
    }

    // ---- centre pedestal
    const pedFrontZ = zPanel + 0.05, pedBackZ = R.z + 0.32;
    const pedTopF = R.y - 0.68, pedTopB = R.y - 0.62;
    const pedLen = Math.hypot(pedBackZ - pedFrontZ, pedTopB - pedTopF);
    const pedTilt = Math.atan2(pedTopB - pedTopF, pedBackZ - pedFrontZ);
    const pedFrame = new THREE.Object3D();
    pedFrame.position.set(0, pedTopF, pedFrontZ);
    pedFrame.rotation.x = -pedTilt;
    pedFrame.updateMatrix();
    const onPed = (geo, x, along, up = 0) => {
      geo.translate(x, up, along);
      geo.applyMatrix4(pedFrame.matrix);
      return geo;
    };
    {
      const top = new THREE.PlaneGeometry(pedW, pedL);
      top.rotateX(-Math.PI / 2);
      kit.add(K, onPed(top, 0, pedLen / 2, 0.001), '#ffffff', 1, ped.rect);
      kit.add(K, onPed(new THREE.BoxGeometry(pedW, 0.08, pedLen), 0, pedLen / 2, -0.04), st.panel, 0.7);
      // body down to the floor
      const bodyH = pedTopF - floorY;
      kit.add(K, Kit.xf(new THREE.BoxGeometry(pedW - 0.02, bodyH, pedBackZ - pedFrontZ), 0, floorY + bodyH / 2 - 0.04, (pedFrontZ + pedBackZ) / 2), st.sub, 0.55);
      // CDU screens (one canvas on both)
      this.cdu = new Display(256, 256, 1, (c, w, h, g) => drawCDU(c, w, h, g, prof.maker), 0.3);
      const cduMat = L.material('display', { map: this.cdu.tex });
      for (const cd of ped.cdus) {
        const q = new THREE.PlaneGeometry(cd.w * 0.92, cd.h * 0.9);
        q.rotateX(-Math.PI / 2);
        const g = screen(onPed(q, cd.x, cd.y, 0.003));
        const m = new THREE.Mesh(g, cduMat);
        m.frustumCulled = false;
        group.add(m);
        this._ownGeos.push(g);
      }
    }
    // thrust levers
    this.levers = [];
    const n = Math.max(2, Math.min(4, prof.engines));
    const leverAlong = 0.4;
    for (let i = 0; i < n; i++) {
      const lv = new THREE.Group();
      lv.position.set((i - (n - 1) / 2) * 0.055, 0, leverAlong);
      lv.position.applyMatrix4(pedFrame.matrix);
      lv.rotation.x = -pedTilt;
      const arm = part(kit, Kit.xf(new THREE.BoxGeometry(0.014, 0.17, 0.02), 0, 0.085, 0), '#3b3f43');
      const handle = prof.maker === 'airbus'
        ? part(kit, Kit.xf(new THREE.BoxGeometry(0.05, 0.035, 0.06), 0, 0.17, 0.01), '#8c9298')
        : part(kit, Kit.xf(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12), 0, 0.17, 0, 0, 0, Math.PI / 2), '#20222a');
      const lg = mergeGeometries([arm, handle]);
      const mesh = new THREE.Mesh(lg, this.glossMat);
      mesh.frustumCulled = false;
      lv.add(mesh);
      this._ownGeos.push(lg);
      group.add(lv);
      this.levers.push(lv);
    }
    // speed brake (left) and flap (right) levers
    kit.add(G, onPed(new THREE.BoxGeometry(0.012, 0.12, 0.012), -0.2, 0.33, 0.06), '#3a3d40', 0.8);
    kit.add(G, onPed(new THREE.BoxGeometry(0.06, 0.022, 0.03), -0.2, 0.33, 0.12), '#bfc4c8', 0.9);
    kit.add(G, onPed(new THREE.BoxGeometry(0.012, 0.1, 0.012), 0.2, 0.42, 0.05), '#3a3d40', 0.8);
    kit.add(G, onPed(new THREE.BoxGeometry(0.05, 0.03, 0.04), 0.2, 0.42, 0.1), '#d8dbde', 0.9);
    // Boeing trim wheels on the pedestal sides
    if (prof.maker === 'boeing') {
      for (const sx of [-1, 1]) {
        const tw = new THREE.CylinderGeometry(0.11, 0.11, 0.03, 24);
        tw.rotateZ(Math.PI / 2);
        kit.add(G, onPed(tw, sx * (pedW / 2 + 0.016), 0.55, -0.07), '#26282b', 0.8);
      }
    }

    // ---- side consoles
    const conIn = hw - conW - 0.02;
    for (const sx of [-1, 1]) {
      const cx = sx * (conIn + conW / 2);
      const top = new THREE.PlaneGeometry(conW, conL);
      top.rotateX(-Math.PI / 2);
      kit.add(K, Kit.xf(top, cx, R.y - 0.645, R.z - 0.02), '#ffffff', 1, conRect);
      const bodyH = R.y - 0.65 - floorY;
      kit.add(K, Kit.xf(new THREE.BoxGeometry(conW, bodyH, conL), cx, floorY + bodyH / 2, R.z - 0.02), st.sub, 0.5);
      // oxygen mask stowage box and the sliding table / map holder
      kit.add(K, Kit.xf(new THREE.BoxGeometry(conW * 0.5, 0.1, 0.16), cx + sx * conW * 0.18, R.y - 0.6, R.z + 0.32), '#26292c', 0.8);
    }

    // ---- overhead panel
    {
      const ov = new THREE.Group();
      ov.position.set(0, R.y + 0.53, R.z + 0.13);
      ov.rotation.x = -0.17;
      ov.updateMatrix();
      const face = new THREE.PlaneGeometry(ovW, ovL);
      face.rotateX(Math.PI / 2);
      face.applyMatrix4(ov.matrix);
      kit.add(K, face, '#ffffff', 1, ovRect);
      const body = new THREE.BoxGeometry(ovW + 0.04, 0.08, ovL + 0.02);
      body.translate(0, 0.042, 0);
      body.applyMatrix4(ov.matrix);
      kit.add(K, body, st.panel, 0.7);
    }

    // ---- rear bulkhead with circuit breaker panels and the door
    {
      const bh = new THREE.PlaneGeometry(1.0, 0.9);
      bh.rotateY(Math.PI);
      kit.add(K, Kit.xf(bh, -hw * 0.45, R.y - 0.05, zB - 0.012), '#ffffff', 1, bhRect);
      kit.add(K, Kit.xf(new THREE.BoxGeometry(0.75, 1.75, 0.02), hw * 0.35, floorY + 0.9, zB - 0.015), new THREE.Color(st.trim).multiplyScalar(0.8), 0.8);
    }

    // ---- control yokes or sidesticks
    this.yokes = [];
    this.yokeStyle = prof.control !== 'sidestick';
    const pilotX = Math.abs(eye.x || 0.5);
    for (const sx of [-1, 1]) {
      const x = sx * pilotX;
      const grp = new THREE.Group();
      const geos = [];
      if (this.yokeStyle) {
        grp.position.set(x, floorY + 0.03, R.z - 0.6);
        const colH = R.y - 0.56 - floorY;
        geos.push(part(kit, Kit.xf(new THREE.CylinderGeometry(0.03, 0.045, colH, 10), 0, colH / 2, 0, 0.12), '#1b1c1e'));
        geos.push(part(kit, Kit.xf(new THREE.BoxGeometry(0.12, 0.2, 0.1), 0, 0.1, 0.02), '#2a2c2f', 0.6));
        const wheel = new THREE.Group();
        wheel.position.set(0, colH + 0.01, 0.07);
        const horns = prof.control === 'ramhorn'
          ? [[-0.17, 0.1], [-0.17, -0.02], [-0.08, -0.07], [0, -0.07], [0.08, -0.07], [0.17, -0.02], [0.17, 0.1]]
          : [[-0.18, 0.07], [-0.17, -0.04], [-0.1, -0.075], [0, -0.07], [0.1, -0.075], [0.17, -0.04], [0.18, 0.07]];
        const wg = [
          part(kit, tube(horns.map(([hx, hy]) => new THREE.Vector3(hx, hy, 0)), 0.017, 30, 8), '#16171a'),
          part(kit, Kit.xf(new THREE.BoxGeometry(0.13, 0.07, 0.05), 0, -0.04, 0), '#24262a'),
          // checklist clip / clock on the hub
          part(kit, Kit.xf(new THREE.BoxGeometry(0.08, 0.05, 0.004), 0, -0.035, 0.027), '#d9d6c8'),
        ];
        const wgeo = mergeGeometries(wg);
        const wm = new THREE.Mesh(wgeo, this.glossMat);
        wm.frustumCulled = false;
        wheel.add(wm);
        this._ownGeos.push(wgeo);
        grp.add(wheel);
        grp.userData.wheel = wheel;
      } else {
        grp.position.set(sx * (conIn + conW * 0.45), R.y - 0.63, R.z - 0.18);
        geos.push(part(kit, Kit.xf(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 14), 0, 0.0, 0), '#141516'));
        geos.push(part(kit, Kit.xf(new THREE.CylinderGeometry(0.014, 0.018, 0.05, 8), 0, 0.03, 0), '#1c1d1f'));
        geos.push(part(kit, Kit.xf(new THREE.CapsuleGeometry(0.02, 0.07, 4, 10), 0, 0.09, -0.008, -0.25), '#232528'));
        geos.push(part(kit, Kit.xf(new THREE.SphereGeometry(0.008, 8, 6), 0, 0.14, -0.02), '#b3261e'));
      }
      if (geos.length) {
        const g = mergeGeometries(geos);
        const m = new THREE.Mesh(g, this.glossMat);
        m.frustumCulled = false;
        grp.add(m);
        this._ownGeos.push(g);
      }
      group.add(grp);
      this.yokes.push(grp);
    }

    // ---- first officer's seat (the captain's is under the camera)
    addSeat(kit, K, pilotX, floorY, R.z - 0.1, st.seat);
    // windscreen wipers parked outside the lower windshield
    for (const sx of [-1, 1]) {
      const x0 = sx * 0.12, x1 = sx * 0.62;
      const pts = [new THREE.Vector3(x0, yGs + 0.035, zWs(x0, yGs + 0.035) - 0.03), new THREE.Vector3(x1, yGs + 0.06, zWs(x1, yGs + 0.06) - 0.03)];
      kit.add(K, tube(pts, 0.008, 2, 5), '#121314', 0.9);
    }

    for (const [key, mat] of [[K, this.mainMat], [G, this.glossMat]]) {
      const m = kit.mesh(key, mat);
      if (m) {
        group.add(m);
        this._ownGeos.push(m.geometry);
      }
    }
    this.t = 0;
    this.g = { t: 0 };
  }

  update(dt, g) {
    this.t += dt;
    const p = g.ac;
    const c = p.controls;
    for (const y of this.yokes) {
      if (this.yokeStyle) {
        y.rotation.x = -(c.pitch || 0) * 0.16;
        y.userData.wheel.rotation.z = -(c.roll || 0) * 0.9;
      } else y.rotation.set((c.pitch || 0) * 0.3, 0, -(c.roll || 0) * 0.3);
    }
    const rev = p.fm.reverser ? p.fm.reverser.deploy || 0 : 0;
    for (const lv of this.levers) lv.rotation.x = -(p.fm.throttle - 0.4) * 0.9 + rev * 0.35;
    const ctx = Object.assign(this.g, g, { t: this.t });
    if (!this.screens.length) {
      this.screens = [...this.displays.values(), this.fcu, this.cdu];
      if (this.analog) this.screens.push(this.analog.display);
    }
    updateDisplays(this.screens, dt, ctx);
    if (g.camera) this.lighting.update(this.model.root, g.camera, g.world, g);
  }

  dispose() {
    for (const disp of this.displays.values()) disp.dispose();
    this.fcu.dispose();
    this.cdu.dispose();
    this.analog?.dispose();
    this.atlas.dispose();
    this.lighting.dispose();
    for (const geo of this._ownGeos) geo.dispose();
  }
}

// ---------------------------------------------------------------------------
// Fighter cockpit
// ---------------------------------------------------------------------------
const ONE_PIECE = ['f16', 'f22', 'f35', 'j20', 'su57'];

class FighterCockpit {
  constructor(model) {
    this.model = model;
    const spec = model.spec;
    const prof = fighterProfile(spec.id);
    this.prof = prof;
    const st = STYLES[prof.style];
    const E = model.eye;
    const info = model.canopyInfo;
    const c = info ? info.c : { w: 0.42, h: 0.6, y: E.y - 0.5, frameAt: 0 };
    const group = new THREE.Group();
    group.name = 'cockpit';
    group.visible = false;
    this.group = group;
    this.holder = new THREE.Group();
    this.holder.matrixAutoUpdate = false;
    this.holder.add(group);
    this._ownGeos = [];

    const railY = c.y + 0.03;
    const tubW = Math.max(0.36, c.w * 0.97);
    const pw = prof.panelW, ph = 0.34;
    const panelTop = E.y - 0.25, zPanel = E.z - 0.6;
    const gsTop = E.y - 0.165, gsBack = E.z - 0.58;
    const conTop = E.y - 0.62;
    const sill = info
      ? [railY, c.w * 0.93, info.cz0 + info.cl * 0.12, info.cz1 - info.cl * 0.08]
      : [railY, 0.4, E.z - 1.2, E.z + 0.8];
    this.lighting = new CockpitLighting({
      fighter: true,
      ref: E.clone(),
      sill,
      occluders: [
        { min: new THREE.Vector3(-pw / 2 - 0.08, E.y - 1.1, E.z - 1.3), max: new THREE.Vector3(pw / 2 + 0.08, gsTop, gsBack) },
        { min: new THREE.Vector3(-0.32, E.y - 0.4, E.z + 0.28), max: new THREE.Vector3(0.32, E.y + 0.25, E.z + 0.5) },
      ],
      panelLight: st.light,
      // the bubble canopy lets in far more sky light than a flight deck
      ambient: 1.8,
    });
    const L = this.lighting;
    const atlas = new PanelAtlas(1024);
    this.atlas = atlas;
    const kit = new Kit(atlas.plain);
    const conW = Math.max(0.15, tubW - 0.2), conL = 0.8;
    const conRects = [paintFighterConsole(atlas, conW, conL, st, -1), paintFighterConsole(atlas, conW, conL, st, 1)];
    const tex = atlas.textures();
    this.mainMat = L.material('interior', { map: tex.map, emissiveMap: tex.emissiveMap });
    this.glossMat = L.material('interior', { map: tex.map, emissiveMap: tex.emissiveMap, spec: 0.3, shine: 50 });
    const K = 'main', G = 'gloss';

    // ---- instrument panel: dynamic canvas with the analogue instruments,
    // display bezels and up-front controls painted behind the screens
    const panelFrame = new THREE.Object3D();
    panelFrame.position.set(0, panelTop, zPanel);
    panelFrame.rotation.x = -0.12;
    panelFrame.updateMatrix();
    const onPanel = (geo, x, yDown, zOff = 0) => {
      geo.translate(x, -yDown, zOff);
      geo.applyMatrix4(panelFrame.matrix);
      return geo;
    };
    const gauges = (prof.gauges || []).map((g) => ({ ...g, x: g.x + pw / 2 }));
    this.panel = new AnalogPanel(pw, ph, { gauges }, {
      soviet: prof.style === 'fighterRu', metric: !!prof.metric, rate: 12, maxW: 1024,
      paintBg: (ctx, ppm, W, H) => {
        const at = singleCanvasAtlas(ctx, W, H);
        const p = new Painter(at, at.rect, pw, ph, st, 41 + spec.id.length);
        p.base();
        p.module(0.004, 0.004, pw - 0.008, ph - 0.008, '');
        for (const d of prof.displays) {
          const x = pw / 2 + d.x, y = d.y;
          const bw = d.w + (d.osb ? 0.05 : 0.02), bh = d.h + (d.osb ? 0.05 : 0.02);
          p.a.fillStyle = '#121416';
          p.a.fillRect(x - bw / 2, y - bh / 2, bw, bh);
          p.a.strokeStyle = 'rgba(255,255,255,0.08)';
          p.a.lineWidth = p.px(1.5);
          p.a.strokeRect(x - bw / 2, y - bh / 2, bw, bh);
          if (d.osb) {
            // option select buttons around the display
            for (let i = 0; i < 5; i++) {
              const t = (i + 0.5) / 5;
              for (const [bx, by] of [[x - d.w / 2 + d.w * t, y - bh / 2 + 0.011], [x - d.w / 2 + d.w * t, y + bh / 2 - 0.011], [x - bw / 2 + 0.011, y - d.h / 2 + d.h * t], [x + bw / 2 - 0.011, y - d.h / 2 + d.h * t]]) {
                p.a.fillStyle = '#2c3034';
                p.a.fillRect(bx - 0.006, by - 0.005, 0.012, 0.01);
                p.a.fillStyle = 'rgba(255,255,255,0.12)';
                p.a.fillRect(bx - 0.006, by - 0.005, 0.012, 0.003);
              }
            }
            for (const [k, lx] of [['BRT', -1], ['CON', 1]]) p.label(k, x + lx * (bw / 2 - 0.012), y + bh / 2 + 0.008, 0.0055);
          }
        }
        if (prof.ufc) {
          const u = prof.ufc;
          p.module(pw / 2 + u.x - u.w / 2, u.y - u.h / 2, u.w, u.h, '');
          p.keypad(pw / 2 + u.x - u.w / 2 + 0.006, u.y - u.h / 2 + 0.005, 6, 2, (u.w - 0.03) / 6, (u.h - 0.016) / 2, 0.003, ['1', '2', '3', 'RCL', 'ENTR', 'COM1', '4', '5', '6', '0', 'NAV', 'COM2']);
        }
        // master caution / warning lights and the gear handle placard
        p.annunciator(0.035, 0.025, 0.04, 0.016, 'MASTER CAUTION', '#ffae20', false);
        p.annunciator(pw - 0.035, 0.025, 0.04, 0.016, 'WARN', '#ff3020', false);
        p.label('LG', 0.03, ph - 0.09, 0.008);
        p.done();
      },
    });
    this.panelMat = L.material('interior', { map: this.panel.tex, emissiveFromMap: true, emissive: 1.3 });
    {
      const face = screen(onPanel(new THREE.PlaneGeometry(pw, ph), 0, ph / 2, 0.021));
      const fm = new THREE.Mesh(face, this.panelMat);
      fm.frustumCulled = false;
      group.add(fm);
      this._ownGeos.push(face);
      kit.add(K, onPanel(new THREE.BoxGeometry(pw, ph, 0.04), 0, ph / 2), st.panel, 0.7);
      // knee panels between the main panel and the tub walls
      for (const sx of [-1, 1]) {
        const cw = tubW - pw / 2;
        if (cw > 0.02) kit.add(K, Kit.xf(new THREE.BoxGeometry(cw, railY - conTop, 0.04), sx * (pw / 2 + cw / 2), (railY + conTop) / 2, zPanel + 0.02), st.sub, 0.55);
      }
      // landing gear handle (left of the panel)
      kit.add(G, onPanel(new THREE.CylinderGeometry(0.018, 0.018, 0.02, 14), -pw / 2 + 0.03, ph - 0.06, 0.05), '#e8e6e0', 0.9);
      kit.add(G, onPanel(new THREE.BoxGeometry(0.008, 0.008, 0.05), -pw / 2 + 0.03, ph - 0.06, 0.03), '#9ea2a6', 0.9);
    }
    // displays
    this.displays = [];
    const rates = { radar: 8, sms: 2, tsd: 5, eng: 4, rwr: 5, ded: 2, pano: 6, standby: 8 };
    let phase = 0;
    this.tgps = [];
    this.tgpMat = makeTgpMaterial();
    for (const d of prof.displays) {
      const page = FIGHTER_PAGES[d.page];
      if (!page) continue;
      const aspect = d.w / d.h;
      const W = d.page === 'pano' ? 768 : d.page === 'ded' ? 256 : d.page === 'standby' ? 128 : 320;
      const color = prof.color || d.color;
      const disp = new Display(W, Math.round(W / aspect), rates[d.page] || 5, (cx, w, h, g) => page(cx, w, h, g, color), (phase += 0.017));
      disp.mat = L.material('display', { map: disp.tex });
      this.displays.push(disp);
      const geo = screen(onPanel(new THREE.PlaneGeometry(d.w, d.h), d.x, d.y, 0.023));
      const mesh = new THREE.Mesh(geo, disp.mat);
      mesh.frustumCulled = false;
      group.add(mesh);
      this._ownGeos.push(geo);
      // raised bezel
      const fw = d.osb ? 0.022 : 0.008, bw = d.w + fw * 2, bh = d.h + fw * 2;
      for (const [x, y, w, h] of [[0, -bh / 2 + fw / 2, bw, fw], [0, bh / 2 - fw / 2, bw, fw], [-bw / 2 + fw / 2, 0, fw, bh], [bw / 2 - fw / 2, 0, fw, bh]]) {
        kit.add(G, onPanel(new THREE.BoxGeometry(w, h, 0.012), d.x + x, d.y - y, 0.026), '#1a1c1e', 0.9);
      }
      // targeting-pod video over the display (or one portal of a panoramic one)
      if (d.tgp || d.tgpRect) {
        const r = d.tgpRect || [0.06, 0.06, 0.94, 0.94];
        const tw = d.w * (r[2] - r[0]), th = d.h * (r[3] - r[1]);
        const tgeo = onPanel(new THREE.PlaneGeometry(tw, th), d.x - d.w / 2 + d.w * (r[0] + r[2]) / 2, d.y - d.h / 2 + d.h * (r[1] + r[3]) / 2, 0.0245);
        const tm = new THREE.Mesh(tgeo, this.tgpMat);
        tm.visible = false;
        tm.frustumCulled = false;
        group.add(tm);
        this._ownGeos.push(tgeo);
        this.tgps.push(tm);
      }
    }

    // ---- glare-shield coaming over the panel
    {
      const gw = pw / 2 + 0.035;
      const shape = new THREE.Shape();
      shape.moveTo(-gw, gsTop - 0.11);
      shape.lineTo(-gw, gsTop - 0.03);
      shape.quadraticCurveTo(-gw, gsTop, -gw + 0.05, gsTop);
      shape.lineTo(gw - 0.05, gsTop);
      shape.quadraticCurveTo(gw, gsTop, gw, gsTop - 0.03);
      shape.lineTo(gw, gsTop - 0.11);
      shape.closePath();
      const len = 0.24;
      const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false, curveSegments: 6 });
      // the top slopes down towards the windscreen
      const pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) if (pa.getZ(i) < len * 0.5) pa.setY(i, pa.getY(i) - 0.03);
      geo.computeVertexNormals();
      geo.translate(0, 0, gsBack - len);
      kit.add(K, geo, st.glare, 0.8);
      // padded rear lip
      kit.add(K, Kit.xf(new THREE.CapsuleGeometry(0.014, gw * 2 - 0.03, 4, 8), 0, gsTop - 0.012, gsBack - 0.005, 0, 0, Math.PI / 2), '#141414', 0.8);
    }

    // ---- HUD
    this.hudGlass = null;
    if (prof.hud !== 'none') {
      const hz = E.z - 0.66, hy = gsTop;
      kit.add(G, Kit.xf(new THREE.BoxGeometry(0.15, 0.06, 0.2), 0, hy + 0.025, hz + 0.02), '#18191b', 0.8);
      const glassMat = L.material('glass', { tint: '#3a6a50', emissive: 0.06 });
      const plates = prof.hud === 'wide' ? [[0.16, 0.07, 0.07, -0.01], [0.16, 0.07, 0.13, -0.025]] : prof.hud === 'ru' ? [[0.15, 0.13, 0.11, 0]] : [[0.17, 0.12, 0.1, 0]];
      const pg = [];
      for (const [w, h, y, z] of plates) {
        const q = new THREE.PlaneGeometry(w, h);
        q.rotateX(-0.45);
        q.translate(0, hy + y, hz - 0.03 + z);
        pg.push(tintGeometry(kit.uv(q), '#ffffff'));
        // frame posts
        for (const sx of [-1, 1]) kit.add(G, Kit.xf(new THREE.BoxGeometry(0.01, h + 0.04, 0.012), sx * (w / 2 + 0.006), hy + y - 0.005, hz - 0.03 + z, -0.45), '#111213', 0.9);
      }
      const hg = mergeGeometries(pg);
      const hm = new THREE.Mesh(hg, glassMat);
      hm.renderOrder = 8;
      hm.frustumCulled = false;
      group.add(hm);
      this._ownGeos.push(hg);
    }

    // ---- tub walls, sills and side consoles
    for (const sx of [-1, 1]) {
      const wallH = railY - (conTop - 0.35);
      kit.add(K, Kit.xf(new THREE.BoxGeometry(0.03, wallH, 1.3), sx * tubW, conTop - 0.35 + wallH / 2, E.z - 0.05), st.trim, 0.55);
      // canopy sill rail from the panel back past the seat
      const r0 = zPanel + 0.06, r1 = E.z + 0.55;
      kit.add(G, Kit.xf(new THREE.BoxGeometry(0.05, 0.035, r1 - r0), sx * (tubW - 0.01), railY, (r0 + r1) / 2), '#1c1e20', 0.85);
      const cx = sx * (tubW - conW / 2 - 0.015);
      const top = new THREE.PlaneGeometry(conW, conL);
      top.rotateX(-Math.PI / 2);
      kit.add(K, Kit.xf(top, cx, conTop + 0.001, E.z + 0.02), '#ffffff', 1, conRects[sx < 0 ? 0 : 1]);
      kit.add(K, Kit.xf(new THREE.BoxGeometry(conW, 0.3, conL), cx, conTop - 0.15, E.z + 0.02), st.sub, 0.5);
    }
    // floor and seat bucket
    kit.add(K, Kit.xf(new THREE.BoxGeometry(tubW * 2, 0.03, 1.4), 0, E.y - 1.08, E.z - 0.2), st.carpet, 0.4);
    kit.add(K, Kit.xf(new THREE.BoxGeometry(0.52, 0.12, 0.5), 0, E.y - 0.86, E.z + 0.16), st.seat, 0.6);
    for (const sx of [-1, 1]) kit.add(K, Kit.xf(new THREE.BoxGeometry(0.05, 0.4, 0.55), sx * 0.27, E.y - 0.7, E.z + 0.2), '#26282a', 0.6);
    // ejection handle between the knees
    kit.add(G, Kit.xf(new THREE.TorusGeometry(0.04, 0.009, 6, 16, Math.PI), 0, E.y - 0.8, E.z - 0.1, 0.3), '#e2b322', 0.9);

    // ---- canopy: glass with tint and dirt, sill-to-sill frame, mirrors
    if (info) {
      const tint = spec.goldCanopy ? '#a07a2c' : '#2c3a44';
      const glassMat = L.material('glass', { tint, emissive: spec.goldCanopy ? 0.14 : 0.03 });
      const inner = new THREE.Mesh(model.canopy.geometry, glassMat);
      inner.renderOrder = 6;
      inner.frustumCulled = false;
      group.add(inner);
      if (c.frameAt > 0 && !ONE_PIECE.includes(spec.id)) {
        // windscreen bow ahead of the HUD (long two-seat canopies such as the
        // F-14's would otherwise put it right in front of the pilot's face)
        const z = Math.min(E.z - 0.62, Math.max(info.cz0 + info.cl * 0.18, Math.min(info.cz0 + info.cl * 0.32, E.z - 0.85)));
        const sec = sampleSection(info.canopySecs, z);
        const pts = [];
        for (let i = 0; i <= 16; i++) {
          const th = (i / 16) * Math.PI;
          pts.push(new THREE.Vector3(Math.cos(th) * sec.w * 0.97, sec.y + Math.sin(th) * sec.top * 0.97, z));
        }
        kit.add(K, tube(pts, 0.024, 24, 6), '#1f2123', 0.8);
        // rear-view mirrors on the bow
        for (const k of [-0.45, 0, 0.45]) {
          const th = Math.PI / 2 + k;
          const mx = Math.cos(th) * sec.w * 0.9, my = sec.y + Math.sin(th) * sec.top * 0.9 - 0.035;
          kit.add(G, Kit.xf(new THREE.BoxGeometry(0.09, 0.035, 0.012), mx, my, z + 0.03, 0.2, 0, -k * 0.8), '#7d8a94', 1);
        }
      }
    }

    // ---- stick, throttle, legs
    this.stick = new THREE.Group();
    const side = prof.stick === 'side';
    this.stick.position.set(side ? tubW - conW * 0.55 : 0, side ? conTop + 0.02 : E.y - 0.95, side ? E.z - 0.12 : E.z - 0.33);
    {
      const geos = [
        part(kit, Kit.xf(new THREE.CylinderGeometry(0.013, 0.018, side ? 0.07 : 0.34, 8), 0, side ? 0.035 : 0.17, 0), '#131415'),
        part(kit, Kit.xf(new THREE.CapsuleGeometry(0.024, 0.075, 4, 10), 0, side ? 0.1 : 0.38, -0.006, -0.22), '#1c1d1f'),
        part(kit, Kit.xf(new THREE.BoxGeometry(0.012, 0.014, 0.014), 0, side ? 0.15 : 0.43, -0.02), '#c8a22a'),
        part(kit, Kit.xf(new THREE.BoxGeometry(0.03, 0.012, 0.02), 0.012, side ? 0.12 : 0.4, -0.03), '#0f1011'),
      ];
      if (!side) geos.push(part(kit, Kit.xf(new THREE.CylinderGeometry(0.05, 0.06, 0.05, 12), 0, 0.01, 0), '#202223', 0.6));
      const sg = mergeGeometries(geos);
      const sm = new THREE.Mesh(sg, this.glossMat);
      sm.frustumCulled = false;
      this.stick.add(sm);
      this._ownGeos.push(sg);
    }
    group.add(this.stick);
    this.throttle = new THREE.Group();
    this.throttle.position.set(-(tubW - conW * 0.5), conTop + 0.01, E.z - 0.05);
    {
      const geos = [
        part(kit, Kit.xf(new THREE.BoxGeometry(0.025, 0.11, 0.03), 0, 0.055, 0), '#1a1b1d'),
        part(kit, Kit.xf(new THREE.BoxGeometry(0.05, 0.055, 0.085), 0.005, 0.12, -0.01), '#202124'),
        part(kit, Kit.xf(new THREE.BoxGeometry(0.01, 0.012, 0.012), 0.03, 0.14, -0.03), '#c8a22a'),
      ];
      const tg = mergeGeometries(geos);
      const tm = new THREE.Mesh(tg, this.glossMat);
      tm.frustumCulled = false;
      this.throttle.add(tm);
      this._ownGeos.push(tg);
    }
    group.add(this.throttle);
    const suit = new THREE.Color(prof.style === 'fighterRu' ? '#5a5a3e' : '#4d5538');
    for (const sx of [-1, 1]) {
      const thigh = new THREE.CapsuleGeometry(0.075, 0.36, 4, 10);
      thigh.rotateX(Math.PI / 2 - 0.28);
      kit.add(K, Kit.xf(thigh, sx * 0.115, E.y - 0.73, E.z - 0.14), suit, 0.75);
      const shin = new THREE.CapsuleGeometry(0.06, 0.36, 4, 10);
      shin.rotateX(0.35);
      kit.add(K, Kit.xf(shin, sx * 0.12, E.y - 0.88, E.z - 0.44), suit, 0.55);
      // G-suit pocket
      kit.add(K, Kit.xf(new THREE.BoxGeometry(0.1, 0.03, 0.14), sx * 0.13, E.y - 0.66, E.z - 0.12, -0.28), suit.clone().multiplyScalar(0.8), 0.75);
    }
    // kneeboard on the right thigh
    kit.add(K, Kit.xf(new THREE.BoxGeometry(0.14, 0.008, 0.2), 0.115, E.y - 0.645, E.z - 0.2, -0.3), '#d8d4c4', 0.9);

    for (const [key, mat] of [[K, this.mainMat], [G, this.glossMat]]) {
      const m = kit.mesh(key, mat);
      if (m) {
        group.add(m);
        this._ownGeos.push(m.geometry);
      }
    }
    this.screens = [...this.displays, this.panel.display];
    this.t = 0;
    this.g = { t: 0 };
  }

  update(dt, g) {
    this.t += dt;
    const p = g.ac;
    const cc = p.controls;
    this.stick.rotation.set((cc.pitch || 0) * 0.28, 0, -(cc.roll || 0) * 0.28);
    this.throttle.rotation.x = -(p.fm.throttle - 0.5) * 0.6;
    const tgpTex = g.tgpTexture;
    for (const t of this.tgps) t.visible = !!tgpTex;
    if (tgpTex) {
      this.tgpMat.uniforms.tVideo.value = tgpTex;
      this.tgpMat.uniforms.uTime.value = this.t;
    }
    const ctx = Object.assign(this.g, g, { t: this.t });
    updateDisplays(this.screens, dt, ctx);
    if (g.camera) this.lighting.update(this.model.root, g.camera, g.world, g);
  }

  dispose() {
    for (const d of this.displays) d.dispose();
    this.panel.dispose();
    this.atlas.dispose();
    this.tgpMat.dispose();
    this.lighting.dispose();
    for (const geo of this._ownGeos) geo.dispose();
  }
}

// Shared by both cockpit kinds: keep the overlay holder on the airframe.
function syncTransform() {
  const root = this.model.root;
  root.updateMatrixWorld();
  this.holder.matrix.copy(root.matrixWorld);
  this.holder.matrixWorldNeedsUpdate = true;
}
AirlinerCockpit.prototype.syncTransform = syncTransform;
FighterCockpit.prototype.syncTransform = syncTransform;

export function buildCockpit(model) {
  return model.airliner ? new AirlinerCockpit(model) : new FighterCockpit(model);
}
