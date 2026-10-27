// People and ground equipment for the pre-flight story: a fighter pilot in
// flight suit, G-suit, survival vest, harness and helmet with visor and oxygen
// mask; airline captains and first officers in uniform; a marshaller in a
// hi-vis vest with lit wands; plus a boarding ladder, an airstair truck and
// traffic cones. Bodies are smooth lathed shapes with human proportions
// (about 1.78 m tall): tapered limbs with knee, calf and forearm contours,
// a chest-waist-hip torso, deltoids, gloved hands and a face with jaw, nose
// and ears. Figures stand at the origin facing -Z (like the aircraft);
// animate() blends walk, climb, idle, marshalling, salute and seated poses.
// bakeSeatedPilot() merges a seated pilot and an ejection seat into a few
// meshes for the cockpits of every fighter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const geoCache = new Map();
function cachedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.cached = true;
    geoCache.set(key, g);
  }
  return g;
}

// Smooth body segment hanging down from its pivot (y = 0) to y = -len: a
// lathe through radii at fractions of the length, with rounded ends.
// `prof` is a list of [t, r] (t = 0 at the pivot, 1 at the far end).
function segment(key, len, prof, depth = 1, radial = 14) {
  return cachedGeo(`seg:${key}:${len}:${depth}`, () => {
    const pts = [];
    const rEnd = prof[prof.length - 1][1], rTop = prof[0][1];
    // bottom cap
    for (let k = 0; k <= 4; k++) {
      const a = -Math.PI / 2 + (k / 4) * (Math.PI / 2);
      pts.push(V2(Math.max(0.0005, rEnd * Math.cos(a)), -len + rEnd * 0.8 * Math.sin(a)));
    }
    for (let i = prof.length - 2; i >= 1; i--) pts.push(V2(prof[i][1], -len * prof[i][0]));
    // top cap
    for (let k = 0; k <= 4; k++) {
      const a = (k / 4) * (Math.PI / 2);
      pts.push(V2(Math.max(0.0005, rTop * Math.cos(a)), rTop * 0.8 * Math.sin(a)));
    }
    const g = new THREE.LatheGeometry(pts, radial);
    if (depth !== 1) g.scale(1, 1, depth);
    return g;
  });
}

// lathe from a [y, r] profile listed bottom to top, closed at both ends
function body(key, prof, depth = 1, radial = 18, open = false) {
  return cachedGeo(`body:${key}:${depth}:${open}`, () => {
    const pts = [];
    if (!open) pts.push(V2(0.0005, prof[0][0]));
    for (const [y, r] of prof) pts.push(V2(r, y));
    if (!open) pts.push(V2(0.0005, prof[prof.length - 1][0]));
    const g = new THREE.LatheGeometry(pts, radial);
    if (depth !== 1) g.scale(1, 1, depth);
    return g;
  });
}

const ellipsoid = (rx, ry, rz, seg = 16) => cachedGeo(`ell:${rx}:${ry}:${rz}:${seg}`, () => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)).scale(rx, ry, rz));
const box = (w, h, d) => cachedGeo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r0, r1, h, s = 10) => cachedGeo(`cyl:${r0}:${r1}:${h}:${s}`, () => new THREE.CylinderGeometry(r0, r1, h, s));

const OUTFITS = {
  fighter: { suit: '#5c6349', gsuit: '#4a5038', vest: '#3b4030', harness: '#2b2e28', boots: '#17150f', skin: '#c99d80', gloves: '#8a7a5c', helmet: '#d8d7cd', visor: '#151a20', mask: '#4a4d4f' },
  captain: { suit: '#141b2b', shirt: '#f2f3f5', trousers: '#141b2b', boots: '#0b0b0d', skin: '#b8876a', hair: '#2a1f18', cap: '#141b2b', gold: '#d4a843', tie: '#141b2b', gloves: null },
  officer: { suit: '#141b2b', shirt: '#f2f3f5', trousers: '#141b2b', boots: '#0b0b0d', skin: '#e0b898', hair: '#5a3c22', cap: '#141b2b', gold: '#d4a843', tie: '#141b2b', gloves: null },
  marshal: { suit: '#2c333a', vest: '#ff7614', trousers: '#2c333a', boots: '#191919', skin: '#a77a5a', hair: '#1b1612', ears: '#e8c21a', gloves: '#2a2a2a' },
  crewChief: { suit: '#3e4a3a', vest: '#cfe021', trousers: '#3e4a3a', boots: '#191919', skin: '#c49a78', hair: '#3a2a1c', ears: '#2a2a2a', gloves: '#2a2a2a' },
};

const HIP = 0.93; // hip joint height when standing

