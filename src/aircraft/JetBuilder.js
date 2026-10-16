// Assembles a detailed aircraft model from design data: lofted fuselage,
// airfoil wings with moving control surfaces, canopy + pilot, intakes,
// nozzles with afterburner flames, missiles on pylons, gear and nav lights.
// Airliners add turbofan pods, winglets, bogie gear and painted cabin
// windows; supersonic jets get a transonic vapour cone and high-G wing vapour.
import * as THREE from 'three';
import { loft, Surface, mirrorX, lathe, mergeGeometries, sampleSection } from './geometry.js';
import { getLiveryTextures, getRoundelTexture, getTextTexture, getAirlinerTextures, getGlowTexture } from './jetTextures.js';
import { getNoiseTexture } from '../world/textures.js';
import { buildCockpit } from './Cockpit.js';

const matCache = new Map();

function sharedMaterials(spec, quality) {
  const key = spec.id + ':' + quality.textureSize;
  if (matCache.has(key)) return matCache.get(key);
  const size = Math.min(1024, quality.textureSize);
  const withNormal = quality.textureSize >= 1024;
  const airliner = spec.design.type === 'airliner';
  let body, wing, tail, hump = null;
  if (airliner) {
    // glossy airline paint: clearcoat on capable GPUs
    const tex = getAirlinerTextures(spec, spec.design.fuselage, spec.design.hump ? spec.design.hump.sections : null);
    const Paint = quality.postFX ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const paint = (map) => {
      const m = new Paint({ map, roughness: 0.34, metalness: 0.12, name: 'paint' });
      if (m.isMeshPhysicalMaterial) {
        m.clearcoat = 0.7;
        m.clearcoatRoughness = 0.18;
      }
      return m;
    };
    body = paint(tex.fuselage);
    if (tex.hump) hump = paint(tex.hump);
    tail = paint(tex.tail);
    wing = new THREE.MeshStandardMaterial({ map: tex.wing.map, normalMap: withNormal ? tex.wing.normalMap : null, normalScale: new THREE.Vector2(0.4, 0.4), roughness: 0.42, metalness: 0.45, name: 'wing' });
  } else {
    const { map, normalMap } = getLiveryTextures(spec.id, spec.livery, size, withNormal);
    const metalFinish = spec.livery.finish === 'metal';
    body = new THREE.MeshStandardMaterial({
      map, normalMap, normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: metalFinish ? 0.3 : 0.52, metalness: metalFinish ? 0.78 : 0.32, name: 'body',
    });
    wing = body;
    tail = body;
  }
  const intake = body.clone();
  intake.side = THREE.DoubleSide;
  const engineCol = airliner ? spec.livery.engine || '#e8eaed' : null;
  const pod = airliner
    ? new THREE.MeshStandardMaterial({ color: engineCol, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide })
    : body;
  const dark = new THREE.MeshStandardMaterial({ color: 0x141618, roughness: 0.75, metalness: 0.3, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: 0x6d655c, roughness: 0.35, metalness: 0.9 });
  const metalDark = new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide });
  const bright = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.22, metalness: 0.95, side: THREE.DoubleSide });
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
  const out = { body, wing, tail, hump, pod, intake, dark, metal, metalDark, bright, glass, cockpit, helmet, suit, missileBody, missileNose, tyre, strut };
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
  uniform float uCore;
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float t = 1.0 - vUv.y; // 0 at nozzle, 1 at tip
    float facing = abs( dot( vNormalV, vViewV ) );
    float core = pow( facing, 1.5 );
    // shock diamonds: bright knots that fade along the plume
    float diamonds = 0.5 + 0.5 * pow( abs( cos( t * 15.0 - uTime * 2.0 ) ), 5.0 ) * ( 1.0 - t );
    float flicker = 0.88 + 0.12 * sin( uTime * 63.0 + t * 21.0 ) * sin( uTime * 37.0 );
    float fade = pow( max( 1.0 - t, 0.0 ), 1.35 );
    vec3 hot = vec3( 1.0, 0.85, 0.65 );
    vec3 blue = vec3( 0.5, 0.62, 1.0 );
    vec3 orange = vec3( 1.0, 0.4, 0.09 );
    vec3 col = mix( orange, hot, core * ( 1.0 - t * 0.6 ) );
    col = mix( col, blue, ( 1.0 - t ) * 0.4 * core );
    if ( uCore > 0.5 ) {
      // narrow white-blue inner core with the brightest shock knots
      col = mix( vec3( 0.75, 0.82, 1.0 ), vec3( 1.0, 0.95, 0.85 ), diamonds );
      fade = pow( max( 1.0 - t * 1.25, 0.0 ), 2.0 );
    }
    float a = fade * core * diamonds * flicker * ( uAB * 1.0 + uThrottle * 0.08 );
    gl_FragColor = vec4( col * a * ( uCore > 0.5 ? 6.0 : 5.0 ), 1.0 );
  }
