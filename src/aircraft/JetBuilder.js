// Assembles a detailed fighter model from design data: lofted fuselage,
// airfoil wings with moving control surfaces, canopy + pilot, intakes,
// nozzles with afterburner flames, missiles on pylons, gear and nav lights.
import * as THREE from 'three';
import { loft, Surface, mirrorX, lathe, mergeGeometries, sampleSection } from './geometry.js';
import { getLiveryTextures, getRoundelTexture, getTextTexture } from './jetTextures.js';

const matCache = new Map();

function sharedMaterials(spec, quality) {
  const key = spec.id + ':' + quality.textureSize;
  if (matCache.has(key)) return matCache.get(key);
  const size = Math.min(1024, quality.textureSize);
  const withNormal = quality.textureSize >= 1024;
  const { map, normalMap } = getLiveryTextures(spec.id, spec.livery, size, withNormal);
  const body = new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.52, metalness: 0.32, name: 'body',
  });
  const intake = body.clone();
  intake.side = THREE.DoubleSide;
  const dark = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d655c, roughness: 0.35, metalness: 0.9 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({
    color: spec.goldCanopy ? 0x8a6a2a : 0x26323c, roughness: 0.04, metalness: 0.95,
    transparent: true, opacity: spec.goldCanopy ? 0.62 : 0.42, envMapIntensity: 1.6, depthWrite: false,
  });
  const cockpit = new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.85 });
  const helmet = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.4, metalness: 0.1 });
  const suit = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.9 });
  const missileBody = new THREE.MeshStandardMaterial({ color: 0xd6d6d0, roughness: 0.45, metalness: 0.2 });
  const missileNose = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.3, metalness: 0.4 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const strut = new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.3, metalness: 0.8 });
  const out = { body, intake, dark, metal, metalDark, glass, cockpit, helmet, suit, missileBody, missileNose, tyre, strut };
  matCache.set(key, out);
  return out;
}

// --- Afterburner flame shader ------------------------------------------------
const flameVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4( position, 1.0 );
    vNormalV = normalize( normalMatrix * normal );
    vViewV = normalize( -mv.xyz );
    gl_Position = projectionMatrix * mv;
  }
`;
const flameFragment = /* glsl */ `
  uniform float uAB;
  uniform float uThrottle;
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float t = 1.0 - vUv.y; // 0 at nozzle, 1 at tip
    float facing = abs( dot( vNormalV, vViewV ) );
    float core = pow( facing, 1.5 );
    float diamonds = 0.55 + 0.45 * pow( abs( cos( t * 15.0 ) ), 4.0 ) * ( 1.0 - t );
    float flicker = 0.9 + 0.1 * sin( uTime * 60.0 + t * 20.0 );
    float fade = pow( max( 1.0 - t, 0.0 ), 1.4 );
    vec3 hot = vec3( 1.0, 0.82, 0.6 );
    vec3 blue = vec3( 0.55, 0.65, 1.0 );
    vec3 orange = vec3( 1.0, 0.42, 0.1 );
    vec3 col = mix( orange, hot, core * ( 1.0 - t * 0.6 ) );
    col = mix( col, blue, ( 1.0 - t ) * 0.35 * core );
    float a = fade * core * diamonds * flicker * ( uAB * 1.0 + uThrottle * 0.08 );
    gl_FragColor = vec4( col * a * 5.0, 1.0 );
  }