export class Person {
  constructor(kind = 'fighter', opts = {}) {
    this.kind = kind;
    const o = OUTFITS[kind] || OUTFITS.fighter;
    this.materials = [];
    const matCache = new Map();
    const M = (color, rough = 0.85, extra = {}) => {
      const key = color + rough + JSON.stringify(extra, (k, v) => (v && v.isColor ? v.getHexString() : v));
      let m = matCache.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...extra });
        matCache.set(key, m);
        this.materials.push(m);
      }
      return m;
    };
    const skin = M(o.skin, 0.55);
    const suit = M(o.suit, 0.88);
    const legsMat = M(o.trousers || o.suit, 0.88);
    const boots = M(o.boots, 0.45);
    const hands = o.gloves ? M(o.gloves, 0.8) : skin;
    const root = new THREE.Group();
    root.name = 'person:' + kind;
    this.root = root;
    const pelvis = new THREE.Group();
    pelvis.position.y = HIP;
    root.add(pelvis);
    this.pelvis = pelvis;
    const torsoG = new THREE.Group();
    pelvis.add(torsoG);
    this.torsoG = torsoG;
    const add = (geo, mat, parent, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, rz);
      m.castShadow = !!opts.shadows;
      parent.add(m);
      return m;
    };

    // ---- legs: hip -> thigh -> knee -> calf -> ankle -> foot
    const thigh = segment('thigh', 0.45, [[0, 0.083], [0.25, 0.08], [0.7, 0.064], [1, 0.054]], 1, 16);
    const calf = segment('calf', 0.43, [[0, 0.052], [0.22, 0.06], [0.45, 0.055], [0.85, 0.037], [1, 0.034]], 1, 16);
    this.legs = [];
    for (const side of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(side * 0.095, 0, 0);
      pelvis.add(hip);
      add(thigh, legsMat, hip);
      const knee = new THREE.Group();
      knee.position.y = -0.45;
      hip.add(knee);
      add(calf, legsMat, knee);
      // boot: rounded toe, heel and sole
      const foot = new THREE.Group();
      foot.position.y = -0.43;
      knee.add(foot);
      add(ellipsoid(0.048, 0.042, 0.115), boots, foot, 0, -0.03, -0.055);
      add(ellipsoid(0.044, 0.045, 0.06), boots, foot, 0, -0.025, 0.015);
      add(box(0.09, 0.018, 0.25), M('#0d0d0d', 0.7), foot, 0, -0.066, -0.045);
      if (kind === 'fighter') {
        // G-suit bladders laced over thigh and calf
        const gs = M(o.gsuit, 0.8);
        add(segment('gthigh', 0.4, [[0, 0.093], [0.3, 0.09], [1, 0.068]], 1, 14), gs, hip, 0, -0.03, 0);
        add(segment('gcalf', 0.34, [[0, 0.064], [0.3, 0.068], [1, 0.045]], 1, 14), gs, knee, 0, -0.02, 0);
        // leg harness strap
        add(cachedGeo('legstrap', () => new THREE.TorusGeometry(0.094, 0.012, 6, 18).rotateX(Math.PI / 2)), M(o.harness, 0.6), hip, 0, -0.06, 0);
      }
      this.legs.push({ hip, knee, foot, side });
    }

    // ---- pelvis + torso (chest, waist, hips, shoulders)
    add(body('hips', [[-0.1, 0.06], [-0.07, 0.15], [0.0, 0.172], [0.08, 0.165]], 0.68, 20), legsMat, pelvis);
    const torsoProf = [[0.04, 0.166], [0.14, 0.152], [0.24, 0.158], [0.34, 0.182], [0.44, 0.19], [0.5, 0.18], [0.545, 0.14], [0.565, 0.07]];
    const torsoMat = kind === 'captain' || kind === 'officer' ? suit : suit;
    this.torso = add(body('torso', torsoProf, 0.62, 22), torsoMat, torsoG);
    // shoulders / deltoids
    for (const side of [-1, 1]) add(ellipsoid(0.07, 0.062, 0.068), torsoMat, torsoG, side * 0.19, 0.5, 0);
    if (kind === 'fighter') {
      // survival vest over the flight suit, harness straps, zip and pockets
      const vest = M(o.vest, 0.75);
      add(body('svest', [[0.16, 0.172], [0.26, 0.17], [0.36, 0.193], [0.46, 0.2], [0.51, 0.19]], 0.64, 22, true), vest, torsoG).material.side = THREE.DoubleSide;
      const strap = M(o.harness, 0.6);
      for (const side of [-1, 1]) {
        add(box(0.045, 0.42, 0.012), strap, torsoG, side * 0.07, 0.3, -0.122, 0.08, 0, -side * 0.12);
        add(box(0.05, 0.05, 0.03), M('#9a9a92', 0.35, { metalness: 0.8 }), torsoG, side * 0.075, 0.2, -0.13);
        add(box(0.08, 0.07, 0.03), vest, torsoG, side * 0.11, 0.38, -0.128);
      }
      add(box(0.012, 0.3, 0.008), M('#22251f', 0.5), torsoG, 0, 0.2, -0.104);
      // name patch
      add(box(0.09, 0.03, 0.006), M('#6b6450', 0.8), torsoG, -0.1, 0.45, -0.12);
    } else if (kind === 'captain' || kind === 'officer') {
      // open jacket showing the white shirt and tie; epaulettes with stripes
      add(cachedGeo('shirtv', () => new THREE.ConeGeometry(0.07, 0.2, 3).rotateX(Math.PI).scale(1, 1, 0.25)), M(o.shirt, 0.6), torsoG, 0, 0.46, -0.108);
      add(box(0.032, 0.2, 0.012), M(o.tie, 0.45), torsoG, 0, 0.42, -0.118, 0.08);
      add(box(0.042, 0.035, 0.014), M(o.tie, 0.45), torsoG, 0, 0.525, -0.11);
      const gold = M(o.gold, 0.3, { metalness: 0.85 });
      for (const side of [-1, 1]) {
        add(box(0.05, 0.012, 0.13), M(o.suit, 0.7), torsoG, side * 0.17, 0.545, 0, 0, 0, side * 0.2);
        const n = kind === 'captain' ? 4 : 3;
        for (let i = 0; i < n; i++) add(box(0.052, 0.014, 0.008), gold, torsoG, side * 0.17, 0.552, -0.04 + i * 0.022, 0, 0, side * 0.2);
        // jacket buttons
        add(cyl(0.008, 0.008, 0.004, 8), gold, torsoG, side * 0.03, 0.18 + 0.08 * (side > 0 ? 1 : 0), -0.105, Math.PI / 2);
      }
      add(cachedGeo('wings', () => new THREE.BoxGeometry(0.07, 0.014, 0.004)), gold, torsoG, -0.09, 0.44, -0.12);
    } else if (o.vest) {
      // hi-vis vest with retro-reflective bands
      const vest = M(o.vest, 0.55, { emissive: new THREE.Color(o.vest), emissiveIntensity: 0.1 });
      add(body('hivis', [[0.12, 0.17], [0.24, 0.165], [0.34, 0.189], [0.44, 0.196], [0.5, 0.186]], 0.65, 22, true), vest, torsoG).material.side = THREE.DoubleSide;
      const band = M('#d6dbe0', 0.25, { metalness: 0.6, emissive: new THREE.Color(0.35, 0.35, 0.35), emissiveIntensity: 0.5 });
      for (const y of [0.24, 0.36]) {
        const r = y > 0.3 ? 0.194 : 0.17;
        add(cachedGeo(`band${y}`, () => new THREE.CylinderGeometry(r + 0.003, r + 0.003, 0.03, 22, 1, true).scale(1, 1, 0.66)), band, torsoG, 0, y, 0).material.side = THREE.DoubleSide;
      }
    }

    // ---- neck + head
    add(segment('neck', 0.1, [[0, 0.05], [1, 0.056]], 1, 12), skin, torsoG, 0, 0.66, 0.0);
    const head = new THREE.Group();
    head.position.set(0, 0.67, 0.005);
    torsoG.add(head);
    this.head = head;
    add(ellipsoid(0.088, 0.11, 0.1, 20), skin, head, 0, 0.1, 0.008); // cranium
    add(ellipsoid(0.07, 0.06, 0.078, 16), skin, head, 0, 0.04, -0.018); // jaw
    add(ellipsoid(0.03, 0.024, 0.02), skin, head, 0, 0.022, -0.078); // chin
    add(cachedGeo('nose', () => new THREE.ConeGeometry(0.016, 0.042, 8).rotateX(-Math.PI / 2 + 0.35)), skin, head, 0, 0.085, -0.098);
    for (const side of [-1, 1]) {
      add(ellipsoid(0.012, 0.026, 0.018), skin, head, side * 0.088, 0.09, 0.01); // ears
      add(ellipsoid(0.012, 0.007, 0.006, 10), M('#1a1410', 0.3), head, side * 0.033, 0.112, -0.088); // eyes
      add(box(0.03, 0.007, 0.01), M(o.hair || '#2a1f18', 0.9), head, side * 0.034, 0.128, -0.09); // brows
    }
    if (kind === 'fighter') {
      // flight helmet with the visor down, oxygen mask and hose
      const shell = M(o.helmet, 0.32);
      add(ellipsoid(0.128, 0.134, 0.142, 22), shell, head, 0, 0.115, 0.012);
      add(cachedGeo('hrim', () => new THREE.TorusGeometry(0.128, 0.012, 8, 28, Math.PI * 1.1).rotateX(Math.PI / 2).rotateY(-Math.PI * 0.05)), M('#3a3b3d', 0.6), head, 0, 0.055, 0.01);
      add(cachedGeo('visor', () => new THREE.SphereGeometry(0.132, 22, 12, Math.PI * 0.6, Math.PI * 0.8, Math.PI * 0.3, Math.PI * 0.26)), M(o.visor, 0.06, { metalness: 0.75 }), head, 0, 0.115, 0.004);
      add(cachedGeo('mask', () => new THREE.ConeGeometry(0.052, 0.09, 14).rotateX(-Math.PI / 2)), M(o.mask, 0.6), head, 0, 0.045, -0.105);
      const hose = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, -0.15), new THREE.Vector3(0.02, -0.08, -0.17), new THREE.Vector3(0.06, -0.2, -0.15), new THREE.Vector3(0.09, -0.32, -0.13)]);
      add(cachedGeo('hose', () => new THREE.TubeGeometry(hose, 12, 0.014, 6, false)), M('#2b2d2f', 0.5), head);
    } else if (kind === 'captain' || kind === 'officer') {
      add(cachedGeo('hair', () => new THREE.SphereGeometry(0.093, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52)), M(o.hair, 0.9), head, 0, 0.105, 0.016);
      const cap = M(o.cap, 0.55);
      add(cyl(0.106, 0.098, 0.05, 20), cap, head, 0, 0.19, 0.01);
      add(cachedGeo('capcrown', () => new THREE.CylinderGeometry(0.118, 0.106, 0.03, 20).scale(1, 1, 1.08)), cap, head, 0, 0.225, 0.006);
      add(cachedGeo('peak', () => new THREE.CylinderGeometry(0.1, 0.1, 0.01, 18, 1, false, -Math.PI * 0.45, Math.PI * 0.9).rotateY(Math.PI).rotateX(-0.25)), M('#0b0b0c', 0.2), head, 0, 0.17, -0.045);
      add(box(0.09, 0.02, 0.006), M(o.gold, 0.3, { metalness: 0.85 }), head, 0, 0.198, -0.1);
    } else {
      add(cachedGeo('shorthair', () => new THREE.SphereGeometry(0.092, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5)), M(o.hair, 0.9), head, 0, 0.105, 0.014);
      // ear defenders on a headband
      const ears = M(o.ears || '#333', 0.45);
      for (const side of [-1, 1]) add(cachedGeo('earcup', () => new THREE.CylinderGeometry(0.042, 0.045, 0.045, 14).rotateZ(Math.PI / 2)), ears, head, side * 0.1, 0.09, 0.008);
      add(cachedGeo('earband', () => new THREE.TorusGeometry(0.104, 0.01, 6, 20, Math.PI)), ears, head, 0, 0.1, 0.008);
    }

    // ---- arms: shoulder -> upper arm -> elbow -> forearm -> wrist -> hand
    const upper = segment('uarm', 0.29, [[0, 0.054], [0.3, 0.052], [0.75, 0.042], [1, 0.038]], 1, 14);
    const fore = segment('farm', 0.26, [[0, 0.039], [0.25, 0.042], [0.8, 0.03], [1, 0.027]], 1, 14);
    this.arms = [];
    for (const side of [-1, 1]) {
      const sh = new THREE.Group();
      sh.position.set(side * 0.2, 0.49, 0);
      torsoG.add(sh);
      add(upper, suit, sh);
      const el = new THREE.Group();
      el.position.y = -0.29;
      sh.add(el);
      add(fore, suit, el);
      const hand = new THREE.Group();
      hand.position.y = -0.26;
      el.add(hand);
      add(ellipsoid(0.026, 0.05, 0.042, 12), hands, hand, 0, -0.045, -0.004); // palm
      add(ellipsoid(0.022, 0.035, 0.034, 10), hands, hand, 0, -0.095, -0.012); // fingers
      add(segment('thumb', 0.05, [[0, 0.012], [1, 0.01]], 1, 8), hands, hand, side * -0.002, -0.025, -0.04, 0.6, 0, 0);
      if (kind === 'captain' || kind === 'officer') {
        add(segment('cuff', 0.03, [[0, 0.03], [1, 0.03]], 1, 12), M(o.shirt, 0.6), el, 0, -0.235, 0);
        const n = kind === 'captain' ? 4 : 3;
        for (let i = 0; i < n; i++) add(cachedGeo('stripe', () => new THREE.CylinderGeometry(0.0305, 0.0305, 0.007, 14, 1, true)), M(o.gold, 0.3, { metalness: 0.85 }), el, 0, -0.2 + i * 0.012, 0);
      }
      this.arms.push({ sh, el, hand, side });
    }

    // ---- held props
    this.wands = [];
    if (kind === 'marshal') {
      const wandMat = M('#ff8a1a', 0.4, { emissive: new THREE.Color(1.0, 0.42, 0.06), emissiveIntensity: 2.2 });
      for (const a of this.arms) this.wands.push(add(cachedGeo('wand', () => new THREE.CylinderGeometry(0.022, 0.024, 0.4, 10).translate(0, -0.2, 0)), wandMat, a.hand, 0, -0.05, -0.02));
    }
    if (opts.bag) {
      const bagMat = M(kind === 'fighter' ? '#2e3226' : '#121316', 0.5);
      if (kind === 'fighter') {
        // helmet bag carried in the right hand
        add(cachedGeo('hbag', () => new THREE.SphereGeometry(1, 14, 10).scale(0.15, 0.13, 0.08)), bagMat, this.arms[1].hand, 0.02, -0.2, 0);
      } else {
        // roller case pulled on its wheels
        this.trolley = new THREE.Group();
        root.add(this.trolley);
        add(box(0.36, 0.48, 0.22), bagMat, this.trolley, 0, 0.3, 0);
        add(box(0.016, 0.42, 0.016), M('#8a8c8f', 0.3, { metalness: 0.8 }), this.trolley, 0, 0.74, -0.08);
        for (const s of [-1, 1]) add(cyl(0.03, 0.03, 0.02, 12), M('#111', 0.8), this.trolley, s * 0.15, 0.04, 0.09, 0, 0, Math.PI / 2);
      }
    }
    this.phase = Math.random() * 6;
    this.mode = 'idle';
    this.speed = 0;
  }

  // mode: idle, walk, climb, marshal, salute, seated; speed in m/s while walking
  animate(dt, mode = this.mode, speed = this.speed) {
    this.mode = mode;
    this.speed = speed;
    const t = (this.phase += dt * (mode === 'walk' ? speed * 3.9 : mode === 'climb' ? 4.2 : 1.6));
    const s = Math.sin(t), c = Math.cos(t);
    const ease = (obj, x, y, z, k = 0.2) => {
      obj.rotation.x += (x - obj.rotation.x) * k;
      obj.rotation.y += (y - obj.rotation.y) * k;
      obj.rotation.z += (z - obj.rotation.z) * k;
    };
    const k = mode === 'walk' || mode === 'climb' || mode === 'marshal' ? 1 : Math.min(1, dt * 6);
    // convention: +x on hips / shoulders swings the limb forward (towards -Z),
    // -x on knees folds the calf back, +x on elbows brings the forearm forward
    this.pelvis.position.y = HIP;
    this.pelvis.rotation.set(0, 0, 0);
    let torsoX = 0, torsoY = 0, torsoZ = 0;
    for (const l of this.legs) {
      const ph = l.side < 0 ? 1 : -1;
      if (mode === 'walk') {
        ease(l.hip, 0.42 * s * ph, 0, 0, k);
        const swing = Math.max(0, -Math.cos(t + (ph > 0 ? 0 : Math.PI)));
        ease(l.knee, -(swing * 0.85 + 0.06), 0, 0, k);
        ease(l.foot, 0.15 * s * ph, 0, 0, k);
      } else if (mode === 'climb') {
        const lift = Math.max(0, Math.sin(t + (ph > 0 ? 0 : Math.PI)));
        ease(l.hip, 1.05 * lift + 0.15, 0, 0, k);
        ease(l.knee, -1.5 * lift - 0.2, 0, 0, k);
        ease(l.foot, 0.3, 0, 0, k);
      } else if (mode === 'seated') {
        ease(l.hip, 1.42, 0, l.side * -0.1, k);
        ease(l.knee, -1.3, 0, 0, k);
        ease(l.foot, 0.25, 0, 0, k);
      } else {
        ease(l.hip, 0, 0, l.side * -0.02, k);
        ease(l.knee, -0.04, 0, 0, k);
        ease(l.foot, 0, 0, 0, k);
      }
    }
    if (mode === 'walk') {
      this.pelvis.position.y = HIP + Math.abs(c) * 0.028 - 0.01;
      this.pelvis.rotation.y = 0.08 * s;
      this.pelvis.rotation.z = 0.03 * c;
      torsoY = -0.14 * s;
      torsoX = 0.05;
    } else if (mode === 'climb') torsoX = 0.2;
    else if (mode === 'seated') torsoX = -0.12;
    else torsoX = 0.01 * Math.sin(t * 0.5);
    ease(this.torsoG, torsoX, torsoY, torsoZ, k);
    for (const a of this.arms) {
      const ph = a.side < 0 ? -1 : 1;
      const carry = (this.trolley || this.kind === 'fighter') && a.side > 0 && mode === 'walk';
      if (mode === 'walk') {
        ease(a.sh, carry ? -0.1 + 0.08 * s : 0.36 * s * ph, 0, a.side * 0.1, k);
        ease(a.el, carry ? 0.1 : 0.25 + Math.max(0, s * ph) * 0.35, 0, 0, k);
      } else if (mode === 'climb') {
        const reach = Math.sin(t + (ph > 0 ? 0 : Math.PI));
        ease(a.sh, 2.5 + reach * 0.3, 0, a.side * 0.12, k);
        ease(a.el, 0.25 + Math.max(0, -reach) * 0.5, 0, 0, k);
      } else if (mode === 'marshal') {
        // "move ahead": both wands raised, beckoning overhead
        const beck = 0.5 + 0.5 * Math.sin(t * 2.4);
        ease(a.sh, 0.2, 0, a.side * 2.45, 0.3);
        ease(a.el, 0.4 + beck * 1.1, 0, 0, 0.3);
      } else if (mode === 'salute') {
        if (a.side > 0) {
          ease(a.sh, 1.35, 0, 1.05, 0.2);
          ease(a.el, 2.2, 0, 0, 0.2);
        } else {
          ease(a.sh, 0, 0, -0.06, 0.2);
          ease(a.el, 0.1, 0, 0, 0.2);
        }
      } else if (mode === 'seated') {
        // right hand on the side-stick or centre stick, left on the throttle
        ease(a.sh, a.side > 0 ? 0.55 : 0.5, 0, a.side * 0.22, k);
        ease(a.el, a.side > 0 ? 1.05 : 1.15, 0, 0, k);
      } else {
        ease(a.sh, 0.02 + Math.sin(t * 0.8) * 0.01, 0, a.side * 0.08, k);
        ease(a.el, 0.14, 0, 0, k);
      }
    }
    this.head.rotation.y = mode === 'idle' ? Math.sin(t * 0.3) * 0.25 : mode === 'walk' ? 0.1 * s : 0;
    if (this.trolley) {
      this.trolley.position.set(0.3, 0, 0.62);
      this.trolley.rotation.x = mode === 'walk' ? 0.42 : 0;
    }
  }

  dispose() {
    this.root.parent?.remove(this.root);
    for (const m of this.materials) m.dispose();
  }
}