`;

function makeFlameMaterial(core = false) {
  return new THREE.ShaderMaterial({
    uniforms: { uAB: { value: 0 }, uThrottle: { value: 0 }, uTime: { value: 0 }, uCore: { value: core ? 1 : 0 } },
    vertexShader: flameVertex,
    fragmentShader: flameFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// --- Condensation: transonic vapour cone and high-G wing vapour ----------------
const vaporVertex = /* glsl */ `
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
const vaporFragment = /* glsl */ `
  uniform sampler2D uNoise;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec3 uLight;
  uniform float uMode; // 0 cone, 1 wing sheet
  varying vec2 vUv;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    float a;
    float n;
    if ( uMode < 0.5 ) {
      // cone: u around the body, v from the narrow front (0) to the shock (1)
      float along = vUv.y;
      n = texture2D( uNoise, vec2( vUv.x * 3.0 + uTime * 0.21, along * 0.7 - uTime * 1.9 ) ).r;
      float n2 = texture2D( uNoise, vec2( vUv.x * 9.0 - uTime * 0.13, along * 1.6 - uTime * 2.7 ) ).g;
      float shape = smoothstep( 0.05, 0.8, along ) * ( 1.0 - smoothstep( 0.86, 1.0, along ) );
      float rim = pow( 1.0 - abs( dot( normalize( vNormalV ), normalize( vViewV ) ) ), 1.2 );
      a = shape * ( 0.3 + 0.7 * rim ) * smoothstep( 0.25, 0.8, n * 0.65 + n2 * 0.55 );
    } else {
      // wing sheet: u chordwise from the leading edge, v spanwise
      n = texture2D( uNoise, vec2( vUv.y * 4.0 + uTime * 0.05, vUv.x * 1.2 - uTime * 3.5 ) ).r;
      float n2 = texture2D( uNoise, vec2( vUv.y * 11.0, vUv.x * 2.5 - uTime * 5.0 ) ).b;
      float chord = smoothstep( 0.0, 0.12, vUv.x ) * ( 1.0 - smoothstep( 0.35, 1.0, vUv.x ) );
      float span = smoothstep( 0.0, 0.15, vUv.y ) * ( 1.0 - smoothstep( 0.7, 1.0, vUv.y ) );
      a = chord * span * smoothstep( 0.3, 0.75, n * 0.6 + n2 * 0.5 );
    }
    a *= uIntensity;
    if ( a < 0.003 ) discard;
    gl_FragColor = vec4( uLight * ( 0.88 + 0.24 * n ), a * 0.8 );
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeVaporMaterial(mode) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uNoise: { value: getNoiseTexture() }, uIntensity: { value: 0 }, uTime: { value: 0 },
      uLight: { value: new THREE.Color(1.6, 1.6, 1.65) }, uMode: { value: mode },
    },
    vertexShader: vaporVertex,
    fragmentShader: vaporFragment,
    transparent: true,
    depthWrite: false,
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

// Replace a geometry's UVs with a planar projection over a box (used for tail
// artwork so the logo covers the whole fin, rudder included).
function remapUV(geo, box, vertical) {
  const pos = geo.getAttribute('position');
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const a = vertical ? pos.getY(i) : pos.getX(i);
    uv[i * 2] = (pos.getZ(i) - box.z0) / Math.max(1e-3, box.z1 - box.z0);
    uv[i * 2 + 1] = (a - box.a0) / Math.max(1e-3, box.a1 - box.a0);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

// --- Builder -----------------------------------------------------------------

export class JetModel {
  constructor(spec, quality, opts = {}) {
    this.spec = spec;
    this.quality = quality;
    const d = spec.design;
    const cg = d.cg;
    const airliner = d.type === 'airliner';
    this.airliner = airliner;
    const mats = sharedMaterials(spec, quality);
    this.mats = mats;
    this.ownMaterials = [];
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
    const radial = airliner ? (quality.terrainSegments >= 32 ? 44 : 28) : quality.terrainSegments >= 32 ? 32 : 20;
    const fusSecs = d.fuselage;
    const uvZ = [fusSecs[0].z - cg, fusSecs[fusSecs.length - 1].z - cg];

    // Fuselage (optionally with a droop nose or an open nose intake) + spine
    if (d.droopNose) {
      const zs = d.droopNose.z;
      const front = fusSecs.filter((s) => s.z <= zs);
      const split = sampleSection(fusSecs, zs);
      const back = [split, ...fusSecs.filter((s) => s.z > zs)];
      if (front[front.length - 1].z < zs) front.push(split);
      add(loft(Z(back), { radial, smooth: 4, capStart: false, capEnd: true, uvZ }), mats.body);
      this.droop = new THREE.Group();
      const hingeY = (split.y ?? 0) - split.bot * 0.7;
      this.droop.position.set(0, hingeY, zs - cg);
      root.add(this.droop);
      const nose = loft(Z(front), { radial, smooth: 4, capStart: true, capEnd: false, uvZ });
      nose.translate(0, -hingeY, -(zs - cg));
      add(nose, mats.body, this.droop);
      this.droopAngle = THREE.MathUtils.degToRad(d.droopNose.angle);
      this.droopValue = opts.gear ? 1 : 0;
    } else {
      add(loft(Z(fusSecs), { radial, smooth: 4, capStart: !d.noseIntake, capEnd: true, uvZ }), mats.body);
    }
    if (d.noseIntake) {
      // MiG-21 style: open ring with a translating shock cone
      const s0 = fusSecs[0];
      const ni = d.noseIntake;
      const cone = lathe([[0.001, -ni.coneLen * 0.45], [ni.coneR * 0.55, -ni.coneLen * 0.15], [ni.coneR, ni.coneLen * 0.3], [ni.coneR * 0.9, ni.coneLen * 0.6]], 24);
      add(cone, mats.metal).position.set(0, s0.y ?? 0, s0.z - cg);
      const face = new THREE.Mesh(new THREE.CircleGeometry(s0.w * 0.98, 24), mats.dark);
      face.rotation.y = Math.PI;
      face.position.set(0, s0.y ?? 0, s0.z - cg + 0.8);
      root.add(face);
      const lip = new THREE.Mesh(new THREE.TorusGeometry(s0.w * 0.97, 0.035, 6, 28), mats.bright);
      lip.position.set(0, s0.y ?? 0, s0.z - cg + 0.02);
      root.add(lip);
    }
    if (d.hump) add(loft(Z(d.hump.sections), { radial, smooth: 4 }), mats.hump || mats.body);
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
    // closed fairings such as landing-gear sponsons
    for (const f of d.fairings || []) {
      for (const side of [1, -1]) add(loft(Z(f.sections).map((sec) => ({ ...sec, x: f.x * side })), { radial: 20, smooth: 3 }), mats.body);
    }

    // Canopy, frame, cockpit tub, pilot (fighters). Airliners paint their
    // flight-deck windows into the livery instead.
    const eyeX = d.pilotEye.x || 0, eyeZ = d.pilotEye.z - cg, eyeY = d.pilotEye.y;
    this.eye = new THREE.Vector3(eyeX, eyeY, eyeZ);
    this.canopyInfo = null;
    if (d.canopy) {
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
      this.canopyInfo = { c, cz0, cz1, cl, canopySecs };
      this.canopy = add(loft(canopySecs, { radial: 24, smooth: 4 }), mats.glass, root, false);
      this.canopy.renderOrder = 5;
      if (c.frameAt > 0) {
        const fz = cz0 + cl * c.frameAt;
        const frameSec = (dz, k) => ({ z: fz + dz, w: c.w * 0.97 * k, top: c.h * 0.92 * k, bot: 0.12, y: c.y });
        add(loft([frameSec(-0.05, 1.04), frameSec(0.05, 1.04)], { radial: 24, smooth: 1, capStart: true, capEnd: true }), mats.body, root, false);
      }
      const tub = new THREE.Mesh(new THREE.BoxGeometry(c.w * 1.5, 0.35, cl * 0.7), mats.cockpit);
      tub.position.set(0, c.y + 0.02, cz0 + cl * 0.5);
      root.add(tub);
      this.pilot = new THREE.Group();
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 10), mats.helmet);
      head.position.set(0, eyeY - 0.02, eyeZ + 0.08);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.152, 12, 8, -Math.PI * 0.5, Math.PI, Math.PI * 0.35, Math.PI * 0.3), mats.glass);
      visor.position.copy(head.position);
      visor.rotation.y = Math.PI;
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.5, 8), mats.suit);
      torso.position.set(0, eyeY - 0.38, eyeZ + 0.18);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.12), mats.cockpit);
      seat.position.set(0, eyeY - 0.25, eyeZ + 0.45);
      seat.rotation.x = -0.25;
      this.pilot.add(head, visor, torso, seat);
      root.add(this.pilot);
    }

    // Lifting surfaces
    this.controls = { ailerons: [], flaps: [], stabs: [], canards: [], rudders: [], elevators: [] };
    const buildSurface = (stations, { controls = [], vertical = false, allMoving = null, xform = null, mirror = false, kind = null, material = mats.body, mount = null, uvBox = null }) => {
      const surf = new Surface(ZW(stations), { vertical });
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
      if (uvBox) {
        for (const g of fixedGeos) remapUV(g, uvBox, vertical);
        for (const mv of moving) remapUV(mv.geo, uvBox, vertical);
      }
      const sides = mirror ? [1, -1] : [1];
      for (const side of sides) {
        const parent = mount ? (side > 0 ? mount.right : mount.left) : root;
        const off = mount ? (side > 0 ? mount.origin : mount.originL) : null;
        if (fixedGeos.length) {
          let g = mergeGeometries(fixedGeos);
          if (xform) g.applyMatrix4(xform);
          if (side < 0) g = mirrorX(g);
          if (off) g.translate(-off.x, -off.y, -off.z);
          add(g, material, parent);
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
          if (off) pivot.position.sub(off);
          parent.add(pivot);
          add(g, material, pivot);
          const axis = b.sub(a).normalize();
          this.controls[mv.kind].push({ pivot, axis, side, base: new THREE.Quaternion() });
        }
      }
      return surf;
    };

    // Main wing, optionally on variable-sweep pivots (F-14)
    let wingMount = null;
    const sw = d.wing.sweep;
    if (sw) {
      const wy = d.wing.stations[0].y;
      const pR = new THREE.Vector3(sw.x, wy, sw.z - cg);
      const pL = new THREE.Vector3(-sw.x, wy, sw.z - cg);
      const right = new THREE.Group();
      const left = new THREE.Group();
      right.position.copy(pR);
      left.position.copy(pL);
      root.add(right, left);
      wingMount = { right, left, origin: pR, originL: pL };
      this.sweep = { ...sw, mount: wingMount, value: 0 };
    }
    this.wingMount = wingMount;
    const wingSurf = buildSurface(d.wing.stations, {
      controls: [d.wing.aileron && { range: d.wing.aileron, kind: 'ailerons' }, d.wing.flap && { range: d.wing.flap, kind: 'flaps' }],
      mirror: true, material: mats.wing, mount: wingMount,
    });
    if (d.lex) buildSurface(d.lex.stations, { mirror: true, material: mats.body });
    if (d.stab) {
      if (d.stab.elevator) buildSurface(d.stab.stations, { controls: [{ range: d.stab.elevator, kind: 'elevators' }], mirror: true, material: mats.wing });
      else buildSurface(d.stab.stations, { allMoving: d.stab.pivot, mirror: true, kind: 'stabs', material: mats.wing });
    }
    if (d.canard) buildSurface(d.canard.stations, { allMoving: d.canard.pivot, mirror: true, kind: 'canards' });
    for (const vt of d.vtails) {
      const m = new THREE.Matrix4();
      const base = vt.stations[0];
      const rootPt = new THREE.Vector3(0, base.y, 0);
      m.makeTranslation(vt.x, 0, 0)
        .multiply(new THREE.Matrix4().makeTranslation(rootPt.x, rootPt.y, 0))
        .multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(vt.cant)))
        .multiply(new THREE.Matrix4().makeTranslation(-rootPt.x, -rootPt.y, 0));
      let uvBox = null;
      if (airliner) {
        const st = vt.stations;
        uvBox = {
          z0: Math.min(...st.map((s) => s.z)) - cg, z1: Math.max(...st.map((s) => s.z + s.chord)) - cg,
          a0: Math.min(...st.map((s) => s.y)), a1: Math.max(...st.map((s) => s.y)),
        };
      }
      buildSurface(vt.stations, { vertical: true, controls: [vt.rudder && { range: vt.rudder, kind: 'rudders' }], xform: m, material: airliner ? mats.tail : mats.body, uvBox });
      if (!this.tailSurface) this.tailSurface = { vt, m };
    }
    for (const vf of d.ventrals || []) {
      const m = new THREE.Matrix4();
      const y0 = vf.stations[0].y;
      m.makeTranslation(vf.x, y0, 0).multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(vf.cant))).multiply(new THREE.Matrix4().makeTranslation(0, -y0, 0));
      buildSurface(vf.stations, { vertical: true, xform: m, mirror: vf.x !== 0 });
    }
    // Winglets / sharklets / wingtip fences on the last wing station
    const tipSt = d.wing.stations[d.wing.stations.length - 1];
    for (const wl of d.winglets || []) {
      const m = new THREE.Matrix4();
      m.makeTranslation(tipSt.x, tipSt.y, 0).multiply(new THREE.Matrix4().makeRotationZ(-THREE.MathUtils.degToRad(wl.cant || 0)));
      const z0 = tipSt.z + Math.max(0, tipSt.chord - wl.chord0) * 0.85;
      buildSurface([{ x: 0, y: 0, z: z0, chord: wl.chord0, t: 0.06 }, { x: 0, y: wl.h, z: z0 + wl.sweep, chord: wl.chord1, t: 0.05 }], { vertical: true, xform: m, mirror: true, material: airliner ? mats.tail : mats.wing });
    }

    // Decals: roundels on the wings, codes on the fins
    const p = { x: 0, y: 0, z: 0 };
    if (spec.insignia) {
      const roundelLit = new THREE.MeshStandardMaterial({ map: getRoundelTexture(spec.insignia), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6, metalness: 0.2 });
      this.ownMaterials.push(roundelLit);
      for (const side of [1, -1]) {
        wingSurf.point(0.72, 0.45, 1, p);
        const st = wingSurf.station(0.72);
        const size = Math.min(1.3, st.chord * 0.55);
        const dec = new THREE.Mesh(new THREE.PlaneGeometry(size, size), roundelLit);
        dec.rotation.x = -Math.PI / 2;
        dec.position.set(p.x * side, p.y + 0.012, p.z);
        if (wingMount) {
          dec.position.sub(side > 0 ? wingMount.origin : wingMount.originL);
          (side > 0 ? wingMount.right : wingMount.left).add(dec);
        } else root.add(dec);
      }
    }
    if (this.tailSurface && spec.tailCode) {
      const { vt } = this.tailSurface;
      const textMat = new THREE.MeshStandardMaterial({ map: getTextTexture(spec.tailCode), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.6 });
      this.ownMaterials.push(textMat);
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
    this.exhausts = [];
    this.flameMat = makeFlameMaterial(false);
    this.flameCoreMat = makeFlameMaterial(true);
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
      this.ownMaterials.push(glowMat);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(r * (nz.type === '2d' ? 0.7 : 0.8), 20), glowMat);
      glow.position.z = nz.len * 0.45;
      if (nz.type === '2d') glow.scale.set(1.5, 0.9, 1);
      grp.add(glow);
      // flame: outer plume + narrow inner core
      const flameGeo = new THREE.CylinderGeometry(r * 0.12, r * 0.78, 1, 16, 12, true);
      flameGeo.rotateX(Math.PI / 2);
      flameGeo.translate(0, 0, 0.5);
      const flame = new THREE.Mesh(flameGeo, this.flameMat);
      flame.position.z = nz.len * 0.85;
      flame.frustumCulled = false;
      flame.renderOrder = 20;
      if (nz.type === '2d') flame.scale.set(1.4, 0.7, 1);
      grp.add(flame);
      const coreGeo = new THREE.CylinderGeometry(r * 0.05, r * 0.42, 1, 12, 10, true);
      coreGeo.rotateX(Math.PI / 2);
      coreGeo.translate(0, 0, 0.5);
      const core = new THREE.Mesh(coreGeo, this.flameCoreMat);
      core.position.z = nz.len * 0.85;
      core.frustumCulled = false;
      core.renderOrder = 21;
      if (nz.type === '2d') core.scale.set(1.4, 0.7, 1);
      grp.add(core);
      const exit = new THREE.Vector3(nz.x, nz.y, z0 + nz.len);
      this.flames.push({ flame, core, glow, glowMat, r, len: nz.len, baseScale: flame.scale.clone(), coreScale: core.scale.clone(), exit });
      this.exhausts.push(exit);
    }

    // Turbofan pods on pylons (airliners, A-10)
    for (const pod of d.pods || []) {
      for (const side of pod.x !== 0 ? [1, -1] : [1]) this._buildPod(pod, side, cg, add, pod.color === 'body' ? mats.body : mats.pod);
    }
    // Box nacelles (Concorde)
    for (const nb of d.nacelleBoxes || []) {
      for (const side of [1, -1]) {
        const cx = ((nb.x0 + nb.x1) / 2) * side, w = (nb.x1 - nb.x0) / 2;
        const cy = (nb.top + nb.bottom) / 2, h = (nb.top - nb.bottom) / 2;
        const sec = (z, k = 1) => ({ z: z - cg, x: cx, w: w * k, top: h * k, bot: h * k, y: cy, n: 7, nb: 7 });
        add(loft([sec(nb.z0, 0.96), sec(nb.z0 + 1.2), sec(nb.z1 - 2.0), sec(nb.z1, 0.92)], { radial: 28, smooth: 3, capStart: false, capEnd: true }), mats.pod);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.8, h * 1.7), mats.dark);
        face.rotation.y = Math.PI;
        face.position.set(cx, cy, nb.z0 - cg + 0.6);
        root.add(face);
      }
    }
    if (!this.exhausts.length) this.exhausts.push(new THREE.Vector3(0, 0, d.length - cg));

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
        const missileY = y - 0.12;
        mm.position.set(x, missileY, z);
        mm.visible = !py.internal;
        root.add(mm);
        this.missileSlots.push({ mesh: mm, type: py.type, internal: !!py.internal, local: new THREE.Vector3(x, missileY, z), used: false });
      }
    }

    // Landing gear: single wheels for fighters, twin nose wheels and
    // multi-axle bogies for airliners
    this.gear = new THREE.Group();
    const wheelGeo = (rad, w) => {
      const g = new THREE.CylinderGeometry(rad, rad, w, 18);
      g.rotateZ(Math.PI / 2);
      return g;
    };
    let lowest = 0;
    const leg = (x, g, defR, isNose) => {
      const r = g.r ?? defR;
      const strutR = Math.max(0.06, r * 0.16);
      const s = new THREE.Mesh(new THREE.CylinderGeometry(strutR, strutR, g.len, 8), mats.strut);
      s.position.set(x, g.y - g.len / 2, g.z - cg);
      this.gear.add(s);
      const wy = g.y - g.len;
      const ww = r * 0.62;
      if (g.axles) {
        const pitch = g.pitch ?? r * 2.3;
        const n = g.axles;
        if (n > 1) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(strutR * 1.6, strutR * 1.6, pitch * (n - 1) + r * 0.6), mats.strut);
          beam.position.set(x, wy, g.z - cg);
          this.gear.add(beam);
        }
        for (let k = 0; k < n; k++) {
          const zz = g.z - cg + (k - (n - 1) / 2) * pitch;
          for (const sx of [-1, 1]) {
            const w = new THREE.Mesh(wheelGeo(r, ww), mats.tyre);
            w.position.set(x + sx * (ww * 0.62 + strutR), wy, zz);
            this.gear.add(w);
          }
        }
      } else if (g.twin) {
        for (const sx of [-1, 1]) {
          const w = new THREE.Mesh(wheelGeo(r, ww), mats.tyre);
          w.position.set(x + sx * (ww * 0.62 + strutR), wy, g.z - cg);
          this.gear.add(w);
        }
      } else {
        const w = new THREE.Mesh(wheelGeo(r, isNose ? 0.18 : 0.26), mats.tyre);
        w.position.set(x, wy, g.z - cg);
        this.gear.add(w);
      }
      if (!isNose && !airliner) {
        const door = new THREE.Mesh(new THREE.BoxGeometry(0.03, g.len * 0.7, 1.0), pylonMat);
        door.position.set(x + Math.sign(x || 1) * 0.25, g.y - g.len * 0.4, g.z - cg);
        this.gear.add(door);
      }
      lowest = Math.min(lowest, wy - r);
    };
    const ng = d.gear.nose;
    leg(0, ng, 0.28, true);
    const mg = d.gear.main;
    for (const side of [1, -1]) leg(mg.x * side, mg, 0.38, false);
    if (d.gear.body) for (const side of [1, -1]) leg(d.gear.body.x * side, d.gear.body, 0.38, false);
    this.gear.traverse((o) => { if (o.isMesh) o.castShadow = shadows; });
    root.add(this.gear);
    // height of wheels below origin, used for ground contact
    this.gearHeight = -lowest;
    this.gearZ = { nose: ng.z - cg, main: mg.z - cg };
    this.gearDeploy = opts.gear ? 1 : 0;

    // Lights: nav lights, strobes and beacons, each with a soft glow sprite
    this.lightSprites = [];
    const lightGeo = new THREE.SphereGeometry(airliner ? 0.12 : 0.07, 8, 6);
    const glowTex = getGlowTexture();
    const mkLight = (col, pos, parent = root, glowSize = 1.4) => {
      const mat = new THREE.MeshBasicMaterial({ color: col });
      this.ownMaterials.push(mat);
      const m = new THREE.Mesh(lightGeo, mat);
      m.position.copy(pos);
      parent.add(m);
      const sm = new THREE.SpriteMaterial({ map: glowTex, color: col.clone().multiplyScalar(0.35), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
      this.ownMaterials.push(sm);
      const sp = new THREE.Sprite(sm);
      sp.scale.setScalar(glowSize);
      m.add(sp);
      this.lightSprites.push(sp);
      return m;
    };
    const tipP = { x: 0, y: 0, z: 0 };
    wingSurf.point(1, 0.3, 0, tipP);
    const tipR = new THREE.Vector3(tipP.x + 0.05, tipP.y, tipP.z);
    const tipL = new THREE.Vector3(-tipP.x - 0.05, tipP.y, tipP.z);
    const greenCol = new THREE.Color(0.2, 4, 0.5), redCol = new THREE.Color(4, 0.15, 0.15), whiteCol = new THREE.Color(6, 6, 6);
    if (wingMount) {
      this.navLights = [
        mkLight(greenCol, tipR.clone().sub(wingMount.origin), wingMount.right),
        mkLight(redCol, tipL.clone().sub(wingMount.originL), wingMount.left),
      ];
    } else this.navLights = [mkLight(greenCol, tipR), mkLight(redCol, tipL)];
    const tl = d.lights.tail;
    this.strobe = mkLight(whiteCol, new THREE.Vector3(tl[0], tl[1], tl[2] - cg), root, 1.6);
    this.beacons = (d.lights.beacons || []).map((b) => mkLight(new THREE.Color(5, 0.25, 0.15), new THREE.Vector3(b[0], b[1], b[2] - cg), root, 2.4));
    this.tipStrobes = airliner ? [mkLight(whiteCol, tipR.clone().add(new THREE.Vector3(0, 0, 0.4)), root, 2.6), mkLight(whiteCol, tipL.clone().add(new THREE.Vector3(0, 0, 0.4)), root, 2.6)] : [];
    this.wingtips = [new THREE.Vector3(tipP.x, tipP.y, tipP.z + 0.3), new THREE.Vector3(-tipP.x, tipP.y, tipP.z + 0.3)];
    this._wingtipBase = this.wingtips.map((w) => w.clone());

    // Condensation effects (supersonic aircraft only)
    this.vaporCone = null;
    this.wingVapor = [];
    if (spec.flight.maxMach > 1.05) {
      const maxW = Math.max(...d.fuselage.map((s) => s.w));
      const wr = d.wing.stations[0];
      const zBack = wr.z + wr.chord * 0.95 - cg;
      const zFront = Math.min(zBack - 2, Math.max((d.canopy ? d.canopy.z1 : d.length * 0.25) - cg, zBack - d.length * 0.35));
      const r0 = maxW * 1.25, r1 = Math.max(maxW * 2.2, Math.min(tipP.x * 0.8, d.length * 0.3));
      const prof = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        prof.push(new THREE.Vector2(r0 + (r1 - r0) * Math.pow(t, 1.7), zFront + (zBack - zFront) * t));
      }
      const g = new THREE.LatheGeometry(prof, 36);
      g.rotateX(Math.PI / 2);
      // LatheGeometry runs along +y which rotateX maps to +z; keep uv.v front-to-back
      this.vaporMat = makeVaporMaterial(0);
      this.ownMaterials.push(this.vaporMat);
      this.vaporCone = new THREE.Mesh(g, this.vaporMat);
      this.vaporCone.renderOrder = 22;
      this.vaporCone.visible = false;
      this.vaporCone.frustumCulled = false;
      root.add(this.vaporCone);
    }
    if (!airliner && spec.category !== 'attack') {
      this.wingVaporMat = makeVaporMaterial(1);
      this.ownMaterials.push(this.wingVaporMat);
      const ns = 6, nc = 6;
      const pos = [], uv = [], idx = [];
      const q = { x: 0, y: 0, z: 0 };
      for (let i = 0; i <= ns; i++) {
        const s = 0.05 + (i / ns) * 0.85;
        for (let j = 0; j <= nc; j++) {
          const c = (j / nc) * 0.85;
          wingSurf.point(s, c, 1, q);
          pos.push(q.x, q.y + 0.05 + c * 0.25, q.z);
          uv.push(j / nc, i / ns);
        }
      }
      for (let i = 0; i < ns; i++) {
        for (let j = 0; j < nc; j++) {
          const a = i * (nc + 1) + j, b = a + 1, c2 = a + nc + 1, e = c2 + 1;
          idx.push(a, c2, b, b, c2, e);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      for (const side of [1, -1]) {
        let gg = side > 0 ? g : mirrorX(g);
        const parent = wingMount ? (side > 0 ? wingMount.right : wingMount.left) : root;
        if (wingMount) {
          gg = gg.clone();
          const off = side > 0 ? wingMount.origin : wingMount.originL;
          gg.translate(-off.x, -off.y, -off.z);
        }
        const m = new THREE.Mesh(gg, this.wingVaporMat);
        m.renderOrder = 23;
        m.visible = false;
        m.frustumCulled = false;
        parent.add(m);
        this.wingVapor.push(m);
      }
    }

    this.gunPos = new THREE.Vector3(d.gun.x, d.gun.y, d.gun.z - cg);
    const span = tipP.x * 2;
    this.span = span;
    this.length = d.length;
    this.radius = Math.max(span, d.length) * 0.5;
    this.maxWidth = Math.max(...d.fuselage.map((s) => s.w));
    this.time = 0;
    this.lightGlow = 0;
    this.cockpit = null;
    this.cockpitOn = false;
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
  }

  _buildPod(pod, side, cg, add, mat) {
    const mats = this.mats;
    const r = pod.r, len = pod.len;
    const g = new THREE.Group();
    g.position.set(pod.x * side, pod.y, pod.z - cg);
    if (pod.flat) g.scale.y = pod.flat;
    this.root.add(g);
    // fan cowl and thrust reverser
    add(lathe([[r * 0.86, 0], [r * 0.97, len * 0.04], [r, len * 0.14], [r * 0.99, len * 0.42], [r * 0.9, len * 0.7], [r * 0.74, len * 0.86]], 32), mat, g);
    // bright inlet lip and dark intake duct
    add(lathe([[r * 0.8, len * 0.16], [r * 0.81, len * 0.05], [r * 0.86, 0]], 32), mats.bright, g, false);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 32), mats.dark);
    fan.rotation.y = Math.PI;
    fan.position.z = len * 0.16;
    g.add(fan);
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(r * 0.24, r * 0.5, 16), mats.metal);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = len * 0.16 - r * 0.25;
    g.add(spinner);
    // core cowl, nozzle and plug
    add(lathe([[r * 0.66, len * 0.8], [r * 0.6, len * 0.95], [r * 0.48, len * 1.08]], 28), mats.metal, g);
    add(lathe([[r * 0.38, len * 1.04], [r * 0.24, len * 1.16], [0.02, len * 1.26]], 20), mats.metalDark, g, false);
    // pylon towards the wing (or the fuselage for rear-mounted engines)
    if (pod.pylon) {
      const tx = pod.pylon.x * side - pod.x * side, ty = (pod.pylon.y - pod.y) / (pod.flat || 1);
      const dist = Math.hypot(tx, ty);
      const l = Math.max(0.2, dist - r * 0.7);
      // optional explicit z range lets a pylon reach back under a high wing
      const pz0 = pod.pylon.z0 !== undefined ? pod.pylon.z0 - pod.z : len * 0.24;
      const pz1 = pod.pylon.z1 !== undefined ? pod.pylon.z1 - pod.z : len * 0.86;
      const pyl = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.16, r * 0.24), l, pz1 - pz0), mat);
      const ang = Math.atan2(tx, ty);
      pyl.rotation.z = -ang;
      const k = (r * 0.7 + l / 2) / dist;
      pyl.position.set(tx * k, ty * k, (pz0 + pz1) / 2);
      pyl.castShadow = this.quality.shadows;
      g.add(pyl);
    }
    this.exhausts.push(new THREE.Vector3(pod.x * side, pod.y, pod.z - cg + len * 1.15));
  }

  // Animate control surfaces, flames, gear, lights and condensation.
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
    const flapsDown = input.gear ? 1 : 0;
    // positive angle = trailing edge down (or right for rudders)
    set(this.controls.ailerons, (c) => -deg(18) * roll * c.side);
    set(this.controls.flaps, (c) => deg(this.airliner ? 30 : 20) * flapsDown - deg(this.airliner ? 0 : 8) * roll * c.side);
    set(this.controls.stabs, (c) => -deg(20) * pitch - deg(6) * roll * c.side);
    set(this.controls.elevators, () => -deg(22) * pitch);
    set(this.controls.canards, () => deg(16) * pitch);
    set(this.controls.rudders, () => deg(22) * yaw);

    // variable sweep schedule: wings fold back as Mach rises
    if (this.sweep) {
      const sw = this.sweep;
      const target = THREE.MathUtils.smoothstep(input.mach ?? 0.5, 0.5, 0.95);
      sw.value += (target - sw.value) * Math.min(1, dt * 0.8);
      const ang = deg((sw.max - sw.min) * sw.value);
      sw.mount.right.rotation.y = -ang;
      sw.mount.left.rotation.y = ang;
      for (let i = 0; i < 2; i++) {
        const piv = i === 0 ? sw.mount.origin : sw.mount.originL;
        const a = i === 0 ? -ang : ang;
        this._v.copy(this._wingtipBase[i]).sub(piv).applyAxisAngle(THREE.Object3D.DEFAULT_UP, a).add(piv);
        this.wingtips[i].copy(this._v);
      }
    }

    // Concorde droop nose follows the gear
    if (this.droop) {
      const tgt = input.gear ? 1 : 0;
      this.droopValue += Math.sign(tgt - this.droopValue) * Math.min(Math.abs(tgt - this.droopValue), dt / 4);
      this.droop.rotation.x = -this.droopAngle * this.droopValue;
    }

    const ab = input.ab || 0;
    const thr = input.throttle || 0;
    for (const m of [this.flameMat, this.flameCoreMat]) {
      const u = m.uniforms;
      u.uAB.value = ab;
      u.uThrottle.value = thr;
      u.uTime.value = this.time;
    }
    for (const f of this.flames) {
      const len = (0.7 + ab * 3.4 + thr * 0.5) * f.r * 2.2 * (0.94 + 0.06 * Math.sin(this.time * 47));
      f.flame.scale.set(f.baseScale.x, f.baseScale.y, len);
      f.core.scale.set(f.coreScale.x, f.coreScale.y, len * 0.62);
      f.flame.visible = ab > 0.01 || thr > 0.7;
      f.core.visible = ab > 0.05;
      const glow = 0.4 + thr * 1.2 + ab * 4;
      f.glowMat.color.setRGB(1.0 * glow, 0.42 * glow, 0.14 * glow);
    }
    // gear deploy animation
    const target = input.gear ? 1 : 0;
    this.gearDeploy += Math.sign(target - this.gearDeploy) * Math.min(Math.abs(target - this.gearDeploy), dt / 1.8);
    this.gear.visible = this.gearDeploy > 0.02;
    this.gear.scale.set(1, Math.max(0.05, this.gearDeploy), 1);
    this.gear.position.y = (1 - this.gearDeploy) * 0.4;
    // strobes, beacons and light glow
    const t = this.time;
    this.strobe.visible = t % 1.2 < 0.08;
    const beaconOn = t % 1.1 < 0.12;
    for (const b of this.beacons) b.visible = beaconOn;
    const tipOn = t % 1.3 < 0.06 || (t % 1.3 > 0.16 && t % 1.3 < 0.22);
    for (const s of this.tipStrobes) s.visible = tipOn;
    const glow = Math.max(0.12, input.lightGlow ?? this.lightGlow);
    for (const sp of this.lightSprites) sp.material.opacity = glow;

    // condensation: transonic cone near Mach 1, wing vapour at high G
    const alt = input.altitude ?? 1000;
    const humid = 0.25 + 0.75 * (1 - THREE.MathUtils.smoothstep(alt, 2500, 9000));
    if (this.vaporCone) {
      const m = input.mach ?? 0;
      const cone = THREE.MathUtils.smoothstep(m, 0.93, 0.985) * (1 - THREE.MathUtils.smoothstep(m, 1.03, 1.12)) * humid;
      this.vaporCone.visible = cone > 0.01;
      this.vaporMat.uniforms.uIntensity.value = cone;
      this.vaporMat.uniforms.uTime.value = t;
    }
    if (this.wingVapor.length) {
      const g = Math.abs(input.gLoad ?? 1);
      const aoa = Math.abs(input.alpha ?? 0);
      const v = THREE.MathUtils.smoothstep(g, 4.5, 7.5) * THREE.MathUtils.smoothstep(aoa, 0.08, 0.22) * humid * THREE.MathUtils.smoothstep(input.speed ?? 200, 90, 170);
      for (const w of this.wingVapor) w.visible = v > 0.01;
      this.wingVaporMat.uniforms.uIntensity.value = v;
      this.wingVaporMat.uniforms.uTime.value = t;
    }
  }

  // Tints both condensation effects (sun colour) so they match the scene.
  setVaporLight(color) {
    if (this.vaporMat) this.vaporMat.uniforms.uLight.value.copy(color);
    if (this.wingVaporMat) this.wingVaporMat.uniforms.uLight.value.copy(color);
  }

  setCockpitView(on) {
    this.cockpitOn = on;
    if (on && !this.cockpit) {
      this.cockpit = buildCockpit(this);
      this.root.add(this.cockpit.group);
    }
    if (this.canopy) this.canopy.visible = !on;
    if (this.pilot) this.pilot.visible = !on;
    if (this.cockpit) this.cockpit.group.visible = on;
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry) o.geometry.dispose();
    });
    this.flameMat.dispose();
    this.flameCoreMat.dispose();
    for (const m of this.ownMaterials) m.dispose();
    if (this.cockpit) this.cockpit.dispose();
  }
}
