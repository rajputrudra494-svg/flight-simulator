// Airbase: textured runway, taxiways, apron, hangars, tower and runway lights.
import * as THREE from 'three';
import { getConcreteTexture, getRunwayTexture } from './textures.js';

export class Airbase {
  constructor(map, quality, scene) {
    this.scene = scene;
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
    // parallel taxiway + connectors
    strip(22, L * 0.9, 150, 0);
    for (const z of [-L * 0.44, 0, L * 0.44]) strip(22, 130, 82, z, Math.PI / 2);
    // apron
    const apronZ = -200;
    strip(160, 520, 260, apronZ);
    this.apron = { x: 260, z: apronZ };

    // Hangars
    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x7d8278, roughness: 0.7, metalness: 0.3 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3c403c, roughness: 0.8, metalness: 0.2 });
    const hangarGeo = new THREE.CylinderGeometry(18, 18, 50, 16, 1, false, 0, Math.PI);
    hangarGeo.rotateZ(Math.PI / 2);
    hangarGeo.rotateY(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
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

    group.traverse((o) => {
      if (o.isMesh) o.matrixAutoUpdate = true;
    });
    scene.add(group);
  }

  // Convert a point in runway-local coordinates (x right, z along runway towards
  // the approach end) to world space.
  localToWorld(x, y, z, out = new THREE.Vector3()) {
    out.set(x, y, z);
    this.group.updateMatrixWorld();
    return out.applyMatrix4(this.group.matrixWorld);
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}