// ---------------------------------------------------------------- cockpit

// Shared materials for every fighter's seat, seated pilot and cockpit well:
// one vertex-coloured material for the opaque parts (so the whole pilot and
// seat cost a couple of draw calls) plus the glossy visor, HUD glass and the
// lit screens.
let cockpitMats = null;
function getCockpitMats() {
  if (cockpitMats) return cockpitMats;
  cockpitMats = {
    cloth: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05 }),
    gloss: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.65 }),
    hud: new THREE.MeshStandardMaterial({ color: '#7fc8a8', roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.3, depthWrite: false, emissive: new THREE.Color(0.05, 0.25, 0.12), emissiveIntensity: 0.6 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0b1a14', roughness: 0.2, metalness: 0.3, emissive: new THREE.Color(0.08, 0.35, 0.2), emissiveIntensity: 0.55 }),
  };
  return cockpitMats;
}

// colour palette of the seat and well parts (sRGB hex)
const COCKPIT_COL = {
  well: '#141618', seat: '#2c2f31', cushion: '#4a4f3c', yellow: '#e2b81c', stripe: '#101010',
  coaming: '#0e1011', frame: '#3c4045', panel: '#25282b',
};

// Merge meshes into one geometry per look: opaque parts get their colour baked
// into vertex colours; glossy (metallic) parts go to the gloss material and
// special materials (HUD glass, screens) keep their own.
function mergeByLook(group, specials = new Map()) {
  group.updateMatrixWorld(true);
  const buckets = { cloth: [], gloss: [] };
  const extra = new Map();
  const col = new THREE.Color();
  group.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(o.matrixWorld);
    const sp = specials.get(o.material);
    if (sp) {
      if (!extra.has(sp)) extra.set(sp, []);
      extra.get(sp).push(g);
      return;
    }
    col.copy(o.material.color || col.set(1, 1, 1));
    const n = g.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    (o.material.metalness > 0.5 || o.material.roughness < 0.2 ? buckets.gloss : buckets.cloth).push(g);
  });
  const cm = getCockpitMats();
  const out = [];
  for (const k of ['cloth', 'gloss']) if (buckets[k].length) out.push({ geo: mergeGeometries(buckets[k]), mat: cm[k] });
  for (const [mat, list] of extra) out.push({ geo: mergeGeometries(list.map((g) => { g.deleteAttribute('color'); return g; })), mat });
  for (const k of ['cloth', 'gloss']) for (const g of buckets[k]) g.dispose();
  return out;
}

