// Airbase: textured runway, taxiways with yellow markings and lights, apron,
// hangars (military fields) or a passenger terminal (civil airports), tower,
// apron flood lights, runway lights and parked aircraft on the other stands.
import * as THREE from 'three';
import { getConcreteTexture, getRunwayTexture } from './textures.js';
import { JetModel } from '../aircraft/JetBuilder.js';
import { getGlowTexture } from '../aircraft/jetTextures.js';

export class Airbase {
  constructor(map, quality, scene) {
    this.scene = scene;
    this.quality = quality;
    this.civil = map.def.airport === 'civil';
    this.parked = [];
    this.materials = [];
    const ab = map.airbase;
    this.ab = ab;
    const group = new THREE.Group();
    group.name = 'airbase';
    group.position.set(ab.x, ab.elevation, ab.z);
    // local frame: -Z along runway direction (heading), +X to the right
    group.rotation.y = -THREE.MathUtils.degToRad(ab.heading);
    this.group = group;

    const runwayTex = getRunwayTexture(quality.textureSize >= 2048 ? 4096 : 2048, ab.heading);
    const runwayMat = new THREE.MeshStandardMaterial({
      map: runwayTex, roughness: 0.92, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const runway = new THREE.Mesh(new THREE.PlaneGeometry(ab.width, ab.length), runwayMat);
    runway.rotation.x = -Math.PI / 2;
    runway.position.y = 0.12;
    runway.receiveShadow = quality.shadows;
    group.add(runway);

    const concrete = getConcreteTexture().clone();
    concrete.needsUpdate = true;
    concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
    const concreteMat = (rx, ry) => {
      const t = concrete.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      return new THREE.MeshStandardMaterial({
        map: t, roughness: 0.95, color: 0xb8b8b2,
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
      });
    };
    const strip = (w, l, x, z, rotY = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), concreteMat(w / 25, l / 25));
      m.rotation.set(-Math.PI / 2, 0, rotY);
      m.position.set(x, 0.08, z);
      m.receiveShadow = quality.shadows;
      group.add(m);
      return m;
    };
    // shoulders
    const shoulderMat = new THREE.MeshStandardMaterial({
      color: 0x6c6a62, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(ab.width + 24, ab.length + 60), shoulderMat);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.y = 0.05;
    group.add(shoulder);

    const L = ab.length;
    // parallel taxiway + connectors; A1 at the take-off end is the holding point
    strip(22, L * 0.9, 150, 0);
    strip(22, 200, 150, L / 2 - 140);
    for (const z of [-L * 0.44, 0, L * 0.44]) strip(22, 130, 82, z, Math.PI / 2);
    this.holdZ = L / 2 - 60;
    strip(24, 132, 82, this.holdZ, Math.PI / 2);
    // apron
    const apronZ = -200;
    strip(160, 520, 260, apronZ);
    this.apron = { x: 260, z: apronZ };
    // stands along the apron (z of each stand; the stand line runs across x)
    this.stands = [-20, -140, -260, -380];
    this._taxiMarkings(group, L, apronZ);

    // Hangars (military) or a passenger terminal (civil airports)
    if (this.civil) this._terminal(group, apronZ, quality);
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x7d8278, roughness: 0.7, metalness: 0.3 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3c403c, roughness: 0.8, metalness: 0.2 });
    const hangarGeo = new THREE.CylinderGeometry(18, 18, 50, 16, 1, false, 0, Math.PI);
    hangarGeo.rotateZ(Math.PI / 2);
    hangarGeo.rotateY(Math.PI / 2);
    for (let i = 0; i < (this.civil ? 0 : 4); i++) {
      const h = new THREE.Mesh(hangarGeo, hangarMat);
      h.rotation.y = Math.PI / 2;
      h.position.set(375, 0, apronZ - 180 + i * 120);
      h.castShadow = quality.shadows;
      h.receiveShadow = quality.shadows;
      group.add(h);
      const door = new THREE.Mesh(new THREE.CircleGeometry(17.5, 16, 0, Math.PI), doorMat);
      door.rotation.y = -Math.PI / 2;
      door.position.set(349.8, 0, apronZ - 180 + i * 120);
      group.add(door);
    }
    // Control tower
    const towerMat = new THREE.MeshStandardMaterial({ color: 0xc9c5ba, roughness: 0.8 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x1d3340, roughness: 0.1, metalness: 0.6, emissive: 0x0a1418 });
    const tower = new THREE.Mesh(new THREE.BoxGeometry(8, 30, 8), towerMat);
    tower.position.set(250, 15, 180);
    tower.castShadow = quality.shadows;
    group.add(tower);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 5, 8), glassMat);
    cab.position.set(250, 32.5, 180);
    group.add(cab);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.6, 1, 8), towerMat);
    roof.position.set(250, 35.5, 180);
    group.add(roof);
    // Admin buildings
    const bldMat = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 0.85 });
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(30 + (i % 2) * 20, 8 + (i % 3) * 4, 22), bldMat);
      b.position.set(330 + (i % 2) * 60, b.geometry.parameters.height / 2, 240 + i * 45);
      b.castShadow = quality.shadows;
      group.add(b);
    }
    // Fuel tanks
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 12, 16), tankMat);
      t.position.set(420, 6, 380 + i * 26);
      group.add(t);
    }
    // Radar dome
    const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.6 }));
    dome.position.set(180, 10, 420);
    group.add(dome);
    const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 10, 12), towerMat);
    domeBase.position.set(180, 5, 420);
    group.add(domeBase);

    // Runway edge / threshold lights (emissive, picked up by bloom)
    const lightGeo = new THREE.SphereGeometry(0.5, 6, 4);
    const edgeCount = Math.floor(L / 60) * 2;
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 2.6) });
    const edge = new THREE.InstancedMesh(lightGeo, white, edgeCount);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let z = -L / 2; z < L / 2 && k < edgeCount; z += 60) {
      m4.makeTranslation(-ab.width / 2 - 2, 0.6, z); edge.setMatrixAt(k++, m4);
      m4.makeTranslation(ab.width / 2 + 2, 0.6, z); edge.setMatrixAt(k++, m4);
    }
    edge.count = k;
    group.add(edge);
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 3, 0.6) });
    const red = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.2, 0.2) });
    const thr = (mat, z) => {
      const im = new THREE.InstancedMesh(lightGeo, mat, 10);
      for (let i = 0; i < 10; i++) {
        m4.makeTranslation(-ab.width / 2 + (i + 0.5) * (ab.width / 10), 0.6, z);
        im.setMatrixAt(i, m4);
      }
      group.add(im);
    };
    thr(green, L / 2 + 4);
    thr(red, -L / 2 - 4);
    // Approach lights (PAPI style bar) beyond the threshold
    const approach = new THREE.InstancedMesh(lightGeo, white, 30);
    k = 0;
    for (let i = 1; i <= 10; i++) {
      for (let j = -1; j <= 1; j++) {
        m4.makeTranslation(j * 4, 1.2, L / 2 + 30 + i * 30);
        approach.setMatrixAt(k++, m4);
      }
    }
    group.add(approach);

    this._floodLights(group);
    group.traverse((o) => {
      if (o.isMesh) o.matrixAutoUpdate = true;
    });
    scene.add(group);
  }

  // Yellow taxiway centrelines, the runway-holding position markings at A1 and
  // blue edge / green centreline lights that glow at night.
  _taxiMarkings(group, L, apronZ) {
    const yellow = new THREE.MeshStandardMaterial({
      color: 0xe8b818, roughness: 0.7, emissive: 0x2a2000,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6,
    });
    this.materials.push(yellow);
    const line = (w, l, x, z, rot = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), yellow);
      m.rotation.set(-Math.PI / 2, 0, rot);
      m.position.set(x, 0.14, z);
      group.add(m);
    };
    line(0.3, L * 0.9 + 110, 150, 55);
    for (const z of [-L * 0.44, 0, L * 0.44, this.holdZ]) line(0.3, 120, 87, z, Math.PI / 2);
    // stand lead-in lines from the taxiway to each stand
    for (const z of this.stands) line(0.3, 150, 232, z, Math.PI / 2);
    line(0.3, 440, 180, apronZ + 40);
    // holding position: two solid and two dashed lines across the connector
    const hx = 62;
    line(0.3, 24, hx, this.holdZ);
    line(0.3, 24, hx + 0.9, this.holdZ);
    for (let k = -10; k <= 10; k += 2.6) {
      line(0.3, 1.4, hx + 1.8, this.holdZ + k);
      line(0.3, 1.4, hx + 2.7, this.holdZ + k);
    }
    // taxiway lights
    const geo = new THREE.SphereGeometry(0.28, 6, 4);
    const blue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.45, 3.2) });
    const green = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 2.6, 0.6) });
    this.materials.push(blue, green);
    const pts = [], cpts = [];
    for (let z = -L * 0.45; z < L / 2 - 40; z += 45) pts.push([150 - 12, z], [150 + 12, z]);
    for (const z of [-L * 0.44, 0, L * 0.44, this.holdZ]) for (let x = 35; x < 140; x += 30) pts.push([x, z - 12], [x, z + 12]);
    for (let z = -L * 0.45; z < L / 2 - 40; z += 30) cpts.push([150, z]);
    for (let x = 35; x < 140; x += 15) cpts.push([x, this.holdZ]);
    const m4 = new THREE.Matrix4();
    const inst = (mat, list) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([x, z], i) => im.setMatrixAt(i, m4.makeTranslation(x, 0.35, z)));
      group.add(im);
    };
    inst(blue, pts);
    inst(green, cpts);
  }

  // Passenger terminal: a long glass-fronted concourse under a vaulted roof,
  // with jet-bridge stubs between the stands.
  _terminal(group, apronZ, quality) {
    const glass = new THREE.MeshStandardMaterial({ color: 0x2c4152, roughness: 0.06, metalness: 0.9, emissive: new THREE.Color(1.0, 0.82, 0.6), emissiveIntensity: 0 });
    const panel = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, roughness: 0.4, metalness: 0.5 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.3, metalness: 0.8, side: THREE.DoubleSide });
    this.materials.push(glass, panel, roofMat);
    this.terminalGlass = glass;
    const len = 520, depth = 46, h = 17;
    const body = new THREE.Mesh(new THREE.BoxGeometry(depth, h, len), panel);
    body.position.set(372 + depth / 2, h / 2, apronZ);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(len, h - 3), glass);
    front.rotation.y = -Math.PI / 2;
    front.position.set(371.6, (h - 3) / 2 + 1.5, apronZ);
    // vaulted roof
    const R = depth * 0.75;
    const roofGeo = new THREE.CylinderGeometry(R, R, len + 8, 24, 1, true, -0.62, 1.24);
    roofGeo.rotateX(Math.PI / 2);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(372 + depth / 2, h - R * Math.cos(0.62) + 0.6, apronZ);
    for (const m of [body, roof]) {
      m.castShadow = quality.shadows;
      m.receiveShadow = quality.shadows;
    }
    group.add(body, front, roof);
    // fixed jet-bridge stubs between the stands
    for (const z of [-80, -200, -320]) {
      const jb = new THREE.Mesh(new THREE.BoxGeometry(22, 3.2, 3.4), panel);
      jb.position.set(361, 5.2, z);
      jb.castShadow = quality.shadows;
      group.add(jb);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.6, 8), roofMat);
      leg.position.set(352, 1.8, z);
      group.add(leg);
    }
  }

  // Tall flood-light masts along the apron: glare spots that come on at dusk.
  _floodLights(group) {
    const mast = new THREE.MeshStandardMaterial({ color: 0x8b9096, roughness: 0.5, metalness: 0.7 });
    this.materials.push(mast);
    const pts = [];
    for (const z of [-470, -330, -200, -70, 70]) {
      const x = 190;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 26, 8), mast);
      m.position.set(x, 13, z);
      group.add(m);
      const head = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 3.2), mast);
      head.position.set(x + 0.4, 26.2, z);
      group.add(head);
      pts.push(x + 0.9, 25.8, z - 1, x + 0.9, 25.8, z + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.floodMat = new THREE.PointsMaterial({ color: new THREE.Color(3, 2.6, 2.0), size: 7, map: getGlowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    this.materials.push(this.floodMat);
    const p = new THREE.Points(g, this.floodMat);
    p.frustumCulled = false;
    group.add(p);
  }

  setNight(n) {
    if (this.floodMat) this.floodMat.opacity = Math.min(1, n * 1.4);
    if (this.terminalGlass) this.terminalGlass.emissiveIntensity = n * 0.9;
  }

  // Static aircraft on the other stands (nose towards the taxiway), so the
  // apron never looks empty. Skipped on the Low preset.
  addParked(specs) {
    if (this.quality.trees === 0) return;
    const stands = this.stands.slice(1, this.quality.trees >= 1 ? 4 : 2);
    stands.forEach((z, i) => {
      const spec = specs[i % specs.length];
      if (!spec) return;
      const model = new JetModel(spec, this.quality, { gear: true });
      const st = this.standFor(spec, model.length);
      model.root.position.set(st.x, model.gearHeight, z);
      model.root.rotation.y = Math.PI / 2;
      model.animate(0.016, {
        pitch: 0, roll: 0, yaw: 0, throttle: 0, ab: 0, gear: true, mach: 0, gLoad: 1, alpha: 0, speed: 0, altitude: 0, lightGlow: 0,
        spoilers: 0, airbrake: 0, reverser: 0, chute: 0, chuteState: 'stowed', bay: false,
      });
      this.group.add(model.root);
      this.parked.push(model);
    });
  }

  // stand position (airbase-local) for an aircraft of a given length: the
  // tail backs onto the hangars or terminal, the nose faces the taxiway
  standFor(spec, len) {
    const cg = spec.design.cg;
    return { x: Math.min(336 - (len - cg), 322), z: this.stands[0] };
  }

  // Convert a point in runway-local coordinates (x right, z along runway towards
  // the approach end) to world space.
  localToWorld(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z);
    this.group.updateMatrixWorld();
    return out.applyMatrix4(this.group.matrixWorld);
  }

  dispose() {
    for (const m of this.parked) {
      this.group.remove(m.root);
      m.dispose();
    }
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const m of this.materials) m.dispose();
  }
}
