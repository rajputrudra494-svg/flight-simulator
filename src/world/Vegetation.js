// Instanced trees streamed in cells around the camera. Placement uses the same
// forest mask as the terrain shader so trees sit inside the dark forest patches.
import * as THREE from 'three';
import { hash2, mulberry32 } from './noise.js';
import { sampleNoiseCPU } from './textures.js';

function colorize(geo, color) {
  const n = geo.getAttribute('position').count;
  const c = new Float32Array(n * 3);
  const col = new THREE.Color(color);
  for (let i = 0; i < n; i++) {
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

function snowTop(geo, threshold) {
  const pos = geo.getAttribute('position');
  const col = geo.getAttribute('color');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > threshold) col.setXYZ(i, 0.92, 0.94, 0.97);
  }
  return geo;
}

function merge(geos) {
  // tiny merge helper (non-indexed)
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let total = 0;
  for (const g of parts) total += g.getAttribute('position').count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const g of parts) {
    g.computeVertexNormals();
    pos.set(g.getAttribute('position').array, o * 3);
    nor.set(g.getAttribute('normal').array, o * 3);
    col.set(g.getAttribute('color').array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

function makeTreeGeometry(kind) {
  const trunkCol = '#5a4030';
  if (kind === 'conifer' || kind === 'snowconifer') {
    const trunk = colorize(new THREE.CylinderGeometry(0.25, 0.35, 3, 5).translate(0, 1.5, 0), trunkCol);
    const c1 = colorize(new THREE.ConeGeometry(2.6, 5, 7).translate(0, 4.5, 0), '#2d4a26');
    const c2 = colorize(new THREE.ConeGeometry(2.0, 4.2, 7).translate(0, 7.0, 0), '#30502a');
    const c3 = colorize(new THREE.ConeGeometry(1.3, 3.4, 7).translate(0, 9.3, 0), '#355a2e');
    if (kind === 'snowconifer') {
      snowTop(c1, 5.5); snowTop(c2, 7.9); snowTop(c3, 9.8);
    }
    return merge([trunk, c1, c2, c3]);
  }
  if (kind === 'tropical') {
    const parts = [colorize(new THREE.CylinderGeometry(0.22, 0.35, 9, 5).translate(0, 4.5, 0), '#7a6448')];
    for (let i = 0; i < 6; i++) {
      const leaf = colorize(new THREE.ConeGeometry(0.7, 5.5, 3), '#3f7a2c');
      leaf.rotateZ(Math.PI / 2 + 0.35);
      leaf.translate(2.6, 8.6, 0);
      leaf.rotateY((i / 6) * Math.PI * 2);
      parts.push(leaf);
    }
    return merge(parts);
  }
  if (kind === 'desert') {
    const bush = colorize(new THREE.IcosahedronGeometry(1.6, 0).scale(1.2, 0.7, 1.2).translate(0, 0.8, 0), '#6d6a3c');
    return merge([bush]);
  }
  // broadleaf
  const trunk = colorize(new THREE.CylinderGeometry(0.28, 0.4, 3.5, 5).translate(0, 1.75, 0), trunkCol);
  const b1 = colorize(new THREE.IcosahedronGeometry(2.8, 0).scale(1, 0.85, 1).translate(0, 5.2, 0), '#3d6a2a');
  const b2 = colorize(new THREE.IcosahedronGeometry(2.0, 0).translate(0.9, 6.6, 0.4), '#46762f');
  return merge([trunk, b1, b2]);
}

export class Vegetation {
  constructor(map, quality, scene) {
    this.map = map;
    this.scene = scene;
    const cfg = map.def.trees;
    this.enabled = quality.trees > 0 && cfg && cfg.density > 0;
    if (!this.enabled) return;
    this.cellSize = 220;
    this.radiusCells = Math.max(2, Math.round(5 * quality.trees));
    this.perCell = Math.round(26 * cfg.density * Math.min(1.3, quality.trees));
    this.maxAlt = cfg.maxAlt + map.waterLevel;
    this.kinds = cfg.kind === 'tropical' ? ['tropical', 'broadleaf'] : cfg.kind === 'snowconifer' ? ['snowconifer', 'conifer'] : [cfg.kind, cfg.kind === 'desert' ? 'desert' : 'conifer'];
    if (cfg.kind === 'broadleaf') this.kinds = ['broadleaf', 'conifer'];
    const cells = (this.radiusCells * 2 + 1) ** 2;
    const maxInstances = cells * this.perCell;
    this.material = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.meshes = this.kinds.map((k) => {
      const m = new THREE.InstancedMesh(makeTreeGeometry(k), this.material, maxInstances);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = false;
      m.receiveShadow = quality.shadows;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxInstances * 3), 3);
      scene.add(m);
      return m;
    });
    this.cells = new Map();
    this.centerKey = null;
    this.forestAmount = map.def.forest;
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._p = new THREE.Vector3();
    this._n = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
    this.pending = [];
  }

  _forestMask(x, z) {
    const a = sampleNoiseCPU(x / 4096, z / 4096, 2);
    const b = sampleNoiseCPU(x / 640, z / 640, 0);
    const v = a + (b - 0.5) * 0.3;
    const t = Math.max(0, Math.min(1, (v - 0.56) / 0.08));
    return t * t * (3 - 2 * t) * this.forestAmount;
  }

  _buildCell(ci, cj) {
    const rand = mulberry32(Math.floor(hash2(ci, cj, this.map.def.seed) * 4294967296));
    const out = this.kinds.map(() => ({ mats: [], cols: [] }));
    const wl = this.map.waterLevel;
    for (let k = 0; k < this.perCell * 2; k++) {
      const x = (ci + rand()) * this.cellSize;
      const z = (cj + rand()) * this.cellSize;
      const r = rand();
      const forest = this._forestMask(x, z);
      if (r > 0.08 + forest * 0.92) continue;
      const h = this.map.heightAt(x, z);
      if (h < wl + 3 || h > this.maxAlt) continue;
      if (this.map.airbase && Math.abs(this.map.toAirbaseLocal(x, z).u) < this.map.airbase.halfL + 80 && Math.abs(this.map.toAirbaseLocal(x, z).v) < this.map.airbase.halfW + 60) continue;
      this.map.normalAt(x, z, this._n);
      if (this._n.y < 0.82) continue;
      const kind = rand() < 0.75 ? 0 : 1;
      const s = 0.8 + rand() * 0.9;
      this._q.setFromAxisAngle(this._up, rand() * Math.PI * 2);
      this._s.set(s, s * (0.85 + rand() * 0.4), s);
      this._p.set(x, h - 0.3, z);
      this._m.compose(this._p, this._q, this._s);
      out[kind].mats.push(...this._m.elements);
      const shade = 0.75 + rand() * 0.45;
      out[kind].cols.push(shade, shade * (0.95 + rand() * 0.1), shade);
      if (out[0].mats.length / 16 + out[1].mats.length / 16 >= this.perCell) break;
    }
    return out.map((o) => ({ mats: new Float32Array(o.mats), cols: new Float32Array(o.cols) }));
  }

  update(camera, aglAltitude) {
    if (!this.enabled) return;
    const show = aglAltitude < 3000;
    for (const m of this.meshes) m.visible = show;
    if (!show) return;
    const cs = this.cellSize;
    const ci = Math.floor(camera.position.x / cs), cj = Math.floor(camera.position.z / cs);
    const key = ci + ',' + cj;
    let dirty = false;
    if (key !== this.centerKey) {
      this.centerKey = key;
      const R = this.radiusCells;
      const needed = new Set();
      for (let j = -R; j <= R; j++) {
        for (let i = -R; i <= R; i++) {
          if (i * i + j * j > R * R + 1) continue;
          const k = (ci + i) + ',' + (cj + j);
          needed.add(k);
          if (!this.cells.has(k)) this.pending.push([ci + i, cj + j, i * i + j * j]);
        }
      }
      for (const k of [...this.cells.keys()]) if (!needed.has(k)) { this.cells.delete(k); dirty = true; }
      this.pending.sort((a, b) => a[2] - b[2]);
      this.pending = this.pending.filter((p) => needed.has(p[0] + ',' + p[1]));
    }
    const t0 = performance.now();
    while (this.pending.length && performance.now() - t0 < 2.5) {
      const [i, j] = this.pending.shift();
      const k = i + ',' + j;
      if (this.cells.has(k)) continue;
      this.cells.set(k, this._buildCell(i, j));
      dirty = true;
    }
    if (dirty) this._rebuild();
  }

  warmup(camera) {
    if (!this.enabled) return;
    this.centerKey = null;
    this.update(camera, 0);
    while (this.pending.length) {
      const [i, j] = this.pending.shift();
      const k = i + ',' + j;
      if (!this.cells.has(k)) this.cells.set(k, this._buildCell(i, j));
    }
    this._rebuild();
  }

  _rebuild() {
    for (let t = 0; t < this.meshes.length; t++) {
      const mesh = this.meshes[t];
      const M = mesh.instanceMatrix.array;
      const C = mesh.instanceColor.array;
      let n = 0;
      const max = M.length / 16;
      for (const cell of this.cells.values()) {
        const c = cell[t];
        const cnt = c.mats.length / 16;
        if (n + cnt > max) break;
        M.set(c.mats, n * 16);
        C.set(c.cols, n * 3);
        n += cnt;
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor.needsUpdate = true;
    }
  }

  dispose() {
    if (!this.enabled) return;
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.dispose();
    }
    this.material.dispose();
  }
}