const seatedCache = new Map();
const tmpMat = (hex, rough = 0.8, metal = 0.1) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });

// A seated pilot strapped into an ejection seat (seat pan and back cushions,
// headbox, catapult rails, the yellow-and-black ejection handles), cached as a
// few merged geometries (callers clone them). Origin at the pilot's eye
// point; the seat leans back by `recline` radians.
export function bakeSeatedPilot(recline = 0.3) {
  const key = recline.toFixed(2);
  if (seatedCache.has(key)) return seatedCache.get(key);
  const group = new THREE.Group();
  const person = new Person('fighter');
  for (let i = 0; i < 30; i++) person.animate(0.05, 'seated');
  // move the figure so its eyes are at the origin
  const tilt = new THREE.Group();
  tilt.rotation.x = -recline;
  group.add(tilt);
  tilt.add(person.root);
  group.updateMatrixWorld(true);
  const eye = new THREE.Vector3(0, 0.1, -0.09);
  person.head.localToWorld(eye);
  tilt.worldToLocal(eye);
  person.root.position.sub(eye);
  group.updateMatrixWorld(true);
  // the seat pan goes under the pilot's hips
  const hipW = new THREE.Vector3();
  person.pelvis.getWorldPosition(hipW);
  tilt.worldToLocal(hipW);
  const seat = new THREE.Group();
  seat.position.set(0, hipW.y - 0.06, hipW.z + 0.02);
  tilt.add(seat);
  const m = {};
  for (const [k, v] of Object.entries(COCKPIT_COL)) m[k] = tmpMat(v, k === 'frame' ? 0.4 : 0.85, k === 'frame' ? 0.7 : 0.1);
  const add = (geo, mat, x, y, z, rx = 0) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    seat.add(mesh);
  };
  add(new THREE.BoxGeometry(0.5, 0.12, 0.5), m.seat, 0, -0.1, -0.12);
  add(new THREE.BoxGeometry(0.44, 0.06, 0.44), m.cushion, 0, -0.02, -0.13);
  add(new THREE.BoxGeometry(0.48, 0.66, 0.13), m.seat, 0, 0.3, 0.2);
  add(new THREE.BoxGeometry(0.42, 0.56, 0.06), m.cushion, 0, 0.3, 0.12);
  add(new THREE.BoxGeometry(0.34, 0.22, 0.2), m.seat, 0, 0.74, 0.2);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.032, 0.032, 0.86, 10), m.frame, s * 0.22, 0.36, 0.28);
    add(new THREE.BoxGeometry(0.05, 0.42, 0.36), m.seat, s * 0.27, 0.06, -0.02);
  }
  add(new THREE.TorusGeometry(0.07, 0.013, 8, 16, Math.PI), m.yellow, 0, 0.86, 0.1, -0.4);
  add(new THREE.TorusGeometry(0.06, 0.013, 8, 16, Math.PI), m.yellow, 0, 0.04, -0.37, Math.PI / 2 + 0.3);
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.0145, 0.0145, 0.013, 8), m.stripe, -0.035 + i * 0.035, 0.9, 0.085, Math.PI / 2);
  const parts = mergeByLook(group);
  person.dispose();
  for (const v of Object.values(m)) v.dispose();
  seatedCache.set(key, parts);
  return parts;
}