`;

function makeFlameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uAB: { value: 0 }, uThrottle: { value: 0 }, uTime: { value: 0 } },
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- Missile geometry ---------------------------------------------------------
const missileGeoCache = {};
export function getMissileGeometry(type) {
  if (missileGeoCache[type]) return missileGeoCache[type];
  const L = type === 'ir' ? 2.9 : 3.65;
  const r = type === 'ir' ? 0.064 : 0.09;
  const bodyParts = [];
  const body = new THREE.CylinderGeometry(r, r, L * 0.86, 12, 1, true);
  body.rotateX(Math.PI / 2);
  body.translate(0, 0, L * 0.07);
  bodyParts.push(body);
  const nose = new THREE.ConeGeometry(r, L * 0.14, 12);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, -L / 2 + L * 0.07);
  const tailCap = new THREE.CircleGeometry(r, 12);
  tailCap.translate(0, 0, L / 2);
  bodyParts.push(tailCap);
  const fins = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const rear = new THREE.BoxGeometry(0.006, r * 3.2, L * 0.12);
    rear.translate(0, r * 1.6 + r * 0.4, L / 2 - L * 0.07);
    rear.rotateZ(a);
    fins.push(rear);
    const front = new THREE.BoxGeometry(0.006, r * (type === 'ir' ? 2.6 : 1.6), L * (type === 'ir' ? 0.06 : 0.1));
    front.translate(0, r * 1.3 + r * 0.3, type === 'ir' ? -L / 2 + L * 0.2 : 0);
    front.rotateZ(a);
    fins.push(front);
  }
  const bodyGeo = mergeGeometries([...bodyParts.map((g) => g.toNonIndexed()), ...fins.map((g) => g.toNonIndexed())]);
  bodyGeo.computeVertexNormals();
  missileGeoCache[type] = { body: bodyGeo, nose, length: L, radius: r };
  return missileGeoCache[type];
}

export function makeMissileMesh(type, mats) {
  const g = getMissileGeometry(type);
  const grp = new THREE.Group();
  const b = new THREE.Mesh(g.body, mats.missileBody);
  const n = new THREE.Mesh(g.nose, mats.missileNose);
  grp.add(b, n);
  grp.userData.length = g.length;
  return grp;
}

// --- Builder -----------------------------------------------------------------

export class JetModel {
  constructor(spec, quality, opts = {}) {
    this.spec = spec;
    const d = spec.design;
    const cg = d.cg;
    const mats = sharedMaterials(spec, quality);
    this.mats = mats;
    const root = new THREE.Group();
    root.name = spec.id;
    this.root = root;
    const shadows = quality.shadows;
    const add = (geo, mat, parent = root, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = shadows && cast;
      m.receiveShadow = shadows;
      parent.add(m);
      return m;
    };
    const Z = (sections) => sections.map((s) => ({ ...s, z: s.z - cg }));
    const ZW = (stations) => stations.map((s) => ({ ...s, z: s.z - cg }));
    const radial = quality.terrainSegments >= 32 ? 32 : 20;

    // Fuselage + spine
    const fus = loft(Z(d.fuselage), { radial, smooth: 4, capEnd: true });
    add(fus, mats.body);
    if (d.spine) add(loft(Z(d.spine), { radial: 16, smooth: 3 }), mats.body);

    // Intakes / nacelles
    const intakeLoft = (sections, xoff = 0) => {
      const secs = Z(sections).map((s) => ({ ...s, x: xoff }));
      const g = loft(secs, { radial: 20, smooth: 3, capStart: false, capEnd: true });
      add(g, mats.intake);
      // dark duct face slightly inside the lip
      const s0 = secs[0];
      const inner = loft([
        { ...s0, z: s0.z + 0.25, w: s0.w * 0.88, top: s0.top * 0.85, bot: s0.bot * 0.85 },
        { ...s0, z: s0.z + 0.26, w: s0.w * 0.88, top: s0.top * 0.85, bot: s0.bot * 0.85 },
      ], { radial: 20, smooth: 1, capStart: true, capEnd: false });
      add(inner, mats.dark, root, false);
    };
    if (d.intake) intakeLoft(d.intake.sections);
    if (d.sideIntakes) {
      intakeLoft(d.sideIntakes.sections, d.sideIntakes.x);
      intakeLoft(d.sideIntakes.sections, -d.sideIntakes.x);
    }
    if (d.nacelles) {
      intakeLoft(d.nacelles.sections, d.nacelles.x);
      intakeLoft(d.nacelles.sections, -d.nacelles.x);
    }

    // Canopy, frame, cockpit, pilot
    const c = { ...d.canopy };
    // seat the canopy on the fuselage and make sure it clears the pilot's head
    const midSec = sampleSection(d.fuselage, (c.z0 + c.z1) * 0.5);
    c.y = (midSec.y ?? 0) + midSec.top - 0.1;
    c.h = Math.max(c.h, d.pilotEye.y + 0.3 - c.y);
    const cz0 = c.z0 - cg, cz1 = c.z1 - cg, cl = cz1 - cz0;
    const canopySecs = [
      { z: cz0, w: 0.04, top: 0.03, bot: 0.1, y: c.y },
      { z: cz0 + cl * 0.12, w: c.w * 0.62, top: c.h * 0.45, bot: 0.12, y: c.y },
      { z: cz0 + cl * 0.35, w: c.w * 0.97, top: c.h * 0.92, bot: 0.12, y: c.y },
      { z: cz0 + cl * 0.55, w: c.w, top: c.h, bot: 0.12, y: c.y },
      { z: cz0 + cl * 0.8, w: c.w * 0.82, top: c.h * 0.72, bot: 0.12, y: c.y },
      { z: cz1, w: c.w * 0.3, top: c.h * 0.15, bot: 0.1, y: c.y },
    ];
    this.canopy = add(loft(canopySecs, { radial: 24, smooth: 4 }), mats.glass, root, false);
    this.canopy.renderOrder = 5;
    if (c.frameAt > 0) {
      const fz = cz0 + cl * c.frameAt;
      const frameSec = (dz, k) => ({ z: fz + dz, w: c.w * 0.97 * k, top: c.h * 0.92 * k, bot: 0.12, y: c.y });
      add(loft([frameSec(-0.05, 1.04), frameSec(0.05, 1.04)], { radial: 24, smooth: 1, capStart: true, capEnd: true }), mats.body, root, false);
    }
    // cockpit tub & pilot
    const eyeZ = d.pilotEye.z - cg, eyeY = d.pilotEye.y;
    this.eye = new THREE.Vector3(0, eyeY, eyeZ);
    const tub = new THREE.Mesh(new THREE.BoxGeometry(c.w * 1.5, 0.35, cl * 0.7), mats.cockpit);
    tub.position.set(0, c.y + 0.02, cz0 + cl * 0.5);
    root.add(tub);
    this.pilot = new THREE.Group();
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mats.helmet);
    head.position.set(0, eyeY - 0.02, eyeZ + 0.08);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8), mats.suit);
    torso.position.set(0, eyeY - 0.38, eyeZ + 0.18);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.12), mats.cockpit);
    seat.position.set(0, eyeY - 0.25, eyeZ + 0.45);
    seat.rotation.x = -0.25;
    this.pilot.add(head, torso, seat);
    root.add(this.pilot);
    // instrument panel (visible from cockpit)
    this.panel = new THREE.Group();
    const dash = new THREE.Mesh(new THREE.BoxGeometry(c.w * 1.4, 0.28, 0.18), mats.cockpit);
    dash.position.set(0, eyeY - 0.36, eyeZ - 0.75);
    dash.rotation.x = -0.35;
    this.panel.add(dash);
    const mfdMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.25, 0.12) });
    for (const sx of [-0.18, 0.18]) {
      const mfd = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.15), mfdMat);
      mfd.position.set(sx, eyeY - 0.33, eyeZ - 0.655);
      mfd.rotation.x = -0.35;
      this.panel.add(mfd);
    }
    const hudGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.18), new THREE.MeshBasicMaterial({ color: 0x88ffaa, transparent: true, opacity: 0.06, depthWrite: false }));
    hudGlass.position.set(0, eyeY - 0.08, eyeZ - 0.62);
    hudGlass.rotation.x = 0.35;
    this.panel.add(hudGlass);
    root.add(this.panel);

    // Lifting surfaces
    this.controls = { ailerons: [], flaps: [], stabs: [], canards: [], rudders: [] };
    const buildSurface = (stations, { controls = [], vertical = false, allMoving = null, xform = null, mirror = false, kind = null }) => {
      const surf = new Surface(ZW(stations), { vertical });
      const pieces = [];
      const ranges = controls.filter(Boolean).map((r) => ({ s0: r.range[0], s1: r.range[1], hinge: r.range[2], kind: r.kind })).sort((a, b) => a.s0 - b.s0);
      const fixedGeos = [];
      const moving = [];
      if (allMoving !== null) {
        moving.push({ geo: surf.panel(0, 1, 0, 1, 6, 14), hinge: surf.hinge(0, 1, allMoving), kind });
      } else {
        let s = 0;
        for (const r of ranges) {
          if (r.s0 > s) fixedGeos.push(surf.panel(s, r.s0, 0, 1, 3, 14));
          fixedGeos.push(surf.panel(r.s0, r.s1, 0, r.hinge, 4, 12));
          moving.push({ geo: surf.panel(r.s0, r.s1, r.hinge, 1, 4, 4), hinge: surf.hinge(r.s0, r.s1, r.hinge), kind: r.kind });
          s = r.s1;
        }
        if (s < 1) fixedGeos.push(surf.panel(s, 1, 0, 1, 4, 14));
      }
      const sides = mirror ? [1, -1] : [1];
      for (const side of sides) {
        if (fixedGeos.length) {
          let g = mergeGeometries(fixedGeos);
          if (xform) g.applyMatrix4(xform);
          if (side < 0) g = mirrorX(g);
          add(g, mats.body);
        }
        for (const mv of moving) {
          let g = mv.geo.clone();
          const a = mv.hinge[0].clone(), b = mv.hinge[1].clone();
          if (xform) {
            g.applyMatrix4(xform);
            a.applyMatrix4(xform);
            b.applyMatrix4(xform);
          }
          if (side < 0) {
            g = mirrorX(g);
            a.x = -a.x;
            b.x = -b.x;
          }
          g.translate(-a.x, -a.y, -a.z);
          const pivot = new THREE.Group();
          pivot.position.copy(a);
          root.add(pivot);
          add(g, mats.body, pivot);
          const axis = b.sub(a).normalize();
          this.controls[mv.kind].push({ pivot, axis, side, base: new THREE.Quaternion() });
        }
      }
      pieces.push(surf);
      return surf;
    };

    const wingSurf = buildSurface(d.wing.stations, {
      controls: [d.wing.aileron && { range: d.wing.aileron, kind: 'ailerons' }, d.wing.flap && { range: d.wing.flap, kind: 'flaps' }],
      mirror: true,
    });
    if (d.lex) buildSurface(d.lex.stations, { mirror: true });
    if (d.stab) buildSurface(d.stab.stations, { allMoving: d.stab.pivot, mirror: true, kind: 'stabs' });
    if (d.canard) buildSurface(d.canard.stations, { allMoving: d.canard.pivot, mirror: true, kind: 'canards' });
    for (const vt of d.vtails) {
      const m = new THREE.Matrix4();
      const base = vt.stations[0];
      const rootPt = new THREE.Vector3(0, base.y, 0);
      m.makeTranslation(vt.x, 0, 0)
        .multiply(new THREE.Matrix4().makeTranslation(rootPt.x, rootPt.y, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(vt.cant)))
        .multiply(new THREE.Matrix4().makeTranslation(-rootPt.x, -rootPt.y, 0));
      buildSurface(vt.stations, { vertical: true, controls: [vt.rudder && { range: vt.rudder, kind: 'rudders' }], xform: m });
      this.tailSurface = this.tailSurface || { vt, m };
    }
    for (const vf of d.ventrals || []) {
      const m = new THREE.Matrix4();
      const y0 = vf.stations[0].y;
      m.makeTranslation(vf.x, y0, 0).multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(vf.cant))).multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0));
      buildSurface(vf.stations, { vertical: true, xform: m, mirror: vf.x !== 0 });
    }

    // Decals: roundels on the wings, codes on the fins
    const roundelMat = new THREE.MeshBasicMaterial({ map: getRoundelTexture(spec.insignia), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    roundelMat.toneMapped = true;
    const roundelLit = new THREE.MeshStandardMaterial({ map: getRoundelTexture(spec.insignia), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6, metalness: 0.2 });
    const p = { x: 0, y: 0, z: 0 };
    for (const side of [1, -1]) {
      wingSurf.point(0.72, 0.45, 1, p);
      const st = wingSurf.station(0.72);
      const size = Math.min(1.3, st.chord * 0.55);
      const dec = new THREE.Mesh(new THREE.PlaneGeometry(size, size), roundelLit);
      dec.rotation.x = -Math.PI / 2;
      dec.position.set(p.x * side, p.y + 0.012, p.z);
      root.add(dec);
    }
    roundelMat.dispose();
    if (this.tailSurface) {
      const { vt } = this.tailSurface;
      const textMat = new THREE.MeshStandardMaterial({ map: getTextTexture(spec.tailCode), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6 });
      const tailSurf = new Surface(ZW(vt.stations), { vertical: true });
      tailSurf.point(0.45, 0.42, 1, p);
      const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(this.tailSurface.m);
      const st = tailSurf.station(0.45);
      for (const side of [1, -1]) {
        const dec = new THREE.Mesh(new THREE.PlaneGeometry(st.chord * 0.5, st.chord * 0.25), textMat);
        const cant = THREE.MathUtils.degToRad(vt.cant);
        dec.rotation.order = 'ZYX';
        dec.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, -cant);
        const off = st.t * st.chord * 0.32 + 0.015;
        dec.position.set(v.x + side * Math.cos(cant) * off, v.y - side * Math.sin(cant) * off, v.z);
        root.add(dec);
      }
    }

    // Nozzles & afterburners
    this.flames = [];
    this.flameMat = makeFlameMaterial();
    for (const nz of d.nozzles) {
      const z0 = nz.z - cg;
      const r = nz.r;
      const grp = new THREE.Group();
      grp.position.set(nz.x, nz.y, z0);
      root.add(grp);
      if (nz.type === '2d') {
        const sec = (z, k) => ({ z, w: r * 1.2 * k, top: r * 0.75 * k, bot: r * 0.75 * k, n: 8 });
        add(loft([sec(0, 1.0), sec(nz.len * 0.6, 0.98), sec(nz.len, 0.85)], { radial: 24, smooth: 2, capStart: false, capEnd: false }), mats.metal, grp);
        add(loft([sec(nz.len, 0.78), sec(nz.len * 0.5, 0.72)], { radial: 24, smooth: 1, capStart: false, capEnd: true }), mats.metalDark, grp, false);
      } else {
        add(lathe([[r, 0], [r * 1.02, nz.len * 0.3], [r * 0.96, nz.len * 0.75], [r * 0.9, nz.len]], 28), mats.metal, grp);
        add(lathe([[r * 0.86, nz.len], [r * 0.82, nz.len * 0.4], [r * 0.6, nz.len * 0.1]], 28), mats.metalDark, grp, false);
        // petals ridge ring
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.99, 0.02, 6, 28), mats.metalDark);
        ring.position.z = nz.len * 0.3;
        grp.add(ring);
      }
      // glowing turbine face
      const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.45, 0.15), transparent: true, opacity: 1 });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r * (nz.type === '2d' ? 0.7 : 0.8), 20), glowMat);
      glow.position.z = nz.len * 0.45;
      if (nz.type === '2d') glow.scale.set(1.5, 0.9, 1);
      grp.add(glow);
      // flame
      const flameGeo = new THREE.CylinderGeometry(r * 0.12, r * 0.78, 1, 16, 12, true);
      flameGeo.rotateX(Math.PI / 2);
      flameGeo.translate(0, 0, 0.5);
      const flame = new THREE.Mesh(flameGeo, this.flameMat);
      flame.position.z = nz.len * 0.85;
      flame.frustumCulled = false;
      flame.renderOrder = 20;
      if (nz.type === '2d') flame.scale.set(1.4, 0.7, 1);
      grp.add(flame);
      this.flames.push({ flame, glow, glowMat, r, len: nz.len, baseScale: flame.scale.clone(), exit: new THREE.Vector3(nz.x, nz.y, z0 + nz.len) });
    }

    // Pylons & missiles
    this.missileSlots = [];
    const pylonMat = mats.body;
    for (const py of d.pylons || []) {
      for (const side of [1, -1]) {
        const x = py.x * side, y = py.y, z = py.z - cg;
        if (!py.internal) {
          if (py.rail) {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 2.6), pylonMat);
            rail.position.set(x, y, z);
            root.add(rail);
          } else {
            const ph = py.body ? 0.25 : 0.32;
            const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.08, ph, 1.8), pylonMat);
            pylon.position.set(x, y + ph / 2 + 0.06, z);
            root.add(pylon);
          }
        }
        const mm = makeMissileMesh(py.type, mats);
        const missileY = py.rail ? y - 0.12 : y - 0.12;
        mm.position.set(x, missileY, z);
        mm.visible = !py.internal;
        root.add(mm);
        this.missileSlots.push({ mesh: mm, type: py.type, internal: !!py.internal, local: new THREE.Vector3(x, missileY, z), used: false });
      }
    }

    // Landing gear
    this.gear = new THREE.Group();
    const wheel = (rad, w) => {
      const g = new THREE.CylinderGeometry(rad, rad, w, 16);
      g.rotateZ(Math.PI / 2);
      return g;
    };
    const ng = d.gear.nose;
    const strutGeo = (len) => new THREE.CylinderGeometry(0.06, 0.06, len, 8);
    const nStrut = new THREE.Mesh(strutGeo(ng.len), mats.strut);
    nStrut.position.set(0, ng.y - ng.len / 2, ng.z - cg);
    const nWheel = new THREE.Mesh(wheel(0.28, 0.18), mats.tyre);
    nWheel.position.set(0, ng.y - ng.len, ng.z - cg);
    this.gear.add(nStrut, nWheel);
    const mg = d.gear.main;
    for (const side of [1, -1]) {
      const s = new THREE.Mesh(strutGeo(mg.len), mats.strut);
      s.position.set(mg.x * side, mg.y - mg.len / 2, mg.z - cg);
      const w = new THREE.Mesh(wheel(0.38, 0.26), mats.tyre);
      w.position.set(mg.x * side, mg.y - mg.len, mg.z - cg);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, mg.len * 0.7, 1.0), pylonMat);
      door.position.set(mg.x * side + side * 0.25, mg.y - mg.len * 0.4, mg.z - cg);
      this.gear.add(s, w, door);
    }
    this.gear.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    root.add(this.gear);
    // height of wheels below origin, used for ground contact
    this.gearHeight = -Math.min(ng.y - ng.len - 0.28, mg.y - mg.len - 0.38);
    this.gearZ = { nose: ng.z - cg, main: mg.z - cg };
    this.gearDeploy = opts.gear ? 1 : 0;

    // Nav lights
    const lightGeo = new THREE.SphereGeometry(0.07, 8, 6);
    const mkLight = (col, pos) => {
      const m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: col }));
      m.position.copy(pos);
      root.add(m);
      return m;
    };
    const tipP = { x: 0, y: 0, z: 0 };
    wingSurf.point(1, 0.3, 0, tipP);
    this.navLights = [
      mkLight(new THREE.Color(0.2, 4, 0.5), new THREE.Vector3(tipP.x + 0.05, tipP.y, tipP.z)),
      mkLight(new THREE.Color(4, 0.15, 0.15), new THREE.Vector3(-tipP.x - 0.05, tipP.y, tipP.z)),
    ];
    const tl = d.lights.tail;
    this.strobe = mkLight(new THREE.Color(6, 6, 6), new THREE.Vector3(tl[0], tl[1], tl[2] - cg));
    this.wingtips = [new THREE.Vector3(tipP.x, tipP.y, tipP.z + 0.3), new THREE.Vector3(-tipP.x, tipP.y, tipP.z + 0.3)];

    this.gunPos = new THREE.Vector3(d.gun.x, d.gun.y, d.gun.z - cg);
    const span = tipP.x * 2;
    this.span = span;
    this.length = d.length;
    this.radius = Math.max(span, d.length) * 0.5;
    this.time = 0;
    this._q = new THREE.Quaternion();
  }

  // Animate control surfaces, flames, gear and lights.
  animate(dt, input) {
    this.time += dt;
    const deg = THREE.MathUtils.degToRad;
    const q = this._q;
    const set = (list, angleFn) => {
      for (const c of list) {
        const a = angleFn(c);
        q.setFromAxisAngle(c.axis, a * c.side);
        c.pivot.quaternion.copy(q);
      }
    };
    const pitch = input.pitch || 0, roll = input.roll || 0, yaw = input.yaw || 0;
    // positive angle = trailing edge down (or right for rudders)
    set(this.controls.ailerons, (c) => -deg(18) * roll * c.side);
    set(this.controls.flaps, (c) => deg(input.gear ? 20 : 0) - deg(8) * roll * c.side);
    set(this.controls.stabs, (c) => -deg(20) * pitch - deg(6) * roll * c.side);
    set(this.controls.canards, () => deg(16) * pitch);
    set(this.controls.rudders, () => deg(22) * yaw);

    const ab = input.ab || 0;
    const thr = input.throttle || 0;
    const u = this.flameMat.uniforms;
    u.uAB.value = ab;
    u.uThrottle.value = thr;
    u.uTime.value = this.time;
    for (const f of this.flames) {
      const len = (0.7 + ab * 3.4 + thr * 0.5) * f.r * 2.2 * (0.94 + 0.06 * Math.sin(this.time * 47));
      f.flame.scale.set(f.baseScale.x, f.baseScale.y, len);
      f.flame.visible = ab > 0.01 || thr > 0.7;
      const glow = 0.4 + thr * 1.2 + ab * 4;
      f.glowMat.color.setRGB(1.0 * glow, 0.42 * glow, 0.14 * glow);
    }
    // gear deploy animation
    const target = input.gear ? 1 : 0;
    this.gearDeploy += Math.sign(target - this.gearDeploy) * Math.min(Math.abs(target - this.gearDeploy), dt / 1.8);
    this.gear.visible = this.gearDeploy > 0.02;
    this.gear.scale.set(1, Math.max(0.05, this.gearDeploy), 1);
    this.gear.position.y = (1 - this.gearDeploy) * 0.4;
    // strobe
    this.strobe.visible = this.time % 1.2 < 0.08;
  }

  setCockpitView(on) {
    this.canopy.visible = !on;
    this.pilot.visible = !on;
    this.panel.visible = on;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    this.flameMat.dispose();
  }
}
