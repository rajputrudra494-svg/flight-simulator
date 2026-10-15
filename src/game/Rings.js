// Checkpoint rings for training / race courses.
import * as THREE from 'three';

const _n = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Rings {
  constructor(scene, points, opts = {}) {
    this.scene = scene;
    this.points = points;
    this.radius = opts.radius || 50;
    this.optional = !!opts.optional;
    this.index = 0;
    this.passed = 0;
    this.missed = 0;
    this.group = new THREE.Group();
    this.meshes = [];
    const geo = new THREE.TorusGeometry(this.radius, Math.max(1.6, this.radius * 0.045), 10, 64);
    for (let i = 0; i < points.length; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.6, 0.6), transparent: true, opacity: 0.9, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(points[i]);
      const prev = i > 0 ? points[i - 1] : points[i].clone().sub(_a.subVectors(points[1] || points[i], points[i]));
      const next = points[i + 1] || points[i].clone().add(_b.subVectors(points[i], prev));
      _n.subVectors(next, prev).normalize();
      m.lookAt(_a.copy(points[i]).add(_n));
      m.userData.normal = _n.clone();
      m.renderOrder = 15;
      this.group.add(m);
      this.meshes.push(m);
    }
    scene.add(this.group);
    this.time = 0;
    this.done = points.length === 0;
  }

  get current() {
    return this.index < this.points.length ? this.points[this.index] : null;
  }

  // returns 'pass' | 'miss' | null
  update(dt, prevPos, pos) {
    this.time += dt;
    for (let i = 0; i < this.meshes.length; i++) {
      const m = this.meshes[i];
      if (i < this.index) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      const isNext = i === this.index;
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 6);
      if (isNext) {
        m.material.color.setRGB(0.4 * pulse * 4, 2.6 * pulse * 1.4, 1.2 * pulse * 2);
        m.material.opacity = 0.95;
        m.scale.setScalar(1 + 0.04 * Math.sin(this.time * 6));
      } else {
        const f = i === this.index + 1 ? 0.7 : 0.4;
        m.material.color.setRGB(1.6 * f, 1.4 * f, 0.6 * f);
        m.material.opacity = 0.6;
        m.scale.setScalar(1);
      }
    }
    if (this.done || !prevPos) return null;
    const m = this.meshes[this.index];
    const c = this.points[this.index];
    const n = m.userData.normal;
    const d0 = _a.subVectors(prevPos, c).dot(n);
    const d1 = _b.subVectors(pos, c).dot(n);
    if (d0 < 0 && d1 >= 0) {
      const t = d0 / (d0 - d1);
      _a.copy(prevPos).lerp(pos, t);
      const r = _a.distanceTo(c);
      this.index++;
      if (this.index >= this.points.length) this.done = true;
      if (r <= this.radius * 1.08) {
        this.passed++;
        return 'pass';
      }
      this.missed++;
      return 'miss';
    }
    // skipped past it entirely (far beyond): count as a miss
    if (d1 > 600 && _b.subVectors(pos, c).length() < 2500) {
      this.index++;
      this.missed++;
      if (this.index >= this.points.length) this.done = true;
      return 'miss';
    }
    return null;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const m of this.meshes) m.material.dispose();
    if (this.meshes[0]) this.meshes[0].geometry.dispose();
  }
}