// Visible cockpit furniture under an open or clear canopy: the dark well of the
// cockpit opening with its sill rail, the glare shield over the instrument
// panel and its two screens, the HUD combiner glass and the side consoles.
// Sizes follow the canopy footprint (w = half width, len = length).
export function buildCockpitWell(w, len) {
  const cm = getCockpitMats();
  const g = new THREE.Group();
  const m = {};
  for (const [k, v] of Object.entries(COCKPIT_COL)) m[k] = tmpMat(v, k === 'frame' ? 0.4 : 0.9, k === 'frame' ? 0.7 : 0.05);
  const hudTmp = tmpMat('#ffffff'), screenTmp = tmpMat('#000000');
  const add = (geo, mat, x, y, z, rx = 0, sx = 1, sz = 1) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.x = rx;
    mesh.scale.set(sx, 1, sz);
    g.add(mesh);
  };
  // glare shield: a half-round hood across the cockpit over the panel
  const shield = new THREE.CylinderGeometry(0.2, 0.2, w * 1.25, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  shield.scale(1, 0.75, 1);
  add(shield, m.coaming, 0, 0.0, -len * 0.31);
  add(new THREE.BoxGeometry(w * 1.25, 0.2, 0.04), m.panel, 0, 0.02, -len * 0.27, -0.35);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(w * 0.42, 0.13, 0.012), screenTmp, s * w * 0.32, 0.045, -len * 0.268, -0.35);
  add(new THREE.BoxGeometry(w * 0.55, 0.16, 0.008), hudTmp, 0, 0.2, -len * 0.33, -0.25);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.015, 0.2, 0.015), m.frame, s * w * 0.28, 0.15, -len * 0.33, -0.25);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(w * 0.2, 0.04, len * 0.36), m.panel, s * w * 0.6, -0.005, len * 0.04);
  const parts = mergeByLook(g, new Map([[hudTmp, cm.hud], [screenTmp, cm.screen]]));
  g.traverse((o) => o.geometry?.dispose());
  for (const v of [...Object.values(m), hudTmp, screenTmp]) v.dispose();
  return parts;
}

// ---------------------------------------------------------------- equipment

const metal = (color, rough = 0.45) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.6 });

// Ladder hooked over the cockpit sill; `top` is the sill point, `base` on the ground.
export function makeLadder(top, base, shadows = false) {
  const g = new THREE.Group();
  const mat = metal('#d8d23a', 0.5);
  const dark = metal('#2a2b2c', 0.6);
  const d = new THREE.Vector3().subVectors(top, base);
  const len = d.length();
  const rail = new THREE.CylinderGeometry(0.03, 0.03, len, 8);
  const holder = new THREE.Group();
  holder.position.copy(base).addScaledVector(d, 0.5);
  holder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.add(holder);
  // rails run along the ladder; the side axis is horizontal, along the fuselage
  const flat = new THREE.Vector3(d.x, 0, d.z);
  const side = flat.lengthSq() > 1e-6 ? new THREE.Vector3(0, 1, 0).cross(flat.normalize()).normalize() : new THREE.Vector3(1, 0, 0);
  const sideLocal = side.clone().applyQuaternion(holder.quaternion.clone().invert());
  for (const s of [-1, 1]) {
    const r = new THREE.Mesh(rail, mat);
    r.position.copy(sideLocal).multiplyScalar(0.22 * s);
    r.castShadow = shadows;
    holder.add(r);
  }
  const rungs = Math.max(3, Math.round(len / 0.3));
  const rung = new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6);
  const rq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), sideLocal);
  for (let i = 1; i < rungs; i++) {
    const m = new THREE.Mesh(rung, dark);
    m.quaternion.copy(rq);
    m.position.y = -len / 2 + (i / rungs) * len;
    holder.add(m);
  }
  // hooks over the sill
  for (const s of [-1, 1]) {
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 6, 10, Math.PI), dark);
    hook.position.copy(sideLocal).multiplyScalar(0.22 * s).add(new THREE.Vector3(0, len / 2, 0));
    hook.quaternion.copy(rq);
    holder.add(hook);
  }
  g.userData.materials = [mat, dark];
  return g;
}

// Self-propelled airstair: chassis and cab with the stair rising to the door.
export function makeAirstair(doorHeight, shadows = false) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: '#e9e6dd', roughness: 0.5, metalness: 0.2 });
  const stripe = new THREE.MeshStandardMaterial({ color: '#1f4fa0', roughness: 0.5, metalness: 0.2 });
  const dark = metal('#3a3c3e', 0.7);
  const tyre = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.9 });
  const glass = new THREE.MeshStandardMaterial({ color: '#1d2a33', roughness: 0.1, metalness: 0.8 });
  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = shadows;
    m.receiveShadow = shadows;
    g.add(m);
    return m;
  };
  // the stair climbs towards -Z (the door) and the truck cab sits at +Z
  const run = Math.max(3, doorHeight * 1.35);
  add(new THREE.BoxGeometry(2.2, 0.6, run + 2.5), dark, 0, 0.75, 0.6);
  add(new THREE.BoxGeometry(2.1, 1.7, 2.0), bodyMat, 0, 1.6, run / 2 + 1.0);
  add(new THREE.BoxGeometry(2.12, 0.25, 2.02), stripe, 0, 1.15, run / 2 + 1.0);
  add(new THREE.BoxGeometry(1.9, 0.7, 0.05), glass, 0, 2.0, run / 2 - 0.01);
  const ang = Math.atan2(doorHeight - 1.1, run);
  const stairLen = Math.hypot(run, doorHeight - 1.1);
  add(new THREE.BoxGeometry(1.4, 0.18, stairLen), bodyMat, 0, 1.1 + (doorHeight - 1.1) / 2, 0, ang);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.08, 1.0, stairLen), stripe, s * 0.72, 1.6 + (doorHeight - 1.1) / 2, 0, ang);
  add(new THREE.BoxGeometry(1.6, 0.2, 1.4), bodyMat, 0, doorHeight - 0.1, -run / 2 - 0.6);
  const wheel = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14).rotateZ(Math.PI / 2);
  for (const [x, z] of [[-1.05, run / 2 + 0.6], [1.05, run / 2 + 0.6], [-1.05, -run / 2 + 0.4], [1.05, -run / 2 + 0.4]]) add(wheel, tyre, x, 0.42, z);
  g.userData.materials = [bodyMat, stripe, dark, tyre, glass];
  g.userData.run = run;
  return g;
}

// Orange traffic cone with a reflective collar
export function makeCone(shadows = false) {
  const g = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: '#ff5a12', roughness: 0.6 });
  const white = new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: 0.4, emissive: new THREE.Color(0.2, 0.2, 0.2) });
  const c = new THREE.Mesh(cachedGeo('cone', () => new THREE.ConeGeometry(0.17, 0.7, 16).translate(0, 0.35, 0)), orange);
  c.castShadow = shadows;
  const b = new THREE.Mesh(cachedGeo('coneband', () => new THREE.CylinderGeometry(0.095, 0.115, 0.1, 16).translate(0, 0.42, 0)), white);
  const base = new THREE.Mesh(box(0.38, 0.04, 0.38), orange);
  base.position.y = 0.02;
  g.add(c, b, base);
  g.userData.materials = [orange, white];
  return g;
}

export function disposeGroup(g) {
  if (!g) return;
  g.parent?.remove(g);
  g.traverse((o) => {
    if (o.geometry && !o.geometry.userData.cached) o.geometry.dispose();
  });
  for (const m of g.userData.materials || []) m.dispose();
}
